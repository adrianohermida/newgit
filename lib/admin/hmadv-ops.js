import {
  buildProcessNumberLookupPath,
  buildProcessSearchPath,
  buildProcessTitleLookupPath,
  buildRelationListPath,
} from "./hmadv-query-utils.js";
import {
  buildPairKey,
  buildSelectionKey,
  buildSnippet,
  buildUnorderedPairKey,
  clampPageSize,
  detectAuctionKeyword,
  extractCnjMentions,
  inferRelationOrientationFromText,
  inferRelationTypeFromText,
  jaccardSimilarity,
  normalizeCnj,
  normalizeText,
  parsePartesFromText,
} from "./hmadv-text-utils.js";
import {
  buildAudienciaResumo,
  buildAudienciaTipo,
  extractAudienciaDate,
  extractAudienciaLocal,
  extractAudienciaTime,
  testAudienciaSignal,
} from "./hmadv-hearing-utils.js";

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

function deriveProcessRecommendedNextAction({
  workerStoppedWithoutProgress = false,
  processosSemAccount = 0,
  processosSemMovimentacao = 0,
  movimentacoesPendentes = 0,
  publicacoesPendentes = 0,
  partesSemContato = 0,
  camposOrfaos = 0,
  monitoramentoFilaPendente = 0,
  structuralGapTotal = 0,
} = {}) {
  if (processosSemAccount > 0) {
    return {
      key: "push_orfaos",
      label: "Criar accounts agora",
      queueKey: "orfaos",
      hash: "processos-sem-sales-account",
      reason: "Existem processos sem Sales Account; sem isso o restante da esteira perde tracao.",
      bucket: "worker",
    };
  }
  if (movimentacoesPendentes > 0) {
    return {
      key: "sincronizar_movimentacoes_activity",
      label: "Sincronizar movimentacoes",
      queueKey: "movimentacoes_pendentes",
      hash: "processos-movimentacoes-pendentes",
      reason: "Ha andamentos no HMADV ainda sem reflexo em activity no Freshsales.",
      bucket: "worker",
    };
  }
  if (publicacoesPendentes > 0) {
    return {
      key: "sincronizar_publicacoes_activity",
      label: "Sincronizar publicacoes",
      queueKey: "publicacoes_pendentes",
      hash: "processos-publicacoes-pendentes",
      reason: "Ha publicacoes vinculadas sem activity no Freshsales.",
      bucket: "worker",
    };
  }
  if (workerStoppedWithoutProgress && structuralGapTotal > 0) {
    if (partesSemContato > 0) {
      return {
        key: "reconciliar_partes_contatos",
        label: "Reconciliar partes",
        queueKey: "partes_sem_contato",
        hash: "processos-partes-sem-contato",
        reason: "O worker parou sem progresso e o maior déficit restante está em contatos de partes.",
        bucket: "structural",
      };
    }
    if (camposOrfaos > 0) {
      return {
        key: "repair_freshsales_accounts",
        label: "Corrigir campos no CRM",
        queueKey: "campos_orfaos",
        hash: "processos-campos-orfaos",
        reason: "O worker parou sem progresso e ainda existem gaps estruturais de CRM/campos.",
        bucket: "structural",
      };
    }
    if (processosSemMovimentacao > 0) {
      return {
        key: "enriquecer_datajud",
        label: "Buscar movimentacoes",
        queueKey: "sem_movimentacoes",
        hash: "processos-sem-movimentacoes",
        reason: "O worker não drena processos sem base de movimentações; a trilha correta é reenriquecer pelo DataJud.",
        bucket: "structural",
      };
    }
  }
  if (monitoramentoFilaPendente > 0) {
    return {
      key: "run_sync_worker",
      label: "Rodar sync-worker",
      queueKey: "monitoramento_ativo",
      hash: "processos-monitoramento-ativo",
      reason: "Ainda existe fila pendente de monitoramento pronta para o worker.",
      bucket: "worker",
    };
  }
  return {
    key: "auditoria_sync",
    label: "Rodar auditoria",
    queueKey: "cobertura_processos",
    hash: "processos-cobertura",
    reason: "O painel não detectou um gargalo operacional dominante; vale reauditar a cobertura.",
    bucket: "diagnostic",
  };
}

function derivePublicationRecommendedNextAction({
  advisePersistedDelta = 0,
  publicacoesSemProcesso = 0,
  publicacoesPendentesComAccount = 0,
  snapshotMesaIntegradaAvailable = false,
  snapshotPartesAvailable = false,
  snapshotProcessosAvailable = false,
} = {}) {
  if (advisePersistedDelta > 0) {
    return {
      key: "run_advise_backfill",
      label: "Importar backlog Advise",
      hash: "operacao",
      view: "operacao",
      reason: "O cursor do Advise ainda indica publicacoes nao persistidas no HMADV.",
      bucket: "ingestion",
    };
  }
  if (publicacoesSemProcesso > 0) {
    return {
      key: "criar_processos_publicacoes",
      label: "Criar processos",
      hash: "publicacoes-fila-processos-criaveis",
      view: "filas",
      reason: "Existem publicacoes sem processo vinculado prontas para virar processo no HMADV.",
      bucket: "queue",
    };
  }
  if (publicacoesPendentesComAccount > 0) {
    return {
      key: "sincronizar_publicacoes_activity",
      label: "Sincronizar publicacoes",
      hash: "operacao",
      view: "operacao",
      reason: "Ha publicacoes vinculadas a processo/account ainda sem activity no Freshsales.",
      bucket: "crm",
    };
  }
  if (!snapshotMesaIntegradaAvailable || !snapshotPartesAvailable || !snapshotProcessosAvailable) {
    return {
      key: "refresh_snapshot_filas",
      label: "Atualizar snapshot",
      hash: "publicacoes-mesa-integrada",
      view: "operacao",
      reason: "As filas pesadas dependem do snapshot operacional para leitura segura no portal.",
      bucket: "snapshot",
    };
  }
  return {
    key: "orquestrar_drenagem_publicacoes",
    label: "Abrir drenagem principal",
    hash: "operacao",
    view: "operacao",
    reason: "A esteira principal esta pronta para nova rodada curta de drenagem.",
    bucket: "pipeline",
  };
}

function buildProcessOperationalPlan({
  recommendedNextAction = null,
  partesSemContato = 0,
  camposOrfaos = 0,
  processosSemMovimentacao = 0,
} = {}) {
  const steps = [];
  if (recommendedNextAction?.label) {
    steps.push({
      title: recommendedNextAction.label,
      detail: recommendedNextAction.reason || "Proxima acao recomendada pelo modulo.",
      actionKey: recommendedNextAction.key || null,
      targetHash: recommendedNextAction.hash || null,
      targetView: "filas",
    });
  }
  if (Number(partesSemContato || 0) > 0 && recommendedNextAction?.key !== "reconciliar_partes_contatos") {
    steps.push({
      title: "Reconciliar partes com contatos",
      detail: "Ainda existem processos com partes sem contato vinculado no Freshsales.",
      actionKey: "reconciliar_partes_contatos",
      targetHash: "processos-partes-sem-contato",
      targetView: "filas",
    });
  }
  if (Number(camposOrfaos || 0) > 0 && recommendedNextAction?.key !== "repair_freshsales_accounts") {
    steps.push({
      title: "Corrigir gaps de CRM",
      detail: "Ha processos com campos estruturais incompletos ou desalinhados no CRM.",
      actionKey: "repair_freshsales_accounts",
      targetHash: "processos-campos-orfaos",
      targetView: "filas",
    });
  }
  if (Number(processosSemMovimentacao || 0) > 0 && recommendedNextAction?.key !== "enriquecer_datajud") {
    steps.push({
      title: "Buscar movimentacoes no DataJud",
      detail: "Processos sem base de movimentacoes pedem reenriquecimento antes do sync-worker.",
      actionKey: "enriquecer_datajud",
      targetHash: "processos-sem-movimentacoes",
      targetView: "filas",
    });
  }
  return steps.slice(0, 3);
}

function buildPublicationOperationalPlan({
  recommendedNextAction = null,
  advisePersistedDelta = 0,
  publicacoesSemProcesso = 0,
  publicacoesPendentesComAccount = 0,
  snapshotMesaIntegradaAvailable = false,
  snapshotPartesAvailable = false,
} = {}) {
  const steps = [];
  if (recommendedNextAction?.label) {
    steps.push({
      title: recommendedNextAction.label,
      detail: recommendedNextAction.reason || "Proxima acao recomendada pelo modulo.",
      actionKey: recommendedNextAction.key || null,
      targetHash: recommendedNextAction.hash || null,
      targetView: recommendedNextAction.view || "operacao",
    });
  }
  if (advisePersistedDelta > 0 && recommendedNextAction?.key !== "run_advise_backfill") {
    steps.push({
      title: "Importar backlog Advise",
      detail: "Ainda existe delta entre o cursor do Advise e o que foi persistido no HMADV.",
      actionKey: "run_advise_backfill",
      targetHash: "operacao",
      targetView: "operacao",
    });
  }
  if (publicacoesSemProcesso > 0 && recommendedNextAction?.key !== "criar_processos_publicacoes") {
    steps.push({
      title: "Criar processos ausentes",
      detail: "Ha publicacoes prontas para vincular ou criar processo na base.",
      actionKey: "criar_processos_publicacoes",
      targetHash: "publicacoes-fila-processos-criaveis",
      targetView: "filas",
    });
  }
  if (publicacoesPendentesComAccount > 0 && recommendedNextAction?.key !== "sincronizar_publicacoes_activity") {
    steps.push({
      title: "Sincronizar publicacoes vinculadas",
      detail: "Existem publicacoes com processo/account que ainda nao viraram activity no Freshsales.",
      actionKey: "sincronizar_publicacoes_activity",
      targetHash: "operacao",
      targetView: "operacao",
    });
  }
  if ((!snapshotMesaIntegradaAvailable || !snapshotPartesAvailable) && recommendedNextAction?.key !== "refresh_snapshot_filas") {
    steps.push({
      title: "Atualizar snapshot operacional",
      detail: "As filas pesadas dependem do snapshot para leitura segura no portal.",
      actionKey: "refresh_snapshot_filas",
      targetHash: "publicacoes-mesa-integrada",
      targetView: "operacao",
    });
  }
  return steps.slice(0, 3);
}

function uniqueNonEmpty(values = []) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
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

async function countTableSafe(table, filters = "", schema = "judiciario", fallback = 0) {
  try {
    return await countTable(table, filters, schema);
  } catch {
    return fallback;
  }
}

async function listTableSafe(path, schema = "judiciario", fallback = []) {
  try {
    const rows = await hmadvRest(path, {}, schema);
    return Array.isArray(rows) ? rows : fallback;
  } catch {
    return fallback;
  }
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

async function getAdviseSyncStatusSafe() {
  try {
    return await hmadvFunction("advise-sync", { action: "status" });
  } catch (error) {
    return {
      ok: false,
      unavailable: true,
      error: error?.message || "Falha ao consultar o status do advise-sync.",
      functionName: "advise-sync",
    };
  }
}

async function getAdviseBackfillStatusSafe() {
  try {
    const rows = await hmadvRest(
      "advise_sync_status?select=id,fonte,status,pagina_atual,ultima_pagina,total_paginas,total_registros,ultima_execucao&fonte=eq.ADVISE&order=ultima_execucao.desc.nullslast,id.desc&limit=1"
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch {
    return null;
  }
}

async function getSnapshotQueueSummary(queueType) {
  try {
    const totalRows = await countTableSafe("publicacoes_fila_snapshot", `queue_type=eq.${encodeURIComponent(String(queueType || ""))}`, "judiciario", 0);
    const rows = await listTableSafe(
      `publicacoes_fila_snapshot?queue_type=eq.${encodeURIComponent(String(queueType || ""))}&select=updated_at,source&order=updated_at.desc.nullslast&limit=1`,
      "judiciario",
      []
    );
    const latest = rows[0] || null;
    return {
      queueType,
      totalRows,
      updatedAt: latest?.updated_at || null,
      source: latest?.source || null,
      available: totalRows > 0,
    };
  } catch {
    return {
      queueType,
      totalRows: 0,
      updatedAt: null,
      source: null,
      available: false,
    };
  }
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

async function loadPublicacoesSemProcesso(limit = 160, offset = 0) {
  return hmadvRest(
    `publicacoes?processo_id=is.null&numero_processo_api=not.is.null&select=id,numero_processo_api,data_publicacao,conteudo&order=data_publicacao.desc.nullslast&limit=${Math.max(1, Number(limit || 160))}&offset=${Math.max(0, Number(offset || 0))}`
  );
}

async function loadPublicacoesByProcessIds(processIds = [], limit = 12) {
  const ids = uniqueNonEmpty(processIds);
  if (!ids.length) return [];
  return hmadvRest(
    `publicacoes?processo_id=in.(${ids.join(",")})&select=id,processo_id,conteudo,data_publicacao&order=data_publicacao.desc.nullslast&limit=${Math.max(limit * ids.length, ids.length)}`
  );
}

async function loadPartesByProcessIds(processIds = []) {
  const ids = uniqueNonEmpty(processIds);
  if (!ids.length) return [];
  return hmadvRest(
    `partes?processo_id=in.(${ids.join(",")})&select=id,processo_id,nome,polo,tipo_pessoa&limit=${Math.max(ids.length * 20, 50)}`
  );
}

export async function getProcessosOverview() {
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
    movimentacoesPendentes,
    publicacoesPendentes,
    partesSemContato,
    camposOrfaos,
    monitoramentoFilaPendente,
  ] = await Promise.all([
    getSyncWorkerStatusSafe(),
    countTable("processos"),
    countTable("processos", "account_id_freshsales=not.is.null"),
    countTable("processos", "account_id_freshsales=is.null"),
    countTable("processos", "datajud_enriquecido=eq.true"),
    countTable("processos", "status_atual_processo=is.null"),
    countTable("processos", "or=(polo_ativo.is.null,polo_passivo.is.null)"),
    countTable("audiencias"),
    countTableSafe("processos", "or=(quantidade_movimentacoes.is.null,quantidade_movimentacoes.eq.0)"),
    countTableSafe("movimentacoes", "processo_id=not.is.null&freshsales_activity_id=is.null"),
    countTableSafe("publicacoes", "processo_id=not.is.null&freshsales_activity_id=is.null"),
    countTableSafe("partes", "processo_id=not.is.null&contato_freshsales_id=is.null"),
    countTableSafe("processos", "or=(classe.is.null,assunto_principal.is.null,area.is.null,data_ajuizamento.is.null,sistema.is.null,polo_ativo.is.null,polo_passivo.is.null)"),
    countTableSafe("monitoramento_queue", "status=eq.pendente"),
  ]);
  let monitoramentoAtivo = 0;
  let monitoramentoInativo = 0;
  let monitoramentoFallback = false;
  try {
    [monitoramentoAtivo, monitoramentoInativo] = await Promise.all([
      countTable("processos", "monitoramento_ativo=eq.true"),
      countTable("processos", "monitoramento_ativo=eq.false"),
    ]);
  } catch (error) {
    if (!schemaMessageMatches(error?.message, "monitoramento_ativo")) throw error;
    monitoramentoAtivo = processosComAccount;
    monitoramentoInativo = 0;
    monitoramentoFallback = true;
  }

  const workerVisiblePendencias = {
    processosSemAccount,
    movimentacoesPendentes,
    publicacoesPendentes,
    monitoramentoFilaPendente,
  };
  const workerVisibleTotal = Object.values(workerVisiblePendencias).reduce((acc, value) => acc + Number(value || 0), 0);
  const structuralGapCounts = {
    processosSemStatus,
    processosSemPolos,
    processosSemMovimentacao,
    partesSemContato,
    camposOrfaos,
  };
  const structuralGapTotal = Object.values(structuralGapCounts).reduce((acc, value) => acc + Number(value || 0), 0);
  const ultimoLote = syncStatus?.worker?.ultimo_lote || syncStatus?.ultimo_lote || null;
  const semProg = String(ultimoLote?.motivo || "") === "sem_prog";
  const recommendedNextAction = deriveProcessRecommendedNextAction({
    workerStoppedWithoutProgress: semProg,
    processosSemAccount,
    processosSemMovimentacao,
    movimentacoesPendentes,
    publicacoesPendentes,
    partesSemContato,
    camposOrfaos,
    monitoramentoFilaPendente,
    structuralGapTotal,
  });
  const operationalPlan = buildProcessOperationalPlan({
    recommendedNextAction,
    partesSemContato,
    camposOrfaos,
    processosSemMovimentacao,
  });

  return {
    processosTotal,
    processosComAccount,
    processosSemAccount,
    datajudEnriquecido,
    processosSemStatus,
    processosSemPolos,
    audienciasTotal,
    processosSemMovimentacao,
    movimentacoesPendentes,
    publicacoesPendentes,
    partesSemContato,
    camposOrfaos,
    monitoramentoAtivo,
    monitoramentoInativo,
    monitoramentoFallback,
    monitoramentoFilaPendente,
    workerVisiblePendencias,
    workerVisibleTotal,
    structuralGapCounts,
    structuralGapTotal,
    recommendedNextAction,
    operationalPlan,
    syncWorkerScopeNote: semProg && structuralGapTotal > 0
      ? "O sync-worker parou sem progresso porque as pendencias restantes sao majoritariamente estruturais e nao entram na fila automatica dele."
      : semProg
        ? "O sync-worker encerrou sem progresso nesta rodada porque nao encontrou pendencias drenaveis no escopo dele."
        : "",
    syncWorker: syncStatus,
  };
}

export async function getPublicacoesOverview() {
  const [
    publicacoesTotal,
    publicacoesComActivity,
    publicacoesPendentesComAccount,
    publicacoesLeilaoIgnorado,
    publicacoesSemProcesso,
    partesTotal,
    syncWorker,
    adviseSync,
    snapshotMesaIntegrada,
    snapshotPartes,
    snapshotProcessos,
  ] = await Promise.all([
    countTable("publicacoes"),
    countTable("publicacoes", "freshsales_activity_id=not.is.null"),
    countTable("publicacoes", "freshsales_activity_id=is.null&processo_id=not.is.null"),
    countTable("publicacoes", "freshsales_activity_id=eq.LEILAO_IGNORADO"),
    countTable("publicacoes", "processo_id=is.null"),
    countTable("partes"),
    getSyncWorkerStatusSafe(),
    getAdviseSyncStatusSafe(),
    getSnapshotQueueSummary("mesa_integrada"),
    getSnapshotQueueSummary("candidatos_partes"),
    getSnapshotQueueSummary("candidatos_processos"),
  ]);
  const publicacoesOperacionais = Math.max(0, Number(publicacoesTotal || 0) - Number(publicacoesLeilaoIgnorado || 0));
  const publicacoesVinculadas = Math.max(0, Number(publicacoesTotal || 0) - Number(publicacoesSemProcesso || 0));
  const adviseCursor = adviseSync?.status_cursor || adviseSync?.ultima_execucao || null;
  const adviseCursorTotal = Number(adviseCursor?.total_registros || adviseSync?.publicacoes_total || 0);
  const advisePersistedDelta = adviseCursorTotal > 0 ? Math.max(0, adviseCursorTotal - Number(publicacoesTotal || 0)) : 0;
  const recommendedNextAction = derivePublicationRecommendedNextAction({
    advisePersistedDelta,
    publicacoesSemProcesso,
    publicacoesPendentesComAccount,
    snapshotMesaIntegradaAvailable: Boolean(snapshotMesaIntegrada?.available),
    snapshotPartesAvailable: Boolean(snapshotPartes?.available),
    snapshotProcessosAvailable: Boolean(snapshotProcessos?.available),
  });
  const operationalPlan = buildPublicationOperationalPlan({
    recommendedNextAction,
    advisePersistedDelta,
    publicacoesSemProcesso,
    publicacoesPendentesComAccount,
    snapshotMesaIntegradaAvailable: Boolean(snapshotMesaIntegrada?.available),
    snapshotPartesAvailable: Boolean(snapshotPartes?.available),
  });
  return {
    publicacoesTotal,
    publicacoesOperacionais,
    publicacoesVinculadas,
    publicacoesComActivity,
    publicacoesPendentesComAccount,
    publicacoesLeilaoIgnorado,
    publicacoesSemProcesso,
    partesTotal,
    adviseCursorTotal,
    advisePersistedDelta,
    recommendedNextAction,
    operationalPlan,
    snapshotOverview: {
      mesa_integrada: snapshotMesaIntegrada,
      candidatos_partes: snapshotPartes,
      candidatos_processos: snapshotProcessos,
    },
    syncWorker,
    adviseSync,
  };
}

export async function listAdminOperations({ modulo, acao, limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 50));
  const filters = [`limit=${safeLimit}`, "order=created_at.desc"];
  if (modulo) filters.unshift(`modulo=eq.${encodeURIComponent(String(modulo))}`);
  if (acao) filters.unshift(`acao=eq.${encodeURIComponent(String(acao))}`);
  const items = await listTableSafe(
    `operacao_execucoes?${filters.join("&")}&select=id,modulo,acao,status,payload,resumo,result_summary,result_sample,requested_count,affected_count,error_message,created_at,finished_at`,
    "judiciario",
    []
  );
  return { items };
}

export async function listAdminJobs({ modulo, limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit || 20), 50));
  const filters = [`limit=${safeLimit}`, "order=created_at.desc"];
  if (modulo) filters.unshift(`modulo=eq.${encodeURIComponent(String(modulo))}`);
  const items = await listTableSafe(
    `operacao_jobs?${filters.join("&")}&select=id,modulo,acao,status,payload,requested_count,processed_count,success_count,error_count,result_summary,last_error,created_at,started_at,updated_at,finished_at`,
    "judiciario",
    []
  );
  return { items };
}

export async function listCreateProcessCandidates({ page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const targetStart = (safePage - 1) * safePageSize;
  const targetEnd = targetStart + safePageSize;
  const rawBatchSize = Math.max(120, safePageSize * 8);
  const estimatedScansForPage = Math.ceil((targetEnd * 1.5) / Math.max(1, rawBatchSize));
  const maxScans = Math.min(240, Math.max(24, estimatedScansForPage + 6));
  const grouped = new Map();
  let offset = 0;
  let scans = 0;
  let hasMore = true;

  while (hasMore && scans < maxScans && grouped.size < targetEnd) {
    const rows = await loadPublicacoesSemProcesso(rawBatchSize, offset);
    offset += rows.length;
    scans += 1;
    for (const row of rows) {
      const numero = normalizeProcessNumber(row?.numero_processo_api);
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

export async function listPartesExtractionCandidates({ page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, Number(page || 1));
  const safePageSize = Math.max(1, Math.min(Number(pageSize || 20), 50));
  const targetStart = (safePage - 1) * safePageSize;
  const targetEnd = targetStart + safePageSize;
  const processBatchSize = Math.min(40, Math.max(24, safePageSize * 2));
  const maxScans = Math.min(40, Math.max(8, Math.ceil(targetEnd / Math.max(1, processBatchSize)) + 4));
  const collected = [];
  const seen = new Set();
  let offset = 0;
  let scans = 0;
  let hasMore = true;

  while (hasMore && scans < maxScans && collected.length < targetEnd) {
    const processRows = await hmadvRest(
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
      processIds.length ? loadPublicacoesByProcessIds(processIds, 6) : Promise.resolve([]),
      processIds.length ? loadPartesByProcessIds(processIds) : Promise.resolve([]),
    ]);

    for (const proc of processRows) {
      const dedupeKey = proc.numero_cnj || proc.id;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      const pubs = publicacoes.filter((item) => item.processo_id === proc.id).slice(0, 18);
      if (!pubs.length) continue;
      const existing = partes.filter((item) => item.processo_id === proc.id);
      const parsed = pubs.flatMap((pub) => parsePartesFromText(pub.conteudo));
      const uniqueParsed = parsed.reduce((acc, item) => {
        const key = `${normalizeText(item.nome)}|${item.polo}`;
        if (!acc.some((row) => `${normalizeText(row.nome)}|${row.polo}` === key)) acc.push(item);
        return acc;
      }, []);
      const novas = uniqueParsed.filter(
        (parte) => !existing.some((item) => `${normalizeText(item.nome)}|${item.polo}` === `${normalizeText(parte.nome)}|${parte.polo}`)
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

  if (!collected.length) {
    return {
      page: safePage,
      pageSize: safePageSize,
      totalRows: 0,
      totalEstimated: false,
      hasMore: false,
      limited: false,
      items: [],
    };
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

export async function searchProcesses(query = "", limit = 8) {
  const cleanQuery = String(query || "").trim();
  const safeLimit = clampPageSize(limit, 8, 50);
  if (!cleanQuery) return { items: [], totalRows: 0 };
  const cnj = normalizeCnj(cleanQuery);
  const path = buildProcessSearchPath({ cleanQuery, cnj, safeLimit });
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
  const path = buildRelationListPath({ offset, safePageSize, cleanQuery });
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
      rows = await hmadvRest(buildProcessNumberLookupPath(digits));
    }
    if (!rows.length) {
      rows = await hmadvRest(buildProcessTitleLookupPath(value));
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

export async function runAdviseSync({ maxPaginas = 12, porPagina = 50 } = {}) {
  return hmadvFunction(
    "advise-sync",
    {
      action: "sync",
      max_paginas: Math.max(1, Number(maxPaginas || 12)),
      por_pagina: Math.max(1, Number(porPagina || 50)),
    },
    { method: "POST", body: {} }
  );
}

export async function runAdviseBackfill({ maxPaginas = 5, porPagina = 100 } = {}) {
  try {
    return await hmadvFunction("sync-advise-backfill", {}, {
      method: "POST",
      body: {
        maxPaginas: Math.max(1, Math.min(Number(maxPaginas || 5), 25)),
        porPagina: Math.max(1, Math.min(Number(porPagina || 100), 100)),
      },
    });
  } catch (error) {
    const snapshot = await getAdviseBackfillStatusSafe();
    if (!snapshot) throw error;
    const totalPaginas = Number(snapshot.total_paginas || 0) || null;
    const ultimaPagina = Number(snapshot.ultima_pagina || 0) || null;
    const paginaAtual = Number(snapshot.pagina_atual || 0) || null;
    const remainingPages = totalPaginas && paginaAtual ? Math.max(0, totalPaginas - paginaAtual + 1) : null;
    return {
      status: "fallback_status",
      execucao_parcial: true,
      upstream_error: error?.message || "Falha ao executar sync-advise-backfill.",
      pagina_atual: paginaAtual,
      ultima_pagina_processada: ultimaPagina,
      total_paginas: totalPaginas,
      total_registros_api: Number(snapshot.total_registros || 0) || 0,
      ultima_execucao: snapshot.ultima_execucao || null,
      remaining_pages: remainingPages,
      paginas_planejadas: Math.max(1, Math.min(Number(maxPaginas || 5), 25)),
      por_pagina: Math.max(1, Math.min(Number(porPagina || 100), 100)),
      uiHint: "A edge function de backfill oscilou, mas o cursor local do Advise foi preservado. Revise o status e continue em nova rodada curta.",
    };
  }
}
