function cleanEnvValue(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getSupabaseBaseUrl() {
  return cleanEnvValue(process.env.SUPABASE_URL) || cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL) || null;
}

function getServiceRoleKey() {
  return cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY) || null;
}

function getSharedSecret() {
  return (
    cleanEnvValue(process.env.HMDAV_AI_SHARED_SECRET) ||
    cleanEnvValue(process.env.HMADV_AI_SHARED_SECRET) ||
    cleanEnvValue(process.env.LAWDESK_AI_SHARED_SECRET) ||
    null
  );
}

function getRunnerToken() {
  return cleanEnvValue(process.env.HMADV_RUNNER_TOKEN) || cleanEnvValue(process.env.MADV_RUNNER_TOKEN) || null;
}

function getHmadvConfig() {
  const baseUrl = getSupabaseBaseUrl();
  const serviceRole = getServiceRoleKey();
  if (!baseUrl || !serviceRole) {
    throw new Error("Configuracao HMADV/Supabase incompleta no ambiente.");
  }
  return { baseUrl, serviceRole };
}

function hmadvHeaders(schema = "judiciario", extra = {}) {
  const { serviceRole } = getHmadvConfig();
  const sharedSecret = getSharedSecret();
  const runnerToken = getRunnerToken();
  return {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
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

async function hmadvRest(path, init = {}, schema = "judiciario") {
  const { baseUrl } = getHmadvConfig();
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...hmadvHeaders(schema),
      ...(init.headers || {}),
    },
  });
  const text = await response.text().catch(() => "");
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error((payload && (payload.message || payload.error || payload.details)) || text || `HMADV REST failed: ${response.status}`);
  }
  return payload;
}

async function hmadvRestWithCount(path, init = {}, schema = "judiciario") {
  const { baseUrl } = getHmadvConfig();
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      Prefer: "count=exact",
      ...hmadvHeaders(schema),
      ...(init.headers || {}),
    },
  });
  const text = await response.text().catch(() => "");
  const payload = text ? JSON.parse(text) : [];
  if (!response.ok) {
    throw new Error((payload && (payload.message || payload.error || payload.details)) || text || `HMADV REST failed: ${response.status}`);
  }
  const contentRange = response.headers.get("content-range") || "";
  const match = contentRange.match(/\/(\d+)/);
  return {
    rows: Array.isArray(payload) ? payload : [],
    total: match ? Number(match[1]) : Array.isArray(payload) ? payload.length : 0,
  };
}

async function hmadvFunction(name, query = {}, init = {}) {
  const { baseUrl, serviceRole } = getHmadvConfig();
  const sharedSecret = getSharedSecret();
  const runnerToken = getRunnerToken();
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  const url = `${baseUrl}/functions/v1/${name}${qs.toString() ? `?${qs.toString()}` : ""}`;
  const response = await fetch(url, {
    method: init.method || "GET",
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
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
  });
  const text = await response.text().catch(() => "");
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error((payload && (payload.error || payload.message)) || text || `HMADV function failed: ${response.status}`);
  }
  return payload;
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

function normalizeCnj(value) {
  const digits = String(value || "").replace(/\D+/g, "");
  return digits.length === 20 ? digits : "";
}

function extractCnjMentions(text) {
  const source = String(text || "");
  const matches = source.match(/\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}|\b\d{20}\b/g) || [];
  return [...new Set(matches.map((item) => normalizeCnj(item)).filter(Boolean))];
}

function tokenizeSimilarityText(value) {
  return [...new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/i)
      .map((item) => item.trim())
      .filter((item) => item.length >= 4 && ![
        "processo",
        "parte",
        "autor",
        "requerente",
        "requerido",
        "executado",
        "executante",
        "acao",
        "vara",
        "juizo",
        "tribunal",
      ].includes(item))
  )];
}

function jaccardSimilarity(left, right) {
  const a = tokenizeSimilarityText(left);
  const b = tokenizeSimilarityText(right);
  if (!a.length || !b.length) return 0;
  const bSet = new Set(b);
  const intersection = a.filter((item) => bSet.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function inferRelationTypeFromText(text) {
  const clean = normalizeText(text);
  if (/\brecurso\b|\bagravo\b|\bapelacao\b/.test(clean)) return "recurso";
  if (/\bincidente\b|\bcumprimento de sentenca\b|\bimpugnacao\b/.test(clean)) return "incidente";
  if (/\bapenso\b|\bautos apensos\b|\bapensad/.test(clean)) return "apenso";
  return "dependencia";
}

function inferRelationOrientationFromText(text) {
  const clean = normalizeText(text);
  if (/\b(apenso|dependencia|incidente|recurso)\b.{0,50}\b(?:ao|aos|do|dos|da)\b/.test(clean)) {
    return "mentioned_parent";
  }
  if (/\bprocesso principal\b|\bautos principais\b/.test(clean)) {
    return "mentioned_parent";
  }
  return "source_parent";
}

function buildSnippet(text, needle = "") {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  if (!source) return "";
  if (!needle) return source.slice(0, 240);
  const index = source.toLowerCase().indexOf(String(needle || "").toLowerCase());
  if (index < 0) return source.slice(0, 240);
  const start = Math.max(0, index - 80);
  const end = Math.min(source.length, index + Math.max(needle.length, 1) + 120);
  return source.slice(start, end);
}

function buildPairKey(left, right) {
  return `${String(left || "").trim()}::${String(right || "").trim()}`;
}

function buildUnorderedPairKey(left, right) {
  return [String(left || "").trim(), String(right || "").trim()].sort().join("::");
}

function buildSelectionKey(prefix, left, right, relationType = "") {
  return `${prefix}:${String(left || "").trim()}:${String(right || "").trim()}:${String(relationType || "").trim()}`;
}

function clampPageSize(value, fallback = 20, max = 200) {
  const numeric = Number(value || fallback);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(Math.max(1, Math.floor(numeric)), max);
}

async function loadProcessesByExactNumbers(numbers = []) {
  const cleanNumbers = [...new Set((numbers || []).map((item) => normalizeCnj(item)).filter(Boolean))];
  if (!cleanNumbers.length) return [];
  const clauses = cleanNumbers.map((item) => `numero_cnj.eq.${item}`).join(",");
  return hmadvRest(
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,polo_ativo,polo_passivo&or=(${clauses})&limit=${cleanNumbers.length}`
  );
}

async function loadProcessesByIds(ids = []) {
  const cleanIds = [...new Set((ids || []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!cleanIds.length) return [];
  return hmadvRest(
    `processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,polo_ativo,polo_passivo&id=in.(${cleanIds.join(",")})&limit=${cleanIds.length}`
  );
}

async function loadExistingRelationsForNumbers(numbers = []) {
  const cleanNumbers = [...new Set((numbers || []).map((item) => normalizeCnj(item)).filter(Boolean))];
  if (!cleanNumbers.length) return [];
  const clauses = cleanNumbers.flatMap((item) => [`numero_cnj_pai.eq.${item}`, `numero_cnj_filho.eq.${item}`]).join(",");
  return hmadvRest(
    `processo_relacoes?select=id,numero_cnj_pai,numero_cnj_filho,tipo_relacao,status&or=(${clauses})&limit=500`
  );
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
    if (!acc.some((row) => `${normalizeText(row.nome)}|${row.polo}` === key)) {
      acc.push(item);
    }
    return acc;
  }, []);
}

async function countTable(table, filters = "", schema = "judiciario") {
  const { baseUrl } = getHmadvConfig();
  const response = await fetch(`${baseUrl}/rest/v1/${table}?${filters}${filters ? "&" : ""}select=id`, {
    headers: {
      ...hmadvHeaders(schema, {
        Prefer: "count=exact",
        Range: "0-0",
      }),
    },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Count failed for ${table}`);
  }
  const contentRange = response.headers.get("content-range") || "";
  const match = contentRange.match(/\/(\d+)/);
  return match ? Number(match[1]) : 0;
}

async function getSyncWorkerStatusSafe() {
  try {
    return await hmadvFunction("sync-worker", { action: "status" });
  } catch (error) {
    return {
      ok: false,
      unavailable: true,
      error: error?.message || "Falha ao consultar o status do sync-worker.",
      functionName: "sync-worker",
    };
  }
}

export async function getProcessosOverview() {
  const [syncStatus, processosTotal, processosComAccount, processosSemAccount, datajudEnriquecido, processosSemStatus, processosSemPolos, audienciasTotal] = await Promise.all([
    getSyncWorkerStatusSafe(),
    countTable("processos"),
    countTable("processos", "account_id_freshsales=not.is.null"),
    countTable("processos", "account_id_freshsales=is.null"),
    countTable("processos", "datajud_enriquecido=eq.true"),
    countTable("processos", "status_atual_processo=is.null"),
    countTable("processos", "or=(polo_ativo.is.null,polo_passivo.is.null)"),
    countTable("audiencias"),
  ]);
  return {
    processosTotal,
    processosComAccount,
    processosSemAccount,
    datajudEnriquecido,
    processosSemStatus,
    processosSemPolos,
    audienciasTotal,
    syncWorker: syncStatus,
  };
}

export async function getPublicacoesOverview() {
  const [publicacoesTotal, publicacoesComActivity, publicacoesPendentesComAccount, publicacoesLeilaoIgnorado, partesTotal] = await Promise.all([
    countTable("publicacoes"),
    countTable("publicacoes", "freshsales_activity_id=not.is.null"),
    countTable("publicacoes", "freshsales_activity_id=is.null&processo_id=not.is.null"),
    countTable("publicacoes", "freshsales_activity_id=eq.LEILAO_IGNORADO"),
    countTable("partes"),
  ]);
  return {
    publicacoesTotal,
    publicacoesComActivity,
    publicacoesPendentesComAccount,
    publicacoesLeilaoIgnorado,
    partesTotal,
  };
}

export async function searchProcesses(query = "", limit = 8) {
  const cleanQuery = String(query || "").trim();
  const safeLimit = clampPageSize(limit, 8, 50);
  if (!cleanQuery) return { items: [], totalRows: 0 };
  const cnj = normalizeCnj(cleanQuery);
  let path = "";
  if (cnj) {
    const likePattern = encodeURIComponent(`*${cnj}*`);
    path = `processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,polo_ativo,polo_passivo&numero_cnj=ilike.${likePattern}&order=updated_at.desc.nullslast&limit=${safeLimit}`;
  } else {
    const pattern = encodeURIComponent(`*${cleanQuery}*`);
    path = `processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,polo_ativo,polo_passivo&or=(titulo.ilike.${pattern},polo_ativo.ilike.${pattern},polo_passivo.ilike.${pattern},numero_cnj.ilike.${pattern})&order=updated_at.desc.nullslast&limit=${safeLimit}`;
  }
  const items = await hmadvRest(path);
  return {
    items,
    totalRows: items.length,
  };
}

export async function listProcessRelations({ page = 1, pageSize = 20, query = "", selectionOnly = false } = {}) {
  const safePageSize = clampPageSize(pageSize, 20, selectionOnly ? 500 : 100);
  const safePage = Math.max(1, Number(page || 1));
  const offset = (safePage - 1) * safePageSize;
  const cleanQuery = String(query || "").trim();
  let path = `processo_relacoes?select=id,processo_pai_id,processo_filho_id,numero_cnj_pai,numero_cnj_filho,tipo_relacao,status,observacoes,created_at,updated_at&order=updated_at.desc.nullslast&offset=${offset}&limit=${safePageSize}`;
  if (cleanQuery) {
    const pattern = encodeURIComponent(`*${cleanQuery}*`);
    path += `&or=(numero_cnj_pai.ilike.${pattern},numero_cnj_filho.ilike.${pattern},tipo_relacao.ilike.${pattern},status.ilike.${pattern},observacoes.ilike.${pattern})`;
  }
  const { rows, total } = await hmadvRestWithCount(path);
  if (selectionOnly) {
    return {
      items: rows.map((item) => ({
        id: item.id,
        selection_key: buildSelectionKey("relation", item.numero_cnj_pai, item.numero_cnj_filho, item.tipo_relacao),
      })),
      totalRows: total,
      page: safePage,
      pageSize: safePageSize,
    };
  }
  const numbers = [...new Set(rows.flatMap((item) => [item.numero_cnj_pai, item.numero_cnj_filho]).map((item) => normalizeCnj(item)).filter(Boolean))];
  const processes = await loadProcessesByExactNumbers(numbers);
  const processMap = new Map(processes.map((item) => [item.numero_cnj, item]));
  return {
    items: rows.map((item) => ({
      ...item,
      selection_key: buildSelectionKey("relation", item.numero_cnj_pai, item.numero_cnj_filho, item.tipo_relacao),
      processo_pai: processMap.get(item.numero_cnj_pai) || null,
      processo_filho: processMap.get(item.numero_cnj_filho) || null,
    })),
    totalRows: total,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function saveProcessRelation(payload = {}) {
  const numeroCnjPai = normalizeCnj(payload.numero_cnj_pai);
  const numeroCnjFilho = normalizeCnj(payload.numero_cnj_filho);
  const tipoRelacao = ["dependencia", "apenso", "incidente", "recurso"].includes(String(payload.tipo_relacao || ""))
    ? String(payload.tipo_relacao)
    : "dependencia";
  const status = String(payload.status || "ativo") === "inativo" ? "inativo" : "ativo";
  const observacoes = String(payload.observacoes || "").trim() || null;
  if (!numeroCnjPai || !numeroCnjFilho) {
    throw new Error("Informe dois CNJs validos para salvar a relacao.");
  }
  if (numeroCnjPai === numeroCnjFilho) {
    throw new Error("Os processos relacionados precisam ser diferentes.");
  }
  const processes = await loadProcessesByExactNumbers([numeroCnjPai, numeroCnjFilho]);
  const processMap = new Map(processes.map((item) => [item.numero_cnj, item]));
  const body = {
    processo_pai_id: processMap.get(numeroCnjPai)?.id || null,
    processo_filho_id: processMap.get(numeroCnjFilho)?.id || null,
    numero_cnj_pai: numeroCnjPai,
    numero_cnj_filho: numeroCnjFilho,
    tipo_relacao: tipoRelacao,
    status,
    observacoes,
  };
  let rows = [];
  if (payload.id) {
    rows = await hmadvRest(`processo_relacoes?id=eq.${payload.id}&select=id,numero_cnj_pai,numero_cnj_filho,tipo_relacao`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
  } else {
    rows = await hmadvRest("processo_relacoes?on_conflict=numero_cnj_pai,numero_cnj_filho,tipo_relacao&select=id,numero_cnj_pai,numero_cnj_filho,tipo_relacao", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify(body),
    });
  }
  const saved = rows?.[0];
  if (!saved?.id) {
    throw new Error("A relacao nao retornou identificador apos salvar.");
  }
  const relationPage = await listProcessRelations({ page: 1, pageSize: 1, query: numeroCnjPai });
  const exact = relationPage.items.find((item) => item.id === saved.id);
  return exact || saved;
}

export async function deleteProcessRelation(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) throw new Error("Relacao invalida para remocao.");
  await hmadvRest(`processo_relacoes?id=eq.${cleanId}`, {
    method: "DELETE",
    headers: {
      Prefer: "return=minimal",
    },
  });
  return { id: cleanId, removed: true };
}

export async function bulkUpdateProcessRelations({ ids = [], status = "", remove = false } = {}) {
  const cleanIds = [...new Set((ids || []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!cleanIds.length) throw new Error("Nenhuma relacao selecionada para a acao em massa.");
  const filter = `id=in.(${cleanIds.join(",")})`;
  if (remove) {
    await hmadvRest(`processo_relacoes?${filter}`, {
      method: "DELETE",
      headers: {
        Prefer: "return=minimal",
      },
    });
    return { updated: cleanIds.length, removed: true };
  }
  const nextStatus = String(status || "") === "inativo" ? "inativo" : "ativo";
  const rows = await hmadvRest(`processo_relacoes?${filter}&select=id`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ status: nextStatus }),
  });
  return { updated: rows.length, status: nextStatus };
}

export async function scanOrphanProcesses(limit = 50) {
  const rows = await hmadvRest(`processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo&account_id_freshsales=is.null&limit=${limit}&order=updated_at.desc.nullslast`);
  return {
    total: rows.length,
    items: rows,
  };
}

export async function inspectAudiencias(limit = 20) {
  return hmadvFunction("sync-worker", { action: "inspect_audiencias", limit });
}

export async function backfillAudiencias({ processNumbers = [], limit = 100, apply = false } = {}) {
  let processes = [];
  if (processNumbers.length) {
    processes = await loadProcessesByNumbers(processNumbers);
  }
  let inserted = 0;
  const sample = [];
  for (const proc of processes) {
    const publicacoes = await hmadvRest(
      `publicacoes?processo_id=eq.${proc.id}&select=id,conteudo,data_publicacao&order=data_publicacao.desc.nullslast&limit=50`
    );
    const existentes = await hmadvRest(
      `audiencias?processo_id=eq.${proc.id}&select=id,origem,origem_id,tipo,data_audiencia,descricao,local,situacao,freshsales_activity_id&limit=200`
    );
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
      await hmadvRest("audiencias?on_conflict=processo_id,origem,origem_id", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Profile": "judiciario",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(novas),
      });
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
  };
}

async function loadProcessesByNumbers(processNumbers) {
  const output = [];
  for (const raw of processNumbers) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const digits = value.replace(/\D+/g, "");
    let rows = [];
    if (digits.length === 20) {
      rows = await hmadvRest(`processos?numero_cnj=eq.${digits}&select=id,numero_cnj,titulo,account_id_freshsales&limit=1`);
    }
    if (!rows.length) {
      const pattern = encodeURIComponent(`*${value}*`);
      rows = await hmadvRest(`processos?titulo=ilike.${pattern}&select=id,numero_cnj,titulo,account_id_freshsales&limit=1`);
    }
    if (rows[0] && !output.some((item) => item.id === rows[0].id)) {
      output.push(rows[0]);
    }
  }
  return output;
}

export async function backfillPartesFromPublicacoes({ processNumbers = [], limit = 50, apply = false } = {}) {
  const processes = processNumbers.length
    ? await loadProcessesByNumbers(processNumbers)
    : await hmadvRest(`processos?select=id,numero_cnj,titulo,account_id_freshsales,polo_ativo,polo_passivo&limit=${limit}`);
  let inserted = 0;
  const sample = [];
  for (const proc of processes) {
    const [publicacoes, existentes] = await Promise.all([
      hmadvRest(`publicacoes?processo_id=eq.${proc.id}&select=id,conteudo,data_publicacao&order=data_publicacao.desc.nullslast&limit=50`),
      hmadvRest(`partes?processo_id=eq.${proc.id}&select=id,nome,polo&limit=200`),
    ]);
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
      await hmadvRest("partes?on_conflict=processo_id,nome,polo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Profile": "judiciario",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(novas),
      });
      inserted += novas.length;
    }
    if (novas.length || processNumbers.length) {
      sample.push({
        processo_id: proc.id,
        numero_cnj: proc.numero_cnj,
        publicacoes_lidas: publicacoes.length,
        partes_existentes: existentes.length,
        partes_detectadas: uniqueParsed.length,
        partes_novas: novas,
      });
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    processosLidos: processes.length,
    partesInseridas: inserted,
    sample: sample.slice(0, 20),
  };
}

export async function suggestProcessRelations({ query = "", page = 1, pageSize = 20, minScore = 0.45, selectionOnly = false } = {}) {
  const safePageSize = clampPageSize(pageSize, 20, selectionOnly ? 500 : 100);
  const safePage = Math.max(1, Number(page || 1));
  const cleanQuery = String(query || "").trim();
  const scoreFloor = Math.max(0, Math.min(0.99, Number(minScore || 0.45)));

  const sourceProcesses = cleanQuery
    ? (await searchProcesses(cleanQuery, 18)).items
    : await hmadvRest("processos?select=id,numero_cnj,titulo,account_id_freshsales,status_atual_processo,polo_ativo,polo_passivo&order=updated_at.desc.nullslast&limit=12");

  if (!sourceProcesses.length) {
    return { items: [], totalRows: 0, page: safePage, pageSize: safePageSize };
  }

  const existingRelations = await loadExistingRelationsForNumbers(sourceProcesses.map((item) => item.numero_cnj));
  const existingPairs = new Set(existingRelations.map((item) => buildUnorderedPairKey(item.numero_cnj_pai, item.numero_cnj_filho)));

  const publicationRows = await Promise.all(
    sourceProcesses.map(async (processo) => ({
      processo,
      publicacoes: await hmadvRest(
        `publicacoes?processo_id=eq.${processo.id}&select=id,conteudo,data_publicacao&order=data_publicacao.desc.nullslast&limit=8`
      ),
    }))
  );

  const mentionedCnjs = [...new Set(
    publicationRows.flatMap((item) => item.publicacoes.flatMap((pub) => extractCnjMentions(pub.conteudo))).filter(Boolean)
  )];
  const targetMap = new Map((await loadProcessesByExactNumbers(mentionedCnjs)).map((item) => [item.numero_cnj, item]));
  const suggestionMap = new Map();

  for (const { processo, publicacoes } of publicationRows) {
    for (const publicacao of publicacoes) {
      const text = String(publicacao.conteudo || "");
      const mentions = extractCnjMentions(text);
      const relationType = inferRelationTypeFromText(text);
      const orientation = inferRelationOrientationFromText(text);
      for (const mentionedCnj of mentions) {
        if (!mentionedCnj || mentionedCnj === processo.numero_cnj) continue;
        const target = targetMap.get(mentionedCnj);
        if (!target?.numero_cnj) continue;
        if (existingPairs.has(buildUnorderedPairKey(processo.numero_cnj, target.numero_cnj))) continue;

        const titleSimilarity = jaccardSimilarity(processo.titulo, target.titulo);
        const partesSimilarity = Math.max(
          jaccardSimilarity(processo.polo_ativo, target.polo_ativo),
          jaccardSimilarity(processo.polo_passivo, target.polo_passivo),
          jaccardSimilarity(`${processo.polo_ativo} ${processo.polo_passivo}`, `${target.polo_ativo} ${target.polo_passivo}`)
        );
        const publicationSimilarity = Math.max(
          jaccardSimilarity(text, target.titulo),
          jaccardSimilarity(text, `${target.polo_ativo} ${target.polo_passivo}`)
        );
        const score = Math.min(0.99, 0.72 + (titleSimilarity * 0.12) + (partesSimilarity * 0.09) + (publicationSimilarity * 0.07));
        if (score < scoreFloor) continue;

        const numeroCnjPai = orientation === "mentioned_parent" ? target.numero_cnj : processo.numero_cnj;
        const numeroCnjFilho = orientation === "mentioned_parent" ? processo.numero_cnj : target.numero_cnj;
        const key = buildPairKey(numeroCnjPai, numeroCnjFilho);
        const reasons = [
          "CNJ citado em publicacao",
          titleSimilarity >= 0.18 ? "titulos semelhantes" : "",
          partesSimilarity >= 0.18 ? "partes semelhantes" : "",
          relationType !== "dependencia" ? `sinal de ${relationType}` : "",
        ].filter(Boolean);

        const current = suggestionMap.get(key);
        const nextSuggestion = {
          suggestion_key: buildSelectionKey("suggestion", numeroCnjPai, numeroCnjFilho, relationType),
          numero_cnj_pai: numeroCnjPai,
          numero_cnj_filho: numeroCnjFilho,
          tipo_relacao: relationType,
          status: "ativo",
          score,
          score_pct: Math.round(score * 100),
          reasons,
          source_process: processo,
          target_process: target,
          evidence: {
            publicacao_id: publicacao.id,
            data_publicacao: publicacao.data_publicacao,
            cnj_mencionado: mentionedCnj,
            trecho: buildSnippet(text, mentionedCnj),
          },
        };
        if (!current || nextSuggestion.score > current.score) {
          suggestionMap.set(key, nextSuggestion);
        }
      }
    }
  }

  const sourceByQuery = sourceProcesses.slice(0, 10);
  for (let index = 0; index < sourceByQuery.length; index += 1) {
    for (let inner = index + 1; inner < sourceByQuery.length; inner += 1) {
      const left = sourceByQuery[index];
      const right = sourceByQuery[inner];
      if (!left?.numero_cnj || !right?.numero_cnj) continue;
      if (existingPairs.has(buildUnorderedPairKey(left.numero_cnj, right.numero_cnj))) continue;
      const titleSimilarity = jaccardSimilarity(left.titulo, right.titulo);
      const partesSimilarity = Math.max(
        jaccardSimilarity(left.polo_ativo, right.polo_ativo),
        jaccardSimilarity(left.polo_passivo, right.polo_passivo),
        jaccardSimilarity(`${left.polo_ativo} ${left.polo_passivo}`, `${right.polo_ativo} ${right.polo_passivo}`)
      );
      const score = (titleSimilarity * 0.55) + (partesSimilarity * 0.45);
      if (score < Math.max(scoreFloor, 0.42)) continue;
      const numeroCnjPai = left.numero_cnj;
      const numeroCnjFilho = right.numero_cnj;
      const key = buildPairKey(numeroCnjPai, numeroCnjFilho);
      if (suggestionMap.has(key)) continue;
      suggestionMap.set(key, {
        suggestion_key: buildSelectionKey("suggestion", numeroCnjPai, numeroCnjFilho, "dependencia"),
        numero_cnj_pai: numeroCnjPai,
        numero_cnj_filho: numeroCnjFilho,
        tipo_relacao: "dependencia",
        status: "ativo",
        score,
        score_pct: Math.round(score * 100),
        reasons: ["similaridade de cadastro", titleSimilarity >= partesSimilarity ? "titulos proximos" : "partes proximas"],
        source_process: left,
        target_process: right,
        evidence: {
          trecho: "Sugestao formada por semelhanca entre titulo e polos do cadastro.",
        },
      });
    }
  }

  const allSuggestions = [...suggestionMap.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return String(right.evidence?.data_publicacao || "").localeCompare(String(left.evidence?.data_publicacao || ""));
  });

  if (selectionOnly) {
    return {
      items: allSuggestions.map((item) => ({ suggestion_key: item.suggestion_key })),
      totalRows: allSuggestions.length,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  const offset = (safePage - 1) * safePageSize;
  return {
    items: allSuggestions.slice(offset, offset + safePageSize),
    totalRows: allSuggestions.length,
    page: safePage,
    pageSize: safePageSize,
  };
}

export async function bulkSaveSuggestedRelations({ items = [] } = {}) {
  const cleanItems = Array.isArray(items) ? items : [];
  if (!cleanItems.length) throw new Error("Nenhuma sugestao selecionada para validacao em massa.");
  const saved = [];
  for (const item of cleanItems) {
    const relation = await saveProcessRelation({
      numero_cnj_pai: item.numero_cnj_pai,
      numero_cnj_filho: item.numero_cnj_filho,
      tipo_relacao: item.tipo_relacao,
      status: item.status || "ativo",
      observacoes: item.observacoes || `Validado via sugestao automatica (${Math.round(Number(item.score || 0) * 100)}%).`,
    });
    saved.push(relation);
  }
  return {
    saved: saved.length,
    items: saved,
  };
}

export async function runSyncWorker() {
  return hmadvFunction("sync-worker", { action: "run" }, { method: "POST", body: {} });
}
