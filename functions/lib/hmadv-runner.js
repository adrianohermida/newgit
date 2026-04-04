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

  return {
    runnerConfigured: Boolean(String(env?.HMADV_RUNNER_TOKEN || "").trim()),
    processosOverview,
    publicacoesOverview,
    processosJobs: summarizeJobs(processJobs.items || []),
    publicacoesJobs: summarizeJobs(publicacaoJobs.items || []),
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
