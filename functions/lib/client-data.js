import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { buildFallbackClientProfile, isClientProfileComplete } from "./client-auth.js";

function normalizeFreshdeskDomain(value) {
  return String(value || "").replace(/\/+$/, "");
}

function buildFreshdeskAuthHeader(env) {
  const basicToken = String(env.FRESHDESK_BASIC_TOKEN || "").trim();
  if (basicToken) {
    return basicToken.startsWith("Basic ") ? basicToken : `Basic ${basicToken}`;
  }

  const apiKey = String(env.FRESHDESK_API_KEY || "").trim();
  if (!apiKey) {
    return null;
  }

  return `Basic ${btoa(`${apiKey}:X`)}`;
}

function buildFreshdeskPortalUrls(env, ticketId = null) {
  const domain = normalizeFreshdeskDomain(env.FRESHDESK_DOMAIN);
  if (!domain) {
    return {
      portal_home_url: null,
      new_ticket_url: null,
      ticket_url: null,
      agent_ticket_url: null,
    };
  }

  const baseTicketUrl = String(env.FRESHDESK_PORTAL_TICKET_BASE_URL || "").trim() || `${domain}/support/tickets`;
  const newTicketUrl = String(env.FRESHDESK_NEW_TICKET_URL || "").trim() || `${domain}/support/tickets/new`;

  return {
    portal_home_url: `${domain}/support/home`,
    new_ticket_url: newTicketUrl,
    ticket_url: ticketId ? `${baseTicketUrl}/${ticketId}` : null,
    agent_ticket_url: ticketId ? `${domain}/a/tickets/${ticketId}` : null,
  };
}

function mapFreshdeskStatus(value) {
  const statusMap = {
    2: "Aberto",
    3: "Pendente",
    4: "Resolvido",
    5: "Fechado",
  };
  return statusMap[value] || String(value || "Indefinido");
}

function mapFreshdeskPriority(value) {
  const priorityMap = {
    1: "Baixa",
    2: "Media",
    3: "Alta",
    4: "Urgente",
  };
  return priorityMap[value] || String(value || "Nao definida");
}

function safeJsonParse(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getEnvString(env, key) {
  const value = env?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function parseEnvList(env, key) {
  const value = getEnvString(env, key);
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumber(value) {
  if (value == null || value === "") return null;
  const normalized = String(value).replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readFieldValue(entry) {
  if (!entry || typeof entry !== "object") return entry ?? null;
  if ("display_value" in entry && entry.display_value != null && entry.display_value !== "") return entry.display_value;
  if ("value" in entry && entry.value != null && entry.value !== "") return entry.value;
  return null;
}

function flattenToStrings(value, bucket = []) {
  if (value == null) return bucket;
  if (Array.isArray(value)) {
    value.forEach((item) => flattenToStrings(item, bucket));
    return bucket;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((item) => flattenToStrings(item, bucket));
    return bucket;
  }
  const text = String(value).trim();
  if (text) bucket.push(text);
  return bucket;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function textIncludesAny(text, needles) {
  const haystack = normalizeText(text);
  return needles.some((needle) => haystack.includes(normalizeText(needle)));
}

function snapshotFieldEntries(snapshot) {
  const attributes = safeJsonParse(snapshot?.attributes, {});
  const customAttributes = safeJsonParse(snapshot?.custom_attributes, {});
  return {
    attributes,
    customAttributes,
    entries: [
      ...Object.entries(attributes).map(([key, entry]) => ({ scope: "attribute", key, entry })),
      ...Object.entries(customAttributes).map(([key, entry]) => ({ scope: "custom", key, entry })),
    ],
  };
}

function getSnapshotField(snapshot, matcher) {
  const { entries } = snapshotFieldEntries(snapshot);
  return entries.find((item) => matcher(item)) || null;
}

function getSnapshotFieldText(snapshot, matcher) {
  const field = getSnapshotField(snapshot, matcher);
  return field ? readFieldValue(field.entry) : null;
}

function getSnapshotTextCorpus(snapshot) {
  const summary = safeJsonParse(snapshot?.summary, {});
  const relationships = safeJsonParse(snapshot?.relationships, {});
  const timestamps = safeJsonParse(snapshot?.timestamps, {});
  return flattenToStrings([
    snapshot?.display_name,
    snapshot?.status,
    summary,
    relationships,
    timestamps,
    safeJsonParse(snapshot?.attributes, {}),
    safeJsonParse(snapshot?.custom_attributes, {}),
  ]).join(" | ");
}

function formatCurrencyBRL(value) {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : toNumber(value);
  if (amount == null) return null;
  return amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function mapFinanceStatus(text, kind = "financeiro") {
  const normalized = normalizeText(text);
  if (!normalized) return kind === "subscription" ? "ativa" : "em_aberto";
  if (textIncludesAny(normalized, ["pago", "quitado", "recebido", "ganho", "won", "paid", "recebida"])) return "pago";
  if (textIncludesAny(normalized, ["ativo", "ativa", "vigente", "recorrente", "active", "renewed"])) return "ativa";
  if (textIncludesAny(normalized, ["vencido", "atrasado", "overdue"])) return "vencido";
  if (textIncludesAny(normalized, ["cancelado", "cancelada", "encerrado", "lost", "perdido", "closed"])) return "encerrado";
  if (textIncludesAny(normalized, ["pendente", "aberto", "open", "draft", "novo"])) return "em_aberto";
  return kind === "subscription" ? "ativa" : "em_aberto";
}

function mapFinanceStatusLabel(status) {
  const labels = {
    pago: "Pago",
    ativa: "Ativa",
    em_aberto: "Em aberto",
    vencido: "Vencido",
    encerrado: "Encerrado",
  };
  return labels[status] || "Em analise";
}

function inferDealKind(snapshot, accountSnapshot = null) {
  const { entries } = snapshotFieldEntries(snapshot);
  const typeField = entries.find(({ key, entry }) =>
    textIncludesAny(`${key} ${entry?.label || ""}`, [
      "tipo", "type", "categoria", "category", "produto", "produto contratado", "natureza", "modalidade", "assinatura", "subscription", "fatura", "invoice",
    ])
  );

  const candidateTexts = flattenToStrings([
    snapshot?.display_name,
    snapshot?.status,
    readFieldValue(typeField?.entry),
    accountSnapshot?.display_name,
    safeJsonParse(snapshot?.summary, {}),
    safeJsonParse(snapshot?.attributes, {}),
    safeJsonParse(snapshot?.custom_attributes, {}),
  ]);

  const joined = candidateTexts.join(" | ");
  if (textIncludesAny(joined, ["assinatura", "subscription", "mensal", "mensalidade", "plano", "recorrente"])) {
    return "subscription";
  }
  if (textIncludesAny(joined, ["fatura", "invoice", "boleto", "parcela", "honorario", "cobranca", "cobrança"])) {
    return "invoice";
  }
  if (accountSnapshot) {
    return "invoice";
  }
  return "other";
}

function buildFieldCatalog(snapshots, keywords) {
  const catalog = new Map();
  for (const snapshot of snapshots) {
    const { entries } = snapshotFieldEntries(snapshot);
    for (const { key, entry } of entries) {
      const label = entry?.label || key;
      if (!textIncludesAny(`${key} ${label}`, keywords)) continue;
      const catalogKey = `${key}::${label}`;
      const sampleBucket = catalog.get(catalogKey) || { key, label, samples: new Set() };
      flattenToStrings(readFieldValue(entry)).slice(0, 3).forEach((value) => sampleBucket.samples.add(value));
      catalog.set(catalogKey, sampleBucket);
    }
  }

  return Array.from(catalog.values()).map((item) => ({
    key: item.key,
    label: item.label,
    samples: Array.from(item.samples).slice(0, 4),
  }));
}

function getFieldValuesByCandidate(snapshots, keywords) {
  const candidateMap = new Map();

  for (const snapshot of snapshots) {
    const { entries } = snapshotFieldEntries(snapshot);
    for (const { key, entry } of entries) {
      const label = entry?.label || key;
      if (!textIncludesAny(`${key} ${label}`, keywords)) continue;

      const compoundKey = `${key}::${label}`;
      const bucket =
        candidateMap.get(compoundKey) || {
          key,
          label,
          count: 0,
          values: new Map(),
        };

      const values = flattenToStrings(readFieldValue(entry));
      if (values.length) {
        bucket.count += 1;
        values.forEach((value) => {
          const normalized = value.trim();
          if (!normalized) return;
          bucket.values.set(normalized, (bucket.values.get(normalized) || 0) + 1);
        });
      }

      candidateMap.set(compoundKey, bucket);
    }
  }

  return Array.from(candidateMap.values())
    .map((item) => ({
      key: item.key,
      label: item.label,
      count: item.count,
      values: Array.from(item.values.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([value, occurrences]) => ({ value, occurrences })),
    }))
    .sort((left, right) => right.count - left.count);
}

function selectBestFieldCandidate(candidates, preferredKeys = []) {
  if (!candidates.length) return null;

  for (const preferredKey of preferredKeys) {
    const exact = candidates.find((item) => item.key === preferredKey);
    if (exact) return exact;
  }

  return candidates[0];
}

function selectConfiguredFieldCandidate(candidates, configuredKeys = [], fallbackKeys = []) {
  if (configuredKeys.length) {
    const configured = candidates.find((item) => configuredKeys.includes(item.key));
    if (configured) {
      return {
        ...configured,
        source: "config",
      };
    }
  }

  const inferred = selectBestFieldCandidate(candidates, fallbackKeys);
  return inferred
    ? {
        ...inferred,
        source: "inferred",
      }
    : null;
}

function inferStatusSemantics(snapshots, env) {
  const candidates = getFieldValuesByCandidate(snapshots, ["estagio", "estágio", "stage", "status", "situacao", "situação"]);
  const selected = selectConfiguredFieldCandidate(
    candidates,
    parseEnvList(env, "FRESHSALES_FINANCE_DEAL_STAGE_FIELDS"),
    ["deal_stage_id", "status", "cf_status"]
  );

  if (!selected) {
    return {
      field: null,
      values: [],
      semantics: {
        pago: [],
        em_aberto: [],
        cancelado: [],
      },
    };
  }

  const semantics = {
    pago: [],
    em_aberto: [],
    cancelado: [],
  };

  selected.values.forEach(({ value, occurrences }) => {
    const normalized = normalizeText(value);
    if (textIncludesAny(normalized, ["pago", "quitado", "recebido", "won", "ganho", "paid"])) {
      semantics.pago.push({ value, occurrences });
      return;
    }
    if (textIncludesAny(normalized, ["cancelado", "cancelada", "lost", "perdido", "fechado", "encerrado"])) {
      semantics.cancelado.push({ value, occurrences });
      return;
    }
    semantics.em_aberto.push({ value, occurrences });
  });

  return {
    field: {
      key: selected.key,
      label: selected.label,
      count: selected.count,
      source: selected.source || "inferred",
    },
    values: selected.values,
    semantics,
  };
}

async function listFreshsalesSnapshots(env, entity, limit = 250) {
  const params = new URLSearchParams();
  params.set(
    "select",
    "id,entity,source_id,display_name,status,emails,phones,summary,attributes,custom_attributes,relationships,timestamps,source_filter_name,synced_at"
  );
  params.set("entity", `eq.${entity}`);
  params.set("order", "synced_at.desc");
  params.set("limit", String(limit));

  return fetchSupabaseAdmin(env, `freshsales_sync_snapshots?${params.toString()}`);
}

function snapshotHasEmail(snapshot, email) {
  const normalizedEmail = normalizeEmail(email);
  const emails = Array.isArray(snapshot?.emails) ? snapshot.emails : safeJsonParse(snapshot?.emails, []);
  const directMatch = emails.some((item) => normalizeEmail(item) === normalizedEmail);
  if (directMatch) return true;
  const corpus = getSnapshotTextCorpus(snapshot);
  return corpus.toLowerCase().includes(normalizedEmail);
}

function findAccountProcessReference(accountSnapshot, processFieldKeys = []) {
  const candidate = processFieldKeys.length
    ? getSnapshotFieldText(accountSnapshot, ({ key }) => processFieldKeys.includes(key))
    : getSnapshotFieldText(accountSnapshot, ({ key, entry }) =>
        textIncludesAny(`${key} ${entry?.label || ""}`, ["processo", "numero do processo", "numero processo", "cnj"])
      );
  return candidate || accountSnapshot?.display_name || null;
}

function buildFinanceItem(dealSnapshot, accountSnapshot = null, mapping = null) {
  const summary = safeJsonParse(dealSnapshot?.summary, {});
  const relationships = safeJsonParse(dealSnapshot?.relationships, {});
  const timestamps = safeJsonParse(dealSnapshot?.timestamps, {});
  const configuredTypeValue = mapping?.deal_type_field?.key
    ? getSnapshotFieldText(dealSnapshot, ({ key }) => key === mapping.deal_type_field.key)
    : null;
  const inferredKind = inferDealKind(dealSnapshot, accountSnapshot);
  const kind = configuredTypeValue
    ? textIncludesAny(configuredTypeValue, ["assinatura", "subscription", "mensal", "mensalidade", "plano", "recorrente"])
      ? "subscription"
      : textIncludesAny(configuredTypeValue, ["fatura", "invoice", "boleto", "parcela", "honorario", "cobranca", "cobranÃ§a"])
        ? "invoice"
        : inferredKind
    : inferredKind;
  const amount = toNumber(summary.amount)
    ?? toNumber(getSnapshotFieldText(dealSnapshot, ({ key, entry }) => textIncludesAny(`${key} ${entry?.label || ""}`, ["valor", "amount", "preco", "price"])))
    ?? null;
  const dueDate =
    getSnapshotFieldText(dealSnapshot, ({ key, entry }) => textIncludesAny(`${key} ${entry?.label || ""}`, ["vencimento", "due", "due date", "cobranca", "cobrança"])) ||
    summary.expected_close ||
    timestamps.updated_at ||
    null;
  const stageText =
    getSnapshotFieldText(dealSnapshot, ({ key, entry }) => textIncludesAny(`${key} ${entry?.label || ""}`, ["estagio", "estágio", "stage", "status"])) ||
    dealSnapshot?.status ||
    null;
  const status = mapFinanceStatus(stageText || "", kind);
  const processReference = accountSnapshot
    ? findAccountProcessReference(accountSnapshot, mapping?.process_reference_field?.key ? [mapping.process_reference_field.key] : [])
    : null;
  const accountStatus = accountSnapshot
    ? getSnapshotFieldText(accountSnapshot, ({ key, entry }) => textIncludesAny(`${key} ${entry?.label || ""}`, ["status", "situacao", "situação"]))
    : null;

  return {
    id: dealSnapshot.source_id,
    title: dealSnapshot.display_name || "Negocio financeiro",
    kind,
    kind_label: kind === "subscription" ? "Assinatura" : kind === "invoice" ? "Fatura" : "Financeiro",
    status,
    status_label: mapFinanceStatusLabel(status),
    amount,
    amount_label: formatCurrencyBRL(amount),
    due_date: dueDate,
    created_at: timestamps.created_at || null,
    updated_at: timestamps.updated_at || null,
    stage: stageText,
    process_account: accountSnapshot
      ? {
          id: accountSnapshot.source_id,
          name: accountSnapshot.display_name || "Processo vinculado",
          process_reference: processReference,
          status: accountStatus,
        }
      : null,
    source_filter_name: dealSnapshot.source_filter_name || null,
    relationship_ids: {
      sales_account_id: relationships.sales_account_id || null,
      targetable_type: relationships.targetable_type || null,
      targetable_id: relationships.targetable_id || null,
    },
  };
}

function buildFinanceMapping(relatedDeals, accounts, env) {
  const dealTypeCandidates = getFieldValuesByCandidate(relatedDeals, [
    "tipo", "type", "categoria", "modalidade", "produto", "assinatura", "subscription", "fatura", "invoice", "plano",
  ]);
  const processCandidates = getFieldValuesByCandidate(accounts, ["processo", "cnj", "numero do processo", "numero processo", "número do processo", "número processo"]);
  const accountStatusCandidates = getFieldValuesByCandidate(accounts, ["status", "situacao", "situação"]);
  const stageSemantics = inferStatusSemantics(relatedDeals, env);

  return {
    deal_type_field: selectConfiguredFieldCandidate(dealTypeCandidates, parseEnvList(env, "FRESHSALES_FINANCE_DEAL_TYPE_FIELDS"), ["cf_tipo", "cf_categoria", "cf_modalidade", "cf_produto", "type"]),
    process_reference_field: selectConfiguredFieldCandidate(processCandidates, parseEnvList(env, "FRESHSALES_FINANCE_ACCOUNT_PROCESS_FIELDS"), ["cf_processo", "name"]),
    account_status_field: selectConfiguredFieldCandidate(accountStatusCandidates, parseEnvList(env, "FRESHSALES_FINANCE_ACCOUNT_STATUS_FIELDS"), ["cf_status", "status"]),
    deal_stage_field: stageSemantics.field,
    deal_stage_values: stageSemantics.values,
    stage_semantics: stageSemantics.semantics,
  };
}

function normalizeProcessRow(row) {
  if (!row) return null;
  return {
    id: row.id || row.processo_id || row.numero_cnj || row.numero || null,
    number: row.numero_cnj || row.numero || row.cnj || row.processo_numero_cnj || null,
    title: row.titulo || row.title || row.assunto || row.numero_cnj || row.numero || "Processo",
    court: row.tribunal || row.tribunal_sigla || row.orgao_julgador || null,
    status: row.status || "sem_status",
    updated_at: row.updated_at || row.data_atualizacao || row.data_ultima_movimentacao || null,
    classe: row.classe || row.classificacao || null,
    area: row.area || row.area_direito || null,
    value: row.valor_causa || row.valor || null,
    filed_at: row.data_distribuicao || row.distribuido_em || row.created_at || null,
    polo_ativo: row.polo_ativo || row.titulo_polo_ativo || null,
    polo_passivo: row.polo_passivo || row.titulo_polo_passivo || null,
    movement_count: row.quantidade_movimentacoes || row.total_movimentacoes || null,
    metadata: safeJsonParse(row.metadata, {}),
    raw: row,
  };
}

function normalizePartRow(row) {
  return {
    id: row.id || `${row.processo_id || "proc"}-${row.nome || row.parte_nome || Math.random()}`,
    name: row.nome || row.parte_nome || row.name || "Parte",
    role: row.tipo_parte || row.polo || row.tipo || "parte",
    document: row.cpf_cnpj || row.documento || null,
    person_type: row.tipo_pessoa || null,
    is_client: row.e_cliente_escritorio === true || row.is_client === true,
    lawyers: Array.isArray(row.advogados) ? row.advogados : safeJsonParse(row.advogados, []),
  };
}

function normalizeMovementRow(row) {
  return {
    id: row.id || row.uuid || `${row.processo_id || "proc"}-${row.data_movimentacao || row.data || Math.random()}`,
    date: row.data_movimentacao || row.data || row.created_at || null,
    title: row.tipo || row.descricao || row.movimento || "Movimentacao",
    body: row.texto || row.complemento || row.descricao_completa || row.resumo || "",
    source: row.fonte || row.tribunal_sigla || null,
  };
}

function normalizePublicationRow(row) {
  return {
    id: row.id || row.uuid || `${row.processo_id || "proc"}-${row.data_publicacao || row.data || Math.random()}`,
    date: row.data_publicacao || row.data_disponibilizacao || row.publicada_em || row.created_at || null,
    title: row.titulo || row.tipo || row.veiculo || "Publicacao",
    summary: row.resumo || row.descricao || row.texto || "",
    content: row.texto || row.conteudo || row.descricao || "",
    source: row.veiculo || row.diario || row.fonte || null,
    status: row.status || null,
    url: row.url || row.link || null,
    process_id: row.processo_id || row.processo || null,
  };
}

function buildProcessIdentifierCandidates(process, processId) {
  const values = [processId, process?.id, process?.number, process?.raw?.id, process?.raw?.numero_cnj, process?.raw?.numero];
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

export function buildClientDraftProfile(user, profile = null) {
  const fallback = buildFallbackClientProfile(user);
  const metadata = safeJsonParse(profile?.metadata, fallback.metadata || {});
  return {
    id: profile?.id || fallback.id,
    email: profile?.email || fallback.email,
    full_name: profile?.full_name || fallback.full_name,
    is_active: profile?.is_active ?? fallback.is_active,
    whatsapp: profile?.whatsapp || fallback.whatsapp,
    cpf: profile?.cpf || fallback.cpf,
    metadata,
    onboarding_required: !isClientProfileComplete({
      ...profile,
      ...{
        full_name: profile?.full_name || fallback.full_name,
        whatsapp: profile?.whatsapp || fallback.whatsapp,
        cpf: profile?.cpf || fallback.cpf,
        metadata,
        is_active: profile?.is_active ?? fallback.is_active,
      },
    }),
  };
}

async function tryFetchOptional(env, variants) {
  let lastError = null;

  for (const variant of variants) {
    try {
      const rows = await fetchSupabaseAdmin(env, variant.path);
      return {
        ok: true,
        items: Array.isArray(rows) ? rows.map(variant.mapRow) : [],
        warning: null,
      };
    } catch (error) {
      const message = String(error?.message || "");
      lastError = error;
      if (
        message.includes("404") ||
        message.includes("PGRST205") ||
        message.includes("Could not find the table") ||
        message.includes("does not exist") ||
        message.includes("42703")
      ) {
        continue;
      }
      throw error;
    }
  }

  return {
    ok: true,
    items: [],
    warning: lastError ? null : null,
  };
}

export async function listClientConsultas(env, email) {
  const params = new URLSearchParams();
  params.set("select", "id,nome,email,telefone,area,data,hora,status,observacoes,created_at,updated_at");
  params.set("email", `eq.${email}`);
  params.set("order", "data.desc,hora.desc");
  params.set("limit", "50");
  const rows = await fetchSupabaseAdmin(env, `agendamentos?${params.toString()}`);
  return Array.isArray(rows) ? rows : [];
}

export async function listClientProcessos(env, email) {
  const result = await tryFetchOptional(env, [
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,email_cliente,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes&email_cliente=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: normalizeProcessRow,
    },
  ]);

  if (!result.items.length) {
    return {
      items: [],
      warning: "Leitura de processos ainda nao foi ligada neste projeto Supabase.",
    };
  }

  return result;
}

async function getClientProcessBase(env, email, processId) {
  const result = await tryFetchOptional(env, [
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&id=eq.${encodeURIComponent(processId)}&cliente_email=eq.${encodeURIComponent(email)}&limit=1`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,email_cliente,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&id=eq.${encodeURIComponent(processId)}&email_cliente=eq.${encodeURIComponent(email)}&limit=1`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&numero_cnj=eq.${encodeURIComponent(processId)}&cliente_email=eq.${encodeURIComponent(email)}&limit=1`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,email_cliente,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&numero_cnj=eq.${encodeURIComponent(processId)}&email_cliente=eq.${encodeURIComponent(email)}&limit=1`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&numero=eq.${encodeURIComponent(processId)}&cliente_email=eq.${encodeURIComponent(email)}&limit=1`,
      mapRow: normalizeProcessRow,
    },
  ]);

  return result.items[0] || null;
}

async function listClientProcessParts(env, processId) {
  const candidates = buildProcessIdentifierCandidates(null, processId);
  for (const candidate of candidates) {
    const result = await tryFetchOptional(env, [
      {
        path: `processo_partes?select=id,processo_id,numero_cnj,nome,tipo_parte,cpf_cnpj,tipo_pessoa,e_cliente_escritorio,advogados&processo_id=eq.${encodeURIComponent(candidate)}&limit=100`,
        mapRow: normalizePartRow,
      },
      {
        path: `processo_partes?select=id,processo_id,numero_cnj,nome,tipo_parte,cpf_cnpj,tipo_pessoa,e_cliente_escritorio,advogados&numero_cnj=eq.${encodeURIComponent(candidate)}&limit=100`,
        mapRow: normalizePartRow,
      },
      {
        path: `partes_processo?select=id,processo_id,numero_cnj,nome,tipo_parte,cpf_cnpj,tipo_pessoa,e_cliente_escritorio,advogados&processo_id=eq.${encodeURIComponent(candidate)}&limit=100`,
        mapRow: normalizePartRow,
      },
    ]);
    if (result.items.length) return result.items;
  }

  return [];
}

async function listClientProcessMovements(env, processId) {
  const candidates = buildProcessIdentifierCandidates(null, processId);
  for (const candidate of candidates) {
    const result = await tryFetchOptional(env, [
      {
        path: `processo_movimentacoes?select=id,processo_id,numero_cnj,data_movimentacao,tipo,descricao,texto,fonte&processo_id=eq.${encodeURIComponent(candidate)}&order=data_movimentacao.desc&limit=100`,
        mapRow: normalizeMovementRow,
      },
      {
        path: `processo_movimentacoes?select=id,processo_id,numero_cnj,data_movimentacao,tipo,descricao,texto,fonte&numero_cnj=eq.${encodeURIComponent(candidate)}&order=data_movimentacao.desc&limit=100`,
        mapRow: normalizeMovementRow,
      },
      {
        path: `movimentacoes_processo?select=id,processo_id,numero_cnj,data_movimentacao,tipo,descricao,texto,fonte&processo_id=eq.${encodeURIComponent(candidate)}&order=data_movimentacao.desc&limit=100`,
        mapRow: normalizeMovementRow,
      },
      {
        path: `movimentacoes?select=id,processo_id,numero_cnj,data_movimentacao,tipo,descricao,texto,fonte&processo_id=eq.${encodeURIComponent(candidate)}&order=data_movimentacao.desc&limit=100`,
        mapRow: normalizeMovementRow,
      },
      {
        path: `movimentacoes?select=id,processo_id,numero_cnj,data_movimentacao,tipo,descricao,texto,fonte&numero_cnj=eq.${encodeURIComponent(candidate)}&order=data_movimentacao.desc&limit=100`,
        mapRow: normalizeMovementRow,
      },
    ]);
    if (result.items.length) return result.items;
  }

  return [];
}

async function listClientProcessPublications(env, processId) {
  const candidates = buildProcessIdentifierCandidates(null, processId);
  for (const candidate of candidates) {
    const result = await tryFetchOptional(env, [
      {
        path: `publicacoes?select=id,processo_id,numero_cnj,data_publicacao,titulo,resumo,texto,veiculo,status,url&processo_id=eq.${encodeURIComponent(candidate)}&order=data_publicacao.desc&limit=100`,
        mapRow: normalizePublicationRow,
      },
      {
        path: `publicacoes?select=id,processo_id,numero_cnj,data_publicacao,titulo,resumo,texto,veiculo,status,url&numero_cnj=eq.${encodeURIComponent(candidate)}&order=data_publicacao.desc&limit=100`,
        mapRow: normalizePublicationRow,
      },
      {
        path: `processo_publicacoes?select=id,processo_id,numero_cnj,data_publicacao,titulo,resumo,texto,veiculo,status,url&processo_id=eq.${encodeURIComponent(candidate)}&order=data_publicacao.desc&limit=100`,
        mapRow: normalizePublicationRow,
      },
    ]);
    if (result.items.length) return result.items;
  }

  return [];
}

export async function getClientProcessDetails(env, profile, processId) {
  const process = await getClientProcessBase(env, profile.email, processId);

  if (!process) {
    return {
      process: null,
      parts: [],
      movements: [],
      publications: [],
      warnings: ["O processo solicitado nao foi encontrado para o cadastro autenticado."],
    };
  }

  const embeddedParts = Array.isArray(process.raw?.partes) ? process.raw.partes.map(normalizePartRow) : [];
  const embeddedMovements = Array.isArray(process.raw?.movimentacoes) ? process.raw.movimentacoes.map(normalizeMovementRow) : [];

  const processCandidates = buildProcessIdentifierCandidates(process, processId);
  const [parts, movements, publications] = await Promise.all([
    embeddedParts.length ? embeddedParts : listClientProcessParts(env, processCandidates[0]),
    embeddedMovements.length ? embeddedMovements : listClientProcessMovements(env, processCandidates[0]),
    listClientProcessPublications(env, processCandidates[0]),
  ]);

  const warnings = [];
  if (!parts.length) warnings.push("As partes do processo ainda nao estao visiveis nesta fonte.");
  if (!movements.length) warnings.push("Os andamentos ainda nao foram sincronizados para este processo.");
  if (!publications.length) warnings.push("Ainda nao ha publicacoes vinculadas a este processo no portal.");

  return {
    process,
    parts,
    movements,
    publications,
    warnings,
  };
}

export async function listClientPublicacoes(env, profile) {
  const processes = await listClientProcessos(env, profile.email);
  const processIds = processes.items.flatMap((item) => buildProcessIdentifierCandidates(item, item.id)).filter(Boolean);

  if (!processIds.length) {
    return {
      items: [],
      warning: "As publicacoes passam a aparecer quando houver processos vinculados ao seu cadastro.",
    };
  }

  const publicationBatches = await Promise.all(
    processIds.slice(0, 20).map((processId) => listClientProcessPublications(env, processId))
  );

  const items = publicationBatches.flat().sort((left, right) => {
    const leftTime = left.date ? new Date(left.date).getTime() : 0;
    const rightTime = right.date ? new Date(right.date).getTime() : 0;
    return rightTime - leftTime;
  });

  return {
    items,
    warning: items.length ? null : "Ainda nao ha publicacoes judiciais sincronizadas para os seus processos.",
  };
}

export async function listClientDocumentos(env, email) {
  const result = await tryFetchOptional(env, [
    {
      path: `documentos?select=id,nome,status,created_at,updated_at,arquivo_url,cliente_email&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: (row) => ({
        id: row.id,
        name: row.nome || "Documento",
        status: row.status || "disponivel",
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        url: row.arquivo_url || null,
      }),
    },
    {
      path: `documentos?select=id,titulo,status,created_at,updated_at,file_url,cliente_email&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: (row) => ({
        id: row.id,
        name: row.titulo || "Documento",
        status: row.status || "disponivel",
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        url: row.file_url || null,
      }),
    },
  ]);

  if (!result.items.length) {
    return {
      items: [],
      warning: "Estante documental em ativacao neste projeto.",
    };
  }

  return result;
}

export async function listClientFinanceiro(env, email) {
  try {
    const [contactsRaw, dealsRaw, accountsRaw] = await Promise.all([
      listFreshsalesSnapshots(env, "contacts", 250),
      listFreshsalesSnapshots(env, "deals", 300),
      listFreshsalesSnapshots(env, "sales_accounts", 250),
    ]);

    const normalizedEmail = normalizeEmail(email);
    const contacts = Array.isArray(contactsRaw) ? contactsRaw.filter((item) => snapshotHasEmail(item, normalizedEmail)) : [];
    const contactIds = new Set(contacts.map((item) => String(item.source_id || "").trim()).filter(Boolean));
    const accounts = Array.isArray(accountsRaw) ? accountsRaw : [];
    const accountsById = new Map(accounts.map((item) => [String(item.source_id || "").trim(), item]));
    const deals = Array.isArray(dealsRaw) ? dealsRaw : [];

    const relatedDeals = deals.filter((deal) => {
      const relationships = safeJsonParse(deal.relationships, {});
      const targetType = normalizeText(relationships.targetable_type || "");
      const targetId = String(relationships.targetable_id || "").trim();

      if (targetType.includes("contact") && contactIds.has(targetId)) {
        return true;
      }

      if (snapshotHasEmail(deal, normalizedEmail)) {
        return true;
      }

      const textCorpus = getSnapshotTextCorpus(deal);
      return contacts.some((contact) => {
        const contactId = String(contact.source_id || "").trim();
        return contactId && textCorpus.includes(contactId);
      });
    });

    const mapping = buildFinanceMapping(relatedDeals, accounts, env);

    const items = relatedDeals
      .map((deal) => {
        const relationships = safeJsonParse(deal.relationships, {});
        const accountId = String(relationships.sales_account_id || "").trim();
        const account = accountId ? accountsById.get(accountId) || null : null;
        return buildFinanceItem(deal, account, mapping);
      })
      .sort((left, right) => {
        const leftTime = left.due_date ? new Date(left.due_date).getTime() : 0;
        const rightTime = right.due_date ? new Date(right.due_date).getTime() : 0;
        return rightTime - leftTime;
      });

    const invoices = items.filter((item) => item.kind === "invoice");
    const subscriptions = items.filter((item) => item.kind === "subscription");
    const others = items.filter((item) => item.kind === "other");
    const openAmount = invoices
      .filter((item) => item.status !== "pago")
      .reduce((sum, item) => sum + (item.amount || 0), 0);
    const recurringAmount = subscriptions
      .filter((item) => item.status !== "encerrado")
      .reduce((sum, item) => sum + (item.amount || 0), 0);

    const fieldCatalog = {
      deal_type_candidates: buildFieldCatalog(relatedDeals, ["tipo", "type", "categoria", "modalidade", "assinatura", "subscription", "fatura", "invoice", "plano"]),
      amount_candidates: buildFieldCatalog(relatedDeals, ["valor", "amount", "price", "preco", "preço"]),
      account_candidates: buildFieldCatalog(accounts, ["processo", "cnj", "numero", "número", "status"]),
    };

    if (!items.length) {
      return {
        items: [],
        invoices: [],
        subscriptions: [],
        others: [],
        summary: {
          total_items: 0,
          invoices: 0,
          subscriptions: 0,
          open_amount: 0,
          recurring_amount: 0,
        },
        mapping,
        field_catalog: fieldCatalog,
        warning: "Nenhum deal financeiro do Freshsales foi pareado ao seu contato neste ambiente.",
      };
    }

    const warnings = [];
    if (!fieldCatalog.deal_type_candidates.length) {
      warnings.push("Os campos de classificacao de fatura e assinatura ainda nao apareceram nos snapshots sincronizados.");
    }
    if (!contacts.length) {
      warnings.push("Nao encontramos snapshot de contato do Freshsales para o e-mail autenticado; o pareamento foi feito por heuristica.");
    }

    return {
      items,
      invoices,
      subscriptions,
      others,
      summary: {
        total_items: items.length,
        invoices: invoices.length,
        subscriptions: subscriptions.length,
        open_amount: openAmount,
        recurring_amount: recurringAmount,
      },
      mapping,
      field_catalog: fieldCatalog,
      warning: warnings.length ? warnings.join(" ") : null,
    };
  } catch (error) {
    const message = String(error?.message || "");
    if (
      message.includes("freshsales_sync_snapshots") ||
      message.includes("Could not find the table") ||
      message.includes("PGRST205")
    ) {
      return {
        items: [],
        invoices: [],
        subscriptions: [],
        others: [],
        summary: {
          total_items: 0,
          invoices: 0,
          subscriptions: 0,
          open_amount: 0,
          recurring_amount: 0,
        },
        mapping: {
          deal_type_field: null,
          process_reference_field: null,
          account_status_field: null,
          deal_stage_field: null,
          deal_stage_values: [],
          stage_semantics: { pago: [], em_aberto: [], cancelado: [] },
        },
        field_catalog: {
          deal_type_candidates: [],
          amount_candidates: [],
          account_candidates: [],
        },
        warning: "Modulo financeiro do cliente ainda nao possui snapshots do Freshsales conectados neste ambiente.",
      };
    }

    throw error;
  }
}

export async function listClientTickets(env, email) {
  const domain = normalizeFreshdeskDomain(env.FRESHDESK_DOMAIN);
  const token = buildFreshdeskAuthHeader(env);

  if (!domain || !token) {
    return {
      items: [],
      warning: "Suporte do portal ainda nao foi conectado ao Freshdesk neste ambiente.",
      urls: buildFreshdeskPortalUrls(env),
    };
  }

  try {
    const params = new URLSearchParams();
    params.set("per_page", "30");
    params.set("page", "1");
    params.set("email", email);
    params.set("order_by", "updated_at");
    params.set("order_type", "desc");
    params.set("include", "description");

    const response = await fetch(`${domain}/api/v2/tickets?${params.toString()}`, {
      headers: {
        Authorization: token,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      return {
        items: [],
        warning: "Nao foi possivel listar os tickets do cliente via Freshdesk neste ambiente.",
        urls: buildFreshdeskPortalUrls(env),
      };
    }

    const payload = await response.json().catch(() => []);
    return {
      items: Array.isArray(payload)
        ? payload.map((item) => ({
            id: item.id,
            subject: item.subject || "Sem assunto",
            status: mapFreshdeskStatus(item.status),
            status_code: item.status,
            priority: mapFreshdeskPriority(item.priority),
            priority_code: item.priority,
            created_at: item.created_at,
            updated_at: item.updated_at,
            description_text: item.description_text || "",
            urls: buildFreshdeskPortalUrls(env, item.id),
          }))
        : [],
      warning: null,
      urls: buildFreshdeskPortalUrls(env),
    };
  } catch {
    return {
      items: [],
      warning: "Nao foi possivel listar os tickets do cliente via Freshdesk neste ambiente.",
      urls: buildFreshdeskPortalUrls(env),
    };
  }
}

export async function createClientTicket(env, profile, payload) {
  const domain = normalizeFreshdeskDomain(env.FRESHDESK_DOMAIN);
  const token = buildFreshdeskAuthHeader(env);

  if (!domain || !token) {
    throw new Error("Suporte do portal ainda nao foi conectado ao Freshdesk neste ambiente.");
  }

  const response = await fetch(`${domain}/api/v2/tickets`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      name: profile.full_name || profile.email,
      email: profile.email,
      subject: payload.subject,
      description: payload.description,
      priority: payload.priority || 1,
      status: 2,
      custom_fields: {
        cf_origem_do_ticket: "portal_cliente",
      },
    }),
  });

  const body = await response.json().catch(async () => ({ raw: await response.text().catch(() => "") }));
  if (!response.ok) {
    throw new Error(body?.description || body?.message || "Nao foi possivel abrir o ticket do cliente.");
  }

  return {
    ...body,
    urls: buildFreshdeskPortalUrls(env, body?.id),
    status_label: mapFreshdeskStatus(body?.status),
    priority_label: mapFreshdeskPriority(body?.priority),
  };
}

export async function getClientSummary(env, profile) {
  const [consultas, tickets, processos, documentos, financeiro, publicacoes] = await Promise.all([
    listClientConsultas(env, profile.email),
    listClientTickets(env, profile.email),
    listClientProcessos(env, profile.email),
    listClientDocumentos(env, profile.email),
    listClientFinanceiro(env, profile.email),
    listClientPublicacoes(env, profile),
  ]);

  const recentActivity = [
    ...consultas.slice(0, 3).map((item) => ({
      id: `consulta-${item.id}`,
      type: "consulta",
      title: item.area || "Consulta agendada",
      date: item.updated_at || item.created_at || item.data || null,
      helper: `${item.data || ""} ${item.hora || ""}`.trim() || item.status || "Consulta",
      href: "/portal/consultas",
    })),
    ...processos.items.slice(0, 3).map((item) => ({
      id: `processo-${item.id}`,
      type: "processo",
      title: item.title || item.number || "Processo",
      date: item.updated_at || null,
      helper: item.status || item.court || "Processo",
      href: `/portal/processos/detalhe?id=${encodeURIComponent(item.id)}`,
    })),
    ...publicacoes.items.slice(0, 3).map((item) => ({
      id: `publicacao-${item.id}`,
      type: "publicacao",
      title: item.title || "Publicacao",
      date: item.date || null,
      helper: item.source || item.status || "Publicacao judicial",
      href: item.process_id ? `/portal/processos/detalhe?id=${encodeURIComponent(item.process_id)}` : "/portal/publicacoes",
    })),
  ]
    .filter((item) => item.title)
    .sort((left, right) => {
      const leftTime = left.date ? new Date(left.date).getTime() : 0;
      const rightTime = right.date ? new Date(right.date).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, 6);

  const warnings = [tickets.warning, processos.warning, documentos.warning, financeiro.warning, publicacoes.warning].filter(Boolean);

  return {
    summary: {
      processos: processos.items.length,
      tickets: tickets.items.length,
      consultas: consultas.length,
      documentos: documentos.items.length,
      financeiro: financeiro.items.length,
      publicacoes: publicacoes.items.length,
    },
    recentActivity,
    warnings,
  };
}
