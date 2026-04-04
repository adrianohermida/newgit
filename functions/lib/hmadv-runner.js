import {
  getProcessosOverview,
  getPublicacoesOverview,
  listAdminJobs,
  processProcessAdminJob,
  processPublicacoesAdminJob,
} from "./hmadv-ops.js";

function getRunnerToken(request) {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  return (
    request.headers.get("x-hmadv-runner-token") ||
    request.headers.get("X-HMADV-RUNNER-TOKEN") ||
    ""
  ).trim();
}

export function requireHmadvRunnerAccess(request, env) {
  const expectedToken = String(env?.HMADV_RUNNER_TOKEN || "").trim();
  if (!expectedToken) {
    return { ok: false, status: 503, error: "HMADV_RUNNER_TOKEN ausente no ambiente." };
  }

  const providedToken = getRunnerToken(request);
  if (!providedToken || providedToken !== expectedToken) {
    return { ok: false, status: 401, error: "Token do runner HMADV ausente ou invalido." };
  }

  return { ok: true };
}

function summarizeJobs(items = []) {
  return {
    pending: items.filter((item) => String(item.status || "") === "pending").length,
    running: items.filter((item) => String(item.status || "") === "running").length,
    completed: items.filter((item) => String(item.status || "") === "completed").length,
    error: items.filter((item) => String(item.status || "") === "error").length,
    active: items.find((item) => ["pending", "running"].includes(String(item.status || ""))) || null,
  };
}

async function drainModuleJobs(env, modulo, processor, maxChunks = 6) {
  const safeChunks = Math.max(1, Math.min(Number(maxChunks || 6), 30));
  let chunks = 0;
  let activeJob = null;
  let completedAll = false;

  while (chunks < safeChunks) {
    const listed = await listAdminJobs(env, { modulo, limit: 20 });
    const job = (listed.items || []).find((item) => ["pending", "running"].includes(String(item.status || ""))) || null;
    if (!job?.id) {
      completedAll = true;
      break;
    }
    activeJob = await processor(env, job.id);
    chunks += 1;
    if (!activeJob || !["pending", "running"].includes(String(activeJob.status || ""))) {
      continue;
    }
  }

  const listed = await listAdminJobs(env, { modulo, limit: 20 });
  const pending = (listed.items || []).filter((item) => ["pending", "running"].includes(String(item.status || "")));

  return {
    modulo,
    chunksProcessed: chunks,
    completedAll: !pending.length || completedAll,
    activeJob: pending[0] || activeJob || null,
    pendingCount: pending.length,
  };
}

export async function getHmadvQueueSnapshot(env) {
  const [processosOverview, publicacoesOverview, processJobs, publicacaoJobs] = await Promise.all([
    getProcessosOverview(env),
    getPublicacoesOverview(env),
    listAdminJobs(env, { modulo: "processos", limit: 20 }),
    listAdminJobs(env, { modulo: "publicacoes", limit: 20 }),
  ]);

  const runnerConfigured = Boolean(String(env?.HMADV_RUNNER_TOKEN || "").trim());
  const processosJobs = summarizeJobs(processJobs.items || []);
  const publicacoesJobs = summarizeJobs(publicacaoJobs.items || []);
  const totalPendingJobs =
    (processosJobs.pending || 0) +
    (processosJobs.running || 0) +
    (publicacoesJobs.pending || 0) +
    (publicacoesJobs.running || 0);
  const totalBacklogItems =
    Number(processosOverview?.processosSemAccount || 0) +
    Number(publicacoesOverview?.publicacoesSemProcesso || 0);
  const processosPressure =
    Number(processosJobs.pending || 0) +
    Number(processosJobs.running || 0) +
    Number(processosOverview?.processosSemAccount || 0);
  const publicacoesPressure =
    Number(publicacoesJobs.pending || 0) +
    Number(publicacoesJobs.running || 0) +
    Number(publicacoesOverview?.publicacoesSemProcesso || 0);

  let nextStep = "Operacao pronta para drenagem manual pelo /interno.";
  if (runnerConfigured) {
    nextStep = totalPendingJobs
      ? "Runner pronto; vale ativar o scheduler externo para consumir a fila continuamente."
      : "Runner pronto; manter scheduler externo para capturar novas pendencias automaticamente.";
  } else if (totalPendingJobs || totalBacklogItems) {
    nextStep = "Configurar HMADV_RUNNER_TOKEN e o workflow hmadv-runner para reduzir cliques manuais.";
  }

  let focusModule = "processos";
  let focusReason = "A fila de processos concentra mais pendencias operacionais neste momento.";
  if (publicacoesPressure > processosPressure) {
    focusModule = "publicacoes";
    focusReason = "A fila de publicacoes concentra mais pendencias e tende a alimentar novas correcoes na base.";
  } else if (publicacoesPressure === processosPressure && totalPendingJobs === 0 && totalBacklogItems === 0) {
    focusModule = "torre";
    focusReason = "As filas estao equilibradas; a Torre HMADV basta para acompanhamento do ciclo atual.";
  }

  let primaryHref = "/interno/processos";
  let primaryLabel = "Abrir processos";
  let checklist = [
    "Atualizar a leitura da fila.",
    "Montar o lote prioritario.",
    "Executar a drenagem ou o modulo recomendado.",
  ];

  if (focusModule === "publicacoes") {
    primaryHref = "/interno/publicacoes";
    primaryLabel = "Abrir publicacoes";
    checklist = [
      "Criar processos faltantes das publicacoes.",
      "Extrair e salvar partes novas.",
      "Atualizar polos e refletir no CRM.",
    ];
  } else if (focusModule === "torre") {
    primaryHref = "/interno";
    primaryLabel = "Permanecer na torre";
    checklist = [
      "Conferir se o runner automatico esta ativo.",
      "Drenar manualmente se surgir novo job.",
      "Revisar modulos apenas em caso de reincidencia.",
    ];
  } else {
    checklist = [
      "Buscar gaps e processos sem account.",
      "Rodar sincronismo Supabase + Freshsales.",
      "Reenriquecer via DataJud se ainda faltar conteudo.",
    ];
  }

  return {
    runnerConfigured,
    processosOverview,
    publicacoesOverview,
    processosJobs,
    publicacoesJobs,
    autoMode: {
      enabled: runnerConfigured,
      totalPendingJobs,
      totalBacklogItems,
      recommendedIntervalMinutes: 5,
      nextStep,
    },
    moduleFocus: {
      target: focusModule,
      processosPressure,
      publicacoesPressure,
      reason: focusReason,
      primaryHref,
      primaryLabel,
      checklist,
    },
  };
}

export async function drainHmadvQueues(env, { maxChunks = 8 } = {}) {
  const [processos, publicacoes] = await Promise.all([
    drainModuleJobs(env, "processos", processProcessAdminJob, maxChunks),
    drainModuleJobs(env, "publicacoes", processPublicacoesAdminJob, maxChunks),
  ]);

  return {
    processos,
    publicacoes,
    completedAll: Boolean(processos.completedAll && publicacoes.completedAll),
  };
}
