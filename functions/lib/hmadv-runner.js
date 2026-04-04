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

function pickLatestTimestamp(...values) {
  const times = values
    .map((value) => {
      const parsed = Date.parse(String(value || ""));
      return Number.isFinite(parsed) ? parsed : null;
    })
    .filter((value) => value !== null);
  if (!times.length) return null;
  return new Date(Math.max(...times)).toISOString();
}

function minutesSince(isoString) {
  if (!isoString) return null;
  const parsed = Date.parse(String(isoString || ""));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60000));
}

function summarizeRecentCycle(job) {
  if (!job) return null;
  const requestedCount = Number(job.requested_count || 0);
  const processedCount = Number(job.processed_count || 0);
  const successCount = Number(job.success_count || 0);
  const errorCount = Number(job.error_count || 0);
  const successRate = processedCount > 0 ? Math.round((successCount / processedCount) * 100) : null;
  const coverageRate = requestedCount > 0 ? Math.round((processedCount / requestedCount) * 100) : null;
  let performanceLabel = "Sem leitura";
  let performanceStatus = "neutral";
  if ((processedCount || requestedCount) > 0) {
    if ((successRate ?? 0) >= 80 && (coverageRate ?? 0) >= 80) {
      performanceLabel = "Bom";
      performanceStatus = "good";
    } else if ((successRate ?? 0) >= 50 || (coverageRate ?? 0) >= 50) {
      performanceLabel = "Parcial";
      performanceStatus = "partial";
    } else {
      performanceLabel = "Andou de lado";
      performanceStatus = "stalled";
    }
  }
  return {
    id: job.id || null,
    acao: job.acao || null,
    status: job.status || null,
    updatedAt: job.updated_at || job.finished_at || job.started_at || job.created_at || null,
    requestedCount,
    processedCount,
    successCount,
    errorCount,
    successRate,
    coverageRate,
    performanceLabel,
    performanceStatus,
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

  const latestProcessJob = processosJobs.active || (processJobs.items || [])[0] || null;
  const latestPublicacaoJob = publicacoesJobs.active || (publicacaoJobs.items || [])[0] || null;
  const lastActivityAt = pickLatestTimestamp(
    latestProcessJob?.updated_at,
    latestProcessJob?.finished_at,
    latestPublicacaoJob?.updated_at,
    latestPublicacaoJob?.finished_at
  );
  const inactivityMinutes = minutesSince(lastActivityAt);

  let healthStatus = "healthy";
  let healthLabel = "Saudavel";
  let healthReason = "A fila HMADV esta sem sinais recentes de travamento.";

  if ((processosJobs.error || 0) + (publicacoesJobs.error || 0) > 0) {
    healthStatus = "error";
    healthLabel = "Com erro";
    healthReason = "Existem jobs com falha recente e a fila precisa de revisao.";
  } else if (totalPendingJobs > 0 && inactivityMinutes !== null && inactivityMinutes >= 30) {
    healthStatus = "stalled";
    healthLabel = "Parado";
    healthReason = "Ha fila pendente sem atividade recente; vale revisar o runner automatico.";
  } else if (!runnerConfigured && (totalPendingJobs > 0 || totalBacklogItems > 0)) {
    healthStatus = "manual_only";
    healthLabel = "Manual";
    healthReason = "A fila depende do painel porque o runner automatico ainda nao foi configurado.";
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

  let blockerTitle = "Fila sob controle";
  let blockerReason = "Nao ha bloqueio principal evidente neste momento.";
  let blockerHref = primaryHref;
  let blockerCta = primaryLabel;

  const latestErroredProcessJob = (processJobs.items || []).find((item) => String(item.status || "") === "error") || null;
  const latestErroredPublicacaoJob = (publicacaoJobs.items || []).find((item) => String(item.status || "") === "error") || null;

  if (healthStatus === "error") {
    if (latestErroredPublicacaoJob) {
      blockerTitle = "Falha recente em publicacoes";
      blockerReason = latestErroredPublicacaoJob.last_error || "A fila de publicacoes tem erro recente e precisa de revisao.";
      blockerHref = "/interno/publicacoes";
      blockerCta = "Revisar publicacoes";
    } else if (latestErroredProcessJob) {
      blockerTitle = "Falha recente em processos";
      blockerReason = latestErroredProcessJob.last_error || "A fila de processos tem erro recente e precisa de revisao.";
      blockerHref = "/interno/processos";
      blockerCta = "Revisar processos";
    }
  } else if (healthStatus === "stalled") {
    blockerTitle = "Fila sem progresso recente";
    blockerReason = "Existem pendencias sem atividade recente; vale drenar a fila e revisar o scheduler.";
    blockerHref = "/interno";
    blockerCta = "Drenar fila";
  } else if (!runnerConfigured && (totalPendingJobs > 0 || totalBacklogItems > 0)) {
    blockerTitle = "Automacao ainda nao configurada";
    blockerReason = "Sem HMADV_RUNNER_TOKEN, a fila continua dependente de acao manual no painel.";
    blockerHref = "/interno";
    blockerCta = "Preparar automacao";
  }

  return {
    runnerConfigured,
    processosOverview,
    publicacoesOverview,
    processosJobs,
    publicacoesJobs,
    recentJobs: {
      processos: (processJobs.items || []).slice(0, 3),
      publicacoes: (publicacaoJobs.items || []).slice(0, 3),
    },
    recentCycle: {
      processos: summarizeRecentCycle((processJobs.items || [])[0] || null),
      publicacoes: summarizeRecentCycle((publicacaoJobs.items || [])[0] || null),
    },
    autoMode: {
      enabled: runnerConfigured,
      totalPendingJobs,
      totalBacklogItems,
      recommendedIntervalMinutes: 5,
      nextStep,
      lastActivityAt,
      inactivityMinutes,
      healthStatus,
      healthLabel,
      healthReason,
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
    blocker: {
      title: blockerTitle,
      reason: blockerReason,
      href: blockerHref,
      cta: blockerCta,
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
