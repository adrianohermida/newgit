import {
  getPersistedCoverageOverview,
  getPersistedCoveragePriorityReport,
  getProcessosOverview,
  getPublicacoesOverview,
  listAdminJobs,
  listAdminOperations,
  persistProcessCoverageSnapshot,
  processProcessAdminJob,
  processPublicacoesAdminJob,
} from "./hmadv-ops.js";
import {
  getContactsOverview,
  reconcilePartesContacts,
  syncFreshsalesContactsMirror,
} from "./hmadv-contacts.js";

function getSupabaseBaseUrl(env) {
  return String(env?.SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
}

function getSupabaseServerKey(env) {
  return String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
}

async function callHmadvFunction(env, name, query = {}, init = {}) {
  const baseUrl = getSupabaseBaseUrl(env);
  const serviceKey = getSupabaseServerKey(env);
  if (!baseUrl || !serviceKey) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes para chamar edge functions do HMADV.");
  }
  const url = new URL(`${baseUrl}/functions/v1/${name}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), {
    method: init.method || "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Falha na edge function ${name} (${response.status}).`);
  }
  return payload;
}

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

function getConfiguredRunnerToken(env) {
  return String(env?.HMADV_RUNNER_TOKEN || env?.MADV_RUNNER_TOKEN || "").trim();
}

function getConfiguredRunnerTokenKey(env) {
  if (String(env?.HMADV_RUNNER_TOKEN || "").trim()) return "HMADV_RUNNER_TOKEN";
  if (String(env?.MADV_RUNNER_TOKEN || "").trim()) return "MADV_RUNNER_TOKEN";
  return null;
}

export function requireHmadvRunnerAccess(request, env) {
  const expectedToken = getConfiguredRunnerToken(env);
  if (!expectedToken) {
    return { ok: false, status: 503, error: "HMADV_RUNNER_TOKEN/MADV_RUNNER_TOKEN ausente no ambiente." };
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

function formatLastActivityLabel(isoString) {
  const minutes = minutesSince(isoString);
  if (minutes === null) return "Sem atividade registrada";
  if (minutes < 1) return "Agora mesmo";
  if (minutes === 1) return "Ha 1 minuto";
  if (minutes < 60) return `Ha ${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "Ha 1 hora";
  if (hours < 24) return `Ha ${hours} horas`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "Ha 1 dia" : `Ha ${days} dias`;
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

function buildCycleTrend(items = []) {
  const latest = summarizeRecentCycle(items[0] || null);
  const previous = summarizeRecentCycle(items[1] || null);
  if (!latest) return null;

  let label = "Estavel";
  let reason = "Sem base suficiente para comparar a tendencia recente.";

  if (previous) {
    const latestScore = Number(latest.successRate ?? 0) + Number(latest.coverageRate ?? 0);
    const previousScore = Number(previous.successRate ?? 0) + Number(previous.coverageRate ?? 0);
    if (latestScore >= previousScore + 20) {
      label = "Melhorando";
      reason = "O ciclo mais recente entregou melhor cobertura e/ou sucesso do que o anterior.";
    } else if (latestScore + 20 <= previousScore) {
      label = "Piorando";
      reason = "O ciclo mais recente perdeu cobertura ou taxa de sucesso frente ao anterior.";
    } else {
      label = "Estavel";
      reason = "Os dois ciclos recentes ficaram em faixa parecida de desempenho.";
    }
  }

  return {
    label,
    reason,
    latest,
    previous,
  };
}

function buildAlerts({
  runnerConfigured,
  totalPendingJobs,
  totalBacklogItems,
  healthStatus,
  healthReason,
  blockerTitle,
  blockerReason,
  latestErroredProcessJob,
  latestErroredPublicacaoJob,
}) {
  const alerts = [];

  if (healthStatus === "error") {
    alerts.push({
      level: "critico",
      title: blockerTitle,
      message: blockerReason,
    });
  }

  if (healthStatus === "stalled") {
    alerts.push({
      level: "atencao",
      title: "Fila parada",
      message: healthReason,
    });
  }

  if (!runnerConfigured && (totalPendingJobs > 0 || totalBacklogItems > 0)) {
    alerts.push({
      level: "atencao",
      title: "Automacao pendente",
      message: "Configure HMADV_RUNNER_TOKEN ou MADV_RUNNER_TOKEN e mantenha o workflow hmadv-runner ativo.",
    });
  }

  if (totalBacklogItems > 0) {
    alerts.push({
      level: "info",
      title: "Backlog de base",
      message: `${totalBacklogItems} itens ainda dependem de criacao ou vinculacao estrutural.`,
    });
  }

  if (latestErroredProcessJob && healthStatus !== "error") {
    alerts.push({
      level: "info",
      title: "Historico de erro em processos",
      message: latestErroredProcessJob.last_error || "Existe falha recente registrada em processos.",
    });
  }

  if (latestErroredPublicacaoJob && healthStatus !== "error") {
    alerts.push({
      level: "info",
      title: "Historico de erro em publicacoes",
      message: latestErroredPublicacaoJob.last_error || "Existe falha recente registrada em publicacoes.",
    });
  }

  return alerts.slice(0, 4);
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

async function runDatajudTaggedPipeline(env) {
  try {
    const data = await callHmadvFunction(
      env,
      "datajud-webhook",
      {
        action: "cron_tagged_datajud",
        scan_limit: 500,
        monitor_limit: 500,
        movement_limit: 200,
      },
      { method: "POST", body: {} }
    );
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Falha ao rodar pipeline DataJud tagged.",
    };
  }
}

async function runAdviseSyncPipeline(env) {
  try {
    const data = await callHmadvFunction(
      env,
      "advise-sync",
      {
        action: "sync",
        por_pagina: 50,
        max_paginas: 2,
      },
      { method: "POST", body: {} }
    );
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Falha ao rodar pipeline Advise.",
    };
  }
}

async function runFreshsalesCoveragePipeline(env) {
  const result = {
    publicacoes: null,
    worker: null,
    ok: true,
  };
  try {
    result.publicacoes = await callHmadvFunction(
      env,
      "publicacoes-freshsales",
      {
        action: "sync",
        batch: 20,
      },
      { method: "POST", body: {} }
    );
  } catch (error) {
    result.ok = false;
    result.publicacoes = {
      ok: false,
      error: error?.message || "Falha ao sincronizar publicacoes no Freshsales.",
    };
  }

  try {
    result.worker = await callHmadvFunction(
      env,
      "sync-worker",
      {
        action: "run",
      },
      { method: "POST", body: {} }
    );
  } catch (error) {
    result.ok = false;
    result.worker = {
      ok: false,
      error: error?.message || "Falha ao rodar sync-worker.",
    };
  }

  return result;
}

async function runContactsCoveragePipeline(env) {
  const result = {
    mirror: null,
    reconcile: null,
    ok: true,
  };
  try {
    result.mirror = await syncFreshsalesContactsMirror(env, {
      limit: 5000,
      dryRun: false,
    });
  } catch (error) {
    result.ok = false;
    result.mirror = {
      ok: false,
      error: error?.message || "Falha ao atualizar espelho de contatos do Freshsales.",
    };
  }

  try {
    result.reconcile = await reconcilePartesContacts(env, {
      limit: 50,
      apply: true,
    });
  } catch (error) {
    result.ok = false;
    result.reconcile = {
      ok: false,
      error: error?.message || "Falha ao reconciliar partes com contatos do Freshsales.",
    };
  }

  return result;
}

async function runCoverageSnapshotPipeline(env) {
  try {
    const data = await persistProcessCoverageSnapshot(env, {
      pageSize: 100,
      maxPages: 100,
    });
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "Falha ao persistir snapshot de cobertura por processo.",
    };
  }
}

function buildCoverageMetrics(snapshotResult, coverageOverview) {
  return {
    processed: Number(snapshotResult?.data?.processed || 0),
    upserted: Number(snapshotResult?.data?.upserted || 0),
    totalRows: Number(coverageOverview?.totalRows || 0),
    coveredRows: Number(coverageOverview?.coveredRows || 0),
    pendingRows: Number(coverageOverview?.pendingRows || 0),
    lastSyncAt: coverageOverview?.lastSyncAt || null,
    unsupported: Boolean(coverageOverview?.unsupported),
  };
}

export async function getHmadvQueueSnapshot(env) {
  const [processosOverview, publicacoesOverview, contactsOverview, coverageOverview, coveragePriority, processJobs, publicacaoJobs, runnerOps] = await Promise.all([
    getProcessosOverview(env),
    getPublicacoesOverview(env),
    getContactsOverview(env).catch(() => null),
    getPersistedCoverageOverview(env).catch(() => null),
    getPersistedCoveragePriorityReport(env, { limit: 100 }).catch(() => null),
    listAdminJobs(env, { modulo: "processos", limit: 20 }),
    listAdminJobs(env, { modulo: "publicacoes", limit: 20 }),
    listAdminOperations(env, { modulo: "runner", limit: 5 }),
  ]);

  const runnerTokenKey = getConfiguredRunnerTokenKey(env);
  const runnerConfigured = Boolean(runnerTokenKey);
  const processosJobs = summarizeJobs(processJobs.items || []);
  const publicacoesJobs = summarizeJobs(publicacaoJobs.items || []);
  const totalPendingJobs =
    (processosJobs.pending || 0) +
    (processosJobs.running || 0) +
    (publicacoesJobs.pending || 0) +
    (publicacoesJobs.running || 0);
  const totalBacklogItems =
    Number(processosOverview?.processosSemAccount || 0) +
    Number(publicacoesOverview?.publicacoesSemProcesso || 0) +
    Number(contactsOverview?.partesSemContato || 0);
  const processosPressure =
    Number(processosJobs.pending || 0) +
    Number(processosJobs.running || 0) +
    Number(processosOverview?.processosSemAccount || 0);
  const publicacoesPressure =
    Number(publicacoesJobs.pending || 0) +
    Number(publicacoesJobs.running || 0) +
    Number(publicacoesOverview?.publicacoesSemProcesso || 0);
  const contactsPressure = Number(contactsOverview?.partesSemContato || 0) + Number(contactsOverview?.duplicados || 0);

  let nextStep = "Operacao pronta para drenagem manual pelo /interno.";
  if (runnerConfigured) {
    nextStep = totalPendingJobs
      ? "Token do runner configurado; confirme se o workflow hmadv-runner esta habilitado e com execucoes recentes."
      : "Token do runner configurado; manter o workflow hmadv-runner ativo para capturar novas pendencias automaticamente.";
  } else if (totalPendingJobs || totalBacklogItems) {
    nextStep = "Configurar HMADV_RUNNER_TOKEN ou MADV_RUNNER_TOKEN e o workflow hmadv-runner para reduzir cliques manuais.";
  }

  const latestProcessJob = processosJobs.active || (processJobs.items || [])[0] || null;
  const latestPublicacaoJob = publicacoesJobs.active || (publicacaoJobs.items || [])[0] || null;
  const latestRunnerExecution = (runnerOps.items || [])[0] || null;
  const latestRunnerSuccess = (runnerOps.items || []).find((item) => String(item.status || "") === "success") || null;
  const lastActivityAt = pickLatestTimestamp(
    latestRunnerExecution?.finished_at,
    latestRunnerExecution?.created_at,
    latestProcessJob?.updated_at,
    latestProcessJob?.finished_at,
    latestPublicacaoJob?.updated_at,
    latestPublicacaoJob?.finished_at
  );
  const inactivityMinutes = minutesSince(lastActivityAt);
  const lastActivityLabel = formatLastActivityLabel(lastActivityAt);

  let healthStatus = "healthy";
  let healthLabel = "Saudavel";
  let healthReason = "A fila HMADV esta sem sinais recentes de travamento.";

  if ((processosJobs.error || 0) + (publicacoesJobs.error || 0) > 0) {
    healthStatus = "error";
    healthLabel = "Com erro";
    healthReason = "Existem jobs com falha recente e a fila precisa de revisao.";
  } else if (totalPendingJobs > 0 && inactivityMinutes !== null && inactivityMinutes >= 15) {
    healthStatus = "stalled";
    healthLabel = "Parado";
    healthReason = "Ha fila pendente sem atividade recente; vale revisar o runner automatico.";
  } else if (runnerConfigured && (totalPendingJobs > 0 || totalBacklogItems > 0) && inactivityMinutes !== null && inactivityMinutes >= 15) {
    healthStatus = "attention";
    healthLabel = "Sem prova recente";
    healthReason = "O token existe, mas nao ha atividade recente suficiente para confiar na automacao.";
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
    blockerReason = "Sem HMADV_RUNNER_TOKEN ou MADV_RUNNER_TOKEN, a fila continua dependente de acao manual no painel.";
    blockerHref = "/interno";
    blockerCta = "Preparar automacao";
  }

  const focoLabel =
    focusModule === "publicacoes" ? "Publicacoes" : focusModule === "processos" ? "Processos" : "Torre HMADV";
  const tendenciaBase =
    focusModule === "publicacoes"
      ? buildCycleTrend(publicacaoJobs.items || [])
      : focusModule === "processos"
        ? buildCycleTrend(processJobs.items || [])
        : null;
  const tendenciaLabel = tendenciaBase?.label || "Estavel";
  const executiveSummary = `${healthLabel}: foco em ${focoLabel}; tendencia ${tendenciaLabel.toLowerCase()}.`;
  const alerts = buildAlerts({
    runnerConfigured,
    totalPendingJobs,
    totalBacklogItems,
    healthStatus,
    healthReason,
    blockerTitle,
    blockerReason,
    latestErroredProcessJob,
    latestErroredPublicacaoJob,
  });
  const moduleCards = {
    processos: {
      label: "Processos",
      href: "/interno/processos",
      pending: Number(processosJobs.pending || 0) + Number(processosJobs.running || 0),
      errors: Number(processosJobs.error || 0),
      backlog: Number(processosOverview?.processosSemAccount || 0),
      pressure: processosPressure,
      focused: focusModule === "processos",
      recommendedAction:
        healthStatus === "error" && latestErroredProcessJob
          ? "Revisar falha recente"
          : focusModule === "processos"
            ? "Abrir modulo prioritario"
            : "Acompanhar fila",
      urgency:
        healthStatus === "error" && latestErroredProcessJob
          ? "Critica"
          : focusModule === "processos"
            ? "Alta"
            : processosPressure >= 20
              ? "Media"
              : "Baixa",
      suggestedBatch:
        healthStatus === "error" && latestErroredProcessJob
          ? 5
          : processosPressure >= 40
            ? 20
            : processosPressure >= 15
              ? 10
              : 5,
    },
    publicacoes: {
      label: "Publicacoes",
      href: "/interno/publicacoes",
      pending: Number(publicacoesJobs.pending || 0) + Number(publicacoesJobs.running || 0),
      errors: Number(publicacoesJobs.error || 0),
      backlog: Number(publicacoesOverview?.publicacoesSemProcesso || 0),
      pressure: publicacoesPressure,
      focused: focusModule === "publicacoes",
      recommendedAction:
        healthStatus === "error" && latestErroredPublicacaoJob
          ? "Revisar falha recente"
          : focusModule === "publicacoes"
            ? "Abrir modulo prioritario"
            : "Acompanhar fila",
      urgency:
        healthStatus === "error" && latestErroredPublicacaoJob
          ? "Critica"
          : focusModule === "publicacoes"
            ? "Alta"
            : publicacoesPressure >= 20
              ? "Media"
              : "Baixa",
      suggestedBatch:
        healthStatus === "error" && latestErroredPublicacaoJob
          ? 5
          : publicacoesPressure >= 40
            ? 20
            : publicacoesPressure >= 15
              ? 10
              : 5,
    },
  };

  return {
    runnerConfigured,
    processosOverview,
    publicacoesOverview,
    contactsOverview,
    coverageOverview,
    coveragePriority,
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
    recentTrend: {
      processos: buildCycleTrend(processJobs.items || []),
      publicacoes: buildCycleTrend(publicacaoJobs.items || []),
    },
    autoMode: {
      enabled: runnerConfigured,
      totalPendingJobs,
      totalBacklogItems,
      recommendedIntervalMinutes: 5,
      nextStep,
      lastActivityAt,
      lastActivityLabel,
      latestRunnerExecution,
      latestRunnerSuccess,
      inactivityMinutes,
      healthStatus,
      healthLabel,
      healthReason,
      runnerTokenKey,
    },
    moduleFocus: {
      target: focusModule,
      processosPressure,
      publicacoesPressure,
      contactsPressure,
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
    executiveSummary,
    alerts,
    moduleCards,
  };
}

export async function drainHmadvQueues(env, { maxChunks = 2 } = {}) {
  const advise = await runAdviseSyncPipeline(env);
  const datajud = await runDatajudTaggedPipeline(env);
  const coverage = await runFreshsalesCoveragePipeline(env);
  const contacts = await runContactsCoveragePipeline(env);
  const coverageSnapshot = await runCoverageSnapshotPipeline(env);
  const coverageOverview = await getPersistedCoverageOverview(env).catch(() => null);
  const [processos, publicacoes] = await Promise.all([
    drainModuleJobs(env, "processos", processProcessAdminJob, maxChunks),
    drainModuleJobs(env, "publicacoes", processPublicacoesAdminJob, maxChunks),
  ]);

  return {
    advise,
    datajud,
    coverage,
    contacts,
    coverageSnapshot,
    coverageMetrics: buildCoverageMetrics(coverageSnapshot, coverageOverview),
    processos,
    publicacoes,
    completedAll: Boolean(processos.completedAll && publicacoes.completedAll),
  };
}
