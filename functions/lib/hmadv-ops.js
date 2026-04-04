import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { getCleanEnvValue, getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";
import { freshsalesRequest } from "./freshsales-crm.js";

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

function cleanPartyName(value) {
  return String(value || "")
    .replace(/^[\s,;:\.\-–—]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function partyKey(nome, polo) {
  return `${normalizeText(cleanPartyName(nome))}|${String(polo || "").trim().toLowerCase()}`;
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

function schemaMessageMatches(message, token = "") {
  const text = String(message || "");
  if (!text) return false;
  const generic = text.includes("does not exist") || text.includes("schema cache") || text.includes("PGRST") || text.includes("42703");
  if (!token) return generic;
  return generic && text.includes(token);
}

function buildProcessLabel(row) {
  return row?.titulo || row?.name || row?.display_name || row?.numero_cnj || "Processo";
}

function uniqueNonEmpty(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function formatCnj(value) {
  const digits = normalizeProcessNumber(value);
  if (digits.length !== 20) return String(value || "").trim();
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

function buildProcessTitle(row) {
  const cnj = formatCnj(row?.numero_cnj || row?.numero_processo || "");
  const active = String(row?.polo_ativo || "").trim();
  const passive = String(row?.polo_passivo || "").trim();
  if (active && passive) return `${cnj} (${active} x ${passive})`;
  if (active) return `${cnj} (${active})`;
  return row?.titulo || cnj || "Processo";
}

function summarizeChunkFailures(result = {}) {
  const rows = Array.isArray(result?.sample)
    ? result.sample
    : Array.isArray(result?.items)
      ? result.items
      : [];
  return rows.reduce((count, row) => {
    if (row?.result?.ok === false || row?.datajud?.ok === false || row?.freshsales_repair?.ok === false) {
      return count + 1;
    }
    return count;
  }, 0);
}

function mergeNumericSummary(current = {}, next = {}) {
  const merged = { ...(current || {}) };
  for (const [key, value] of Object.entries(next || {})) {
    if (typeof value === "number" && Number.isFinite(value)) {
      merged[key] = Number(merged[key] || 0) + value;
    } else if (merged[key] === undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

function summarizeOperationResult(result) {
  const rows = Array.isArray(result?.sample)
    ? result.sample
    : Array.isArray(result?.items)
      ? result.items
      : [];
  const summary = {};
  for (const key of [
    "processosLidos",
    "sincronizados",
    "reparados",
    "partesInseridas",
    "processosAtualizados",
    "accountsReparadas",
    "processosCriados",
    "processosDisparados",
    "publicacoes",
    "audienciasInseridas",
    "disparados",
    "monitoramento_ativo",
  ]) {
    if (result?.[key] !== undefined) summary[key] = result[key];
  }
  return {
    summary,
    rows: rows.slice(0, 10),
    affectedCount:
      Number(result?.sincronizados || 0) ||
      Number(result?.reparados || 0) ||
      Number(result?.partesInseridas || 0) ||
      Number(result?.processosAtualizados || 0) ||
      Number(result?.processosCriados || 0) ||
      Number(result?.publicacoes || 0) ||
      Number(result?.audienciasInseridas || 0) ||
      Number(result?.disparados || 0) ||
      rows.length,
  };
}

export async function logAdminOperation(env, { modulo, acao, status = "success", payload = {}, result = null, error = null }) {
  try {
    const parsed = summarizeOperationResult(result || {});
    const body = {
      modulo: String(modulo || "interno"),
      acao: String(acao || "acao"),
      status: String(status || "success"),
      payload,
      resumo: error ? String(error) : null,
      result_summary: parsed.summary,
      result_sample: parsed.rows,
      requested_count: uniqueNonEmpty(
        String(payload?.processNumbers || "")
          .split(/\r?\n|,|;/)
      ).length,
      affected_count: parsed.affectedCount,
      error_message: error ? String(error) : null,
      finished_at: new Date().toISOString(),
    };
    await hmadvRest(
      env,
      "operacao_execucoes",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Profile": "judiciario",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
      },
      "judiciario"
    );
  } catch (logError) {
    const message = String(logError?.message || "");
    if (
      message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("PGRST") ||
      message.includes("42703")
    ) {
      return null;
    }
    return null;
  }
  return true;
}

export async function listAdminOperations(env, { modulo, limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 50));
  const filters = [`limit=${safeLimit}`, "order=created_at.desc"];
  if (modulo) filters.unshift(`modulo=eq.${encodeURIComponent(String(modulo))}`);
  const items = await listTableSafe(
    env,
    `operacao_execucoes?${filters.join("&")}&select=id,modulo,acao,status,payload,resumo,result_summary,result_sample,requested_count,affected_count,error_message,created_at,finished_at`,
    "judiciario",
    []
  );
  return { items };
}

async function fetchOperationJobById(env, id) {
  const rows = await listTableSafe(
    env,
    `operacao_jobs?id=eq.${encodeURIComponent(String(id || ""))}&select=*`,
    "judiciario",
    []
  );
  return rows[0] || null;
}

async function insertOperationJob(env, body) {
  const rows = await hmadvRest(
    env,
    "operacao_jobs",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "judiciario",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    },
    "judiciario"
  );
  return rows?.[0] || null;
}

async function patchOperationJob(env, id, body) {
  const rows = await hmadvRest(
    env,
    `operacao_jobs?id=eq.${encodeURIComponent(String(id || ""))}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "judiciario",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        ...body,
        updated_at: new Date().toISOString(),
      }),
    },
    "judiciario"
  );
  return rows?.[0] || null;
}

export async function listAdminJobs(env, { modulo, limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 50));
  const filters = [`limit=${safeLimit}`, "order=created_at.desc"];
  if (modulo) filters.unshift(`modulo=eq.${encodeURIComponent(String(modulo))}`);
  const items = await listTableSafe(
    env,
    `operacao_jobs?${filters.join("&")}&select=id,modulo,acao,status,payload,requested_count,processed_count,success_count,error_count,result_summary,last_error,created_at,started_at,updated_at,finished_at`,
    "judiciario",
    []
  );
  return { items };
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
    const nome = cleanPartyName(hit[1]);
    if (nome.length < 3) continue;
    const polo = hit[2] === "A" ? "ativo" : "passivo";
    const tipoPessoa = /\b(LTDA|S\.A\.|S\/A|ME|EPP|EIRELI|BANCO|FUND|ASSOC|SIND|CORP|GRUPO|EMPRESA|CONSTRUTORA|COMERCIAL|SERVI|INCORPORA)\b/i.test(nome)
      ? "JURIDICA"
      : "FISICA";
    output.push({ nome, polo, tipo_pessoa: tipoPessoa, fonte: "publicacao" });
  }
  return output.reduce((acc, item) => {
    const key = partyKey(item.nome, item.polo);
    if (!acc.some((row) => partyKey(row.nome, row.polo) === key)) acc.push(item);
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

async function loadProcessesByIds(env, processIds, select = "id,numero_cnj,titulo,account_id_freshsales,quantidade_movimentacoes,classe,assunto_principal,area,data_ajuizamento,sistema,polo_ativo,polo_passivo,status_atual_processo") {
  const output = [];
  for (const chunk of splitIntoChunks(uniqueNonEmpty(processIds), 25)) {
    const rows = await hmadvRest(
      env,
      `processos?${buildInFilter("id", chunk)}&select=${select}`
    );
    output.push(...rows);
  }
  return output;
}

async function collectProcessNumbersFromPagedList(loader, env, { active } = {}) {
  const pageSize = 50;
  let page = 1;
  let totalRows = null;
  const numbers = [];
  while (totalRows === null || (page - 1) * pageSize < totalRows) {
    const data = await loader(env, { page, pageSize, ...(active === undefined ? {} : { active }) });
    totalRows = Number(data?.totalRows || 0);
    for (const item of data?.items || []) {
      if (item?.numero_cnj) numbers.push(item.numero_cnj);
    }
    if (!(data?.items || []).length || (data?.items || []).length < pageSize) break;
    page += 1;
  }
  return uniqueNonEmpty(numbers);
}

async function resolveProcessJobTargets(env, action, processNumbers = []) {
  const selected = uniqueNonEmpty(processNumbers);
  if (selected.length) return selected;
  if (action === "push_orfaos") {
    return collectProcessNumbersFromPagedList(scanOrphanProcesses, env);
  }
  if (action === "enriquecer_datajud") {
    return collectProcessNumbersFromPagedList(listProcessesWithoutMovements, env);
  }
  if (action === "repair_freshsales_accounts") {
    return collectProcessNumbersFromPagedList(listFieldGapProcesses, env);
  }
  if (action === "sync_supabase_crm") {
    const [withoutMoves, gaps] = await Promise.all([
      collectProcessNumbersFromPagedList(listProcessesWithoutMovements, env),
      collectProcessNumbersFromPagedList(listFieldGapProcesses, env),
    ]);
    return uniqueNonEmpty([...withoutMoves, ...gaps]);
  }
  if (action === "backfill_audiencias") {
    return collectAudienciaBackfillTargets(env);
  }
  return selected;
}

async function collectAudienciaBackfillTargets(env) {
  const pageSize = 200;
  let offset = 0;
  let scans = 0;
  const maxScans = 60;
  const processIds = [];
  while (scans < maxScans) {
    const rows = await listTableSafe(
      env,
      `publicacoes?select=processo_id&processo_id=not.is.null&conteudo=ilike.${encodeURIComponent("*audien*")}&order=data_publicacao.desc.nullslast&limit=${pageSize}&offset=${offset}`
    );
    if (!rows.length) break;
    for (const row of rows) {
      if (row?.processo_id) processIds.push(row.processo_id);
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
    scans += 1;
  }
  const uniqueIds = uniqueNonEmpty(processIds);
  if (!uniqueIds.length) return [];
  const processes = await loadProcessesByIds(env, uniqueIds, "id,numero_cnj");
  return uniqueNonEmpty(processes.map((item) => item.numero_cnj));
}

function getProcessActionLimitConfig(action) {
  if (action === "sync_supabase_crm") return { defaultLimit: 1, maxLimit: 2 };
  if (action === "repair_freshsales_accounts") return { defaultLimit: 2, maxLimit: 3 };
  if (action === "enriquecer_datajud") return { defaultLimit: 2, maxLimit: 3 };
  if (action === "push_orfaos") return { defaultLimit: 2, maxLimit: 3 };
  if (action === "backfill_audiencias") return { defaultLimit: 2, maxLimit: 3 };
  return { defaultLimit: 10, maxLimit: 20 };
}

async function collectPublicacoesTargets(loader, env) {
  const pageSize = 50;
  let page = 1;
  const numbers = [];
  let hasMore = true;
  while (hasMore) {
    const data = await loader(env, { page, pageSize });
    for (const item of data?.items || []) {
      if (item?.numero_cnj) numbers.push(item.numero_cnj);
    }
    hasMore = Boolean(data?.hasMore);
    if (!(data?.items || []).length) break;
    page += 1;
  }
  return uniqueNonEmpty(numbers);
}

async function resolvePublicacoesJobTargets(env, action, processNumbers = []) {
  const selected = uniqueNonEmpty(processNumbers);
  if (selected.length) return selected;
  if (action === "criar_processos_publicacoes") {
    return collectPublicacoesTargets(listCreateProcessCandidates, env);
  }
  if (action === "backfill_partes" || action === "sincronizar_partes") {
    return collectPublicacoesTargets(listPartesExtractionCandidates, env);
  }
  return selected;
}

function countProcessFieldGaps(row) {
  const fields = [
    "classe",
    "assunto_principal",
    "area",
    "data_ajuizamento",
    "sistema",
    "polo_ativo",
    "polo_passivo",
    "status_atual_processo",
  ];
  return fields.reduce((acc, field) => {
    const value = row?.[field];
    if (value === null || value === undefined || value === "") acc += 1;
    return acc;
  }, 0);
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

async function loadAllPublicacoesSemProcesso(env) {
  const pageSize = 1000;
  const total = await countTable(env, "publicacoes", "processo_id=is.null&numero_processo_api=not.is.null");
  const chunks = Math.max(1, Math.ceil(total / pageSize));
  const output = [];
  for (let page = 0; page < chunks; page += 1) {
    const rows = await loadPublicacoesSemProcesso(env, pageSize, page * pageSize);
    output.push(...rows);
    if (rows.length < pageSize) break;
  }
  return output;
}

async function collectCreateProcessCandidatePage(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const targetStart = (safePage - 1) * safePageSize;
  const targetEnd = targetStart + safePageSize;
  const rawBatchSize = Math.max(200, safePageSize * 12);
  const maxScans = 40;
  const grouped = new Map();
  let offset = 0;
  let scans = 0;
  let hasMore = true;

  while (hasMore && scans < maxScans && grouped.size < targetEnd) {
    const rows = await loadPublicacoesSemProcesso(env, rawBatchSize, offset);
    offset += rows.length;
    scans += 1;
    for (const row of rows) {
      const numero = normalizeProcessNumber(row.numero_processo_api);
      if (!numero) continue;
      const current = grouped.get(numero);
      if (current) {
        current.publicacoes += 1;
        if (row.data_publicacao && (!current.ultima_publicacao || row.data_publicacao > current.ultima_publicacao)) {
          current.ultima_publicacao = row.data_publicacao;
        }
        if (!current.snippet && row.conteudo) current.snippet = String(row.conteudo || "").slice(0, 220);
        continue;
      }
      grouped.set(numero, {
        key: numero,
        numero_cnj: numero,
        publicacoes: 1,
        ultima_publicacao: row.data_publicacao || null,
        exemplo_publicacao_id: row.id,
        snippet: String(row.conteudo || "").slice(0, 220),
      });
    }
    if (rows.length < rawBatchSize) hasMore = false;
  }

  const items = [...grouped.values()].sort((left, right) => {
    const a = left.ultima_publicacao || "";
    const b = right.ultima_publicacao || "";
    return a < b ? 1 : a > b ? -1 : 0;
  });

  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: hasMore ? Math.max(targetEnd + 1, items.length) : items.length,
    totalEstimated: hasMore,
    hasMore,
    items: items.slice(targetStart, targetEnd),
  };
}

async function collectPartesExtractionCandidatePage(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const targetStart = (safePage - 1) * safePageSize;
  const targetEnd = targetStart + safePageSize;
  const processBatchSize = Math.max(100, safePageSize * 8);
  const maxScans = 40;
  const collected = [];
  const seen = new Set();
  let offset = 0;
  let scans = 0;
  let hasMore = true;

  while (hasMore && scans < maxScans && collected.length < targetEnd) {
    const processRows = await hmadvRest(
      env,
      `processos?select=id,numero_cnj,titulo,account_id_freshsales,polo_ativo,polo_passivo&limit=${processBatchSize}&offset=${offset}&order=updated_at.desc.nullslast`
    );
    offset += processRows.length;
    scans += 1;
    if (!processRows.length) {
      hasMore = false;
      break;
    }
    const processIds = processRows.map((item) => item.id);
    const [publicacoes, partes] = await Promise.all([
      processIds.length ? loadPublicacoesByProcessIds(env, processIds, 10) : Promise.resolve([]),
      processIds.length ? loadPartesByProcessIds(env, processIds) : Promise.resolve([]),
    ]);

    for (const proc of processRows) {
      const dedupeKey = proc.numero_cnj || proc.id;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      const pubs = publicacoes.filter((item) => item.processo_id === proc.id).slice(0, 25);
      if (!pubs.length) continue;
      const existing = partes.filter((item) => item.processo_id === proc.id);
      const parsed = pubs.flatMap((pub) => parsePartesFromText(pub.conteudo));
      const uniqueParsed = parsed.reduce((acc, item) => {
        const key = partyKey(item.nome, item.polo);
        if (!acc.some((row) => partyKey(row.nome, row.polo) === key)) acc.push(item);
        return acc;
      }, []);
      const novas = uniqueParsed.filter(
        (parte) => !existing.some((item) => partyKey(item.nome, item.polo) === partyKey(parte.nome, parte.polo))
      );
      if (!novas.length) continue;
      seen.add(dedupeKey);
      collected.push({
        key: dedupeKey,
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
      if (collected.length >= targetEnd) break;
    }

    if (processRows.length < processBatchSize) hasMore = false;
  }

  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: hasMore ? Math.max(targetEnd + 1, collected.length) : collected.length,
    totalEstimated: hasMore,
    hasMore,
    items: collected.slice(targetStart, targetEnd),
  };
}

function groupCreateProcessCandidates(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const numero = String(row.numero_processo_api || "").replace(/\D+/g, "");
    if (!numero) continue;
    const current = grouped.get(numero);
    if (current) {
      current.publicacoes += 1;
      if (row.data_publicacao && (!current.ultima_publicacao || row.data_publicacao > current.ultima_publicacao)) {
        current.ultima_publicacao = row.data_publicacao;
      }
      continue;
    }
    grouped.set(numero, {
      key: numero,
      numero_cnj: numero,
      publicacoes: 1,
      ultima_publicacao: row.data_publicacao || null,
      exemplo_publicacao_id: row.id,
      snippet: String(row.conteudo || "").slice(0, 220),
    });
  }
  return [...grouped.values()].sort((left, right) => {
    const a = left.ultima_publicacao || "";
    const b = right.ultima_publicacao || "";
    return a < b ? 1 : a > b ? -1 : 0;
  });
}

function inferPolosFromPartes(partes = []) {
  const ativos = uniqueNonEmpty(partes.filter((item) => String(item.polo || "").toLowerCase() === "ativo").map((item) => cleanPartyName(item.nome)));
  const passivos = uniqueNonEmpty(partes.filter((item) => String(item.polo || "").toLowerCase() === "passivo").map((item) => cleanPartyName(item.nome)));
  return {
    polo_ativo: ativos.join(" | ") || null,
    polo_passivo: passivos.join(" | ") || null,
  };
}

async function patchProcessRow(env, processId, body) {
  const payload = Object.fromEntries(
    Object.entries(body || {}).filter(([, value]) => value !== undefined)
  );
  if (!Object.keys(payload).length) return;
  await hmadvRest(
    env,
    `processos?id=eq.${encodeURIComponent(processId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "judiciario",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    }
  );
}

function buildFreshsalesProcessCustomFields(proc, cnjFmt) {
  const customFields = {
    cf_processo: cnjFmt,
  };
  const set = (key, value) => {
    if (value !== null && value !== undefined && value !== "") {
      customFields[key] = value;
    }
  };
  set("cf_tribunal", proc.tribunal);
  set("cf_vara", proc.orgao_julgador);
  set("cf_numero_do_juizo", proc.orgao_julgador_codigo);
  set("cf_classe", proc.classe);
  set("cf_assunto", proc.assunto_principal || proc.assunto);
  set("cf_instancia", proc.instancia);
  set("cf_polo_ativo", proc.polo_ativo);
  set("cf_parte_adversa", proc.polo_passivo);
  set("cf_status", proc.status_atual_processo);
  set("cf_data_de_distribuio", proc.data_ajuizamento);
  set("cf_data_ultimo_movimento", proc.data_ultima_movimentacao);
  set("cf_descricao_ultimo_movimento", proc.ultimo_movimento_descricao);
  set("cf_area", proc.area);
  set("cf_sistema", proc.sistema);
  if (proc.segredo_justica !== null && proc.segredo_justica !== undefined) {
    set("cf_segredo_de_justica", proc.segredo_justica);
  }
  return customFields;
}

async function lookupFreshsalesAccountByProcess(env, cnjFmt) {
  try {
    const { payload } = await freshsalesRequest(env, "/filtered_search/sales_account", {
      method: "POST",
      body: JSON.stringify({
        filter_rule: [{ attribute: "cf_processo", operator: "is_in", value: [cnjFmt] }],
        page: 1,
        per_page: 3,
      }),
    });
    const items = Array.isArray(payload?.sales_accounts) ? payload.sales_accounts : [];
    return items[0] || null;
  } catch {
    return null;
  }
}

async function ensureFreshsalesAccountForProcess(env, proc) {
  const cnjFmt = formatCnj(proc?.numero_cnj || proc?.numero_processo || "");
  if (!cnjFmt) {
    return { skipped: true, reason: "sem_cnj" };
  }
  const existing = await lookupFreshsalesAccountByProcess(env, cnjFmt);
  if (existing?.id) {
    await patchProcessRow(env, proc.id, {
      account_id_freshsales: String(existing.id),
      fs_sync_at: new Date().toISOString(),
    });
    return {
      ok: true,
      action: "linked_existing",
      account_id_freshsales: String(existing.id),
      title: String(existing.name || ""),
    };
  }

  const title = buildProcessTitle(proc);
  const customFields = buildFreshsalesProcessCustomFields(proc, cnjFmt);
  const standardFields = {};
  if (proc.link_externo_processo) standardFields.website = proc.link_externo_processo;
  if (proc.comarca) standardFields.city = proc.comarca;
  if (proc.valor_causa) standardFields.annual_revenue = proc.valor_causa;
  const ownerId = Number(getCleanEnvValue(env.FS_OWNER_ID) || "31000147944");

  const { payload } = await freshsalesRequest(env, "/sales_accounts", {
    method: "POST",
    body: JSON.stringify({
      sales_account: {
        name: title,
        owner_id: ownerId,
        ...standardFields,
        custom_fields: customFields,
        custom_field: customFields,
      },
    }),
  });
  const account = payload?.sales_account || payload;
  const accountId = String(account?.id || "");
  if (!accountId) {
    throw new Error("Freshsales nao retornou account_id para o processo criado.");
  }
  await patchProcessRow(env, proc.id, {
    account_id_freshsales: accountId,
    titulo: title,
    fs_sync_at: new Date().toISOString(),
  });
  return {
    ok: true,
    action: "created",
    account_id_freshsales: accountId,
    title,
  };
}

async function runFreshsalesRepairForProcess(env, proc) {
  if (!proc?.id || !proc?.account_id_freshsales) {
    return { skipped: true, reason: "sem_account" };
  }
  return hmadvFunction(
    env,
    "fs-account-repair",
    { processo_id: proc.id },
    { method: "POST", body: { processo_id: proc.id, action: "repair" } }
  );
}

async function runDatajudPersistForProcess(env, numero) {
  return hmadvFunction(
    env,
    "datajud-search",
    {},
    { method: "POST", body: { numeroProcesso: numero, persistir: true } }
  );
}

export async function listCreateProcessCandidates(env, { page = 1, pageSize = 20 } = {}) {
  return collectCreateProcessCandidatePage(env, { page, pageSize });
}

export async function listPartesExtractionCandidates(env, { page = 1, pageSize = 20 } = {}) {
  return collectPartesExtractionCandidatePage(env, { page, pageSize });
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

export async function scanOrphanProcesses(env, { page = 1, pageSize = 20, limit = null } = {}) {
  const safePageSize = Math.max(1, Math.min(Number(limit || pageSize || 20), 50));
  const safePage = Math.max(1, Number(page || 1));
  const rows = await hmadvRest(
    env,
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo&account_id_freshsales=is.null&order=updated_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
  );
  return {
    total: await countTableSafe(env, "processos", "account_id_freshsales=is.null"),
    totalRows: await countTableSafe(env, "processos", "account_id_freshsales=is.null"),
    page: safePage,
    pageSize: safePageSize,
    items: rows,
  };
}

export async function listProcessesWithoutMovements(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const items = await listTableSafe(
    env,
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,quantidade_movimentacoes,status_atual_processo&or=(quantidade_movimentacoes.is.null,quantidade_movimentacoes.eq.0)&order=updated_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
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
  let unsupported = false;
  let items = [];
  let totalRows = 0;
  try {
    items = await hmadvRest(
      env,
      `processos?select=id,numero_cnj,titulo,account_id_freshsales,monitoramento_ativo,status_atual_processo,quantidade_movimentacoes&monitoramento_ativo=eq.${flag}&order=updated_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
    );
    totalRows = await countTable(env, "processos", `monitoramento_ativo=eq.${flag}`);
  } catch (error) {
    if (!schemaMessageMatches(error?.message, "monitoramento_ativo")) throw error;
    unsupported = true;
  }
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
    unsupported,
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
  let processes = [];
  if (processNumbers.length) {
    processes = await loadProcessesByNumbers(env, processNumbers);
  } else {
    const candidateNumbers = await collectAudienciaBackfillTargets(env);
    processes = candidateNumbers.length
      ? await loadProcessesByNumbers(env, candidateNumbers.slice(0, safeLimit))
      : await hmadvRest(env, `processos?select=id,numero_cnj,titulo&limit=${safeLimit}`);
  }
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
      const key = partyKey(item.nome, item.polo);
      if (!acc.some((row) => partyKey(row.nome, row.polo) === key)) acc.push(item);
      return acc;
    }, []);
    const novas = uniqueParsed
      .filter((parte) => !existentes.some((item) => partyKey(item.nome, item.polo) === partyKey(parte.nome, parte.polo)))
      .map((parte) => ({
        processo_id: proc.id,
        nome: cleanPartyName(parte.nome),
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
    applyMode: apply,
    processosLidos: processes.length,
    partesInseridas: inserted,
    sample: sample.slice(0, 20),
    limitAplicado: safeLimit,
  };
}

export async function syncPartesFromPublicacoes(env, { processNumbers = [], limit = 20 } = {}) {
  const base = await backfillPartesFromPublicacoes(env, { processNumbers, limit, apply: true });
  const sample = [];
  let processosAtualizados = 0;
  let accountsReparadas = 0;
  const processIds = uniqueNonEmpty((base.sample || []).map((row) => row.processo_id));
  const currentPartes = processIds.length ? await loadPartesByProcessIds(env, processIds) : [];

  for (const row of base.sample || []) {
    const allPartes = currentPartes.filter((item) => item.processo_id === row.processo_id);
    const polos = inferPolosFromPartes(allPartes);
    if (polos.polo_ativo || polos.polo_passivo) {
      await patchProcessRow(env, row.processo_id, {
        polo_ativo: polos.polo_ativo,
        polo_passivo: polos.polo_passivo,
      });
      processosAtualizados += 1;
    }
    let repair = { skipped: true, reason: "sem_account" };
    if (row.account_id_freshsales) {
      repair = await runFreshsalesRepairForProcess(env, row);
      accountsReparadas += 1;
    }
    sample.push({
      ...row,
      polos_atualizados: polos,
      freshsales_repair: repair,
    });
  }

  return {
    ...base,
    processosAtualizados,
    accountsReparadas,
    sample,
  };
}

export async function runSyncWorker(env) {
  return hmadvFunction(env, "sync-worker", { action: "run" }, { method: "POST", body: {} });
}

export async function enrichProcessesViaDatajud(env, { processNumbers = [], limit = 10 } = {}) {
  const config = getProcessActionLimitConfig("enriquecer_datajud");
  const safeLimit = Math.max(1, Math.min(Number(limit || config.defaultLimit), config.maxLimit));
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
    const before = {
      quantidade_movimentacoes: proc.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(proc),
    };
    const result = await hmadvFunction(
      env,
      "datajud-search",
      {},
      { method: "POST", body: { numeroProcesso: numero, persistir: true } }
    );
    const [afterRow] = await loadProcessesByIds(env, [proc.id]);
    const after = afterRow ? {
      quantidade_movimentacoes: afterRow.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(afterRow),
    } : before;
    sample.push({
      processo_id: proc.id,
      numero_cnj: numero,
      before,
      after,
      movimentos_novos: Math.max(0, (after.quantidade_movimentacoes || 0) - (before.quantidade_movimentacoes || 0)),
      gaps_reduzidos: Math.max(0, (before.gaps || 0) - (after.gaps || 0)),
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

export async function syncProcessesSupabaseCrm(env, { processNumbers = [], limit = 10 } = {}) {
  const config = getProcessActionLimitConfig("sync_supabase_crm");
  const safeLimit = Math.max(1, Math.min(Number(limit || config.defaultLimit), config.maxLimit));
  const processes = processNumbers.length
    ? await loadProcessesByNumbers(env, processNumbers)
    : await listTableSafe(
        env,
        `processos?select=id,numero_cnj,titulo,quantidade_movimentacoes,account_id_freshsales&account_id_freshsales=not.is.null&or=(quantidade_movimentacoes.is.null,quantidade_movimentacoes.eq.0,classe.is.null,assunto_principal.is.null,area.is.null,data_ajuizamento.is.null,sistema.is.null,polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)&limit=${safeLimit}`
      );

  const sample = [];
  let reparados = 0;
  for (const proc of processes.slice(0, safeLimit)) {
    const numero = String(proc.numero_cnj || "").replace(/\D+/g, "");
    if (!numero) continue;
    const before = {
      quantidade_movimentacoes: proc.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(proc),
    };
    const datajud = await runDatajudPersistForProcess(env, numero);
    const [afterRow] = await loadProcessesByIds(env, [proc.id]);
    const after = afterRow ? {
      quantidade_movimentacoes: afterRow.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(afterRow),
    } : before;
    let repair = { skipped: true, reason: "sem_account" };
    if (proc.account_id_freshsales) {
      repair = await runFreshsalesRepairForProcess(env, proc);
      reparados += 1;
    }
    sample.push({
      processo_id: proc.id,
      numero_cnj: numero,
      account_id_freshsales: proc.account_id_freshsales || null,
      before,
      after,
      movimentos_novos: Math.max(0, (after.quantidade_movimentacoes || 0) - (before.quantidade_movimentacoes || 0)),
      gaps_reduzidos: Math.max(0, (before.gaps || 0) - (after.gaps || 0)),
      datajud,
      freshsales_repair: repair,
    });
  }
  return {
    checkedAt: new Date().toISOString(),
    processosLidos: processes.length,
    sincronizados: sample.length,
    reparados,
    sample,
  };
}

export async function updateMonitoringStatus(env, { processNumbers = [], active = true, limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 100));
  const processes = processNumbers.length
    ? await loadProcessesByNumbers(env, processNumbers)
    : await listTableSafe(
        env,
        `processos?select=id,numero_cnj,titulo,account_id_freshsales&limit=${safeLimit}`
      );
  let updated = 0;
  const sample = [];
  for (const proc of processes.slice(0, safeLimit)) {
    try {
      await hmadvRest(
        env,
        `processos?id=eq.${encodeURIComponent(proc.id)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "Content-Profile": "judiciario",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            monitoramento_ativo: Boolean(active),
          }),
        }
      );
    } catch (error) {
      if (schemaMessageMatches(error?.message, "monitoramento_ativo")) {
        return {
          checkedAt: new Date().toISOString(),
          monitoramento_ativo: Boolean(active),
          processosAtualizados: 0,
          sample: [],
          unsupported: true,
          reason: "monitoramento_ativo_coluna_ausente",
        };
      }
      throw error;
    }
    updated += 1;
    sample.push({
      processo_id: proc.id,
      numero_cnj: proc.numero_cnj,
      titulo: proc.titulo,
      account_id_freshsales: proc.account_id_freshsales || null,
      monitoramento_ativo: Boolean(active),
    });
  }
  return {
    checkedAt: new Date().toISOString(),
    monitoramento_ativo: Boolean(active),
    processosAtualizados: updated,
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
    const beforeRows = await loadProcessesByNumbers(env, [item.numero]);
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
    const afterRows = await loadProcessesByNumbers(env, [item.numero]);
    const createdProcess = afterRows[0] || null;
    sample.push({
      numero_cnj: item.numero,
      publicacao_id: item.publication.id,
      processo_antes: beforeRows[0]?.id || null,
      processo_depois: createdProcess?.id || null,
      processo_criado: !beforeRows.length && Boolean(createdProcess?.id),
      titulo_processo: createdProcess?.titulo || null,
      account_id_freshsales: createdProcess?.account_id_freshsales || null,
      result,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    publicacoesLidas: publicacoes.length,
    processosCriados: sample.length,
    processosDisparados: sample.length,
    sample,
  };
}

export async function pushOrphanAccounts(env, { processNumbers = [], limit = 20 } = {}) {
  const config = getProcessActionLimitConfig("push_orfaos");
  const safeLimit = Math.max(1, Math.min(Number(limit || config.defaultLimit), config.maxLimit));
  const processes = processNumbers.length
    ? await loadProcessesByNumbers(env, processNumbers)
    : await scanOrphanProcesses(env, { page: 1, pageSize: safeLimit }).then((data) => data.items || []);
  const sample = [];
  for (const proc of processes.slice(0, safeLimit)) {
    const fullRow = (await loadProcessesByIds(
      env,
      [proc.id],
      "id,numero_cnj,numero_processo,titulo,polo_ativo,polo_passivo,tribunal,orgao_julgador,orgao_julgador_codigo,instancia,area,valor_causa,classe,assunto,assunto_principal,sistema,comarca,link_externo_processo,segredo_justica,data_ajuizamento,data_ultima_movimentacao,status_atual_processo,account_id_freshsales"
    ))[0];
    if (!fullRow) continue;
    if (fullRow.account_id_freshsales) {
      sample.push({
        processo_id: fullRow.id,
        numero_cnj: fullRow.numero_cnj,
        titulo: fullRow.titulo,
        account_id_freshsales: fullRow.account_id_freshsales,
        skipped: true,
        reason: "ja_vinculado",
      });
      continue;
    }
    const result = await ensureFreshsalesAccountForProcess(env, fullRow);
    sample.push({
      processo_id: fullRow.id,
      numero_cnj: fullRow.numero_cnj,
      titulo: fullRow.titulo,
      account_id_freshsales: result.account_id_freshsales || null,
      result,
    });
  }
  return {
    checkedAt: new Date().toISOString(),
    processosLidos: processes.length,
    criados: sample.filter((row) => row.result?.action === "created").length,
    vinculados: sample.filter((row) => row.result?.action === "linked_existing").length,
    sample,
  };
}

export async function repairFreshsalesAccounts(env, { processNumbers = [], limit = 10 } = {}) {
  const config = getProcessActionLimitConfig("repair_freshsales_accounts");
  const safeLimit = Math.max(1, Math.min(Number(limit || config.defaultLimit), config.maxLimit));
  const processes = processNumbers.length
    ? await loadProcessesByNumbers(env, processNumbers)
    : await hmadvRest(
        env,
        `processos?select=id,numero_cnj,titulo,account_id_freshsales&account_id_freshsales=not.is.null&limit=${safeLimit}`
      );
  const sample = [];
  for (const proc of processes.slice(0, safeLimit)) {
    const result = await runFreshsalesRepairForProcess(env, proc);
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

function normalizeProcessJobPayload(action, payload = {}) {
  const config = getProcessActionLimitConfig(action);
  return {
    ...payload,
    action,
    processNumbers: uniqueNonEmpty(payload.processNumbers || []),
    limit: Math.max(1, Math.min(Number(payload.limit || config.defaultLimit), config.maxLimit)),
  };
}

export async function createProcessAdminJob(env, { action, payload = {} } = {}) {
  const normalizedPayload = normalizeProcessJobPayload(action, payload);
  const targets = await resolveProcessJobTargets(env, action, normalizedPayload.processNumbers);
  const job = await insertOperationJob(env, {
    modulo: "processos",
    acao: action,
    status: targets.length ? "pending" : "completed",
    payload: {
      ...normalizedPayload,
      processNumbers: targets,
    },
    requested_count: targets.length,
    processed_count: 0,
    success_count: 0,
    error_count: 0,
    result_summary: targets.length ? {} : { requested_count: 0 },
    result_sample: [],
    last_error: null,
    started_at: null,
    finished_at: targets.length ? new Date().toISOString() : null,
  });
  return job;
}

export async function getProcessAdminJob(env, id) {
  return fetchOperationJobById(env, id);
}

async function runProcessJobAction(env, action, processNumbers, limit) {
  if (action === "push_orfaos") {
    return pushOrphanAccounts(env, { processNumbers, limit });
  }
  if (action === "enriquecer_datajud") {
    return enrichProcessesViaDatajud(env, { processNumbers, limit });
  }
  if (action === "repair_freshsales_accounts") {
    return repairFreshsalesAccounts(env, { processNumbers, limit });
  }
  if (action === "sync_supabase_crm") {
    return syncProcessesSupabaseCrm(env, { processNumbers, limit });
  }
  if (action === "backfill_audiencias") {
    return backfillAudiencias(env, { processNumbers, limit, apply: true });
  }
  throw new Error(`Acao de job nao suportada: ${action}`);
}

export async function processProcessAdminJob(env, id) {
  const job = await fetchOperationJobById(env, id);
  if (!job) throw new Error("Job operacional nao encontrado.");
  if (["completed", "error", "cancelled"].includes(String(job.status || ""))) return job;

  const payload = normalizeProcessJobPayload(job.acao, job.payload || {});
  const targets = uniqueNonEmpty(payload.processNumbers || []);
  const offset = Math.max(0, Number(job.processed_count || 0));
  const chunk = targets.slice(offset, offset + payload.limit);

  if (!chunk.length) {
    const completedJob = await patchOperationJob(env, job.id, {
      status: "completed",
      finished_at: new Date().toISOString(),
    });
    await logAdminOperation(env, {
      modulo: "processos",
      acao: `${job.acao}_job`,
      status: "success",
      payload: job.payload || {},
      result: {
        sample: job.result_sample || [],
        ...(job.result_summary || {}),
      },
    });
    return completedJob || job;
  }

  const now = new Date().toISOString();
  if (!job.started_at) {
    await patchOperationJob(env, job.id, { status: "running", started_at: now });
  } else if (job.status !== "running") {
    await patchOperationJob(env, job.id, { status: "running" });
  }

  try {
    const result = await runProcessJobAction(env, job.acao, chunk, chunk.length);
    const parsed = summarizeOperationResult(result || {});
    const failures = summarizeChunkFailures(result || {});
    const nextProcessed = offset + chunk.length;
    const nextJob = await patchOperationJob(env, job.id, {
      status: nextProcessed >= targets.length ? "completed" : "running",
      processed_count: nextProcessed,
      success_count: Number(job.success_count || 0) + Math.max(0, chunk.length - failures),
      error_count: Number(job.error_count || 0) + failures,
      result_summary: mergeNumericSummary(job.result_summary || {}, parsed.summary || {}),
      result_sample: parsed.rows || [],
      last_error: null,
      finished_at: nextProcessed >= targets.length ? new Date().toISOString() : null,
    });
    if (nextProcessed >= targets.length) {
      await logAdminOperation(env, {
        modulo: "processos",
        acao: `${job.acao}_job`,
        status: failures ? "error" : "success",
        payload: job.payload || {},
        result: {
          sample: parsed.rows || [],
          ...(nextJob?.result_summary || parsed.summary || {}),
        },
        error: failures ? `${failures} item(ns) com falha no lote final.` : null,
      });
    }
    return nextJob || job;
  } catch (error) {
    const failedJob = await patchOperationJob(env, job.id, {
      status: "error",
      last_error: error.message || "Falha ao processar job operacional.",
      finished_at: new Date().toISOString(),
    });
    await logAdminOperation(env, {
      modulo: "processos",
      acao: `${job.acao}_job`,
      status: "error",
      payload: job.payload || {},
      error: error.message || "Falha ao processar job operacional.",
    });
    return failedJob || job;
  }
}

function normalizePublicacoesJobPayload(action, payload = {}) {
  const maxLimit = action === "backfill_partes" ? 50 : 20;
  return {
    ...payload,
    action,
    processNumbers: uniqueNonEmpty(payload.processNumbers || []),
    limit: Math.max(1, Math.min(Number(payload.limit || 10), maxLimit)),
  };
}

export async function createPublicacoesAdminJob(env, { action, payload = {} } = {}) {
  const normalizedPayload = normalizePublicacoesJobPayload(action, payload);
  const targets = await resolvePublicacoesJobTargets(env, action, normalizedPayload.processNumbers);
  const job = await insertOperationJob(env, {
    modulo: "publicacoes",
    acao: action,
    status: targets.length ? "pending" : "completed",
    payload: {
      ...normalizedPayload,
      processNumbers: targets,
    },
    requested_count: targets.length,
    processed_count: 0,
    success_count: 0,
    error_count: 0,
    result_summary: targets.length ? {} : { requested_count: 0 },
    result_sample: [],
    last_error: null,
    started_at: null,
    finished_at: targets.length ? new Date().toISOString() : null,
  });
  return job;
}

export async function getPublicacoesAdminJob(env, id) {
  return fetchOperationJobById(env, id);
}

async function runPublicacoesJobAction(env, action, processNumbers, limit) {
  if (action === "criar_processos_publicacoes") {
    return createProcessesFromPublicacoes(env, { processNumbers, limit });
  }
  if (action === "backfill_partes") {
    return backfillPartesFromPublicacoes(env, { processNumbers, limit, apply: true });
  }
  if (action === "sincronizar_partes") {
    return syncPartesFromPublicacoes(env, { processNumbers, limit });
  }
  throw new Error(`Acao de job de publicacoes nao suportada: ${action}`);
}

export async function processPublicacoesAdminJob(env, id) {
  const job = await fetchOperationJobById(env, id);
  if (!job) throw new Error("Job operacional de publicacoes nao encontrado.");
  if (["completed", "error", "cancelled"].includes(String(job.status || ""))) return job;

  const payload = normalizePublicacoesJobPayload(job.acao, job.payload || {});
  const targets = uniqueNonEmpty(payload.processNumbers || []);
  const offset = Math.max(0, Number(job.processed_count || 0));
  const chunk = targets.slice(offset, offset + payload.limit);

  if (!chunk.length) {
    const completedJob = await patchOperationJob(env, job.id, {
      status: "completed",
      finished_at: new Date().toISOString(),
    });
    await logAdminOperation(env, {
      modulo: "publicacoes",
      acao: `${job.acao}_job`,
      status: "success",
      payload: job.payload || {},
      result: {
        sample: job.result_sample || [],
        ...(job.result_summary || {}),
      },
    });
    return completedJob || job;
  }

  const now = new Date().toISOString();
  if (!job.started_at) {
    await patchOperationJob(env, job.id, { status: "running", started_at: now });
  } else if (job.status !== "running") {
    await patchOperationJob(env, job.id, { status: "running" });
  }

  try {
    const result = await runPublicacoesJobAction(env, job.acao, chunk, chunk.length);
    const parsed = summarizeOperationResult(result || {});
    const failures = summarizeChunkFailures(result || {});
    const nextProcessed = offset + chunk.length;
    const nextJob = await patchOperationJob(env, job.id, {
      status: nextProcessed >= targets.length ? "completed" : "running",
      processed_count: nextProcessed,
      success_count: Number(job.success_count || 0) + Math.max(0, chunk.length - failures),
      error_count: Number(job.error_count || 0) + failures,
      result_summary: mergeNumericSummary(job.result_summary || {}, parsed.summary || {}),
      result_sample: parsed.rows || [],
      last_error: null,
      finished_at: nextProcessed >= targets.length ? new Date().toISOString() : null,
    });
    if (nextProcessed >= targets.length) {
      await logAdminOperation(env, {
        modulo: "publicacoes",
        acao: `${job.acao}_job`,
        status: failures ? "error" : "success",
        payload: job.payload || {},
        result: {
          sample: parsed.rows || [],
          ...(nextJob?.result_summary || parsed.summary || {}),
        },
        error: failures ? `${failures} item(ns) com falha no lote final.` : null,
      });
    }
    return nextJob || job;
  } catch (error) {
    const failedJob = await patchOperationJob(env, job.id, {
      status: "error",
      last_error: error.message || "Falha ao processar job operacional de publicacoes.",
      finished_at: new Date().toISOString(),
    });
    await logAdminOperation(env, {
      modulo: "publicacoes",
      acao: `${job.acao}_job`,
      status: "error",
      payload: job.payload || {},
      error: error.message || "Falha ao processar job operacional de publicacoes.",
    });
    return failedJob || job;
  }
}

export { jsonError, jsonOk };
