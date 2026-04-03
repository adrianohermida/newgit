import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";

function jsonOk(payload, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...payload }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(error, status = 500) {
  return new Response(
    JSON.stringify({ ok: false, error: error?.message || "Falha operacional no HMADV." }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeKeyword(value) {
  return normalizeText(value).toUpperCase();
}

function hmadvHeaders(env, schema = "judiciario", extra = {}) {
  const serviceKey = getSupabaseServerKey(env);
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente no ambiente.");
  }
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
    "Accept-Profile": schema,
    ...extra,
  };
}

async function hmadvFunction(env, name, query = {}, init = {}) {
  const baseUrl = getSupabaseBaseUrl(env);
  const serviceKey = getSupabaseServerKey(env);
  if (!baseUrl || !serviceKey) {
    throw new Error("Configuracao HMADV/Supabase incompleta.");
  }
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  const response = await fetch(
    `${baseUrl}/functions/v1/${name}${qs.toString() ? `?${qs.toString()}` : ""}`,
    {
      method: init.method || "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    }
  );
  const text = await response.text().catch(() => "");
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error((payload && (payload.error || payload.message)) || text || `HMADV function failed: ${response.status}`);
  }
  return payload;
}

async function hmadvRest(env, path, init = {}, schema = "judiciario") {
  return fetchSupabaseAdmin(env, path, {
    ...init,
    headers: {
      ...hmadvHeaders(env, schema),
      ...(init.headers || {}),
    },
  });
}

function splitIntoChunks(items, size) {
  const output = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function buildInFilter(field, values) {
  const items = values
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .map((value) => `"${value.replace(/"/g, '\\"')}"`);
  return `${field}=in.(${items.join(",")})`;
}

function normalizeProcessNumber(value) {
  return String(value || "").replace(/\D+/g, "").trim();
}

function buildProcessLabel(row) {
  return row?.titulo || row?.name || row?.display_name || row?.numero_cnj || "Processo";
}

async function countTable(env, table, filters = "", schema = "judiciario") {
  const baseUrl = getSupabaseBaseUrl(env);
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${filters}${filters ? "&" : ""}select=id`, {
    headers: hmadvHeaders(env, schema, {
      Prefer: "count=exact",
      Range: "0-0",
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Count failed for ${table}`);
  }
  const contentRange = response.headers.get("content-range") || "";
  const match = contentRange.match(/\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

async function countTableSafe(env, table, filters = "", schema = "judiciario", fallback = 0) {
  try {
    return await countTable(env, table, filters, schema);
  } catch (error) {
    const message = String(error?.message || "");
    if (
      message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("PGRST")
    ) {
      return fallback;
    }
    throw error;
  }
}

async function listTableSafe(env, path, schema = "judiciario", fallback = []) {
  try {
    return await hmadvRest(env, path, {}, schema);
  } catch (error) {
    const message = String(error?.message || "");
    if (
      message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("PGRST") ||
      message.includes("42703")
    ) {
      return fallback;
    }
    throw error;
  }
}

export function detectAuctionKeyword(rawPayload) {
  const keywords = Array.isArray(rawPayload?.palavrasChave) ? rawPayload.palavrasChave : [];
  return keywords
    .map((item) => normalizeKeyword(item))
    .some((item) => item === "LEILAO" || item === "LEILOES");
}

function testAudienciaSignal(text) {
  const clean = normalizeText(text);
  if (!clean) return false;
  if (clean.includes("deixo de designar audiencia")) return false;
  return /(designad[ao].{0,40}audi|redesignad[ao].{0,40}audi|sessao de julgamento|audiencia.{0,200}\d{2}\/\d{2}\/\d{4})/i.test(clean);
}

function extractAudienciaDate(text) {
  const clean = normalizeText(text);
  const patterns = [
    /design[oa].{0,120}audiencia[\s\S]{0,240}?(\d{2}\/\d{2}\/\d{4})/i,
    /audiencia[\s\S]{0,240}?dia\s+(\d{2}\/\d{2}\/\d{4})/i,
    /sessao de julgamento[\s\S]{0,240}?(\d{2}\/\d{2}\/\d{4})/i,
    /(\d{2}\/\d{2}\/\d{4})[\s\S]{0,140}(?:audiencia|sessao de julgamento)/i,
  ];
  for (const pattern of patterns) {
    const match = clean.match(pattern);
    if (!match?.[1]) continue;
    const [dd, mm, yyyy] = match[1].split("/");
    const dt = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    if (!Number.isNaN(dt.getTime())) return dt;
  }
  return null;
}

function extractAudienciaTime(text) {
  const clean = normalizeText(text);
  const match = clean.match(/(?:as)\s*(\d{1,2}:\d{2})\s*h?/i) || clean.match(/(\d{1,2}:\d{2})\s*h/i);
  return match?.[1] || null;
}

function extractAudienciaLocal(text) {
  const original = String(text || "");
  const orgao = original.match(/órgão:\s*([^\.]+?)(?:tipo de comunicação:|tipo de documento:|meio:|parte\(s\):)/i);
  if (orgao?.[1]) return orgao[1].trim();
  const sala = original.match(/sala de audiências da\s+([^,\n]+)/i);
  if (sala?.[1]) return sala[1].trim();
  return null;
}

function buildAudienciaTipo(text) {
  const clean = normalizeText(text);
  if (clean.includes("sessao de julgamento")) return "sessao_julgamento";
  if (clean.includes("audiencia una")) return "audiencia_una";
  return "audiencia";
}

function buildAudienciaResumo(text, date) {
  const clean = normalizeText(text);
  const label = clean.includes("sessao de julgamento")
    ? "Sessao de julgamento"
    : clean.includes("audiencia una")
      ? "Audiencia una"
      : "Audiencia";
  return `${label} em ${date.toLocaleDateString("pt-BR")}`;
}

function parsePartesFromText(text) {
  const output = [];
  const source = String(text || "");
  const match = source.match(/Parte\(s\):\s*([^\n]+(?:\n(?!Advogado|Processo)[^\n]+)*)/i);
  if (!match?.[1]) return output;
  const regex = /([^()\r\n]{3,}?)\s*\(([AP])\)/g;
  let hit;
  while ((hit = regex.exec(match[1])) !== null) {
    const nome = String(hit[1] || "").trim();
    if (nome.length < 3) continue;
    const polo = hit[2] === "A" ? "ativo" : "passivo";
    const tipoPessoa = /\b(LTDA|S\.A\.|S\/A|ME|EPP|EIRELI|BANCO|FUND|ASSOC|SIND|CORP|GRUPO|EMPRESA|CONSTRUTORA|COMERCIAL|SERVI|INCORPORA)\b/i.test(nome)
      ? "JURIDICA"
      : "FISICA";
    output.push({ nome, polo, tipo_pessoa: tipoPessoa, fonte: "publicacao" });
  }
  return output.reduce((acc, item) => {
    const key = `${normalizeText(item.nome)}|${item.polo}`;
    if (!acc.some((row) => `${normalizeText(row.nome)}|${row.polo}` === key)) acc.push(item);
    return acc;
  }, []);
}

async function loadProcessesByNumbers(env, processNumbers) {
  const output = [];
  const exactCnjs = [];
  const fallbackTerms = [];
  for (const raw of processNumbers) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const digits = value.replace(/\D+/g, "");
    if (digits.length === 20) exactCnjs.push(digits);
    else fallbackTerms.push(value);
  }

  for (const chunk of splitIntoChunks([...new Set(exactCnjs)], 50)) {
    const candidatePaths = [
      `processos?${buildInFilter("numero_cnj", chunk)}&select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo`,
    ];
    for (const numero of chunk) {
      candidatePaths.push(
        `processos?numero_cnj=ilike.${encodeURIComponent(`*${numero}*`)}&select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo&limit=5`,
        `processos?titulo=ilike.${encodeURIComponent(`*${numero}*`)}&select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo&limit=5`
      );
    }
    for (const path of candidatePaths) {
      const rows = await listTableSafe(env, path);
      for (const row of rows) {
        if (!output.some((item) => item.id === row.id)) output.push(row);
      }
    }
  }

  for (const value of [...new Set(fallbackTerms)]) {
    const normalized = value.replace(/\D+/g, "");
    const candidatePaths = [
      `processos?titulo=ilike.${encodeURIComponent(`*${value}*`)}&select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo&limit=5`,
    ];
    if (normalized) {
      candidatePaths.push(
        `processos?numero_cnj=ilike.${encodeURIComponent(`*${normalized}*`)}&select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo&limit=5`
      );
    }
    for (const path of candidatePaths) {
      const rows = await listTableSafe(env, path);
      for (const row of rows) {
        if (row && !output.some((item) => item.id === row.id)) output.push(row);
      }
    }
  }
  return output;
}

async function loadPublicacoesByProcessIds(env, processIds, limitPerProcess = 50) {
  const output = [];
  for (const chunk of splitIntoChunks(processIds, 25)) {
    const rows = await hmadvRest(
      env,
      `publicacoes?${buildInFilter("processo_id", chunk)}&select=id,processo_id,conteudo,data_publicacao&order=data_publicacao.desc.nullslast&limit=${Math.max(chunk.length * limitPerProcess, chunk.length)}`
    );
    output.push(...rows);
  }
  return output;
}

async function loadAudienciasByProcessIds(env, processIds) {
  const output = [];
  for (const chunk of splitIntoChunks(processIds, 50)) {
    const rows = await hmadvRest(
      env,
      `audiencias?${buildInFilter("processo_id", chunk)}&select=id,processo_id,origem,origem_id,tipo,data_audiencia,descricao,local,situacao,freshsales_activity_id&limit=${Math.max(chunk.length * 20, chunk.length)}`
    );
    output.push(...rows);
  }
  return output;
}

async function loadPartesByProcessIds(env, processIds) {
  const output = [];
  for (const chunk of splitIntoChunks(processIds, 50)) {
    const rows = await hmadvRest(
      env,
      `partes?${buildInFilter("processo_id", chunk)}&select=id,processo_id,nome,polo&limit=${Math.max(chunk.length * 20, chunk.length)}`
    );
    output.push(...rows);
  }
  return output;
}

async function loadPublicacoesSemProcesso(env, limit = 100, offset = 0) {
  return hmadvRest(
    env,
    `publicacoes?processo_id=is.null&numero_processo_api=not.is.null&select=id,numero_processo_api,data_publicacao,conteudo&order=data_publicacao.desc.nullslast&limit=${limit}&offset=${offset}`
  );
}

export async function listCreateProcessCandidates(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const fetchSize = safePageSize * 6;
  const rows = await loadPublicacoesSemProcesso(env, fetchSize, (safePage - 1) * fetchSize);
  const grouped = [];
  for (const row of rows) {
    const numero = String(row.numero_processo_api || "").replace(/\D+/g, "");
    if (!numero) continue;
    const existing = grouped.find((item) => item.numero_cnj === numero);
    if (existing) {
      existing.publicacoes += 1;
      if (row.data_publicacao && (!existing.ultima_publicacao || row.data_publicacao > existing.ultima_publicacao)) {
        existing.ultima_publicacao = row.data_publicacao;
      }
      continue;
    }
    grouped.push({
      key: numero,
      numero_cnj: numero,
      publicacoes: 1,
      ultima_publicacao: row.data_publicacao || null,
      exemplo_publicacao_id: row.id,
      snippet: String(row.conteudo || "").slice(0, 220),
    });
    if (grouped.length >= safePageSize) break;
  }
  const total = await countTable(env, "publicacoes", "processo_id=is.null&numero_processo_api=not.is.null");
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: total,
    items: grouped,
  };
}

export async function listPartesExtractionCandidates(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const processRows = await hmadvRest(
    env,
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,polo_ativo,polo_passivo&processo_id=not.is.null&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
      .replace("processo_id=not.is.null&", "")
  );
  const processIds = processRows.map((item) => item.id);
  const [publicacoes, partes] = await Promise.all([
    processIds.length ? loadPublicacoesByProcessIds(env, processIds, 10) : Promise.resolve([]),
    processIds.length ? loadPartesByProcessIds(env, processIds) : Promise.resolve([]),
  ]);
  const items = [];
  for (const proc of processRows) {
    const pubs = publicacoes.filter((item) => item.processo_id === proc.id).slice(0, 25);
    if (!pubs.length) continue;
    const existing = partes.filter((item) => item.processo_id === proc.id);
    const parsed = pubs.flatMap((pub) => parsePartesFromText(pub.conteudo));
    const uniqueParsed = parsed.reduce((acc, item) => {
      const key = `${normalizeText(item.nome)}|${item.polo}`;
      if (!acc.some((row) => `${normalizeText(row.nome)}|${row.polo}` === key)) acc.push(item);
      return acc;
    }, []);
    const novas = uniqueParsed.filter(
      (parte) => !existing.some((item) => normalizeText(item.nome) === normalizeText(parte.nome) && item.polo === parte.polo)
    );
    if (!novas.length) continue;
    items.push({
      key: proc.numero_cnj || proc.id,
      processo_id: proc.id,
      numero_cnj: proc.numero_cnj,
      titulo: proc.titulo,
      account_id_freshsales: proc.account_id_freshsales || null,
      partes_existentes: existing.length,
      partes_detectadas: uniqueParsed.length,
      partes_novas: novas.length,
      sample_partes_novas: novas.slice(0, 4),
      sample_partes_existentes: existing.slice(0, 4),
      sample_partes: novas.slice(0, 4),
    });
  }
  const total = await countTable(env, "processos");
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: total,
    items,
  };
}

export async function getProcessosOverview(env) {
  const [
    syncStatus,
    processosTotal,
    processosComAccount,
    processosSemAccount,
    datajudEnriquecido,
    processosSemStatus,
    processosSemPolos,
    audienciasTotal,
    processosSemMovimentacao,
    monitoramentoAtivo,
    monitoramentoInativo,
    monitoramentoFilaPendente,
  ] = await Promise.all([
    hmadvFunction(env, "sync-worker", { action: "status" }),
    countTable(env, "processos"),
    countTable(env, "processos", "account_id_freshsales=not.is.null"),
    countTable(env, "processos", "account_id_freshsales=is.null"),
    countTableSafe(env, "processos", "datajud_enriquecido=eq.true"),
    countTable(env, "processos", "status_atual_processo=is.null"),
    countTable(env, "processos", "or=(polo_ativo.is.null,polo_passivo.is.null)"),
    countTable(env, "audiencias"),
    countTableSafe(env, "processos", "or=(quantidade_movimentacoes.is.null,quantidade_movimentacoes.eq.0)"),
    countTableSafe(env, "processos", "monitoramento_ativo=eq.true"),
    countTableSafe(env, "processos", "monitoramento_ativo=eq.false"),
    countTableSafe(env, "monitoramento_queue", "status=eq.pendente"),
  ]);
  return {
    processosTotal,
    processosComAccount,
    processosSemAccount,
    datajudEnriquecido,
    processosSemStatus,
    processosSemPolos,
    audienciasTotal,
    processosSemMovimentacao,
    monitoramentoAtivo,
    monitoramentoInativo,
    monitoramentoFilaPendente,
    syncWorker: syncStatus,
  };
}

export async function getPublicacoesOverview(env) {
  const [publicacoesTotal, publicacoesComActivity, publicacoesPendentesComAccount, publicacoesLeilaoIgnorado, publicacoesSemProcesso, partesTotal] = await Promise.all([
    countTable(env, "publicacoes"),
    countTable(env, "publicacoes", "freshsales_activity_id=not.is.null"),
    countTable(env, "publicacoes", "freshsales_activity_id=is.null&processo_id=not.is.null"),
    countTable(env, "publicacoes", "freshsales_activity_id=eq.LEILAO_IGNORADO"),
    countTable(env, "publicacoes", "processo_id=is.null"),
    countTable(env, "partes"),
  ]);
  return {
    publicacoesTotal,
    publicacoesComActivity,
    publicacoesPendentesComAccount,
    publicacoesLeilaoIgnorado,
    publicacoesSemProcesso,
    partesTotal,
  };
}

export async function scanOrphanProcesses(env, limit = 50) {
  const rows = await hmadvRest(
    env,
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo&account_id_freshsales=is.null&limit=${limit}`
  );
  return { total: rows.length, items: rows };
}

export async function listProcessesWithoutMovements(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const items = await listTableSafe(
    env,
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,quantidade_movimentacoes,monitoramento_ativo,status_atual_processo&or=(quantidade_movimentacoes.is.null,quantidade_movimentacoes.eq.0)&order=updated_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
  );
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: await countTableSafe(env, "processos", "or=(quantidade_movimentacoes.is.null,quantidade_movimentacoes.eq.0)"),
    items,
  };
}

export async function listMonitoringProcesses(env, { page = 1, pageSize = 20, active = true } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const flag = active ? "true" : "false";
  let items = await listTableSafe(
    env,
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,monitoramento_ativo,status_atual_processo,quantidade_movimentacoes&monitoramento_ativo=eq.${flag}&order=updated_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
  );
  let totalRows = await countTableSafe(env, "processos", `monitoramento_ativo=eq.${flag}`);
  if (active && !totalRows) {
    items = await listTableSafe(
      env,
      `processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,quantidade_movimentacoes&account_id_freshsales=not.is.null&order=updated_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
    );
    items = items.map((item) => ({ ...item, monitoramento_ativo: true, monitoramento_fallback: true }));
    totalRows = await countTableSafe(env, "processos", "account_id_freshsales=not.is.null");
  }
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows,
    items,
  };
}

export async function listFieldGapProcesses(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const items = await listTableSafe(
    env,
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,classe,assunto_principal,area,data_ajuizamento,sistema,polo_ativo,polo_passivo,status_atual_processo&account_id_freshsales=not.is.null&or=(classe.is.null,assunto_principal.is.null,area.is.null,data_ajuizamento.is.null,sistema.is.null,polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)&order=updated_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
  );
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: await countTableSafe(
      env,
      "processos",
      "account_id_freshsales=not.is.null&or=(classe.is.null,assunto_principal.is.null,area.is.null,data_ajuizamento.is.null,sistema.is.null,polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)"
    ),
    items,
  };
}

async function searchProcessRows(env, term, limit = 12) {
  const normalized = normalizeProcessNumber(term);
  const encodedTerm = encodeURIComponent(`*${String(term || "").trim()}*`);
  const queries = [];

  if (normalized) {
    queries.push(
      `processos?numero_cnj=eq.${normalized}&select=id,numero_cnj,titulo,status_atual_processo,account_id_freshsales&limit=${limit}`,
      `processos?numero_cnj=ilike.${encodeURIComponent(`*${normalized}*`)}&select=id,numero_cnj,titulo,status_atual_processo,account_id_freshsales&limit=${limit}`
    );
  }

  if (term) {
    queries.push(
      `processos?titulo=ilike.${encodedTerm}&select=id,numero_cnj,titulo,status_atual_processo,account_id_freshsales&limit=${limit}`
    );
  }

  const seen = new Set();
  const items = [];
  for (const path of queries) {
    const rows = await listTableSafe(env, path);
    for (const row of rows) {
      const key = String(row.id || row.numero_cnj || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: row.id,
        numero_cnj: row.numero_cnj,
        titulo: buildProcessLabel(row),
        status: row.status_atual_processo || "sem_status",
        account_id_freshsales: row.account_id_freshsales || null,
      });
    }
    if (items.length >= limit) break;
  }

  return items.slice(0, limit);
}

export async function searchProcessesForRelations(env, { query = "", limit = 12 } = {}) {
  const term = String(query || "").trim();
  if (!term) {
    return { items: [] };
  }

  const items = await searchProcessRows(env, term, Math.max(1, Math.min(Number(limit || 12), 25)));
  return { items };
}

export async function listProcessRelations(env, { query = "", page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const normalizedQuery = normalizeProcessNumber(query);
  let filter = "";

  if (normalizedQuery) {
    filter = `or=(numero_cnj_pai.eq.${normalizedQuery},numero_cnj_filho.eq.${normalizedQuery})`;
  }

  const path = `processo_relacoes?${filter ? `${filter}&` : ""}select=id,processo_pai_id,processo_filho_id,numero_cnj_pai,numero_cnj_filho,tipo_relacao,status,observacoes,created_at,updated_at&order=updated_at.desc&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`;
  const rows = await listTableSafe(env, path, "judiciario", []);
  const numbers = [...new Set(rows.flatMap((row) => [row.numero_cnj_pai, row.numero_cnj_filho]).map(normalizeProcessNumber).filter(Boolean))];
  const relatedProcesses = numbers.length
    ? await loadProcessesByNumbers(env, numbers)
    : [];
  const processMap = new Map(relatedProcesses.map((row) => [normalizeProcessNumber(row.numero_cnj), row]));

  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: await countTableSafe(env, "processo_relacoes", filter, "judiciario", 0),
    items: rows.map((row) => ({
      id: row.id,
      tipo_relacao: row.tipo_relacao,
      status: row.status,
      observacoes: row.observacoes || "",
      numero_cnj_pai: row.numero_cnj_pai,
      numero_cnj_filho: row.numero_cnj_filho,
      processo_pai: processMap.get(normalizeProcessNumber(row.numero_cnj_pai)) || null,
      processo_filho: processMap.get(normalizeProcessNumber(row.numero_cnj_filho)) || null,
      updated_at: row.updated_at || row.created_at || null,
    })),
  };
}

export async function upsertProcessRelation(env, payload) {
  const numeroPai = normalizeProcessNumber(payload.numero_cnj_pai);
  const numeroFilho = normalizeProcessNumber(payload.numero_cnj_filho);
  const tipoRelacao = String(payload.tipo_relacao || "").trim().toLowerCase();
  const status = String(payload.status || "ativo").trim().toLowerCase();

  if (!numeroPai || !numeroFilho || !tipoRelacao) {
    throw new Error("Informe processo pai, processo filho e tipo de relacao.");
  }

  if (numeroPai === numeroFilho) {
    throw new Error("O processo pai deve ser diferente do processo filho.");
  }

  const [pai] = await loadProcessesByNumbers(env, [numeroPai]);
  const [filho] = await loadProcessesByNumbers(env, [numeroFilho]);

  const body = {
    numero_cnj_pai: numeroPai,
    numero_cnj_filho: numeroFilho,
    processo_pai_id: pai?.id || null,
    processo_filho_id: filho?.id || null,
    tipo_relacao: tipoRelacao,
    status,
    observacoes: String(payload.observacoes || "").trim() || null,
  };

  const rows = await hmadvRest(
    env,
    "processo_relacoes?on_conflict=numero_cnj_pai,numero_cnj_filho,tipo_relacao",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "judiciario",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(body),
    },
    "judiciario"
  );

  return {
    relation: Array.isArray(rows) ? rows[0] || body : body,
    processo_pai: pai || null,
    processo_filho: filho || null,
  };
}

export async function deleteProcessRelation(env, relationId) {
  const id = String(relationId || "").trim();
  if (!id) {
    throw new Error("Informe o identificador da relacao.");
  }

  await hmadvRest(
    env,
    `processo_relacoes?id=eq.${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    },
    "judiciario"
  );

  return { deleted: true, id };
}

export async function inspectAudiencias(env, limit = 20) {
  return hmadvFunction(env, "sync-worker", { action: "inspect_audiencias", limit });
}

export async function backfillAudiencias(env, { processNumbers = [], limit = 100, apply = false } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 10), 25));
  const processes = processNumbers.length
    ? await loadProcessesByNumbers(env, processNumbers)
    : await hmadvRest(env, `processos?select=id,numero_cnj,titulo&limit=${safeLimit}`);
  const processIds = processes.map((item) => item.id);
  const [allPublicacoes, allExistentes] = await Promise.all([
    processIds.length ? loadPublicacoesByProcessIds(env, processIds, 20) : Promise.resolve([]),
    processIds.length ? loadAudienciasByProcessIds(env, processIds) : Promise.resolve([]),
  ]);
  let inserted = 0;
  const sample = [];
  for (const proc of processes) {
    const publicacoes = allPublicacoes.filter((item) => item.processo_id === proc.id).slice(0, 50);
    const existentes = allExistentes.filter((item) => item.processo_id === proc.id);
    const novas = [];
    for (const pub of publicacoes) {
      const txt = String(pub.conteudo || "");
      if (!testAudienciaSignal(txt)) continue;
      let dt = extractAudienciaDate(txt);
      if (!dt) continue;
      const hour = extractAudienciaTime(txt);
      if (hour) {
        const [hh, mm] = hour.split(":").map(Number);
        dt.setHours(hh || 0, mm || 0, 0, 0);
      }
      const alreadyExists = existentes.some((item) => {
        const sameOrigin = String(item.origem_id || "") === String(pub.id || "");
        const sameDate = item.data_audiencia && new Date(item.data_audiencia).toISOString().slice(0, 19) === dt.toISOString().slice(0, 19);
        return sameOrigin && sameDate;
      });
      if (alreadyExists) continue;
      novas.push({
        processo_id: proc.id,
        origem: "publicacao_advise",
        origem_id: pub.id,
        tipo: buildAudienciaTipo(txt),
        data_audiencia: dt.toISOString(),
        local: extractAudienciaLocal(txt),
        situacao: "detectada",
        descricao: txt.slice(0, 4000),
        metadata: {
          resumo: buildAudienciaResumo(txt, dt),
          numero_cnj: proc.numero_cnj,
          titulo_processo: proc.titulo,
          publicacao_id: pub.id,
        },
      });
    }
    if (novas.length && apply) {
      await hmadvRest(
        env,
        "audiencias?on_conflict=processo_id,origem,origem_id",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Profile": "judiciario",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(novas),
        }
      );
      inserted += novas.length;
    }
    if (novas.length || processNumbers.length) {
      sample.push({
        processo_id: proc.id,
        numero_cnj: proc.numero_cnj,
        titulo_processo: proc.titulo,
        publicacoes_lidas: publicacoes.length,
        audiencias_existentes: existentes.length,
        audiencias_novas: novas,
      });
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    processosLidos: processes.length,
    audienciasInseridas: inserted,
    sample: sample.slice(0, 30),
    limitAplicado: safeLimit,
  };
}

export async function backfillPartesFromPublicacoes(env, { processNumbers = [], limit = 50, apply = false } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 50));
  const processes = processNumbers.length
    ? await loadProcessesByNumbers(env, processNumbers)
    : await hmadvRest(env, `processos?select=id,numero_cnj,titulo,account_id_freshsales,polo_ativo,polo_passivo&limit=${safeLimit}`);
  const processIds = processes.map((item) => item.id);
  const [allPublicacoes, allPartes] = await Promise.all([
    processIds.length ? loadPublicacoesByProcessIds(env, processIds, 20) : Promise.resolve([]),
    processIds.length ? loadPartesByProcessIds(env, processIds) : Promise.resolve([]),
  ]);
  let inserted = 0;
  const sample = [];
  for (const proc of processes) {
    const publicacoes = allPublicacoes.filter((item) => item.processo_id === proc.id).slice(0, 50);
    const existentes = allPartes.filter((item) => item.processo_id === proc.id);
    const parsed = publicacoes.flatMap((pub) => parsePartesFromText(pub.conteudo));
    const uniqueParsed = parsed.reduce((acc, item) => {
      const key = `${normalizeText(item.nome)}|${item.polo}`;
      if (!acc.some((row) => `${normalizeText(row.nome)}|${row.polo}` === key)) acc.push(item);
      return acc;
    }, []);
    const novas = uniqueParsed
      .filter((parte) => !existentes.some((item) => normalizeText(item.nome) === normalizeText(parte.nome) && item.polo === parte.polo))
      .map((parte) => ({
        processo_id: proc.id,
        nome: parte.nome,
        polo: parte.polo,
        tipo_pessoa: parte.tipo_pessoa,
        fonte: "publicacao",
      }));
    if (novas.length && apply) {
      await hmadvRest(
        env,
        "partes?on_conflict=processo_id,nome,polo",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Profile": "judiciario",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(novas),
        }
      );
      inserted += novas.length;
    }
    if (novas.length || processNumbers.length) {
      sample.push({
        processo_id: proc.id,
        numero_cnj: proc.numero_cnj,
        titulo: proc.titulo,
        account_id_freshsales: proc.account_id_freshsales || null,
        publicacoes_lidas: publicacoes.length,
        partes_existentes: existentes.length,
        partes_detectadas: uniqueParsed.length,
        partes_existentes_preview: existentes.slice(0, 4),
        partes_novas: novas,
      });
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    processosLidos: processes.length,
    partesInseridas: inserted,
    sample: sample.slice(0, 20),
    limitAplicado: safeLimit,
  };
}

export async function runSyncWorker(env) {
  return hmadvFunction(env, "sync-worker", { action: "run" }, { method: "POST", body: {} });
}

export async function enrichProcessesViaDatajud(env, { processNumbers = [], limit = 10 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 10), 20));
  const processes = processNumbers.length
    ? await loadProcessesByNumbers(env, processNumbers)
    : await listTableSafe(
        env,
        `processos?select=id,numero_cnj,titulo,quantidade_movimentacoes,account_id_freshsales&or=(quantidade_movimentacoes.is.null,quantidade_movimentacoes.eq.0)&limit=${safeLimit}`
      );
  const sample = [];
  for (const proc of processes.slice(0, safeLimit)) {
    const numero = String(proc.numero_cnj || "").replace(/\D+/g, "");
    if (!numero) continue;
    const result = await hmadvFunction(
      env,
      "datajud-search",
      {},
      { method: "POST", body: { numeroProcesso: numero, persistir: true } }
    );
    sample.push({
      processo_id: proc.id,
      numero_cnj: numero,
      result,
    });
  }
  return {
    checkedAt: new Date().toISOString(),
    processosLidos: processes.length,
    disparados: sample.length,
    sample,
  };
}

export async function runProcessAudit(env) {
  return hmadvFunction(env, "processo-sync", { action: "auditoria" }, { method: "POST", body: {} });
}

export async function createProcessesFromPublicacoes(env, { processNumbers = [], limit = 10 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 10), 15));
  let publicacoes = [];
  if (processNumbers.length) {
    const processes = await loadProcessesByNumbers(env, processNumbers);
    const knownCnjs = new Set(processes.map((item) => String(item.numero_cnj || "")));
    const rawTargets = [...new Set(processNumbers.map((item) => String(item || "").replace(/\D+/g, "")).filter(Boolean))];
    const missingTargets = rawTargets.filter((item) => !knownCnjs.has(item));
    if (missingTargets.length) {
      for (const chunk of splitIntoChunks(missingTargets, 25)) {
        const rows = await hmadvRest(
          env,
          `publicacoes?processo_id=is.null&${buildInFilter("numero_processo_api", chunk)}&select=id,processo_id,numero_processo_api,conteudo,data_publicacao,raw_payload&limit=${Math.max(chunk.length * 5, chunk.length)}`
        );
        publicacoes.push(...rows);
      }
    }
  } else {
    publicacoes = await hmadvRest(
      env,
      `publicacoes?processo_id=is.null&numero_processo_api=not.is.null&select=id,processo_id,numero_processo_api,conteudo,data_publicacao,raw_payload&order=data_publicacao.desc.nullslast&limit=${safeLimit}`
    );
  }

  const uniqueTargets = [];
  for (const pub of publicacoes) {
    const numero = String(pub.numero_processo_api || pub.raw_payload?.numero || "").replace(/\D+/g, "");
    if (numero.length < 15) continue;
    if (!uniqueTargets.some((item) => item.numero === numero)) {
      uniqueTargets.push({ numero, publication: pub });
    }
  }

  const sample = [];
  for (const item of uniqueTargets.slice(0, safeLimit)) {
    const result = await hmadvFunction(
      env,
      "datajud-search",
      {},
      {
        method: "POST",
        body: {
          numeroProcesso: item.numero,
          persistir: true,
        },
      }
    );
    sample.push({
      numero_cnj: item.numero,
      publicacao_id: item.publication.id,
      result,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    publicacoesLidas: publicacoes.length,
    processosDisparados: sample.length,
    sample,
  };
}

export async function pushOrphanAccounts(env, limit = 20) {
  return hmadvFunction(
    env,
    "processo-sync",
    { action: "push_freshsales", limite: Math.max(1, Math.min(Number(limit || 20), 100)), batch: 10 },
    { method: "POST", body: {} }
  );
}

export async function repairFreshsalesAccounts(env, { processNumbers = [], limit = 10 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 10), 20));
  const processes = processNumbers.length
    ? await loadProcessesByNumbers(env, processNumbers)
    : await hmadvRest(
        env,
        `processos?select=id,numero_cnj,titulo,account_id_freshsales&account_id_freshsales=not.is.null&limit=${safeLimit}`
      );
  const sample = [];
  for (const proc of processes.slice(0, safeLimit)) {
    const result = await hmadvFunction(
      env,
      "fs-account-repair",
      { processo_id: proc.id },
      { method: "POST", body: { processo_id: proc.id, action: "repair" } }
    );
    sample.push({
      processo_id: proc.id,
      numero_cnj: proc.numero_cnj,
      titulo: proc.titulo,
      result,
    });
  }
  return {
    checkedAt: new Date().toISOString(),
    processosLidos: processes.length,
    reparados: sample.length,
    sample,
  };
}

export { jsonError, jsonOk };
