import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { buildFallbackClientProfile, isClientProfileComplete } from "./client-auth.js";
import {
  listFreshsalesSalesActivities,
  lookupFreshsalesContactByEmail,
  viewFreshsalesContact,
  viewFreshsalesDeal,
  viewFreshsalesSalesAccount,
} from "./freshsales-crm.js";

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

const FRESHSALES_OWNER_FALLBACKS = {
  "adrianohermida@gmail.com": "31000147944",
};

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

function normalizeProcessLookupValue(value) {
  return String(value || "").replace(/\D+/g, "").trim();
}

function processMatchesStatusFilter(process, statusFilter) {
  if (!statusFilter) return true;
  const normalizedFilter = normalizeText(statusFilter);
  const statusGroup = normalizeText(process?.status_group || "");
  const status = normalizeText(process?.status || "");
  return statusGroup === normalizedFilter || status.includes(normalizedFilter);
}

function chunkArray(values, size) {
  const chunkSize = Math.max(1, Number(size) || 1);
  const chunks = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = String(getKey(item) || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function normalizeProcessStatusGroup(value) {
  const text = normalizeText(value);
  if (!text) return "ativo";
  if (textIncludesAny(text, ["baixado", "arquivado", "encerrado", "extinto"])) return "baixado";
  if (textIncludesAny(text, ["suspenso", "suspensa", "sobrestado"])) return "suspenso";
  return "ativo";
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
  if (!normalized) return kind === "subscription" ? "ativa" : "aberto";
  if (textIncludesAny(normalized, ["pago", "quitado", "recebido", "ganho", "won", "paid", "recebida"])) return "pago";
  if (textIncludesAny(normalized, ["nao pago", "não pago", "unpaid"])) return "nao_pago";
  if (textIncludesAny(normalized, ["aberto", "open"])) return "aberto";
  if (textIncludesAny(normalized, ["ativo", "ativa", "vigente", "recorrente", "active", "renewed"])) return "ativa";
  if (textIncludesAny(normalized, ["fatura atrasada", "atrasado", "atrasada", "overdue", "vencido", "vencida"])) return "atrasado";
  if (textIncludesAny(normalized, ["cancelado", "cancelada", "encerrado", "lost", "perdido", "closed"])) return "encerrado";
  if (textIncludesAny(normalized, ["pendente", "draft", "novo", "faturar", "fatura enviada"])) return "aberto";
  return kind === "subscription" ? "ativa" : "aberto";
}

function mapFinanceStatusLabel(status) {
  const labels = {
    pago: "Pago",
    ativa: "Ativa",
    aberto: "Aberto",
    nao_pago: "Nao pago",
    atrasado: "Atrasado",
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
  if (textIncludesAny(joined, ["reembolso", "refund"])) {
    return "refund";
  }
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
    ["deal_payment_status_id", "deal_stage_id", "status", "cf_status"]
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

function getSnapshotRelationships(snapshot) {
  return safeJsonParse(snapshot?.relationships, {});
}

function getFreshsalesSnapshotLimit(env, entity, fallback = 250) {
  const specific = Number(getEnvString(env, `FRESHSALES_${String(entity || "").toUpperCase()}_SNAPSHOT_LIMIT`));
  if (Number.isFinite(specific) && specific > 0) return specific;
  const generic = Number(getEnvString(env, "FRESHSALES_SNAPSHOT_LIMIT"));
  if (Number.isFinite(generic) && generic > 0) return generic;
  return fallback;
}

function snapshotContainsAnyId(snapshot, candidateIds = []) {
  const ids = candidateIds.map((item) => String(item || "").trim()).filter(Boolean);
  if (!ids.length) return false;

  const relationships = getSnapshotRelationships(snapshot);
  const attributes = safeJsonParse(snapshot?.attributes, {});
  const customAttributes = safeJsonParse(snapshot?.custom_attributes, {});
  const summary = safeJsonParse(snapshot?.summary, {});
  const corpus = flattenToStrings([
    snapshot?.source_id,
    snapshot?.display_name,
    relationships,
    attributes,
    customAttributes,
    summary,
  ]).join(" | ");

  return ids.some((id) => corpus.includes(id));
}

function snapshotMatchesRelatedContacts(snapshot, contactIds = []) {
  const ids = contactIds.map((item) => String(item || "").trim()).filter(Boolean);
  if (!ids.length) return false;

  const relationships = getSnapshotRelationships(snapshot);
  const contactsField = getSnapshotFieldText(snapshot, ({ key }) => key === "contacts");
  const relationshipValues = flattenToStrings([
    relationships.contacts,
    relationships.contact_ids,
    relationships.related_contacts,
    contactsField,
  ]).join(" | ");

  if (ids.some((id) => relationshipValues.includes(id))) {
    return true;
  }

  return snapshotContainsAnyId(snapshot, ids);
}

function getFreshsalesOwnerFallbackId(email, env) {
  const normalizedEmail = normalizeEmail(email);
  return getEnvString(env, "FRESHSALES_OWNER_ID") || FRESHSALES_OWNER_FALLBACKS[normalizedEmail] || "";
}

function shouldUseFreshsalesOwnerFallback(email, env) {
  return Boolean(getFreshsalesOwnerFallbackId(email, env));
}

function snapshotMatchesOwner(snapshot, ownerId) {
  if (!ownerId) return false;

  const ownerFields = [
    getSnapshotFieldText(snapshot, ({ key }) => ["owner_id", "user_id", "responsavel_id", "responsible_user_id"].includes(key)),
    getSnapshotFieldText(snapshot, ({ key, entry }) => textIncludesAny(`${key} ${entry?.label || ""}`, ["owner", "responsavel", "responsável", "usuario responsavel", "usuário responsável"])),
  ].filter(Boolean);

  return ownerFields.some((value) => String(value).includes(String(ownerId))) || snapshotContainsAnyId(snapshot, [ownerId]);
}

function mapFreshsalesAccountToProcessRow(accountSnapshot, processFieldKeys = []) {
  const timestamps = safeJsonParse(accountSnapshot?.timestamps, {});
  const processReference = findAccountProcessReference(accountSnapshot, processFieldKeys);
  const status =
    getSnapshotFieldText(accountSnapshot, ({ key }) => ["cf_status", "status"].includes(key)) ||
    accountSnapshot?.status ||
    "sem_status";
  const tribunal = getSnapshotFieldText(accountSnapshot, ({ key, entry }) =>
    textIncludesAny(`${key} ${entry?.label || ""}`, ["tribunal", "vara", "orgao julgador", "órgão julgador"])
  );
  const classe = getSnapshotFieldText(accountSnapshot, ({ key }) => ["cf_classe"].includes(key));
  const area = getSnapshotFieldText(accountSnapshot, ({ key }) => ["cf_area"].includes(key));
  const assunto = getSnapshotFieldText(accountSnapshot, ({ key }) => ["cf_assunto"].includes(key));
  const valor = getSnapshotFieldText(accountSnapshot, ({ key, entry }) =>
    textIncludesAny(`${key} ${entry?.label || ""}`, ["valor", "annual revenue"])
  );
  const metadata = {
    source: "freshsales_sales_account",
    source_id: accountSnapshot?.source_id || null,
    process_reference: processReference,
    tj_reference: getSnapshotFieldText(accountSnapshot, ({ key }) => ["cf_processo_tj", "website"].includes(key)),
    phase: getSnapshotFieldText(accountSnapshot, ({ key }) => ["cf_fase"].includes(key)),
    latest_movement_description: getSnapshotFieldText(accountSnapshot, ({ key }) => ["cf_descricao_ultimo_movimento"].includes(key)),
    latest_publication_date: getSnapshotFieldText(accountSnapshot, ({ key }) => ["cf_publicacao_em"].includes(key)),
  };

  return normalizeProcessRow({
    id: accountSnapshot?.source_id || processReference,
    numero_cnj: processReference,
    numero: processReference,
    titulo: accountSnapshot?.display_name || assunto || processReference || "Processo",
    tribunal,
    status,
    updated_at: timestamps.updated_at || accountSnapshot?.synced_at || null,
    classe,
    area,
    valor_causa: valor,
    data_distribuicao: getSnapshotFieldText(accountSnapshot, ({ key }) => ["cf_data_de_distribuio"].includes(key)),
    metadata,
  });
}

async function listFreshsalesRelatedAccounts(env, email) {
  const ownerId = getFreshsalesOwnerFallbackId(email, env);
  const safeSnapshots = async (entity, fallbackLimit) => {
    try {
      return await listFreshsalesSnapshots(env, entity, getFreshsalesSnapshotLimit(env, entity, fallbackLimit));
    } catch (error) {
      const message = String(error?.message || "");
      if (
        message.includes("freshsales_sync_snapshots") ||
        message.includes("Could not find the table") ||
        message.includes("PGRST205")
      ) {
        return [];
      }
      throw error;
    }
  };

  const [contactsRaw, dealsRaw, accountsRaw] = await Promise.all([
    safeSnapshots("contacts", 300),
    safeSnapshots("deals", 1000),
    safeSnapshots("sales_accounts", 1000),
  ]);

  const contacts = Array.isArray(contactsRaw) ? contactsRaw.filter((item) => snapshotHasEmail(item, email)) : [];
  const contactIds = contacts.map((item) => String(item.source_id || "").trim()).filter(Boolean);
  const accountProcessFields = parseEnvList(env, "FRESHSALES_FINANCE_ACCOUNT_PROCESS_FIELDS");
  const includeOwnerFallback = shouldUseFreshsalesOwnerFallback(email, env);
  const deals = Array.isArray(dealsRaw) ? dealsRaw : [];
  const preRelatedDeals = deals.filter((snapshot) => {
    const relationships = getSnapshotRelationships(snapshot);
    const accountId = String(relationships.sales_account_id || "").trim();
    if (snapshotMatchesRelatedContacts(snapshot, contactIds)) return true;
    if (snapshotHasEmail(snapshot, email)) return true;
    if (includeOwnerFallback && snapshotMatchesOwner(snapshot, ownerId)) return true;
    if (accountId && snapshotContainsAnyId(snapshot, contactIds)) return true;
    return false;
  });
  const dealAccountIds = preRelatedDeals
    .map((snapshot) => String(getSnapshotRelationships(snapshot).sales_account_id || "").trim())
    .filter(Boolean);
  const accounts = (Array.isArray(accountsRaw) ? accountsRaw : []).filter((snapshot) => {
    if (snapshotContainsAnyId(snapshot, contactIds)) return true;
    if (dealAccountIds.includes(String(snapshot.source_id || "").trim())) return true;
    if (includeOwnerFallback && snapshotMatchesOwner(snapshot, ownerId)) return true;
    return false;
  });
  const accountIds = accounts.map((item) => String(item.source_id || "").trim()).filter(Boolean);
  const relatedDeals = deals.filter((snapshot) => {
    const relationships = getSnapshotRelationships(snapshot);
    const accountId = String(relationships.sales_account_id || "").trim();
    if (preRelatedDeals.some((item) => item.id === snapshot.id || item.source_id === snapshot.source_id)) return true;
    if (accountId && accountIds.includes(accountId)) return true;
    return false;
  });

  return {
    contacts,
    contactIds,
    ownerId: includeOwnerFallback ? ownerId : null,
    relatedDeals,
    accounts,
    accountIds,
    processFieldKeys: accountProcessFields,
  };
}

function buildFreshsalesAccountPublicationRows(accounts = [], processFieldKeys = []) {
  return uniqueBy(
    accounts
      .map((account) => {
        const normalizedAccount =
          account?.attributes || account?.custom_attributes || account?.source_id
            ? account
            : {
                source_id: account?.id || null,
                display_name: account?.name || null,
                status: account?.cf_status || account?.status || null,
                synced_at: account?.updated_at || account?.created_at || null,
                attributes: account,
                custom_attributes: account?.custom_field || {},
                timestamps: { updated_at: account?.updated_at || null, created_at: account?.created_at || null },
              };
        const publicationDate =
          getSnapshotFieldText(normalizedAccount, ({ key }) => ["cf_publicacao_em", "cf_data_ultimo_movimento"].includes(key)) ||
          getSnapshotFieldText(normalizedAccount, ({ key, entry }) => textIncludesAny(`${key} ${entry?.label || ""}`, ["publicacao", "publicação", "ultimo movimento", "último movimento"])) ||
          null;
        const content =
          getSnapshotFieldText(normalizedAccount, ({ key }) => ["cf_contedo_publicacao", "cf_conteudo_publicacao", "cf_descricao_ultimo_movimento"].includes(key)) ||
          getSnapshotFieldText(normalizedAccount, ({ key, entry }) => textIncludesAny(`${key} ${entry?.label || ""}`, ["conteudo publicacao", "conteúdo publicação", "publicacao", "publicação", "ultimo movimento", "último movimento"])) ||
          null;
        const processReference = findAccountProcessReference(normalizedAccount, processFieldKeys);
        const movementDate = getSnapshotFieldText(normalizedAccount, ({ key }) => ["cf_data_ultimo_movimento"].includes(key));
        const movementDescription = getSnapshotFieldText(normalizedAccount, ({ key }) => ["cf_descricao_ultimo_movimento"].includes(key));
        const effectiveDate = publicationDate || movementDate || normalizedAccount?.synced_at || normalizedAccount?.timestamps?.updated_at || null;
        const effectiveContent = content || movementDescription || null;

        if (!effectiveDate && !effectiveContent) return null;

        return {
          id: `fs-account-publicacao-${normalizedAccount?.source_id || processReference || Math.random()}`,
          date: effectiveDate,
          title: normalizedAccount?.display_name || processReference || "Atualizacao do processo",
          summary: effectiveContent || "Atualizacao registrada no CRM para este processo.",
          content: effectiveContent || "",
          source: "Freshsales",
          status: getSnapshotFieldText(normalizedAccount, ({ key }) => ["cf_status", "status"].includes(key)) || null,
          url: null,
          process_id: normalizedAccount?.source_id ? String(normalizedAccount.source_id) : processReference || null,
        };
      })
      .filter(Boolean),
    (item) => item.id
  );
}

async function getFreshsalesPortalContextLive(env, email) {
  try {
    const contactSummary = await lookupFreshsalesContactByEmail(env, email);
    const contactId = contactSummary?.id ? String(contactSummary.id) : null;
    if (!contactId) {
      return {
        contact: null,
        accounts: [],
        deals: [],
        appointments: [],
        activities: [],
      };
    }

    const contact = await viewFreshsalesContact(env, contactId);
    const accountRefs = Array.isArray(contact?.sales_accounts) ? contact.sales_accounts : [];
    const dealRefs = Array.isArray(contact?.deals) ? contact.deals : [];
    const appointments = Array.isArray(contact?.appointments) ? contact.appointments : [];
    const activitiesFromContact = Array.isArray(contact?.sales_activities) ? contact.sales_activities : [];

    const accounts = (
      await Promise.all(
        accountRefs.map((item) => viewFreshsalesSalesAccount(env, item?.id || item).catch(() => null))
      )
    ).filter(Boolean);

    const accountDealRefs = accounts.flatMap((item) => (Array.isArray(item?.deals) ? item.deals : []));
    const deals = (
      await Promise.all(
        [...dealRefs, ...accountDealRefs].map((item) => viewFreshsalesDeal(env, item?.id || item).catch(() => null))
      )
    )
      .filter(Boolean)
      .reduce((acc, item) => {
        if (!acc.some((row) => String(row?.id || "") === String(item?.id || ""))) acc.push(item);
        return acc;
      }, []);

    const accountAppointments = accounts.flatMap((item) => (Array.isArray(item?.appointments) ? item.appointments : []));
    const mergedAppointments = [...appointments, ...accountAppointments].reduce((acc, item) => {
      const nextId = String(item?.id || item || "").trim();
      if (!nextId || acc.some((row) => String(row?.id || row || "").trim() === nextId)) return acc;
      acc.push(item);
      return acc;
    }, []);

    const accountIds = accounts.map((item) => String(item?.id || "").trim()).filter(Boolean);
    let accountActivities = [];
    try {
      const liveActivities = await listFreshsalesSalesActivities(env, { page: 1, perPage: 100 });
      accountActivities = liveActivities.filter((item) => {
        const targetType = normalizeText(item?.targetable_type || "");
        const targetId = String(item?.targetable_id || "").trim();
        return targetType.includes("salesaccount") && accountIds.includes(targetId);
      });
    } catch {
      accountActivities = [];
    }

    return {
      contact,
      accounts,
      deals,
      appointments: mergedAppointments,
      activities: [...activitiesFromContact, ...accountActivities],
    };
  } catch {
    return {
      contact: null,
      accounts: [],
      deals: [],
      appointments: [],
      activities: [],
    };
  }
}

export async function getClientPortalAudit(env, email) {
  const liveContext = await getFreshsalesPortalContextLive(env, email);
  const snapshotContext = await listFreshsalesRelatedAccounts(env, email);
  const consultas = await listClientConsultas(env, email);
  const processos = await listClientProcessos(env, email);
  const financeiro = await listClientFinanceiro(env, email);
  const publicacoes = await listClientPublicacoes(env, { email });

  return {
    email,
    live: {
      contact_id: liveContext.contact?.id || null,
      accounts: (liveContext.accounts || []).map((item) => ({ id: item.id, name: item.name, website: item.website || null, processo: item.cf_processo || null })),
      deals: (liveContext.deals || []).map((item) => ({ id: item.id, name: item.name, sales_account_id: item.sales_account_id || item.sales_account?.id || null, amount: item.amount || null })),
      appointments: (liveContext.appointments || []).map((item) => ({ id: item.id, title: item.title || null, from_date: item.from_date || item.start_date || null })),
      activities: (liveContext.activities || []).map((item) => ({ id: item.id, title: item.title || null, targetable_type: item.targetable_type || null, targetable_id: item.targetable_id || null })),
    },
    snapshots: {
      contacts: snapshotContext.contacts?.length || 0,
      account_ids: snapshotContext.accountIds || [],
      related_deals: snapshotContext.relatedDeals?.map((item) => item.source_id) || [],
    },
    portal: {
      consultas: consultas.summary || null,
      processos: { total: processos.items?.length || 0, warning: processos.warning || null },
      financeiro: { total: financeiro.items?.length || 0, warning: financeiro.warning || null },
      publicacoes: { total: publicacoes.items?.length || 0, warning: publicacoes.warning || null },
    },
  };
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
  const normalizedDueDate =
    getSnapshotFieldText(dealSnapshot, ({ key }) => key === "cf_vencimento_da_fatura") ||
    dueDate;
  const stageText =
    getSnapshotFieldText(dealSnapshot, ({ key, entry }) => textIncludesAny(`${key} ${entry?.label || ""}`, ["estagio", "estágio", "stage", "status"])) ||
    dealSnapshot?.status ||
    null;
  const normalizedStageText =
    (mapping?.deal_stage_field?.key
      ? getSnapshotFieldText(dealSnapshot, ({ key }) => key === mapping.deal_stage_field.key)
      : null) ||
    stageText;
  const status = mapFinanceStatus(normalizedStageText || "", kind);
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
    kind_label: kind === "subscription" ? "Assinatura" : kind === "invoice" ? "Fatura" : kind === "refund" ? "Reembolso" : "Financeiro",
    status,
    status_label: mapFinanceStatusLabel(status),
    amount,
    amount_label: formatCurrencyBRL(amount),
    due_date: normalizedDueDate,
    created_at: timestamps.created_at || null,
    updated_at: timestamps.updated_at || null,
    stage: normalizedStageText,
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
    deal_type_field: selectConfiguredFieldCandidate(dealTypeCandidates, parseEnvList(env, "FRESHSALES_FINANCE_DEAL_TYPE_FIELDS"), ["deal_type_id", "cf_tipo_fatura", "cf_categoria", "cf_tipo", "cf_modalidade", "cf_produto", "type"]),
    process_reference_field: selectConfiguredFieldCandidate(processCandidates, parseEnvList(env, "FRESHSALES_FINANCE_ACCOUNT_PROCESS_FIELDS"), ["cf_processo", "cf_processo_tj", "website", "name"]),
    account_status_field: selectConfiguredFieldCandidate(accountStatusCandidates, parseEnvList(env, "FRESHSALES_FINANCE_ACCOUNT_STATUS_FIELDS"), ["cf_status", "status"]),
    deal_stage_field: stageSemantics.field,
    deal_stage_values: stageSemantics.values,
    stage_semantics: stageSemantics.semantics,
  };
}

function normalizeProcessRow(row) {
  if (!row) return null;
  const rawStatus = row.status || row.status_atual_processo || "sem_status";
  return {
    id: row.id || row.processo_id || row.numero_cnj || row.numero || null,
    account_id_freshsales: row.account_id_freshsales || row.sales_account_id || null,
    number: row.numero_cnj || row.numero || row.cnj || row.processo_numero_cnj || null,
    title: row.titulo || row.title || row.assunto || row.numero_cnj || row.numero || "Processo",
    court: row.tribunal || row.tribunal_sigla || row.orgao_julgador || null,
    status: rawStatus,
    status_group: normalizeProcessStatusGroup(rawStatus),
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

function normalizeFreshsalesActivityPublicationRow(row) {
  return {
    id: row?.id ? `fs-activity-${row.id}` : `fs-activity-${Math.random()}`,
    date: row?.start_date || row?.created_at || row?.updated_at || null,
    title: row?.title || "Publicacao",
    summary: row?.notes || row?.description || "",
    content: row?.notes || row?.description || "",
    source: "Freshsales",
    status: row?.sales_activity_type_id || null,
    url: null,
    process_id: row?.targetable_id ? String(row.targetable_id) : null,
  };
}

function inferDocumentCategory(row = {}) {
  const corpus = flattenToStrings([
    row.nome,
    row.titulo,
    row.tipo,
    row.categoria,
    row.classificacao,
    row.descricao,
    row.metadata,
  ]).join(" | ");

  if (textIncludesAny(corpus, ["contrato", "procuracao", "procuração", "assinatura"])) return "cadastro";
  if (textIncludesAny(corpus, ["peticao", "petição", "manifestacao", "manifestação", "inicial"])) return "peticao";
  if (textIncludesAny(corpus, ["sentenca", "sentença", "acordao", "acórdão", "decisao", "decisão"])) return "decisao";
  if (textIncludesAny(corpus, ["boleto", "fatura", "financeiro", "pagamento"])) return "financeiro";
  return "geral";
}

function mapDocumentStatus(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "disponivel";
  if (textIncludesAny(normalized, ["pendente", "aguardando", "processando"])) return "pendente";
  if (textIncludesAny(normalized, ["assinado", "concluido", "concluído", "finalizado"])) return "concluido";
  if (textIncludesAny(normalized, ["expirado", "cancelado"])) return "expirado";
  return "disponivel";
}

function mapDocumentStatusLabel(status) {
  const labels = {
    disponivel: "Disponivel",
    pendente: "Pendente",
    concluido: "Concluido",
    expirado: "Expirado",
  };
  return labels[status] || "Disponivel";
}

function mapDocumentCategoryLabel(category) {
  const labels = {
    cadastro: "Cadastro",
    peticao: "Peca processual",
    decisao: "Decisao judicial",
    financeiro: "Financeiro",
    geral: "Geral",
  };
  return labels[category] || "Geral";
}

function toTimestamp(value) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function diffInDays(value) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return null;
  const diff = Date.now() - timestamp;
  return Math.max(0, Math.floor(diff / 86400000));
}

function summarizeProcessInsights(process, movements = [], publications = []) {
  const latestMovement = movements.length ? [...movements].sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date))[0] : null;
  const latestPublication = publications.length ? [...publications].sort((a, b) => toTimestamp(b.date) - toTimestamp(a.date))[0] : null;
  const latestActivityDate = [process?.updated_at, latestMovement?.date, latestPublication?.date]
    .filter(Boolean)
    .sort((left, right) => toTimestamp(right) - toTimestamp(left))[0] || null;
  const staleDays = diffInDays(latestActivityDate);

  const alerts = [];
  if (latestPublication && diffInDays(latestPublication.date) <= 7) {
    alerts.push({
      tone: "highlight",
      label: "Nova publicacao",
      helper: latestPublication.title || latestPublication.source || "Publicacao recente identificada.",
    });
  }
  if (latestMovement && diffInDays(latestMovement.date) <= 7) {
    alerts.push({
      tone: "info",
      label: "Andamento recente",
      helper: latestMovement.title || "Movimentacao recente sincronizada.",
    });
  }
  if (staleDays != null && staleDays >= 30) {
    alerts.push({
      tone: "muted",
      label: "Sem atualizacao recente",
      helper: `Ultima atividade visivel ha ${staleDays} dias.`,
    });
  }
  if (String(process?.status || "").toLowerCase().includes("arquiv")) {
    alerts.push({
      tone: "muted",
      label: "Processo arquivado",
      helper: "O status atual indica arquivo ou encerramento.",
    });
  }

  return {
    latest_movement: latestMovement
      ? {
          date: latestMovement.date || null,
          title: latestMovement.title || "Movimentacao recente",
          summary: latestMovement.body || latestMovement.source || null,
        }
      : null,
    latest_publication: latestPublication
      ? {
          date: latestPublication.date || null,
          title: latestPublication.title || "Publicacao recente",
          summary: latestPublication.summary || latestPublication.source || null,
        }
      : null,
    latest_activity_at: latestActivityDate,
    stale_days: staleDays,
    alerts,
  };
}

function relationTypeLabel(value) {
  const type = String(value || "").trim().toLowerCase();
  const labels = {
    dependencia: "Dependencia",
    apenso: "Apenso",
    incidente: "Incidente",
    recurso: "Recurso",
  };
  return labels[type] || "Relacionado";
}

async function listJudiciarioProcessRelations(env, identifiers = []) {
  const unique = [...new Set((identifiers || []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!unique.length) return [];

  const results = [];
  for (const identifier of unique.slice(0, 30)) {
    try {
      const encoded = encodeURIComponent(identifier);
      const rows = await fetchSupabaseAdmin(
        env,
        `processo_relacoes?or=(numero_cnj_pai.eq.${encoded},numero_cnj_filho.eq.${encoded})&select=id,processo_pai_id,processo_filho_id,numero_cnj_pai,numero_cnj_filho,tipo_relacao,status,observacoes,updated_at,created_at`,
        {
          headers: {
            "Accept-Profile": "judiciario",
          },
        }
      );
      if (Array.isArray(rows)) {
        results.push(...rows);
      }
    } catch (error) {
      const message = String(error?.message || "");
      if (
        message.includes("PGRST205") ||
        message.includes("Could not find the table") ||
        message.includes("does not exist")
      ) {
        return [];
      }
      throw error;
    }
  }

  return results.reduce((acc, item) => {
    if (!acc.some((row) => row.id === item.id)) acc.push(item);
    return acc;
  }, []);
}

async function enrichRelationProcessRefs(env, relationRows = []) {
  const numbers = [...new Set(relationRows.flatMap((row) => [row.numero_cnj_pai, row.numero_cnj_filho]).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!numbers.length) return new Map();

  const related = [];
  for (const number of numbers.slice(0, 60)) {
    const result = await tryFetchOptional(env, [
      {
        path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,status_atual_processo,updated_at,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,metadata&numero_cnj=eq.${encodeURIComponent(number)}&limit=1`,
        mapRow: normalizeProcessRow,
      },
      {
        path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,status_atual_processo,updated_at,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,metadata&numero=eq.${encodeURIComponent(number)}&limit=1`,
        mapRow: normalizeProcessRow,
      },
    ]);
    if (result.items[0]) {
      related.push(result.items[0]);
    }
  }

  return new Map(related.map((item) => [String(item.number || item.id || "").trim(), item]));
}

async function buildProcessTreeMap(env, processes = []) {
  const identifiers = processes.flatMap((item) => buildProcessIdentifierCandidates(item, item.id));
  const relationRows = await listJudiciarioProcessRelations(env, identifiers);
  if (!relationRows.length) return new Map();

  const relatedProcessMap = await enrichRelationProcessRefs(env, relationRows);
  const processMap = new Map(processes.map((item) => [String(item.number || item.id || "").trim(), item]));
  const treeMap = new Map();

  processes.forEach((process) => {
    const candidates = buildProcessIdentifierCandidates(process, process.id);
    const candidateSet = new Set(candidates);
    const relatedRows = relationRows.filter((row) => candidateSet.has(String(row.numero_cnj_pai || "").trim()) || candidateSet.has(String(row.numero_cnj_filho || "").trim()));
    if (!relatedRows.length) return;

    const parentLinks = [];
    const childLinks = [];
    const relationTags = [];

    for (const row of relatedRows) {
      const isParent = candidateSet.has(String(row.numero_cnj_pai || "").trim());
      const otherNumber = isParent ? String(row.numero_cnj_filho || "").trim() : String(row.numero_cnj_pai || "").trim();
      const otherProcess = processMap.get(otherNumber) || relatedProcessMap.get(otherNumber) || null;
      const relation = {
        id: row.id,
        type: row.tipo_relacao,
        type_label: relationTypeLabel(row.tipo_relacao),
        status: row.status || "ativo",
        number: otherNumber,
        title: otherProcess?.title || otherProcess?.raw?.titulo || otherNumber,
        status_group: otherProcess?.status_group || normalizeProcessStatusGroup(otherProcess?.status || row.status || ""),
        process_id: otherProcess?.id || null,
        observacoes: row.observacoes || null,
      };

      relationTags.push(relation.type_label);
      if (isParent) {
        childLinks.push(relation);
      } else {
        parentLinks.push(relation);
      }
    }

    treeMap.set(process.id, {
      parent_links: parentLinks,
      child_links: childLinks,
      relation_tags: [...new Set(relationTags)],
      total_related: parentLinks.length + childLinks.length,
    });
  });

  return treeMap;
}

function buildProcessIdentifierCandidates(process, processId) {
  const values = [
    processId,
    process?.id,
    process?.number,
    process?.account_id_freshsales,
    process?.metadata?.source_id,
    process?.metadata?.process_reference,
    process?.raw?.id,
    process?.raw?.numero_cnj,
    process?.raw?.numero,
    process?.raw?.account_id_freshsales,
  ];
  const expanded = [];
  values
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .forEach((value) => {
      expanded.push(value);
      const normalized = normalizeProcessLookupValue(value);
      if (normalized && normalized !== value) {
        expanded.push(normalized);
      }
    });
  return [...new Set(expanded)];
}

export function buildClientDraftProfile(user, profile = null) {
  const fallback = buildFallbackClientProfile(user);
  const metadata = safeJsonParse(profile?.metadata, fallback.metadata || {});
  const normalizedMetadata = {
    ...metadata,
    profession: metadata.profession || "",
    marital_status: metadata.marital_status || "",
    addresses: Array.isArray(metadata.addresses) ? metadata.addresses : [],
    contacts: Array.isArray(metadata.contacts) ? metadata.contacts : [],
    personal_data_locks:
      metadata.personal_data_locks && typeof metadata.personal_data_locks === "object"
        ? metadata.personal_data_locks
        : {
            cpf_verified: false,
            full_name_verified: false,
          },
  };
  return {
    id: profile?.id || fallback.id,
    email: profile?.email || fallback.email,
    full_name: profile?.full_name || fallback.full_name,
    is_active: profile?.is_active ?? fallback.is_active,
    whatsapp: profile?.whatsapp || fallback.whatsapp,
    cpf: profile?.cpf || fallback.cpf,
    metadata: normalizedMetadata,
    onboarding_required: !isClientProfileComplete({
      ...profile,
      ...{
        full_name: profile?.full_name || fallback.full_name,
        whatsapp: profile?.whatsapp || fallback.whatsapp,
        cpf: profile?.cpf || fallback.cpf,
        metadata: normalizedMetadata,
        is_active: profile?.is_active ?? fallback.is_active,
      },
    }),
  };
}

async function safeResolve(promiseFactory, fallback) {
  try {
    return await promiseFactory();
  } catch {
    return fallback;
  }
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

function normalizeConsultaStatus(value) {
  const normalized = normalizeText(value);
  if (!normalized) return "agendada";
  if (textIncludesAny(normalized, ["cancel", "cancelada", "cancelado"])) return "cancelada";
  if (textIncludesAny(normalized, ["confirm", "confirmada", "confirmado"])) return "confirmada";
  if (textIncludesAny(normalized, ["realizada", "concluida", "concluida", "atendida", "finalizada"])) return "realizada";
  if (textIncludesAny(normalized, ["remarc", "reagendada"])) return "remarcada";
  if (textIncludesAny(normalized, ["pendente", "aguardando"])) return "pendente";
  return "agendada";
}

function mapConsultaStatusLabel(status) {
  const labels = {
    agendada: "Agendada",
    confirmada: "Confirmada",
    pendente: "Pendente",
    remarcada: "Remarcada",
    realizada: "Realizada",
    cancelada: "Cancelada",
  };
  return labels[status] || "Agendada";
}

function buildConsultaDateTime(item) {
  if (!item?.data) return null;
  const time = item.hora || "12:00";
  const iso = `${item.data}T${time.length === 5 ? `${time}:00` : time}-03:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeConsultaRow(row) {
  const status = normalizeConsultaStatus(row.status);
  const datetime = buildConsultaDateTime(row);
  return {
    id: row.id,
    name: row.nome || null,
    email: row.email || null,
    telefone: row.telefone || null,
    area: row.area || "Consulta",
    data: row.data || null,
    hora: row.hora || null,
    status,
    status_label: mapConsultaStatusLabel(status),
    observacoes: row.observacoes || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    datetime_iso: datetime ? datetime.toISOString() : null,
    is_upcoming: Boolean(datetime && datetime.getTime() >= Date.now() && status !== "cancelada"),
  };
}

function normalizeFreshsalesAppointmentRow(row) {
  const startDate = row?.from_date || row?.start_date || row?.appointment_start || null;
  const parsed = startDate ? new Date(startDate) : null;
  const data = parsed && !Number.isNaN(parsed.getTime())
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(parsed)
    : null;
  const hora = parsed && !Number.isNaN(parsed.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(parsed)
    : null;

  return normalizeConsultaRow({
    id: row?.id ? `fs-${row.id}` : `fs-${startDate || Math.random()}`,
    nome: row?.title || row?.name || "Consulta",
    email: null,
    telefone: null,
    area: row?.title || row?.appointment_type || "Consulta",
    data,
    hora,
    status: row?.appointment_outcome_id || row?.status || row?.appointment_status || "agendada",
    observacoes: row?.description || row?.summary || row?.location || null,
    created_at: row?.created_at || null,
    updated_at: row?.updated_at || null,
  });
}

export async function listClientConsultas(env, email) {
  const params = new URLSearchParams();
  params.set("select", "id,nome,email,telefone,area,data,hora,status,observacoes,created_at,updated_at");
  params.set("email", `eq.${email}`);
  params.set("order", "data.desc,hora.desc");
  params.set("limit", "50");
  let warning = null;
  let localItems = [];
  let appointmentItems = [];

  try {
    const rows = await fetchSupabaseAdmin(env, `agendamentos?${params.toString()}`);
    localItems = Array.isArray(rows) ? rows.map(normalizeConsultaRow) : [];
  } catch {
    warning = "A agenda local nao respondeu neste ambiente; o portal exibira as consultas encontradas no CRM.";
  }

  try {
    const liveContext = await getFreshsalesPortalContextLive(env, email);
    appointmentItems = (liveContext.appointments || []).map(normalizeFreshsalesAppointmentRow);
  } catch {
    warning = warning || "Nao foi possivel consolidar todas as consultas do CRM neste momento.";
  }
  const mergedMap = new Map();
  [...localItems, ...appointmentItems].forEach((item) => {
    const key = String(item.id || `${item.data}-${item.hora}-${item.area}`).trim();
    if (!key) return;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, item);
    }
  });
  const items = Array.from(mergedMap.values()).sort((left, right) => {
    const leftTime = left.datetime_iso ? new Date(left.datetime_iso).getTime() : 0;
    const rightTime = right.datetime_iso ? new Date(right.datetime_iso).getTime() : 0;
    return rightTime - leftTime;
  });
  const upcomingItems = items
    .filter((item) => item.is_upcoming)
    .sort((left, right) => {
      const leftTime = left.datetime_iso ? new Date(left.datetime_iso).getTime() : Infinity;
      const rightTime = right.datetime_iso ? new Date(right.datetime_iso).getTime() : Infinity;
      return leftTime - rightTime;
    });

  return {
    items,
    next_consulta: upcomingItems[0] || null,
    warning,
    summary: {
      total: items.length,
      agendadas: items.filter((item) => ["agendada", "confirmada", "pendente", "remarcada"].includes(item.status)).length,
      realizadas: items.filter((item) => item.status === "realizada").length,
      canceladas: items.filter((item) => item.status === "cancelada").length,
      proximas: upcomingItems.length,
    },
  };
}

export async function listClientProcessos(env, email, options = {}) {
  const statusFilter = String(options.status || "").trim().toLowerCase();
  const result = await tryFetchOptional(env, [
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,account_id_freshsales&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=200`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,account_id_freshsales&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=200`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,email_cliente,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,account_id_freshsales&email_cliente=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=200`,
      mapRow: normalizeProcessRow,
    },
  ]);

  let freshsalesWarning = null;
  let freshsalesItems = [];
  try {
    const freshsalesContext = await listFreshsalesRelatedAccounts(env, email);
    freshsalesItems = freshsalesContext.accounts.map((account) =>
      mapFreshsalesAccountToProcessRow(account, freshsalesContext.processFieldKeys)
    );
    const liveContext = await getFreshsalesPortalContextLive(env, email);
    const liveItems = (liveContext.accounts || []).map((account) =>
      mapFreshsalesAccountToProcessRow(
        {
          source_id: account.id,
          display_name: account.name,
          status: account.cf_status || account.status,
          synced_at: account.updated_at || account.created_at,
          attributes: account,
          custom_attributes: account.custom_field || {},
          timestamps: { updated_at: account.updated_at, created_at: account.created_at },
        },
        freshsalesContext.processFieldKeys
      )
    );
    freshsalesItems = [...freshsalesItems, ...liveItems];
    if (freshsalesItems.length) {
      freshsalesWarning = "Parte da carteira processual foi vinculada via Freshsales, a partir dos accounts associados ao seu cadastro.";
    }
  } catch (error) {
    freshsalesWarning = "O CRM nao respondeu por completo nesta leitura; o portal exibira apenas os processos que conseguir vincular com seguranca.";
    freshsalesItems = [];

    try {
      const liveContext = await getFreshsalesPortalContextLive(env, email);
      freshsalesItems = (liveContext.accounts || []).map((account) =>
        mapFreshsalesAccountToProcessRow(
          {
            source_id: account.id,
            display_name: account.name,
            status: account.cf_status || account.status,
            synced_at: account.updated_at || account.created_at,
            attributes: account,
            custom_attributes: account.custom_field || {},
            timestamps: { updated_at: account.updated_at, created_at: account.created_at },
          },
          ["cf_processo", "name"]
        )
      );
    } catch {
      freshsalesItems = [];
    }
  }

  if (!result.items.length && !freshsalesItems.length) {
    return {
      items: [],
      warning: "Nenhum processo foi localizado nas fontes atuais do portal, incluindo o Freshsales e a base judicial.",
    };
  }

  const mergedMap = new Map();
  [...result.items, ...freshsalesItems].forEach((item) => {
    const key = String(item.number || item.id || "").trim();
    if (!key) return;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, item);
      return;
    }
    mergedMap.set(key, {
      ...mergedMap.get(key),
      ...item,
      metadata: {
        ...(mergedMap.get(key)?.metadata || {}),
        ...(item?.metadata || {}),
      },
    });
  });
  const mergedItems = Array.from(mergedMap.values());
  const treeMap = await safeResolve(() => buildProcessTreeMap(env, mergedItems), new Map());

  const enrichedItems = await Promise.all(
    mergedItems.map(async (process) => {
      const candidates = buildProcessIdentifierCandidates(process, process.id);
      let movements = [];
      let publications = [];

      try {
        [movements, publications] = await Promise.all([
          listClientProcessMovements(env, candidates[0]),
          listClientProcessPublications(env, candidates[0]),
        ]);
      } catch {
        movements = [];
        publications = [];
      }

      return {
        ...process,
        ...(treeMap.get(process.id) || {
          parent_links: [],
          child_links: [],
          relation_tags: [],
          total_related: 0,
        }),
        ...summarizeProcessInsights(process, movements.slice(0, 5), publications.slice(0, 5)),
      };
    })
  );

  const filteredItems = enrichedItems.filter((item) => processMatchesStatusFilter(item, statusFilter));

  return {
    ...result,
    items: filteredItems,
    warning: [result.warning, freshsalesWarning].filter(Boolean).join(" ").trim() || null,
  };
}

async function getClientProcessBase(env, email, processId) {
  const rawProcessId = String(processId || "").trim();
  const normalizedProcessId = normalizeProcessLookupValue(rawProcessId);
  const result = await tryFetchOptional(env, [
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&id=eq.${encodeURIComponent(rawProcessId)}&cliente_email=eq.${encodeURIComponent(email)}&limit=1`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,email_cliente,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&id=eq.${encodeURIComponent(rawProcessId)}&email_cliente=eq.${encodeURIComponent(email)}&limit=1`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&numero_cnj=eq.${encodeURIComponent(rawProcessId)}&cliente_email=eq.${encodeURIComponent(email)}&limit=1`,
      mapRow: normalizeProcessRow,
    },
    {
      path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,email_cliente,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&numero_cnj=eq.${encodeURIComponent(rawProcessId)}&email_cliente=eq.${encodeURIComponent(email)}&limit=1`,
      mapRow: normalizeProcessRow,
    },
    {
        path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&numero=eq.${encodeURIComponent(rawProcessId)}&cliente_email=eq.${encodeURIComponent(email)}&limit=1`,
        mapRow: normalizeProcessRow,
    },
    {
        path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata,account_id_freshsales&account_id_freshsales=eq.${encodeURIComponent(rawProcessId)}&limit=1`,
        mapRow: normalizeProcessRow,
    },
    {
        path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,email_cliente,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata,account_id_freshsales&account_id_freshsales=eq.${encodeURIComponent(rawProcessId)}&limit=1`,
        mapRow: normalizeProcessRow,
    },
    ...(normalizedProcessId && normalizedProcessId !== rawProcessId
      ? [
          {
            path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&numero_cnj=eq.${encodeURIComponent(normalizedProcessId)}&cliente_email=eq.${encodeURIComponent(email)}&limit=1`,
            mapRow: normalizeProcessRow,
          },
          {
            path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,email_cliente,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&numero_cnj=eq.${encodeURIComponent(normalizedProcessId)}&email_cliente=eq.${encodeURIComponent(email)}&limit=1`,
            mapRow: normalizeProcessRow,
          },
          {
            path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,cliente_email,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&numero=eq.${encodeURIComponent(normalizedProcessId)}&cliente_email=eq.${encodeURIComponent(email)}&limit=1`,
            mapRow: normalizeProcessRow,
          },
          {
            path: `processos?select=id,numero_cnj,numero,titulo,tribunal,status,updated_at,email_cliente,classe,valor_causa,data_distribuicao,polo_ativo,polo_passivo,quantidade_movimentacoes,movimentacoes,partes,metadata&numero=eq.${encodeURIComponent(normalizedProcessId)}&email_cliente=eq.${encodeURIComponent(email)}&limit=1`,
            mapRow: normalizeProcessRow,
          },
        ]
      : []),
    ]);

  if (result.items[0]) {
    return result.items[0];
  }

  try {
    const freshsalesContext = await listFreshsalesRelatedAccounts(env, email);
      const matchedAccount = freshsalesContext.accounts.find((account) => {
        const processRow = mapFreshsalesAccountToProcessRow(account, freshsalesContext.processFieldKeys);
      const candidates = buildProcessIdentifierCandidates(processRow, rawProcessId);
      return candidates.includes(rawProcessId) || (normalizedProcessId ? candidates.includes(normalizedProcessId) : false);
    });

    return matchedAccount ? mapFreshsalesAccountToProcessRow(matchedAccount, freshsalesContext.processFieldKeys) : null;
  } catch {
    try {
      const liveContext = await getFreshsalesPortalContextLive(env, email);
      const matchedAccount = (liveContext.accounts || []).find((account) => {
        const processRow = mapFreshsalesAccountToProcessRow(
          {
            source_id: account.id,
            display_name: account.name,
            status: account.cf_status || account.status,
            synced_at: account.updated_at || account.created_at,
            attributes: account,
            custom_attributes: account.custom_field || {},
            timestamps: { updated_at: account.updated_at, created_at: account.created_at },
          },
          ["cf_processo", "name"]
        );
        const candidates = [...buildProcessIdentifierCandidates(processRow, processId), String(account?.id || "").trim()];
        return candidates.includes(String(processId).trim());
      });

      if (!matchedAccount) return null;

      return mapFreshsalesAccountToProcessRow(
        {
          source_id: matchedAccount.id,
          display_name: matchedAccount.name,
          status: matchedAccount.cf_status || matchedAccount.status,
          synced_at: matchedAccount.updated_at || matchedAccount.created_at,
          attributes: matchedAccount,
          custom_attributes: matchedAccount.custom_field || {},
          timestamps: { updated_at: matchedAccount.updated_at, created_at: matchedAccount.created_at },
        },
        ["cf_processo", "name"]
      );
    } catch {
      return null;
    }
  }
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
        path: `publicacoes?select=id,processo_id,numero_cnj,data_publicacao,data_disponibilizacao,publicada_em,titulo,resumo,texto,conteudo,veiculo,diario,fonte,status,url,link,created_at&processo_id=eq.${encodeURIComponent(candidate)}&order=data_publicacao.desc.nullslast,created_at.desc.nullslast&limit=100`,
        mapRow: normalizePublicationRow,
      },
      {
        path: `publicacoes?select=id,processo_id,numero_cnj,data_publicacao,data_disponibilizacao,publicada_em,titulo,resumo,texto,conteudo,veiculo,diario,fonte,status,url,link,created_at&numero_cnj=eq.${encodeURIComponent(candidate)}&order=data_publicacao.desc.nullslast,created_at.desc.nullslast&limit=100`,
        mapRow: normalizePublicationRow,
      },
      {
        path: `processo_publicacoes?select=id,processo_id,numero_cnj,data_publicacao,data_disponibilizacao,publicada_em,titulo,resumo,texto,conteudo,veiculo,diario,fonte,status,url,link,created_at&processo_id=eq.${encodeURIComponent(candidate)}&order=data_publicacao.desc.nullslast,created_at.desc.nullslast&limit=100`,
        mapRow: normalizePublicationRow,
      },
      {
        path: `processo_publicacoes?select=id,processo_id,numero_cnj,data_publicacao,data_disponibilizacao,publicada_em,titulo,resumo,texto,conteudo,veiculo,diario,fonte,status,url,link,created_at&numero_cnj=eq.${encodeURIComponent(candidate)}&order=data_publicacao.desc.nullslast,created_at.desc.nullslast&limit=100`,
        mapRow: normalizePublicationRow,
      },
    ]);
    if (result.items.length) return result.items;
  }

  return [];
}

async function listClientProcessAudiencias(env, processId) {
  const candidates = buildProcessIdentifierCandidates(null, processId);
  for (const candidate of candidates) {
    const result = await tryFetchOptional(env, [
      {
        path: `audiencias?select=id,processo_id,numero_cnj,tipo,data_audiencia,data,descricao,observacoes,metadata,created_at&processo_id=eq.${encodeURIComponent(candidate)}&order=data_audiencia.desc.nullslast,data.desc.nullslast,created_at.desc.nullslast&limit=50`,
        mapRow: (row) => ({
          id: row.id,
          process_id: row.processo_id || row.numero_cnj || null,
          title: row.tipo || "Audiencia",
          date: row.data_audiencia || row.data || row.created_at || null,
          summary: row.descricao || row.observacoes || null,
          metadata: safeJsonParse(row.metadata, {}),
        }),
      },
      {
        path: `audiencias?select=id,processo_id,numero_cnj,tipo,data_audiencia,data,descricao,observacoes,metadata,created_at&numero_cnj=eq.${encodeURIComponent(candidate)}&order=data_audiencia.desc.nullslast,data.desc.nullslast,created_at.desc.nullslast&limit=50`,
        mapRow: (row) => ({
          id: row.id,
          process_id: row.processo_id || row.numero_cnj || null,
          title: row.tipo || "Audiencia",
          date: row.data_audiencia || row.data || row.created_at || null,
          summary: row.descricao || row.observacoes || null,
          metadata: safeJsonParse(row.metadata, {}),
        }),
      },
    ]);
    if (result.items.length) return result.items;
  }
  return [];
}

async function listClientProcessDocuments(env, email, processId) {
  const candidates = buildProcessIdentifierCandidates(null, processId);
  for (const candidate of candidates) {
    const result = await tryFetchOptional(env, [
      {
        path: `documentos?select=id,nome,status,created_at,updated_at,arquivo_url,cliente_email,tipo,categoria,descricao,metadata,processo_id,numero_cnj&processo_id=eq.${encodeURIComponent(candidate)}&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=50`,
        mapRow: (row) => ({
          id: row.id,
          name: row.nome || "Documento",
          status: mapDocumentStatus(row.status),
          status_label: mapDocumentStatusLabel(mapDocumentStatus(row.status)),
          category: inferDocumentCategory(row),
          category_label: mapDocumentCategoryLabel(inferDocumentCategory(row)),
          created_at: row.created_at || null,
          updated_at: row.updated_at || null,
          reference_date: row.updated_at || row.created_at || null,
          url: row.arquivo_url || null,
          process_id: row.processo_id || row.numero_cnj || null,
          summary: row.descricao || null,
        }),
      },
      {
        path: `documentos?select=id,titulo,status,created_at,updated_at,file_url,cliente_email,tipo,categoria,descricao,metadata,processo_id,numero_cnj&processo_id=eq.${encodeURIComponent(candidate)}&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=50`,
        mapRow: (row) => ({
          id: row.id,
          name: row.titulo || "Documento",
          status: mapDocumentStatus(row.status),
          status_label: mapDocumentStatusLabel(mapDocumentStatus(row.status)),
          category: inferDocumentCategory(row),
          category_label: mapDocumentCategoryLabel(inferDocumentCategory(row)),
          created_at: row.created_at || null,
          updated_at: row.updated_at || null,
          reference_date: row.updated_at || row.created_at || null,
          url: row.file_url || null,
          process_id: row.processo_id || row.numero_cnj || null,
          summary: row.descricao || null,
        }),
      },
    ]);
    if (result.items.length) return result.items;
  }
  return [];
}

async function listClientPublicationsFromJudicialBase(env, processItems = []) {
  const identifiers = uniqueBy(
    processItems.flatMap((item) => buildProcessIdentifierCandidates(item, item.id)).filter(Boolean),
    (value) => value
  );

  if (!identifiers.length) return [];

  const publicationBatches = await Promise.all(
    chunkArray(identifiers, 25).map(async (batch) => {
      const rows = await Promise.all(batch.map((processId) => safeResolve(() => listClientProcessPublications(env, processId), [])));
      return rows.flat();
    })
  );

  return uniqueBy(publicationBatches.flat(), (item) => item.id || `${item.process_id || "proc"}-${item.date || item.title || ""}`);
}

export async function getClientProcessDetails(env, profile, processId) {
  let process = await safeResolve(() => getClientProcessBase(env, profile.email, processId), null);

  if (!process) {
    const portfolio = await safeResolve(() => listClientProcessos(env, profile.email), { items: [] });
    const rawProcessId = String(processId || "").trim();
    const normalizedProcessId = normalizeProcessLookupValue(rawProcessId);
    process = (portfolio.items || []).find((item) => {
      const candidates = buildProcessIdentifierCandidates(item, rawProcessId);
      return candidates.includes(rawProcessId) || (normalizedProcessId ? candidates.includes(normalizedProcessId) : false);
    }) || null;
  }

  if (!process) {
    return {
      process: null,
      parts: [],
      movements: [],
      publications: [],
      audiencias: [],
      documents: [],
      warnings: ["O processo solicitado nao foi encontrado para o cadastro autenticado."],
    };
  }

  const embeddedParts = Array.isArray(process.raw?.partes) ? process.raw.partes.map(normalizePartRow) : [];
  const embeddedMovements = Array.isArray(process.raw?.movimentacoes) ? process.raw.movimentacoes.map(normalizeMovementRow) : [];
  const treeMap = await safeResolve(() => buildProcessTreeMap(env, [process]), new Map());

  const processCandidates = buildProcessIdentifierCandidates(process, processId);
  const [parts, movements, publications, audiencias, documents] = await Promise.all([
    embeddedParts.length ? embeddedParts : safeResolve(() => listClientProcessParts(env, processCandidates[0]), []),
    embeddedMovements.length ? embeddedMovements : safeResolve(() => listClientProcessMovements(env, processCandidates[0]), []),
    safeResolve(() => listClientProcessPublications(env, processCandidates[0]), []),
    safeResolve(() => listClientProcessAudiencias(env, processCandidates[0]), []),
    safeResolve(() => listClientProcessDocuments(env, profile.email, processCandidates[0]), []),
  ]);

  const warnings = [];
  if (!parts.length) warnings.push("As partes do processo ainda nao estao visiveis nesta fonte.");
  if (!movements.length) warnings.push("Os andamentos ainda nao foram sincronizados para este processo.");
  if (!publications.length) warnings.push("Ainda nao ha publicacoes vinculadas a este processo no portal.");
  if (!audiencias.length) warnings.push("Nenhuma audiencia vinculada foi localizada para este processo.");
  if (!documents.length) warnings.push("Nenhum documento vinculado foi localizado para este processo.");
  const insights = summarizeProcessInsights(process, movements, publications);

  return {
    process: {
      ...process,
      ...(treeMap.get(process.id) || {
        parent_links: [],
        child_links: [],
        relation_tags: [],
        total_related: 0,
      }),
      ...insights,
    },
    parts,
    movements,
    publications,
    audiencias,
    documents,
    warnings,
  };
}

export async function listClientPublicacoes(env, profile) {
  const processes = await safeResolve(
    () => listClientProcessos(env, profile.email),
    {
      items: [],
      warning: "A carteira processual nao respondeu por completo; o portal tentara exibir as publicacoes disponiveis.",
    }
  );
  const processItems = Array.isArray(processes.items) ? processes.items : [];
  let livePublicacoes = [];
  let liveAccountPublicacoes = [];
  let liveWarning = processes.warning || null;
  let snapshotAccountPublicacoes = [];
  try {
    const liveContext = await getFreshsalesPortalContextLive(env, profile.email);
    livePublicacoes = (liveContext.activities || [])
      .filter((item) => textIncludesAny(`${item?.title || ""} ${item?.notes || ""}`, ["publicacao", "publicação", "andamento"]))
      .map(normalizeFreshsalesActivityPublicationRow);
    liveAccountPublicacoes = buildFreshsalesAccountPublicationRows(liveContext.accounts || [], ["cf_processo", "name"]);
  } catch {
    livePublicacoes = [];
    liveAccountPublicacoes = [];
    liveWarning = "O CRM nao respondeu por completo; o portal exibira as publicacoes disponiveis na base judicial.";
  }

  try {
    const freshsalesContext = await listFreshsalesRelatedAccounts(env, profile.email);
    snapshotAccountPublicacoes = buildFreshsalesAccountPublicationRows(
      freshsalesContext.accounts || [],
      freshsalesContext.processFieldKeys || []
    );
  } catch {
    snapshotAccountPublicacoes = [];
  }

  if (!processItems.length && !livePublicacoes.length && !liveAccountPublicacoes.length && !snapshotAccountPublicacoes.length) {
    return {
      items: [],
      warning: liveWarning || "Nenhuma publicacao foi localizada nas fontes atuais do portal para os processos vinculados ao seu cadastro.",
    };
  }

  const judicialPublicacoes = await safeResolve(
    () => listClientPublicationsFromJudicialBase(env, processItems),
    []
  );

  const items = uniqueBy([...judicialPublicacoes, ...livePublicacoes, ...liveAccountPublicacoes, ...snapshotAccountPublicacoes], (item) => item.id || `${item.process_id || "proc"}-${item.date || item.title || ""}`).sort((left, right) => {
    const leftTime = left.date ? new Date(left.date).getTime() : 0;
    const rightTime = right.date ? new Date(right.date).getTime() : 0;
    return rightTime - leftTime;
  });

  return {
    items,
    warning: items.length ? liveWarning : (liveWarning || "Ainda nao ha publicacoes judiciais sincronizadas para os seus processos."),
  };
}

export async function listClientDocumentos(env, email) {
  const result = await tryFetchOptional(env, [
    {
      path: `documentos?select=id,nome,status,created_at,updated_at,arquivo_url,cliente_email,tipo,categoria,descricao,metadata,processo_id,numero_cnj&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: (row) => ({
        id: row.id,
        name: row.nome || "Documento",
        status: mapDocumentStatus(row.status),
        status_label: mapDocumentStatusLabel(mapDocumentStatus(row.status)),
        category: inferDocumentCategory(row),
        category_label: mapDocumentCategoryLabel(inferDocumentCategory(row)),
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        reference_date: row.updated_at || row.created_at || null,
        url: row.arquivo_url || null,
        process_id: row.processo_id || row.numero_cnj || null,
        summary: row.descricao || null,
      }),
    },
    {
      path: `documentos?select=id,titulo,status,created_at,updated_at,file_url,cliente_email,tipo,categoria,descricao,metadata,processo_id,numero_cnj&cliente_email=eq.${encodeURIComponent(email)}&order=updated_at.desc&limit=20`,
      mapRow: (row) => ({
        id: row.id,
        name: row.titulo || "Documento",
        status: mapDocumentStatus(row.status),
        status_label: mapDocumentStatusLabel(mapDocumentStatus(row.status)),
        category: inferDocumentCategory(row),
        category_label: mapDocumentCategoryLabel(inferDocumentCategory(row)),
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        reference_date: row.updated_at || row.created_at || null,
        url: row.file_url || null,
        process_id: row.processo_id || row.numero_cnj || null,
        summary: row.descricao || null,
      }),
    },
  ]);

  if (!result.items.length) {
    return {
      items: [],
      summary: {
        total: 0,
        pendentes: 0,
        disponiveis: 0,
        categorias: {},
      },
      warning: "Estante documental em ativacao neste projeto.",
    };
  }

  const categories = result.items.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  return {
    ...result,
    summary: {
      total: result.items.length,
      pendentes: result.items.filter((item) => item.status === "pendente").length,
      disponiveis: result.items.filter((item) => item.status === "disponivel" || item.status === "concluido").length,
      categorias: categories,
    },
  };
}

export async function listClientFinanceiro(env, email) {
  try {
    const freshsalesContext = await listFreshsalesRelatedAccounts(env, email);
    const liveContext = await getFreshsalesPortalContextLive(env, email);
    const processPortfolio = await safeResolve(() => listClientProcessos(env, email), { items: [], warning: null });
    const normalizedEmail = normalizeEmail(email);
    const contacts = freshsalesContext.contacts || [];
    const contactIds = new Set(freshsalesContext.contactIds || []);
    const processLinkedAccountIds = new Set(
      (processPortfolio.items || [])
        .map((item) => String(item?.account_id_freshsales || "").trim())
        .filter(Boolean)
    );
    const liveAccounts = (liveContext.accounts || []).map((account) => ({
      source_id: account.id,
      display_name: account.name,
      status: account.cf_status || account.status || null,
      attributes: account,
      custom_attributes: account.custom_field || {},
      timestamps: { created_at: account.created_at, updated_at: account.updated_at },
    }));
    const missingProcessAccountIds = Array.from(processLinkedAccountIds).filter(
      (accountId) => !liveAccounts.some((item) => String(item?.source_id || "").trim() === accountId)
        && !(freshsalesContext.accounts || []).some((item) => String(item?.source_id || "").trim() === accountId)
    );
    const fetchedProcessAccounts = (
      await Promise.all(
        missingProcessAccountIds.slice(0, 50).map((accountId) => viewFreshsalesSalesAccount(env, accountId).catch(() => null))
      )
    )
      .filter(Boolean)
      .map((account) => ({
        source_id: account.id,
        display_name: account.name,
        status: account.cf_status || account.status || null,
        attributes: account,
        custom_attributes: account.custom_field || {},
        timestamps: { created_at: account.created_at, updated_at: account.updated_at },
      }));
    const accounts = uniqueBy(
      [...(freshsalesContext.accounts || []), ...liveAccounts, ...fetchedProcessAccounts],
      (item) => String(item?.source_id || "").trim()
    );
    const relatedAccountIds = new Set([
      ...(freshsalesContext.accountIds || []),
      ...(liveContext.accounts || []).map((item) => String(item?.id || "").trim()).filter(Boolean),
      ...Array.from(processLinkedAccountIds),
    ]);
    const ownerId = freshsalesContext.ownerId || null;
    const accountsById = new Map(accounts.map((item) => [String(item.source_id || "").trim(), item]));
    const missingDealsFromAccounts = Array.from(
      new Set(
        accounts.flatMap((account) =>
          Array.isArray(account?.attributes?.deals) ? account.attributes.deals.map((item) => String(item?.id || item || "").trim()).filter(Boolean) : []
        )
      )
    );
    const liveDeals = (liveContext.deals || []).map((deal) => ({
      source_id: deal.id,
      display_name: deal.name,
      status: deal.status || null,
      relationships: {
        sales_account_id: deal.sales_account_id || deal.sales_account?.id || null,
        targetable_id: liveContext.contact?.id || null,
        targetable_type: "Contact",
      },
      attributes: deal,
      custom_attributes: deal.custom_field || {},
      summary: { amount: deal.amount, expected_close: deal.expected_close },
      timestamps: { created_at: deal.created_at, updated_at: deal.updated_at },
    }));
    const fetchedAccountDeals = (
      await Promise.all(
        missingDealsFromAccounts.slice(0, 100).map((dealId) => viewFreshsalesDeal(env, dealId).catch(() => null))
      )
    )
      .filter(Boolean)
      .map((deal) => ({
        source_id: deal.id,
        display_name: deal.name,
        status: deal.status || null,
        relationships: {
          sales_account_id: deal.sales_account_id || deal.sales_account?.id || null,
          targetable_id: liveContext.contact?.id || null,
          targetable_type: deal.targetable_type || "SalesAccount",
        },
        attributes: deal,
        custom_attributes: deal.custom_field || {},
        summary: { amount: deal.amount, expected_close: deal.expected_close },
        timestamps: { created_at: deal.created_at, updated_at: deal.updated_at },
      }));
    const relatedDeals = uniqueBy([...(freshsalesContext.relatedDeals || []), ...liveDeals, ...fetchedAccountDeals], (deal) => String(deal?.source_id || deal?.id || "").trim()).filter((deal) => {
      const relationships = safeJsonParse(deal.relationships, {});
      const targetType = normalizeText(relationships.targetable_type || "");
      const targetId = String(relationships.targetable_id || "").trim();
      const accountId = String(relationships.sales_account_id || "").trim();

      if (targetType.includes("contact") && contactIds.has(targetId)) return true;
      if (accountId && relatedAccountIds.has(accountId)) return true;
      if (snapshotMatchesRelatedContacts(deal, Array.from(contactIds))) return true;
      if (snapshotHasEmail(deal, normalizedEmail)) return true;

      const textCorpus = getSnapshotTextCorpus(deal);
      const includeByContact = contacts.some((contact) => {
        const contactId = String(contact.source_id || "").trim();
        return contactId && textCorpus.includes(contactId);
      });
      if (includeByContact) return true;

      if (ownerId && snapshotMatchesOwner(deal, ownerId)) return true;
      return false;
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
    const refunds = items.filter((item) => item.kind === "refund");
    const others = items.filter((item) => item.kind === "other");
    const openAmount = invoices
      .filter((item) => !["pago", "encerrado"].includes(item.status))
      .reduce((sum, item) => sum + (item.amount || 0), 0);
    const recurringAmount = subscriptions
      .filter((item) => item.status !== "encerrado")
      .reduce((sum, item) => sum + (item.amount || 0), 0);
    const statusCounts = items.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

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
        linked_accounts: accounts.map((account) => ({
          id: account.source_id,
          name: account.display_name || "Sales Account",
          process_reference: findAccountProcessReference(account, mapping?.process_reference_field?.key ? [mapping.process_reference_field.key] : []),
          status: getSnapshotFieldText(account, ({ key }) => ["cf_status", "status"].includes(key)) || account.status || null,
        })),
        summary: {
          total_items: 0,
          invoices: 0,
          subscriptions: 0,
          refunds: 0,
          open_amount: 0,
          recurring_amount: 0,
          status_counts: {
            aberto: 0,
            pago: 0,
            atrasado: 0,
            nao_pago: 0,
          },
        },
        mapping,
        field_catalog: fieldCatalog,
        diagnostics: {
          contacts_found: contacts.length,
          linked_accounts: accounts.length,
          related_deals: relatedDeals.length,
        },
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
    if (processLinkedAccountIds.size) {
      warnings.push(`Pareamento financeiro reforcado por ${processLinkedAccountIds.size} processo(s) com Sales Account vinculado no HMADV.`);
    }

    return {
      items,
      invoices,
      subscriptions,
      others,
      linked_accounts: accounts.map((account) => ({
        id: account.source_id,
        name: account.display_name || "Sales Account",
        process_reference: findAccountProcessReference(account, mapping?.process_reference_field?.key ? [mapping.process_reference_field.key] : []),
        status: getSnapshotFieldText(account, ({ key }) => ["cf_status", "status"].includes(key)) || account.status || null,
      })),
      summary: {
        total_items: items.length,
        invoices: invoices.length,
        subscriptions: subscriptions.length,
        refunds: refunds.length,
        open_amount: openAmount,
        recurring_amount: recurringAmount,
        status_counts: {
          aberto: statusCounts.aberto || 0,
          pago: statusCounts.pago || 0,
          atrasado: statusCounts.atrasado || 0,
          nao_pago: statusCounts.nao_pago || 0,
        },
      },
      mapping,
      field_catalog: fieldCatalog,
      diagnostics: {
        contacts_found: contacts.length,
        linked_accounts: accounts.length,
        related_deals: relatedDeals.length,
      },
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
        linked_accounts: [],
        summary: {
          total_items: 0,
          invoices: 0,
          subscriptions: 0,
          refunds: 0,
          open_amount: 0,
          recurring_amount: 0,
          status_counts: {
            aberto: 0,
            pago: 0,
            atrasado: 0,
            nao_pago: 0,
          },
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
        diagnostics: {
          contacts_found: 0,
          linked_accounts: 0,
          related_deals: 0,
        },
        warning: "Nenhum item financeiro foi localizado nas fontes atuais do Freshsales para o seu cadastro.",
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
  const consultaItems = Array.isArray(consultas?.items) ? consultas.items : [];

  const recentActivity = [
    ...consultaItems.slice(0, 3).map((item) => ({
      id: `consulta-${item.id}`,
      type: "consulta",
      title: item.area || "Consulta agendada",
      date: item.updated_at || item.created_at || item.data || null,
      helper: `${item.data || ""} ${item.hora || ""}`.trim() || item.status_label || item.status || "Consulta",
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
  const attentionItems = [
    ...financeiro.items
      .filter((item) => ["atrasado", "nao_pago", "aberto"].includes(item.status))
      .slice(0, 3)
      .map((item) => ({
        id: `financeiro-${item.id}`,
        tone: item.status === "atrasado" ? "critical" : item.status === "nao_pago" ? "warning" : "info",
        title: item.kind_label || "Financeiro",
        helper: `${item.status_label}${item.amount_label ? ` • ${item.amount_label}` : ""}`,
        href: "/portal/financeiro",
      })),
    ...processos.items
      .flatMap((item) => (item.alerts || []).slice(0, 1).map((alert) => ({
        id: `processo-alerta-${item.id}-${alert.label}`,
        tone: alert.tone === "highlight" ? "warning" : alert.tone === "info" ? "info" : "muted",
        title: item.title || item.number || "Processo",
        helper: `${alert.label} • ${alert.helper}`,
        href: `/portal/processos/detalhe?id=${encodeURIComponent(item.id)}`,
      })))
      .slice(0, 3),
    ...tickets.items
      .filter((item) => ["Aberto", "Pendente"].includes(item.status))
      .slice(0, 2)
      .map((item) => ({
        id: `ticket-${item.id}`,
        tone: "info",
        title: item.subject || "Chamado de suporte",
        helper: `${item.status}${item.priority ? ` • ${item.priority}` : ""}`,
        href: "/portal/tickets",
      })),
    ...consultaItems
      .filter((item) => item.status && item.status !== "cancelada")
      .slice(0, 2)
      .map((item) => ({
        id: `consulta-${item.id}`,
        tone: "muted",
        title: item.area || "Consulta agendada",
        helper: `${item.data || ""} ${item.hora || ""}`.trim() || item.status_label || item.status || "Consulta",
        href: "/portal/consultas",
      })),
  ].slice(0, 6);

  return {
    summary: {
      processos: processos.items.length,
      tickets: tickets.items.length,
      consultas: consultaItems.length,
      documentos: documentos.items.length,
      financeiro: financeiro.items.length,
      publicacoes: publicacoes.items.length,
    },
    recentActivity,
    attentionItems,
    warnings,
  };
}
