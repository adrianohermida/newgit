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

export async function getProcessosOverview() {
  const [syncStatus, processosTotal, processosComAccount, processosSemAccount, datajudEnriquecido, processosSemStatus, processosSemPolos, audienciasTotal] = await Promise.all([
    hmadvFunction("sync-worker", { action: "status" }),
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

export async function runSyncWorker() {
  return hmadvFunction("sync-worker", { action: "run" }, { method: "POST", body: {} });
}
