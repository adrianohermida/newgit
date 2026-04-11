import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { getCleanEnvValue, getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";
import {
  createFreshsalesAppointmentForAudiencia,
  createFreshsalesAudienciaActivity,
  createFreshsalesPublicationActivity,
  freshsalesRequest,
} from "./freshsales-crm.js";

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
  const sharedSecret =
    getCleanEnvValue(env.HMDAV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.HMADV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.LAWDESK_AI_SHARED_SECRET) ||
    "";
  const runnerToken =
    getCleanEnvValue(env.HMADV_RUNNER_TOKEN) ||
    getCleanEnvValue(env.MADV_RUNNER_TOKEN) ||
    "";
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
    "Accept-Profile": schema,
    ...(sharedSecret
      ? {
          "x-hmadv-secret": sharedSecret,
          "x-shared-secret": sharedSecret,
        }
      : {}),
    ...(runnerToken
      ? {
          "x-hmadv-runner-token": runnerToken,
        }
      : {}),
    ...extra,
  };
}

async function hmadvFunction(env, name, query = {}, init = {}) {
  const baseUrl = getSupabaseBaseUrl(env);
  const serviceKey = getSupabaseServerKey(env);
  if (!baseUrl || !serviceKey) {
    throw new Error("Configuracao HMADV/Supabase incompleta.");
  }
  const sharedSecret =
    getCleanEnvValue(env.HMDAV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.HMADV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.LAWDESK_AI_SHARED_SECRET) ||
    "";
  const runnerToken =
    getCleanEnvValue(env.HMADV_RUNNER_TOKEN) ||
    getCleanEnvValue(env.MADV_RUNNER_TOKEN) ||
    "";
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
        ...(sharedSecret
          ? {
              "x-hmadv-secret": sharedSecret,
              "x-shared-secret": sharedSecret,
            }
          : {}),
        ...(runnerToken
          ? {
              "x-hmadv-runner-token": runnerToken,
            }
          : {}),
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
    "totalProcessos",
    "processosComAccount",
    "processosSemAccount",
    "processosBaseCompleta",
    "processosSemMovimentacao",
    "processosComGapCrm",
    "processosComPartesSemContato",
    "partesSemContato",
    "publicacoesPendentes",
    "audienciasPendentes",
    "movimentacoesPendentes",
    "sincronizados",
    "reparados",
    "partesInseridas",
    "processosAtualizados",
    "accountsReparadas",
    "processosCriados",
    "processosDisparados",
    "publicacoes",
    "movimentacoes",
    "activitiesCriadas",
    "processed",
    "upserted",
    "coveredRows",
    "pendingRows",
    "totalRows",
    "movimentacoesAtualizadas",
    "audienciasInseridas",
    "disparados",
    "monitoramento_ativo",
  ]) {
    if (result?.[key] !== undefined) summary[key] = result[key];
  }
  if (result?.coverageMetrics && typeof result.coverageMetrics === "object") {
    for (const [key, value] of Object.entries(result.coverageMetrics)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        summary[`coverage_${key}`] = value;
      } else if (value != null && summary[`coverage_${key}`] === undefined) {
        summary[`coverage_${key}`] = value;
      }
    }
  }
  if (result?.datajudMetrics && typeof result.datajudMetrics === "object") {
    for (const [key, value] of Object.entries(result.datajudMetrics)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        summary[`datajud_${key}`] = value;
      } else if (value != null && summary[`datajud_${key}`] === undefined) {
        summary[`datajud_${key}`] = value;
      }
    }
  }
  if (result?.taggedCoverageMetrics && typeof result.taggedCoverageMetrics === "object") {
    for (const [key, value] of Object.entries(result.taggedCoverageMetrics)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        summary[`tagged_${key}`] = value;
      } else if (value != null && summary[`tagged_${key}`] === undefined) {
        summary[`tagged_${key}`] = value;
      }
    }
  }
  if (result?.datajudActionMetrics && typeof result.datajudActionMetrics === "object") {
    for (const [key, value] of Object.entries(result.datajudActionMetrics)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        summary[`datajud_action_${key}`] = value;
      } else if (value != null && summary[`datajud_action_${key}`] === undefined) {
        summary[`datajud_action_${key}`] = value;
      }
    }
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

export async function getCoverageSchemaStatus(env) {
  try {
    const totalRows = await countTableSafe(env, "processo_cobertura_sync", "", "judiciario");
    return {
      ok: true,
      exists: true,
      totalRows,
    };
  } catch (error) {
    const message = String(error?.message || "");
    const missing = message.includes("does not exist") || message.includes("schema cache") || message.includes("PGRST");
    return {
      ok: false,
      exists: !missing,
      error: message,
    };
  }
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

function extractAudienciaDateTime(text) {
  const dt = extractAudienciaDate(text);
  if (!dt) return null;
  const hour = extractAudienciaTime(text);
  if (hour) {
    const [hh, mm] = hour.split(":").map(Number);
    dt.setHours(hh || 0, mm || 0, 0, 0);
  }
  return dt;
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

async function loadProcessesByNumbers(
  env,
  processNumbers,
  select = "id,numero_cnj,titulo,account_id_freshsales,status_atual_processo"
) {
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
      `processos?${buildInFilter("numero_cnj", chunk)}&select=${select}`,
    ];
    for (const numero of chunk) {
      candidatePaths.push(
        `processos?numero_cnj=ilike.${encodeURIComponent(`*${numero}*`)}&select=${select}&limit=5`,
        `processos?titulo=ilike.${encodeURIComponent(`*${numero}*`)}&select=${select}&limit=5`
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
      `processos?titulo=ilike.${encodeURIComponent(`*${value}*`)}&select=${select}&limit=5`,
    ];
    if (normalized) {
      candidatePaths.push(
        `processos?numero_cnj=ilike.${encodeURIComponent(`*${normalized}*`)}&select=${select}&limit=5`
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
    try {
      const rows = await listTableSafe(
        env,
        `processos?${buildInFilter("id", chunk)}&select=${select}`
      );
      output.push(...rows);
    } catch {
      return output;
    }
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

async function resolveProcessJobTargets(env, action, payload = {}) {
  const selected = uniqueNonEmpty(payload?.processNumbers || []);
  const intent = String(payload?.intent || "").trim();
  if (selected.length) return selected;
  if (action === "push_orfaos") {
    return collectProcessNumbersFromPagedList(scanOrphanProcesses, env);
  }
  if (action === "enriquecer_datajud") {
    if (intent === "sincronizar_monitorados") {
      return collectProcessNumbersFromPagedList(listMonitoringProcesses, env, { active: true });
    }
    if (intent === "reenriquecer_gaps") {
      return collectProcessNumbersFromPagedList(listFieldGapProcesses, env);
    }
    return collectProcessNumbersFromPagedList(listProcessesWithoutMovements, env);
  }
  if (action === "repair_freshsales_accounts") {
    return collectProcessNumbersFromPagedList(listFieldGapProcesses, env);
  }
  if (action === "sync_supabase_crm") {
    if (intent === "crm_only") {
      return collectProcessNumbersFromPagedList(listCrmOnlyGapProcesses, env);
    }
    if (intent === "datajud_plus_crm") {
      return collectProcessNumbersFromPagedList(listSyncDatajudProcesses, env);
    }
    const [withoutMoves, gaps] = await Promise.all([
      collectProcessNumbersFromPagedList(listSyncDatajudProcesses, env),
      collectProcessNumbersFromPagedList(listCrmOnlyGapProcesses, env),
    ]);
    return uniqueNonEmpty([...withoutMoves, ...gaps]);
  }
  if (action === "backfill_audiencias") {
    return collectAudienciaBackfillTargets(env);
  }
  return selected;
}

async function collectAudienciaBackfillCandidateRows(env) {
  const pageSize = 200;
  let offset = 0;
  let scans = 0;
  const maxScans = 60;
  const candidates = [];
  while (scans < maxScans) {
    const rows = await listTableSafe(
      env,
      `publicacoes?select=id,processo_id,conteudo&processo_id=not.is.null&conteudo=ilike.${encodeURIComponent("*audien*")}&order=data_publicacao.desc.nullslast&limit=${pageSize}&offset=${offset}`
    );
    if (!rows.length) break;
    for (const row of rows) {
      if (!row?.processo_id) continue;
      const txt = String(row.conteudo || "");
      if (!testAudienciaSignal(txt)) continue;
      const dt = extractAudienciaDateTime(txt);
      if (!dt) continue;
      candidates.push({
        processo_id: row.processo_id,
        origem_id: row.id,
        data_audiencia: dt.toISOString(),
      });
    }
    if (rows.length < pageSize) break;
    offset += rows.length;
    scans += 1;
  }
  const uniqueIds = uniqueNonEmpty(candidates.map((item) => item.processo_id));
  if (!uniqueIds.length) return [];
  const existentes = await loadAudienciasByProcessIds(env, uniqueIds);
  const pendingCandidates = candidates.filter((candidate) => !existentes.some((item) => {
    const sameOrigin = String(item.origem_id || "") === String(candidate.origem_id || "");
    const sameDate = item.data_audiencia && new Date(item.data_audiencia).toISOString().slice(0, 19) === String(candidate.data_audiencia || "").slice(0, 19);
    return sameOrigin && sameDate;
  }));
  const pendingProcessIds = uniqueNonEmpty(pendingCandidates.map((item) => item.processo_id));
  if (!pendingProcessIds.length) return [];
  const processes = await loadProcessesByIds(
    env,
    pendingProcessIds,
    "id,numero_cnj,titulo,account_id_freshsales,status_atual_processo"
  );
  const processMap = new Map(processes.map((item) => [item.id, item]));
  const grouped = new Map();
  for (const candidate of pendingCandidates) {
    const current = grouped.get(candidate.processo_id) || {
      processo_id: candidate.processo_id,
      audiencias_pendentes: 0,
      proxima_data_audiencia: null,
      ultima_data_audiencia: null,
    };
    current.audiencias_pendentes += 1;
    if (!current.proxima_data_audiencia || candidate.data_audiencia < current.proxima_data_audiencia) {
      current.proxima_data_audiencia = candidate.data_audiencia;
    }
    if (!current.ultima_data_audiencia || candidate.data_audiencia > current.ultima_data_audiencia) {
      current.ultima_data_audiencia = candidate.data_audiencia;
    }
    grouped.set(candidate.processo_id, current);
  }
  return [...grouped.values()]
    .map((item) => {
      const process = processMap.get(item.processo_id) || {};
      return {
        ...item,
        numero_cnj: process.numero_cnj || null,
        titulo: process.titulo || null,
        account_id_freshsales: process.account_id_freshsales || null,
        status_atual_processo: process.status_atual_processo || null,
      };
    })
    .filter((item) => item.numero_cnj)
    .sort((a, b) => {
      const countDiff = Number(b.audiencias_pendentes || 0) - Number(a.audiencias_pendentes || 0);
      if (countDiff !== 0) return countDiff;
      return String(a.proxima_data_audiencia || "").localeCompare(String(b.proxima_data_audiencia || ""));
    });
}

async function collectAudienciaBackfillTargets(env) {
  const rows = await collectAudienciaBackfillCandidateRows(env);
  return uniqueNonEmpty(rows.map((item) => item.numero_cnj));
}

export async function listAudienciaBackfillCandidates(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const rows = await collectAudienciaBackfillCandidateRows(env);
  const start = (safePage - 1) * safePageSize;
  const items = rows.slice(start, start + safePageSize).map((item) => ({
    ...item,
    key: item.numero_cnj || item.processo_id,
  }));
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: rows.length,
    items,
  };
}

function getProcessActionLimitConfig(action) {
  if (action === "sync_supabase_crm") return { defaultLimit: 1, maxLimit: 1 };
  if (action === "repair_freshsales_accounts") return { defaultLimit: 1, maxLimit: 1 };
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
  if (action === "sincronizar_publicacoes_activity") {
    return collectPublicacoesTargets(listPublicationActivityBacklog, env);
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

async function loadPendingPublicacoesByProcessIds(env, processIds, limitPerProcess = 50) {
  const output = [];
  for (const chunk of splitIntoChunks(processIds, 25)) {
    const rows = await hmadvRest(
      env,
      `publicacoes?${buildInFilter("processo_id", chunk)}&freshsales_activity_id=is.null&select=id,processo_id,conteudo,data_publicacao,fonte,numero_processo_api,freshsales_activity_id&order=data_publicacao.desc.nullslast&limit=${Math.max(chunk.length * limitPerProcess, chunk.length)}`
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

async function loadPendingAudienciasByProcessIds(env, processIds, limitPerProcess = 20) {
  const output = [];
  for (const chunk of splitIntoChunks(processIds, 25)) {
    const rows = await hmadvRest(
      env,
      `audiencias?${buildInFilter("processo_id", chunk)}&freshsales_activity_id=is.null&select=id,processo_id,origem,origem_id,tipo,data_audiencia,descricao,local,situacao,metadata,freshsales_activity_id&order=data_audiencia.asc.nullslast&limit=${Math.max(chunk.length * limitPerProcess, chunk.length)}`
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
  const rawBatchSize = Math.max(120, safePageSize * 8);
  const maxScans = 24;
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

  const ordered = [...grouped.values()].sort((left, right) => {
    const a = left.ultima_publicacao || "";
    const b = right.ultima_publicacao || "";
    return a < b ? 1 : a > b ? -1 : 0;
  });

  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: hasMore ? Math.max(targetEnd + 1, ordered.length) : ordered.length,
    totalEstimated: hasMore,
    hasMore,
    limited: hasMore,
    items: ordered.slice(targetStart, targetEnd),
  };
}

async function collectPartesExtractionCandidatePage(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const targetStart = (safePage - 1) * safePageSize;
  const targetEnd = targetStart + safePageSize;
  const processBatchSize = Math.max(80, safePageSize * 6);
  const maxScans = 20;
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
      processIds.length ? loadPublicacoesByProcessIds(env, processIds, 6) : Promise.resolve([]),
      processIds.length ? loadPartesByProcessIds(env, processIds) : Promise.resolve([]),
    ]);

    for (const proc of processRows) {
      const dedupeKey = proc.numero_cnj || proc.id;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      const pubs = publicacoes.filter((item) => item.processo_id === proc.id).slice(0, 18);
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
    limited: hasMore,
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
  const payload = {
    processo_id: proc.id,
    action: "repair",
    account_id_freshsales: proc.account_id_freshsales,
    numero_cnj: proc.numero_cnj,
    titulo: proc.titulo,
    classe: proc.classe,
    assunto_principal: proc.assunto_principal,
    area: proc.area,
    data_ajuizamento: proc.data_ajuizamento,
    sistema: proc.sistema,
    polo_ativo: proc.polo_ativo,
    polo_passivo: proc.polo_passivo,
    status_atual_processo: proc.status_atual_processo,
  };
  return hmadvFunction(
    env,
    "fs-account-repair",
    { processo_id: proc.id },
    { method: "POST", body: payload }
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

async function patchPublicacaoFreshsalesActivityId(env, publicationId, activityId) {
  const rows = await hmadvRest(
    env,
    `publicacoes?id=eq.${encodeURIComponent(String(publicationId || ""))}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "judiciario",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        freshsales_activity_id: activityId ? String(activityId) : null,
      }),
    },
    "judiciario"
  );
  return rows?.[0] || null;
}

async function patchAudienciaFreshsalesSync(env, audienciaId, { activityId = null, appointmentId = null } = {}) {
  const normalizedId = String(audienciaId || "").trim();
  if (!normalizedId) return null;
  const payload = {
    freshsales_activity_id: activityId ? String(activityId) : null,
    metadata: {
      freshsales_activity_id: activityId ? String(activityId) : null,
      appointment_id: appointmentId ? String(appointmentId) : null,
      synced_at: new Date().toISOString(),
    },
  };
  const rows = await hmadvRest(
    env,
    `audiencias?id=eq.${encodeURIComponent(normalizedId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Content-Profile": "judiciario",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    }
  );
  return rows?.[0] || null;
}

export async function syncPublicationActivities(env, { processNumbers = [], limit = 5 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 5), 10));
  if (!processNumbers.length) {
    try {
      const remote = await hmadvFunction(
        env,
        "publicacoes-freshsales",
        { action: "sync", batch: safeLimit },
        { method: "POST", body: {} }
      );
      return {
        checkedAt: new Date().toISOString(),
        source: "edge_function_publicacoes_freshsales",
        processosLidos: Number(remote?.total || 0),
        publicacoes: Number(remote?.sucesso || 0),
        activitiesCriadas: Number(remote?.sucesso || 0),
        publicacoesAtualizadas: Number(remote?.sucesso || 0),
        semAccount: Number(remote?.sem_account || 0),
        errors: Number(remote?.erro || 0),
        sample: Array.isArray(remote?.detalhes) ? remote.detalhes.slice(0, 10) : [],
        remote,
      };
    } catch (error) {
      // Fallback local keeps the panel usable even when the HMADV edge function is unavailable.
    }
  }

  let processes = [];
  if (processNumbers.length) {
    processes = await loadProcessesByNumbers(
      env,
      processNumbers,
      "id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,link_externo_processo"
    );
  } else {
    const backlog = await listPublicationActivityBacklog(env, { page: 1, pageSize: safeLimit });
    const processIds = uniqueNonEmpty((backlog.items || []).map((item) => item.processo_id));
    processes = processIds.length
      ? await loadProcessesByIds(
          env,
          processIds,
          "id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,link_externo_processo"
        )
      : [];
  }

  const scopedProcesses = processes.slice(0, safeLimit);
  const processIds = scopedProcesses.map((item) => item.id);
  const pendingPublicacoes = processIds.length
    ? await loadPendingPublicacoesByProcessIds(env, processIds, 25)
    : [];

  let processesRead = 0;
  let activitiesCreated = 0;
  let publicacoesUpdated = 0;
  const sample = [];

  for (const process of scopedProcesses) {
    const processPublications = pendingPublicacoes
      .filter((item) => item.processo_id === process.id)
      .slice(0, 25);
    const row = {
      processo_id: process.id,
      numero_cnj: process.numero_cnj,
      titulo: process.titulo || null,
      account_id_freshsales: process.account_id_freshsales || null,
      publicacoes_pendentes: processPublications.length,
      activities_criadas: 0,
      publicacoes_atualizadas: 0,
      status: "sem_publicacoes_pendentes",
      details: [],
    };

    if (!process.account_id_freshsales) {
      row.status = "sem_sales_account";
      sample.push(row);
      continue;
    }

    processesRead += 1;
    if (!processPublications.length) {
      sample.push(row);
      continue;
    }

    row.status = "sincronizado";
    for (const publication of processPublications) {
      try {
        const activityResult = await createFreshsalesPublicationActivity(env, {
          accountId: process.account_id_freshsales,
          publication,
          process,
        });
        const activityId = activityResult?.activity?.id ? String(activityResult.activity.id) : null;
        if (!activityId) {
          throw new Error("Freshsales nao retornou o id da activity de publicacao.");
        }
        await patchPublicacaoFreshsalesActivityId(env, publication.id, activityId);
        activitiesCreated += 1;
        publicacoesUpdated += 1;
        row.activities_criadas += 1;
        row.publicacoes_atualizadas += 1;
        if (row.details.length < 5) {
          row.details.push({
            publicacao_id: publication.id,
            freshsales_activity_id: activityId,
            data_publicacao: publication.data_publicacao || null,
          });
        }
      } catch (error) {
        row.status = "error";
        if (row.details.length < 5) {
          row.details.push({
            publicacao_id: publication.id,
            error: error.message || "Falha ao criar activity de publicacao.",
          });
        }
      }
    }
    sample.push(row);
  }

  return {
    checkedAt: new Date().toISOString(),
    source: "local_worker_fallback",
    processosLidos: processesRead,
    publicacoes: publicacoesUpdated,
    activitiesCriadas: activitiesCreated,
    publicacoesAtualizadas: publicacoesUpdated,
    sample,
  };
}

export async function getPublicationActivityTypes(env) {
  return hmadvFunction(env, "publicacoes-freshsales", { action: "activity_types" });
}

export async function syncMovementActivities(env, { processNumbers = [], limit = 10 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 10), 25));
  if (processNumbers.length) {
    try {
      const remote = await hmadvFunction(
        env,
        "fs-exec",
        { action: "sync_andamentos_scoped", limite: safeLimit },
        {
          method: "POST",
          body: {
            processNumbers,
          },
        }
      );
      return {
        checkedAt: new Date().toISOString(),
        source: "edge_function_fs_exec_scoped",
        processosLidos: Number(remote?.processos || 0),
        movimentacoes: Number(remote?.enviados || 0),
        activitiesCriadas: Number(remote?.enviados || 0),
        movimentacoesAtualizadas: Number(remote?.enviados || 0),
        semAccount: Number(remote?.sem_account || 0),
        errors: Number(remote?.erros || 0),
        sample: Array.isArray(remote?.detalhes) ? remote.detalhes.slice(0, 10) : [],
        remote,
      };
    } catch {
      // fall through to backlog diagnostics if the scoped edge function is unavailable
    }
  }

  if (!processNumbers.length) {
    try {
      const remote = await hmadvFunction(env, "fs-exec", { action: "sync_andamentos", limite: safeLimit });
      return {
        checkedAt: new Date().toISOString(),
        source: "edge_function_fs_exec",
        processosLidos: Number(remote?.total || 0),
        movimentacoes: Number(remote?.enviados || 0),
        activitiesCriadas: Number(remote?.enviados || 0),
        movimentacoesAtualizadas: Number(remote?.enviados || 0),
        semAccount: Number(remote?.sem_account || 0),
        errors: Number(remote?.erros || 0),
        sample: Array.isArray(remote?.detalhes) ? remote.detalhes.slice(0, 10) : [],
        remote,
      };
    } catch {
      try {
        const remote = await hmadvFunction(env, "sync-worker", { action: "run" }, { method: "POST", body: {} });
        return {
          checkedAt: new Date().toISOString(),
          source: "edge_function_sync_worker",
          movimentacoes: Number(remote?.andamentos_dj || remote?.movs_advise || 0),
          activitiesCriadas: Number(remote?.andamentos_dj || remote?.movs_advise || 0),
          movimentacoesAtualizadas: Number(remote?.andamentos_dj || remote?.movs_advise || 0),
          sample: [],
          remote,
        };
      } catch {
        // keep falling through to explicit local diagnostics below
      }
    }
  }

  const processes = processNumbers.length
    ? await loadProcessesByNumbers(
        env,
        processNumbers,
        "id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,quantidade_movimentacoes"
      )
    : await listMovementActivityBacklog(env, { page: 1, pageSize: safeLimit }).then(async (data) => {
        const ids = uniqueNonEmpty((data.items || []).map((item) => item.processo_id));
        return ids.length
          ? loadProcessesByIds(
              env,
              ids,
              "id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,quantidade_movimentacoes"
            )
          : [];
      });

  return {
    checkedAt: new Date().toISOString(),
    source: "backlog_only",
    processosLidos: processes.length,
    movimentacoes: 0,
    activitiesCriadas: 0,
    movimentacoesAtualizadas: 0,
    sample: processes.slice(0, safeLimit).map((proc) => ({
      processo_id: proc.id,
      numero_cnj: proc.numero_cnj,
      titulo: proc.titulo || null,
      account_id_freshsales: proc.account_id_freshsales || null,
      status: proc.account_id_freshsales ? "pendente_edge_function" : "sem_sales_account",
    })),
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

async function collectGroupedBacklogByProcess(env, {
  path,
  page = 1,
  pageSize = 20,
  rawBatchSize = 150,
  maxScans = 30,
  maxProcessLoad = 40,
  mapRow,
}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const targetStart = (safePage - 1) * safePageSize;
  const targetEnd = targetStart + safePageSize;
  const grouped = new Map();
  let offset = 0;
  let scans = 0;
  let hasMore = true;

  while (hasMore && scans < maxScans && grouped.size < targetEnd) {
    const rows = await listTableSafe(
      env,
      `${path}&limit=${rawBatchSize}&offset=${offset}`
    );
    offset += rows.length;
    scans += 1;
    for (const row of rows) {
      mapRow(grouped, row);
    }
    if (rows.length < rawBatchSize) hasMore = false;
  }

  const ordered = [...grouped.values()].sort((left, right) => {
    const countDiff = Number(right.total_pendente || 0) - Number(left.total_pendente || 0);
    if (countDiff !== 0) return countDiff;
    return String(right.ultima_data || "").localeCompare(String(left.ultima_data || ""));
  });
  const pageSlice = ordered.slice(targetStart, targetEnd);
  const processIds = [...new Set(pageSlice.map((item) => item.processo_id).filter(Boolean))].slice(0, maxProcessLoad);
  const processRows = processIds.length
    ? await loadProcessesByIds(
        env,
        processIds,
        "id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,quantidade_movimentacoes"
      )
    : [];
  const processMap = new Map(processRows.map((item) => [item.id, item]));
  const items = pageSlice
    .map((item) => {
      const process = processMap.get(item.processo_id) || {};
      return {
        ...item,
        numero_cnj: process.numero_cnj || null,
        titulo: process.titulo || item.titulo || null,
        account_id_freshsales: process.account_id_freshsales || null,
        status_atual_processo: process.status_atual_processo || null,
        quantidade_movimentacoes: process.quantidade_movimentacoes ?? null,
        key: process.numero_cnj || item.processo_id,
        fallback: !process.numero_cnj,
      };
    })
    .filter((item) => item.numero_cnj);

  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: hasMore ? Math.max(targetEnd + 1, ordered.length) : ordered.length,
    items,
    hasMore,
    limited: hasMore,
  };
}

export async function listPublicationActivityBacklog(env, { page = 1, pageSize = 20 } = {}) {
  return collectGroupedBacklogByProcess(env, {
    page,
    pageSize,
    rawBatchSize: 150,
    maxScans: 30,
    maxProcessLoad: 30,
    path: `publicacoes?select=id,processo_id,data_publicacao,conteudo,freshsales_activity_id&processo_id=not.is.null&freshsales_activity_id=is.null&order=data_publicacao.desc.nullslast`,
    mapRow(grouped, row) {
      if (!row?.processo_id) return;
      const current = grouped.get(row.processo_id) || {
        processo_id: row.processo_id,
        total_pendente: 0,
        ultima_data: null,
        sample_ids: [],
        sample_conteudo: [],
      };
      current.total_pendente += 1;
      if (row.data_publicacao && (!current.ultima_data || row.data_publicacao > current.ultima_data)) {
        current.ultima_data = row.data_publicacao;
      }
      if (row.id && current.sample_ids.length < 5) current.sample_ids.push(row.id);
      const snippet = String(row.conteudo || "").trim().slice(0, 220);
      if (snippet && current.sample_conteudo.length < 3) current.sample_conteudo.push(snippet);
      grouped.set(row.processo_id, current);
    },
  });
}

export async function listPartesSemContatoBacklog(env, { page = 1, pageSize = 20 } = {}) {
  return collectGroupedBacklogByProcess(env, {
    page,
    pageSize,
    rawBatchSize: 150,
    maxScans: 30,
    maxProcessLoad: 30,
    path: `partes?select=id,processo_id,nome,polo,tipo_pessoa,contato_freshsales_id&contato_freshsales_id=is.null`,
    mapRow(grouped, row) {
      if (!row?.processo_id) return;
      const current = grouped.get(row.processo_id) || {
        processo_id: row.processo_id,
        total_pendente: 0,
        ultima_data: null,
        sample_partes: [],
      };
      current.total_pendente += 1;
      if (current.sample_partes.length < 5) {
        current.sample_partes.push({
          parte_id: row.id,
          nome: row.nome,
          polo: row.polo || null,
          tipo_pessoa: row.tipo_pessoa || null,
        });
      }
      grouped.set(row.processo_id, current);
    },
  });
}

export async function listMovementActivityBacklog(env, { page = 1, pageSize = 20 } = {}) {
  return collectGroupedBacklogByProcess(env, {
    page,
    pageSize,
    rawBatchSize: 150,
    maxScans: 30,
    maxProcessLoad: 30,
    path: `movimentacoes?select=id,processo_id,conteudo,data_movimentacao,fonte,freshsales_activity_id&processo_id=not.is.null&freshsales_activity_id=is.null&order=data_movimentacao.desc.nullslast`,
    mapRow(grouped, row) {
      if (!row?.processo_id) return;
      const current = grouped.get(row.processo_id) || {
        processo_id: row.processo_id,
        total_pendente: 0,
        ultima_data: null,
        sample_ids: [],
        sample_conteudo: [],
      };
      current.total_pendente += 1;
      if (row.data_movimentacao && (!current.ultima_data || row.data_movimentacao > current.ultima_data)) {
        current.ultima_data = row.data_movimentacao;
      }
      if (row.id && current.sample_ids.length < 5) current.sample_ids.push(row.id);
      const snippet = String(row.conteudo || "").trim().slice(0, 220);
      if (snippet && current.sample_conteudo.length < 3) current.sample_conteudo.push(snippet);
      grouped.set(row.processo_id, current);
    },
  });
}

function buildCoverageQueryFilter(query = "") {
  const clean = String(query || "").trim();
  if (!clean) return "";
  const digits = clean.replace(/\D+/g, "");
  const filters = [encodeURIComponent(`titulo.ilike.*${clean}*`)];
  if (digits) {
    filters.push(encodeURIComponent(`numero_cnj.ilike.*${digits}*`));
    filters.push(encodeURIComponent(`numero_processo.ilike.*${digits}*`));
  } else {
    filters.push(encodeURIComponent(`numero_cnj.ilike.*${clean}*`));
  }
  return `or=(${filters.join(",")})`;
}

function summarizeCoveragePercentage(parts = []) {
  const total = parts.length;
  const done = parts.filter(Boolean).length;
  return total ? Math.round((done / total) * 100) : 0;
}

export async function listProcessCoverage(env, { page = 1, pageSize = 20, query = "", onlyPending = false } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const coverageFilter = buildCoverageQueryFilter(query);
  const baseFilters = [coverageFilter].filter(Boolean);
  const baseQuery = baseFilters.join("&");
  const processSelect = [
    "id",
    "numero_cnj",
    "numero_processo",
    "titulo",
    "account_id_freshsales",
    "quantidade_movimentacoes",
    "classe",
    "assunto_principal",
    "area",
    "data_ajuizamento",
    "sistema",
    "polo_ativo",
    "polo_passivo",
    "status_atual_processo",
  ].join(",");
  const countFilters = baseQuery;
  const totalRows = await countTableSafe(env, "processos", countFilters);
  const processes = await listTableSafe(
    env,
    `processos?select=${processSelect}${baseQuery ? `&${baseQuery}` : ""}&order=updated_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
  );
  const processIds = uniqueNonEmpty((processes || []).map((item) => item.id));
  if (!processIds.length) {
    return {
      page: safePage,
      pageSize: safePageSize,
      totalRows,
      items: [],
    };
  }

  const [partesRows, publicacoesRows, movimentacoesRows, audienciasRows] = await Promise.all([
    listTableSafe(env, `partes?select=processo_id,contato_freshsales_id&${buildInFilter("processo_id", processIds)}&limit=5000`),
    listTableSafe(env, `publicacoes?select=processo_id,freshsales_activity_id&${buildInFilter("processo_id", processIds)}&limit=5000`),
    listTableSafe(env, `movimentacoes?select=processo_id,freshsales_activity_id&${buildInFilter("processo_id", processIds)}&limit=5000`),
    listTableSafe(env, `audiencias?select=processo_id,freshsales_activity_id&${buildInFilter("processo_id", processIds)}&limit=5000`),
  ]);

  const grouped = new Map();
  for (const processId of processIds) {
    grouped.set(processId, {
      partesTotal: 0,
      partesComContato: 0,
      publicacoesTotal: 0,
      publicacoesComActivity: 0,
      movimentacoesTotal: 0,
      movimentacoesComActivity: 0,
      audienciasTotal: 0,
      audienciasComActivity: 0,
    });
  }

  for (const row of partesRows || []) {
    const current = grouped.get(row?.processo_id);
    if (!current) continue;
    current.partesTotal += 1;
    if (row?.contato_freshsales_id) current.partesComContato += 1;
  }
  for (const row of publicacoesRows || []) {
    const current = grouped.get(row?.processo_id);
    if (!current) continue;
    current.publicacoesTotal += 1;
    if (row?.freshsales_activity_id) current.publicacoesComActivity += 1;
  }
  for (const row of movimentacoesRows || []) {
    const current = grouped.get(row?.processo_id);
    if (!current) continue;
    current.movimentacoesTotal += 1;
    if (row?.freshsales_activity_id) current.movimentacoesComActivity += 1;
  }
  for (const row of audienciasRows || []) {
    const current = grouped.get(row?.processo_id);
    if (!current) continue;
    current.audienciasTotal += 1;
    if (row?.freshsales_activity_id) current.audienciasComActivity += 1;
  }

  const items = (processes || [])
    .map((row) => {
      const totals = grouped.get(row.id) || {};
      const hasAccount = Boolean(row.account_id_freshsales);
      const detailsOk = Boolean(
        row.classe &&
        row.assunto_principal &&
        row.area &&
        row.data_ajuizamento &&
        row.sistema &&
        row.polo_ativo &&
        row.polo_passivo &&
        row.status_atual_processo
      );
      const hasMovements = Number(row.quantidade_movimentacoes || 0) > 0 || Number(totals.movimentacoesTotal || 0) > 0;
      const partsOk = Number(totals.partesTotal || 0) === 0
        ? true
        : Number(totals.partesComContato || 0) >= Number(totals.partesTotal || 0);
      const publicationsOk = Number(totals.publicacoesTotal || 0) === 0
        ? true
        : Number(totals.publicacoesComActivity || 0) >= Number(totals.publicacoesTotal || 0);
      const movementsOk = Number(totals.movimentacoesTotal || 0) === 0
        ? hasMovements
        : Number(totals.movimentacoesComActivity || 0) >= Number(totals.movimentacoesTotal || 0);
      const hearingsOk = Number(totals.audienciasTotal || 0) === 0
        ? true
        : Number(totals.audienciasComActivity || 0) >= Number(totals.audienciasTotal || 0);
      const crmGap = hasAccount && !detailsOk;
      const pending = [];
      if (!hasAccount) pending.push("sem_account");
      if (!detailsOk) pending.push("detalhes_incompletos");
      if (!hasMovements) pending.push("sem_movimentacoes");
      if (!partsOk) pending.push("partes_sem_contato");
      if (!publicationsOk) pending.push("publicacoes_pendentes");
      if (!movementsOk) pending.push("movimentacoes_pendentes");
      if (!hearingsOk) pending.push("audiencias_pendentes");
      if (crmGap) pending.push("gap_crm");

      const coveragePct = summarizeCoveragePercentage([
        hasAccount,
        detailsOk,
        hasMovements,
        partsOk,
        publicationsOk,
        movementsOk,
        hearingsOk,
      ]);

      return {
        key: row.numero_cnj || row.id,
        processo_id: row.id,
        numero_cnj: row.numero_cnj || row.numero_processo || null,
        titulo: row.titulo || null,
        account_id_freshsales: row.account_id_freshsales || null,
        status_atual_processo: row.status_atual_processo || null,
        coveragePct,
        hasAccount,
        detailsOk,
        hasMovements,
        partsOk,
        publicationsOk,
        movementsOk,
        hearingsOk,
        crmGap,
        partesTotal: Number(totals.partesTotal || 0),
        partesSemContato: Math.max(0, Number(totals.partesTotal || 0) - Number(totals.partesComContato || 0)),
        publicacoesTotal: Number(totals.publicacoesTotal || 0),
        publicacoesPendentes: Math.max(0, Number(totals.publicacoesTotal || 0) - Number(totals.publicacoesComActivity || 0)),
        movimentacoesTotal: Number(totals.movimentacoesTotal || 0),
        movimentacoesPendentes: Math.max(0, Number(totals.movimentacoesTotal || 0) - Number(totals.movimentacoesComActivity || 0)),
        audienciasTotal: Number(totals.audienciasTotal || 0),
        audienciasPendentes: Math.max(0, Number(totals.audienciasTotal || 0) - Number(totals.audienciasComActivity || 0)),
        pending,
      };
    })
    .filter((item) => !onlyPending || item.pending.length > 0);

  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: onlyPending ? items.length : totalRows,
    items,
  };
}

export async function persistProcessCoverageSnapshot(env, { pageSize = 100, maxPages = 100 } = {}) {
  const safePageSize = Math.max(20, Math.min(Number(pageSize || 100), 200));
  const safeMaxPages = Math.max(1, Math.min(Number(maxPages || 100), 500));
  let page = 1;
  let processed = 0;
  let upserted = 0;
  const sample = [];

  while (page <= safeMaxPages) {
    const coverage = await listProcessCoverage(env, {
      page,
      pageSize: safePageSize,
      onlyPending: false,
    });
    const items = Array.isArray(coverage?.items) ? coverage.items : [];
    if (!items.length) break;

    const rows = items
      .filter((item) => item?.processo_id)
      .map((item) => ({
        processo_id: item.processo_id,
        numero_cnj: item.numero_cnj || null,
        account_id_freshsales: item.account_id_freshsales || null,
        coverage_pct: Number(item.coveragePct || 0),
        has_account: Boolean(item.hasAccount),
        details_ok: Boolean(item.detailsOk),
        has_movements: Boolean(item.hasMovements),
        parts_ok: Boolean(item.partsOk),
        publications_ok: Boolean(item.publicationsOk),
        movements_ok: Boolean(item.movementsOk),
        hearings_ok: Boolean(item.hearingsOk),
        crm_gap: Boolean(item.crmGap),
        pending_labels: item.pending || [],
        summary: {
          partes_total: Number(item.partesTotal || 0),
          partes_sem_contato: Number(item.partesSemContato || 0),
          publicacoes_total: Number(item.publicacoesTotal || 0),
          publicacoes_pendentes: Number(item.publicacoesPendentes || 0),
          movimentacoes_total: Number(item.movimentacoesTotal || 0),
          movimentacoes_pendentes: Number(item.movimentacoesPendentes || 0),
          audiencias_total: Number(item.audienciasTotal || 0),
          audiencias_pendentes: Number(item.audienciasPendentes || 0),
        },
        last_sync_at: new Date().toISOString(),
        last_error: null,
      }));

    if (rows.length) {
      await hmadvRest(
        env,
        "processo_cobertura_sync?on_conflict=processo_id",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Profile": "judiciario",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(rows),
        },
        "judiciario"
      );
      upserted += rows.length;
      if (sample.length < 8) {
        sample.push(...rows.slice(0, Math.max(0, 8 - sample.length)).map((row) => ({
          numero_cnj: row.numero_cnj,
          coverage_pct: row.coverage_pct,
          pending_labels: row.pending_labels,
        })));
      }
    }

    processed += items.length;
    if (items.length < safePageSize) break;
    page += 1;
  }

  return {
    ok: true,
    processed,
    upserted,
    pages: page,
    sample,
  };
}

export async function getPersistedCoverageOverview(env) {
  try {
    const [totalRows, coveredRows, pendingRows, lastRows] = await Promise.all([
      countTableSafe(env, "processo_cobertura_sync", "", "judiciario", 0),
      countTableSafe(env, "processo_cobertura_sync", "coverage_pct=gte.100", "judiciario", 0),
      countTableSafe(env, "processo_cobertura_sync", "coverage_pct=lt.100", "judiciario", 0),
      listTableSafe(
        env,
        "processo_cobertura_sync?select=last_sync_at,coverage_pct,numero_cnj,pending_labels&order=last_sync_at.desc&limit=5",
        "judiciario",
        []
      ),
    ]);
    return {
      totalRows,
      coveredRows,
      pendingRows,
      lastSyncAt: lastRows?.[0]?.last_sync_at || null,
      sample: lastRows || [],
    };
  } catch (error) {
    if (schemaMessageMatches(error?.message, "processo_cobertura_sync")) {
      return {
        unsupported: true,
        totalRows: 0,
        coveredRows: 0,
        pendingRows: 0,
        lastSyncAt: null,
        sample: [],
      };
    }
    throw error;
  }
}

export async function getPersistedCoveragePriorityReport(env, { limit = 100 } = {}) {
  const safeLimit = Math.max(10, Math.min(Number(limit || 100), 500));
  try {
    const rows = await listTableSafe(
      env,
      `processo_cobertura_sync?select=processo_id,numero_cnj,coverage_pct,pending_labels,last_sync_at,account_id_freshsales,summary&coverage_pct=lt.100&order=coverage_pct.asc,last_sync_at.asc&limit=${safeLimit}`,
      "judiciario",
      []
    );
    const reasonCounts = new Map();
    for (const row of rows || []) {
      const labels = Array.isArray(row?.pending_labels) ? row.pending_labels : [];
      for (const label of labels) {
        const key = String(label || "").trim();
        if (!key) continue;
        reasonCounts.set(key, Number(reasonCounts.get(key) || 0) + 1);
      }
    }
    const priorities = [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((left, right) => Number(right.count || 0) - Number(left.count || 0));
    return {
      totalRows: rows.length,
      priorities,
      sample: rows.slice(0, 20).map((row) => ({
        processo_id: row.processo_id,
        numero_cnj: row.numero_cnj || null,
        coverage_pct: Number(row.coverage_pct || 0),
        pending_labels: Array.isArray(row.pending_labels) ? row.pending_labels : [],
        account_id_freshsales: row.account_id_freshsales || null,
        last_sync_at: row.last_sync_at || null,
        summary: row.summary || {},
      })),
    };
  } catch (error) {
    if (schemaMessageMatches(error?.message, "processo_cobertura_sync")) {
      return {
        unsupported: true,
        totalRows: 0,
        priorities: [],
        sample: [],
      };
    }
    throw error;
  }
}

export async function getTaggedDatajudDiagnostics(env, { limit = 100, tag = "datajud" } = {}) {
  return hmadvFunction(
    env,
    "datajud-webhook",
    {
      action: "diagnose_tagged_accounts",
      limite: Number(limit || 100),
      tag: String(tag || "datajud"),
    },
    { method: "POST", body: {} }
  );
}

export async function getTaggedDatajudMissingCnjReport(env, { limit = 100, tag = "datajud" } = {}) {
  const diagnostics = await getTaggedDatajudDiagnostics(env, { limit, tag });
  const sample = Array.isArray(diagnostics?.sample) ? diagnostics.sample : [];
  const items = sample
    .filter((item) => String(item?.status || "").trim() === "missing_cnj")
    .map((item) => {
      const inferred = String(item?.inferred_cnj || "").trim() || null;
      return {
        account_id: item?.account_id || null,
        account_name: item?.account_name || null,
        website: item?.website || null,
        inferred_cnj: inferred,
        recoverable: Boolean(inferred),
        suggested_action: inferred
          ? "copiar_cnj_detectado_para_cf_processo"
          : "preencher_cf_processo_no_freshsales",
      };
    });
  return {
    tag: String(tag || "datajud"),
    missingCnj: Number(diagnostics?.missing_cnj || 0),
    recoverable: items.filter((item) => item.recoverable).length,
    items,
  };
}

export async function recoverTaggedDatajudMissingCnj(env, { limit = 100, tag = "datajud" } = {}) {
  return hmadvFunction(
    env,
    "datajud-webhook",
    {
      action: "recover_tagged_missing_cnj",
      limite: Number(limit || 100),
      tag: String(tag || "datajud"),
    },
    { method: "POST", body: {} }
  );
}

export async function runFullIntegrationCron(env, {
  scanLimit = 50,
  monitorLimit = 100,
  movementLimit = 120,
  advisePages = 2,
  advisePerPage = 50,
  publicacoesBatch = 20,
} = {}) {
  return hmadvFunction(
    env,
    "datajud-webhook",
    {
      action: "cron_integracao_total",
      scan_limit: Number(scanLimit || 50),
      monitor_limit: Number(monitorLimit || 100),
      movement_limit: Number(movementLimit || 120),
      advise_pages: Number(advisePages || 2),
      advise_per_page: Number(advisePerPage || 50),
      publicacoes_batch: Number(publicacoesBatch || 20),
    },
    { method: "POST", body: {} }
  );
}

export async function getTaggedDatajudCoverageReport(env, { limit = 100, tag = "datajud" } = {}) {
  const safeLimit = Math.max(10, Math.min(Number(limit || 100), 250));
  const [diagnostics, coverageOverview] = await Promise.all([
    getTaggedDatajudDiagnostics(env, { limit: safeLimit, tag }),
    getPersistedCoverageOverview(env),
  ]);

  const sample = Array.isArray(diagnostics?.sample) ? diagnostics.sample : [];
  const cnjs = uniqueNonEmpty(sample.map((item) => item?.numero_cnj));
  let coverageRows = [];
  if (cnjs.length) {
    coverageRows = await listTableSafe(
      env,
      `processo_cobertura_sync?select=numero_cnj,coverage_pct,pending_labels,last_sync_at&${buildInFilter("numero_cnj", cnjs)}&limit=${Math.max(cnjs.length, 1)}`,
      "judiciario",
      []
    );
  }
  const coverageMap = new Map((coverageRows || []).map((item) => [String(item.numero_cnj || "").trim(), item]));

  const taggedTotal = Number(diagnostics?.scanned || 0);
  const fullyCovered = Number(diagnostics?.fully_covered || 0);
  const fullyCoveredRate = taggedTotal ? Math.round((fullyCovered / taggedTotal) * 100) : 0;
  const hearingGapCount = sample.reduce((acc, item) => {
    const coverage = coverageMap.get(String(item?.numero_cnj || "").trim()) || null;
    const labels = Array.isArray(coverage?.pending_labels) ? coverage.pending_labels : [];
    return acc + (labels.includes("audiencias_pendentes") ? 1 : 0);
  }, 0);
  const blockerCounts = [
    { key: "missing_cnj", label: "Sem CNJ", count: Number(diagnostics?.missing_cnj || 0) },
    { key: "without_process", label: "Sem processo no HMADV", count: Number(diagnostics?.without_process || 0) },
    { key: "without_account_link", label: "Sem vinculo account->processo", count: Number(diagnostics?.without_account_link || 0) },
    { key: "without_movements", label: "Sem movimentacoes locais", count: Number(diagnostics?.without_movements || 0) },
    { key: "movement_activity_gap", label: "Movimentacoes sem activity", count: Number(diagnostics?.movement_activity_gap || 0) },
    { key: "publication_activity_gap", label: "Publicacoes sem activity", count: Number(diagnostics?.publication_activity_gap || 0) },
    { key: "parts_contact_gap", label: "Partes sem contato", count: Number(diagnostics?.parts_contact_gap || 0) },
    { key: "hearing_activity_gap", label: "Audiencias sem activity", count: hearingGapCount },
  ]
    .filter((item) => item.count > 0)
    .sort((left, right) => Number(right.count || 0) - Number(left.count || 0));

  return {
    tag,
    taggedTotal,
    fullyCovered,
    fullyCoveredRate,
    coverageOverview,
    blockers: blockerCounts,
    sample: sample.map((item) => {
      const numeroCnj = String(item?.numero_cnj || "").trim();
      const coverage = coverageMap.get(numeroCnj) || null;
      return {
        ...item,
        coverage_pct: Number(coverage?.coverage_pct || 0),
        coverage_pending_labels: Array.isArray(coverage?.pending_labels) ? coverage.pending_labels : [],
        coverage_last_sync_at: coverage?.last_sync_at || null,
      };
    }),
  };
}

export async function getTaggedDatajudActionPlan(env, { limit = 100, tag = "datajud" } = {}) {
  const [report, missingCnjReport] = await Promise.all([
    getTaggedDatajudCoverageReport(env, { limit, tag }),
    getTaggedDatajudMissingCnjReport(env, { limit, tag }),
  ]);
  const blockers = Array.isArray(report?.blockers) ? report.blockers : [];
  const sample = Array.isArray(report?.sample) ? report.sample : [];
  const recoverableMissingCnj = Number(missingCnjReport?.recoverable || 0);
  const totalMissingCnj = Number(missingCnjReport?.missingCnj || 0);
  const manualMissingCnj = Math.max(0, totalMissingCnj - recoverableMissingCnj);

  const collectNumbers = (predicate, max = 10) => {
    const picked = [];
    for (const row of sample) {
      const number = String(row?.numero_cnj || "").trim();
      if (!number || picked.includes(number)) continue;
      if (!predicate(row)) continue;
      picked.push(number);
      if (picked.length >= max) break;
    }
    return picked;
  };

  const steps = [
    {
      key: "recover_missing_cnj",
      label: "Recuperar CNJ inferido no Freshsales",
      action: "recover_tagged_missing_cnj",
      count: recoverableMissingCnj,
      processNumbers: [],
      helper: "Copia automaticamente o CNJ inferido para cf_processo nos accounts tagueados que ainda permitem recuperacao automatica.",
    },
    {
      key: "missing_cnj",
      label: "Preencher CNJ no Freshsales",
      action: "manual_cf_processo",
      count: manualMissingCnj,
      processNumbers: [],
      helper: "Os accounts tagueados com datajud precisam ter um CNJ utilizavel para iniciar o sincronismo automatico.",
    },
    {
      key: "sync_core",
      label: "Sincronizar processo + DataJud + CRM",
      action: "sync_supabase_crm",
      intent: "datajud_plus_crm",
      count: Number(
        blockers
          .filter((item) => ["without_process", "without_account_link", "without_movements"].includes(String(item.key || "")))
          .reduce((acc, item) => acc + Number(item.count || 0), 0)
      ),
      processNumbers: collectNumbers((row) => {
        const status = String(row?.status || "").trim();
        return ["without_process", "without_account_link", "without_movements"].includes(status);
      }, 10),
      helper: "Recria a trilha estrutural entre account, processo no HMADV, DataJud e reflexo base no CRM.",
    },
    {
      key: "publication_activity_gap",
      label: "Sincronizar publicacoes no Freshsales",
      action: "sincronizar_publicacoes_activity",
      count: Number(blockers.find((item) => item.key === "publication_activity_gap")?.count || 0),
      processNumbers: collectNumbers((row) => String(row?.status || "").trim() === "publication_activity_gap", 10),
      helper: "Cria as sales activities de publicacoes ainda pendentes para os processos tagueados.",
    },
    {
      key: "movement_activity_gap",
      label: "Sincronizar movimentacoes no Freshsales",
      action: "sincronizar_movimentacoes_activity",
      count: Number(blockers.find((item) => item.key === "movement_activity_gap")?.count || 0),
      processNumbers: collectNumbers((row) => String(row?.status || "").trim() === "movement_activity_gap", 10),
      helper: "Cria as sales activities de andamentos ainda pendentes para os processos tagueados.",
    },
    {
      key: "hearing_activity_gap",
      label: "Sincronizar audiencias no Freshsales",
      action: "sincronizar_audiencias_activity",
      count: Number(blockers.find((item) => item.key === "hearing_activity_gap")?.count || 0),
      processNumbers: collectNumbers((row) => {
        const labels = Array.isArray(row?.coverage_pending_labels) ? row.coverage_pending_labels : [];
        return labels.includes("audiencias_pendentes");
      }, 10),
      helper: "Extrai audiencias das publicacoes, grava no HMADV e cria activities/appointments no Freshsales.",
    },
    {
      key: "parts_contact_gap",
      label: "Reconciliar partes com contatos",
      action: "reconciliar_partes_contatos",
      count: Number(blockers.find((item) => item.key === "parts_contact_gap")?.count || 0),
      processNumbers: collectNumbers((row) => String(row?.status || "").trim() === "parts_contact_gap", 10),
      helper: "Vincula ou cria os contatos Freshsales das partes ainda pendentes.",
    },
  ]
    .filter((item) => item.count > 0)
    .map((item, index) => ({
      ...item,
      priority: index + 1,
    }));

  return {
    tag: String(tag || "datajud"),
    taggedTotal: Number(report?.taggedTotal || 0),
    fullyCovered: Number(report?.fullyCovered || 0),
    fullyCoveredRate: Number(report?.fullyCoveredRate || 0),
    topAction: steps[0] || null,
    steps,
  };
}

async function listSyncDatajudProcesses(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const filters = "account_id_freshsales=not.is.null&or=(quantidade_movimentacoes.is.null,quantidade_movimentacoes.eq.0)";
  const items = await listTableSafe(
    env,
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,quantidade_movimentacoes,status_atual_processo&${filters}&order=updated_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
  );
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: await countTableSafe(env, "processos", filters),
    items,
  };
}

async function listCrmOnlyGapProcesses(env, { page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const filters = "account_id_freshsales=not.is.null&quantidade_movimentacoes=gt.0&or=(classe.is.null,assunto_principal.is.null,area.is.null,data_ajuizamento.is.null,sistema.is.null,polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)";
  const items = await listTableSafe(
    env,
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,quantidade_movimentacoes,classe,assunto_principal,area,data_ajuizamento,sistema,polo_ativo,polo_passivo,status_atual_processo&${filters}&order=updated_at.desc.nullslast&limit=${safePageSize}&offset=${(safePage - 1) * safePageSize}`
  );
  return {
    page: safePage,
    pageSize: safePageSize,
    totalRows: await countTableSafe(env, "processos", filters),
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
  let pendingCandidates = [];
  let processes = [];
  if (processNumbers.length) {
    processes = await loadProcessesByNumbers(env, processNumbers);
  } else {
    pendingCandidates = await collectAudienciaBackfillTargets(env);
    processes = pendingCandidates.length
      ? await loadProcessesByNumbers(env, pendingCandidates.slice(0, safeLimit))
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
      let dt = extractAudienciaDateTime(txt);
      if (!dt) continue;
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
    candidatosPendentes: processNumbers.length ? processes.length : pendingCandidates.length,
    audienciasInseridas: inserted,
    sample: sample.slice(0, 30),
    limitAplicado: safeLimit,
  };
}

export async function syncAudienciaActivities(env, { processNumbers = [], limit = 10 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 10), 20));
  const backfill = await backfillAudiencias(env, {
    processNumbers,
    limit: safeLimit,
    apply: true,
  });

  let processes = [];
  if (processNumbers.length) {
    processes = await loadProcessesByNumbers(
      env,
      processNumbers,
      "id,numero_cnj,titulo,account_id_freshsales,status_atual_processo"
    );
  } else {
    const candidates = await listAudienciaBackfillCandidates(env, {
      page: 1,
      pageSize: safeLimit,
    });
    const numbers = uniqueNonEmpty((candidates.items || []).map((item) => item.numero_cnj));
    processes = numbers.length
      ? await loadProcessesByNumbers(
          env,
          numbers,
          "id,numero_cnj,titulo,account_id_freshsales,status_atual_processo"
        )
      : [];
  }

  const scopedProcesses = processes.slice(0, safeLimit);
  const processIds = scopedProcesses.map((item) => item.id);
  const pendingAudiencias = processIds.length
    ? await loadPendingAudienciasByProcessIds(env, processIds, 20)
    : [];

  let processesRead = 0;
  let activitiesCreated = 0;
  let appointmentsCreated = 0;
  let audienciasUpdated = 0;
  const sample = [];

  for (const process of scopedProcesses) {
    const processAudiencias = pendingAudiencias
      .filter((item) => item.processo_id === process.id)
      .slice(0, 20);

    const row = {
      processo_id: process.id,
      numero_cnj: process.numero_cnj,
      titulo: process.titulo || null,
      account_id_freshsales: process.account_id_freshsales || null,
      audiencias_pendentes: processAudiencias.length,
      activities_criadas: 0,
      appointments_criados: 0,
      audiencias_atualizadas: 0,
      details: [],
      status: "skipped",
      reason: null,
    };

    if (!processAudiencias.length) {
      row.reason = "sem_audiencias_pendentes";
      sample.push(row);
      continue;
    }

    processesRead += 1;

    if (!process.account_id_freshsales) {
      row.reason = "sem_account";
      sample.push(row);
      continue;
    }

    row.status = "sincronizado";
    for (const audiencia of processAudiencias) {
      try {
        const activityResult = await createFreshsalesAudienciaActivity(env, {
          accountId: process.account_id_freshsales,
          audiencia,
          process,
        });
        const activityId = activityResult?.activity?.id ? String(activityResult.activity.id) : null;
        if (!activityId) {
          throw new Error("Freshsales nao retornou o id da activity de audiencia.");
        }

        let appointmentId = null;
        const hearingDate = audiencia?.data_audiencia ? new Date(audiencia.data_audiencia) : null;
        if (hearingDate && !Number.isNaN(hearingDate.getTime()) && hearingDate.getTime() > Date.now()) {
          const appointmentResult = await createFreshsalesAppointmentForAudiencia(env, {
            accountId: process.account_id_freshsales,
            audiencia,
            process,
          });
          appointmentId = appointmentResult?.appointment?.id
            ? String(appointmentResult.appointment.id)
            : null;
          if (appointmentId) {
            appointmentsCreated += 1;
            row.appointments_criados += 1;
          }
        }

        await patchAudienciaFreshsalesSync(env, audiencia.id, {
          activityId,
          appointmentId,
        });

        activitiesCreated += 1;
        audienciasUpdated += 1;
        row.activities_criadas += 1;
        row.audiencias_atualizadas += 1;

        if (row.details.length < 5) {
          row.details.push({
            audiencia_id: audiencia.id,
            freshsales_activity_id: activityId,
            appointment_id: appointmentId,
            data_audiencia: audiencia.data_audiencia || null,
            tipo: audiencia.tipo || null,
          });
        }
      } catch (error) {
        row.status = "error";
        if (row.details.length < 5) {
          row.details.push({
            audiencia_id: audiencia.id,
            error: error?.message || "Falha ao sincronizar audiencia no Freshsales.",
          });
        }
      }
    }

    if (
      row.status !== "error" &&
      row.activities_criadas === 0 &&
      row.appointments_criados === 0 &&
      row.audiencias_atualizadas === 0
    ) {
      row.reason = "sem_novas_audiencias";
    }

    sample.push(row);
  }

  return {
    checkedAt: new Date().toISOString(),
    source: "hmadv_local_audiencias",
    processosLidos: processesRead,
    audiencias: pendingAudiencias.length,
    activitiesCriadas: activitiesCreated,
    appointmentsCriados: appointmentsCreated,
    audienciasAtualizadas: audienciasUpdated,
    backfill,
    sample: sample.slice(0, 20),
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
  const scopedProcesses = processes.slice(0, safeLimit);
  const beforeMap = new Map();
  const resultMap = new Map();
  for (const proc of scopedProcesses) {
    beforeMap.set(proc.id, {
      quantidade_movimentacoes: proc.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(proc),
    });
  }
  for (const proc of scopedProcesses) {
    const numero = String(proc.numero_cnj || "").replace(/\D+/g, "");
    if (!numero) continue;
    const result = await hmadvFunction(
      env,
      "datajud-search",
      {},
      { method: "POST", body: { numeroProcesso: numero, persistir: true } }
    );
    resultMap.set(proc.id, { numero, result });
  }
  const afterRows = await loadProcessesByIds(env, scopedProcesses.map((item) => item.id));
  const afterMap = new Map(afterRows.map((row) => [row.id, row]));
  const sample = [];
  for (const proc of scopedProcesses) {
    const datajudRun = resultMap.get(proc.id);
    if (!datajudRun?.numero) continue;
    const before = beforeMap.get(proc.id) || {
      quantidade_movimentacoes: proc.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(proc),
    };
    const afterRow = afterMap.get(proc.id);
    const after = afterRow ? {
      quantidade_movimentacoes: afterRow.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(afterRow),
    } : before;
    sample.push({
      processo_id: proc.id,
      numero_cnj: datajudRun.numero,
      before,
      after,
      movimentos_novos: Math.max(0, (after.quantidade_movimentacoes || 0) - (before.quantidade_movimentacoes || 0)),
      gaps_reduzidos: Math.max(0, (before.gaps || 0) - (after.gaps || 0)),
      result: datajudRun.result,
    });
  }
  return {
    checkedAt: new Date().toISOString(),
    processosLidos: processes.length,
    disparados: sample.length,
    sample,
  };
}

export async function syncProcessesSupabaseCrm(env, { processNumbers = [], limit = 10, intent = "" } = {}) {
  const config = getProcessActionLimitConfig("sync_supabase_crm");
  const safeLimit = Math.max(1, Math.min(Number(limit || config.defaultLimit), config.maxLimit));
  const processSelect = "id,numero_cnj,titulo,quantidade_movimentacoes,account_id_freshsales,classe,assunto_principal,area,data_ajuizamento,sistema,polo_ativo,polo_passivo,status_atual_processo";
  let processes = [];
  if (processNumbers.length) {
    processes = await loadProcessesByNumbers(env, processNumbers, processSelect);
  } else if (intent === "crm_only") {
    const data = await listCrmOnlyGapProcesses(env, { page: 1, pageSize: safeLimit });
    processes = data.items || [];
  } else if (intent === "datajud_plus_crm") {
    const data = await listSyncDatajudProcesses(env, { page: 1, pageSize: safeLimit });
    processes = data.items || [];
  } else {
    processes = await listTableSafe(
      env,
      `processos?select=${processSelect}&account_id_freshsales=not.is.null&or=(quantidade_movimentacoes.is.null,quantidade_movimentacoes.eq.0,classe.is.null,assunto_principal.is.null,area.is.null,data_ajuizamento.is.null,sistema.is.null,polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)&limit=${safeLimit}`
    );
  }
  const scopedProcesses = processes.slice(0, safeLimit);
  const beforeMap = new Map();
  const datajudMap = new Map();
  const processesNeedingDatajud = [];
  for (const proc of scopedProcesses) {
    beforeMap.set(proc.id, {
      quantidade_movimentacoes: proc.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(proc),
    });
  }
  for (const proc of scopedProcesses) {
    const before = beforeMap.get(proc.id) || {
      quantidade_movimentacoes: proc.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(proc),
    };
    const needsDatajud = Number(before.quantidade_movimentacoes || 0) <= 0;
    if (!needsDatajud) continue;
    const numero = String(proc.numero_cnj || "").replace(/\D+/g, "");
    if (!numero) continue;
    const datajud = await runDatajudPersistForProcess(env, numero);
    datajudMap.set(proc.id, { numero, datajud });
    processesNeedingDatajud.push(proc.id);
  }
  const afterRows = processesNeedingDatajud.length ? await loadProcessesByIds(env, processesNeedingDatajud) : [];
  const afterMap = new Map(afterRows.map((row) => [row.id, row]));
  const sample = [];
  let reparados = 0;
  let crmOnly = 0;
  for (const proc of scopedProcesses) {
    const before = beforeMap.get(proc.id) || {
      quantidade_movimentacoes: proc.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(proc),
    };
    const datajudRun = datajudMap.get(proc.id);
    const afterRow = afterMap.get(proc.id);
    const after = afterRow ? {
      quantidade_movimentacoes: afterRow.quantidade_movimentacoes ?? 0,
      gaps: countProcessFieldGaps(afterRow),
    } : before;
    const movimentosNovos = Math.max(0, (after.quantidade_movimentacoes || 0) - (before.quantidade_movimentacoes || 0));
    const gapsReduzidos = Math.max(0, (before.gaps || 0) - (after.gaps || 0));
    const targetProcess = afterRow || proc;
    const hasUsefulChange = movimentosNovos > 0 || gapsReduzidos > 0;
    const stillHasGap = (after.gaps || 0) > 0;
    const skippedDatajud = !datajudRun;
    if (skippedDatajud) crmOnly += 1;
    let repair = { skipped: true, reason: "sem_account" };
    if (targetProcess.account_id_freshsales && (hasUsefulChange || stillHasGap)) {
      repair = await runFreshsalesRepairForProcess(env, targetProcess);
      reparados += 1;
    } else if (targetProcess.account_id_freshsales) {
      repair = { skipped: true, reason: "sem_mudanca_util" };
    }
    sample.push({
      processo_id: proc.id,
      numero_cnj: String(proc.numero_cnj || "").replace(/\D+/g, ""),
      account_id_freshsales: targetProcess.account_id_freshsales || null,
      before,
      after,
      movimentos_novos: movimentosNovos,
      gaps_reduzidos: gapsReduzidos,
      datajud: datajudRun?.datajud || { skipped: true, reason: "crm_only" },
      freshsales_repair: repair,
    });
  }
  return {
    checkedAt: new Date().toISOString(),
    processosLidos: processes.length,
    sincronizados: sample.length,
    reparados,
    crmOnly,
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

async function collectLocalProcessAudit(env, { sampleSize = 8 } = {}) {
  const crmGapFilter = "account_id_freshsales=not.is.null&or=(classe.is.null,assunto_principal.is.null,area.is.null,data_ajuizamento.is.null,sistema.is.null,polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)";
  const completeBaseFilter = [
    "account_id_freshsales=not.is.null",
    "quantidade_movimentacoes=gt.0",
    "classe=not.is.null",
    "assunto_principal=not.is.null",
    "area=not.is.null",
    "data_ajuizamento=not.is.null",
    "sistema=not.is.null",
    "polo_ativo=not.is.null",
    "polo_passivo=not.is.null",
    "status_atual_processo=not.is.null",
  ].join("&");

  const [totals, semMovimentacoesQueue, crmGapQueue, orphanQueue, audienciasQueue, monitoringActiveQueue, publicationBacklogQueue, movementBacklogQueue, partesSemContatoQueue, remoteAudit] = await Promise.all([
    Promise.all([
      countTableSafe(env, "processos"),
      countTableSafe(env, "processos", "account_id_freshsales=not.is.null"),
      countTableSafe(env, "processos", "account_id_freshsales=is.null"),
      countTableSafe(env, "processos", "or=(quantidade_movimentacoes.is.null,quantidade_movimentacoes.eq.0)"),
      countTableSafe(env, "processos", crmGapFilter),
      countTableSafe(env, "processos", completeBaseFilter),
      countTableSafe(env, "partes", "contato_freshsales_id=is.null", "judiciario", 0),
      countTableSafe(env, "publicacoes", "freshsales_activity_id=is.null&processo_id=not.is.null", "judiciario", 0),
      countTableSafe(env, "movimentacoes", "freshsales_activity_id=is.null&processo_id=not.is.null", "judiciario", 0),
      countTableSafe(env, "audiencias", "freshsales_activity_id=is.null", "judiciario", 0),
    ]),
    listProcessesWithoutMovements(env, { page: 1, pageSize: sampleSize }).catch(() => ({ items: [] })),
    listFieldGapProcesses(env, { page: 1, pageSize: sampleSize }).catch(() => ({ items: [] })),
    scanOrphanProcesses(env, { page: 1, pageSize: sampleSize }).catch(() => ({ items: [] })),
    listAudienciaBackfillCandidates(env, { page: 1, pageSize: sampleSize }).catch(() => ({ items: [] })),
    listMonitoringProcesses(env, { page: 1, pageSize: sampleSize, active: true }).catch(() => ({ items: [], unsupported: true })),
    listPublicationActivityBacklog(env, { page: 1, pageSize: sampleSize }).catch(() => ({ items: [] })),
    listMovementActivityBacklog(env, { page: 1, pageSize: sampleSize }).catch(() => ({ items: [] })),
    listPartesSemContatoBacklog(env, { page: 1, pageSize: sampleSize }).catch(() => ({ items: [] })),
    hmadvFunction(env, "processo-sync", { action: "auditoria" }, { method: "POST", body: {} }).catch((error) => ({
      ok: false,
      error: error?.message || "Falha ao consultar auditoria remota.",
    })),
  ]);

  const [
    totalProcessos,
    processosComAccount,
    processosSemAccount,
    processosSemMovimentacao,
    processosComGapCrm,
    processosBaseCompleta,
    partesSemContato,
    publicacoesPendentes,
    movimentacoesPendentes,
    audienciasPendentes,
  ] = totals;

  const combinedSampleMap = new Map();
  const queueDescriptors = [
    { key: "sem_movimentacoes", label: "pendente_datajud", items: semMovimentacoesQueue.items || [] },
    { key: "campos_orfaos", label: "gap_crm", items: crmGapQueue.items || [] },
    { key: "orfaos", label: "sem_account", items: orphanQueue.items || [] },
    { key: "audiencias_pendentes", label: "audiencia_pendente", items: audienciasQueue.items || [] },
    { key: "publicacoes_pendentes", label: "publicacao_pendente", items: publicationBacklogQueue.items || [] },
    { key: "movimentacoes_pendentes", label: "movimentacao_pendente", items: movementBacklogQueue.items || [] },
    { key: "partes_sem_contato", label: "parte_sem_contato", items: partesSemContatoQueue.items || [] },
  ];

  for (const descriptor of queueDescriptors) {
    for (const row of descriptor.items) {
      const key = row?.numero_cnj || row?.processo_id || row?.id;
      if (!key) continue;
      const current = combinedSampleMap.get(key) || {
        key,
        numero_cnj: row?.numero_cnj || null,
        processo_id: row?.processo_id || row?.id || null,
        titulo: row?.titulo || row?.titulo_processo || null,
        account_id_freshsales: row?.account_id_freshsales || null,
        status_atual_processo: row?.status_atual_processo || null,
        flags: [],
      };
      current.flags = uniqueNonEmpty([...current.flags, descriptor.label]);
      if (!current.titulo && row?.titulo) current.titulo = row.titulo;
      if (!current.account_id_freshsales && row?.account_id_freshsales) current.account_id_freshsales = row.account_id_freshsales;
      if (!current.status_atual_processo && row?.status_atual_processo) current.status_atual_processo = row.status_atual_processo;
      if (row?.audiencias_pendentes !== undefined) current.audiencias_pendentes = row.audiencias_pendentes;
      if (row?.proxima_data_audiencia) current.proxima_data_audiencia = row.proxima_data_audiencia;
      if (row?.quantidade_movimentacoes !== undefined) current.quantidade_movimentacoes = row.quantidade_movimentacoes;
      combinedSampleMap.set(key, current);
    }
  }

  const sample = [...combinedSampleMap.values()]
    .sort((left, right) => Number(right.flags?.length || 0) - Number(left.flags?.length || 0))
    .slice(0, Math.max(1, Math.min(Number(sampleSize || 8) * 2, 20)));

  const accountCoveragePct = totalProcessos ? Math.round((processosComAccount / totalProcessos) * 100) : 0;
  const baseCompletenessPct = processosComAccount ? Math.round((processosBaseCompleta / processosComAccount) * 100) : 0;
  const monitoramentoEscritaDisponivel = !Boolean(monitoringActiveQueue?.unsupported);

  return {
    checkedAt: new Date().toISOString(),
    audit_version: "local_v1",
    totalProcessos,
    processosComAccount,
    processosSemAccount,
    processosBaseCompleta,
    processosSemMovimentacao,
    processosComGapCrm,
    processosComPartesSemContato: partesSemContato,
    partesSemContato,
    publicacoesPendentes,
    movimentacoesPendentes,
    audienciasPendentes,
    monitoramentoEscritaDisponivel,
    metrics: {
      accountCoveragePct,
      baseCompletenessPct,
    },
    queues: {
      sem_movimentacoes: semMovimentacoesQueue.items || [],
      campos_orfaos: crmGapQueue.items || [],
      orfaos: orphanQueue.items || [],
      audiencias_pendentes: audienciasQueue.items || [],
      publicacoes_pendentes: publicationBacklogQueue.items || [],
      movimentacoes_pendentes: movementBacklogQueue.items || [],
      partes_sem_contato: partesSemContatoQueue.items || [],
    },
    remoteAudit,
    sample,
  };
}

export async function getLocalProcessAudit(env, { sampleSize = 8 } = {}) {
  return collectLocalProcessAudit(env, { sampleSize });
}

export async function runProcessAudit(env) {
  return collectLocalProcessAudit(env, { sampleSize: 8 });
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
  const scopedProcesses = processes.slice(0, safeLimit);
  const fullRows = await loadProcessesByIds(
    env,
    scopedProcesses.map((item) => item.id),
    "id,numero_cnj,numero_processo,titulo,polo_ativo,polo_passivo,tribunal,orgao_julgador,orgao_julgador_codigo,instancia,area,valor_causa,classe,assunto,assunto_principal,sistema,comarca,link_externo_processo,segredo_justica,data_ajuizamento,data_ultima_movimentacao,status_atual_processo,account_id_freshsales"
  );
  const fullRowMap = new Map(fullRows.map((row) => [row.id, row]));
  const sample = [];
  for (const proc of scopedProcesses) {
    const fullRow = fullRowMap.get(proc.id);
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
  const processSelect = "id,numero_cnj,titulo,account_id_freshsales,classe,assunto_principal,area,data_ajuizamento,sistema,polo_ativo,polo_passivo,status_atual_processo";
  const processes = processNumbers.length
    ? await loadProcessesByNumbers(env, processNumbers, processSelect)
    : await hmadvRest(
        env,
        `processos?select=${processSelect}&account_id_freshsales=not.is.null&or=(classe.is.null,assunto_principal.is.null,area.is.null,data_ajuizamento.is.null,sistema.is.null,polo_ativo.is.null,polo_passivo.is.null,status_atual_processo.is.null)&limit=${safeLimit}`
      );
  const sample = [];
  let reparados = 0;
  for (const proc of processes.slice(0, safeLimit)) {
    const hasGap = countProcessFieldGaps(proc) > 0;
    if (!hasGap) {
      sample.push({
        processo_id: proc.id,
        numero_cnj: proc.numero_cnj,
        titulo: proc.titulo,
        result: { skipped: true, reason: "sem_gap_crm" },
      });
      continue;
    }
    const result = await runFreshsalesRepairForProcess(env, proc);
    reparados += 1;
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
    reparados,
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

function buildProcessActionLogName(action, payload = {}, suffix = "") {
  const baseAction = String(action || "").trim();
  const intent = String(payload?.intent || "").trim();
  let variant = baseAction;
  if (baseAction === "enriquecer_datajud" && intent) {
    variant = `${baseAction}_${intent}`;
  }
  return suffix ? `${variant}_${suffix}` : variant;
}

export async function createProcessAdminJob(env, { action, payload = {} } = {}) {
  const normalizedPayload = normalizeProcessJobPayload(action, payload);
  const targets = await resolveProcessJobTargets(env, action, normalizedPayload);
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

async function runProcessJobAction(env, action, processNumbers, limit, intent = "") {
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
    return syncProcessesSupabaseCrm(env, { processNumbers, limit, intent });
  }
  if (action === "backfill_audiencias") {
    return backfillAudiencias(env, { processNumbers, limit, apply: true });
  }
  if (action === "sincronizar_audiencias_activity") {
    return syncAudienciaActivities(env, { processNumbers, limit });
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
      acao: buildProcessActionLogName(job.acao, job.payload || {}, "job"),
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
    const result = await runProcessJobAction(env, job.acao, chunk, chunk.length, payload.intent || "");
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
        acao: buildProcessActionLogName(job.acao, job.payload || {}, "job"),
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
      acao: buildProcessActionLogName(job.acao, job.payload || {}, "job"),
      status: "error",
      payload: job.payload || {},
      error: error.message || "Falha ao processar job operacional.",
    });
    return failedJob || job;
  }
}

function normalizePublicacoesJobPayload(action, payload = {}) {
  const maxLimit = action === "backfill_partes" ? 50 : action === "sincronizar_publicacoes_activity" ? 5 : 20;
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
  if (action === "sincronizar_publicacoes_activity") {
    return syncPublicationActivities(env, { processNumbers, limit });
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
