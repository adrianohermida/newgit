import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  getProcessosOverview,
  getPublicacoesOverview,
  jsonError,
  jsonOk,
  listAdminJobs,
  processProcessAdminJob,
  processPublicacoesAdminJob,
} from "../lib/hmadv-ops.js";

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
    completedAll: !pending.length,
    activeJob: pending[0] || activeJob || null,
    pendingCount: pending.length,
  };
}

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return jsonError(new Error(auth.error), auth.status);

  try {
    const [processosOverview, publicacoesOverview, processJobs, publicacaoJobs] = await Promise.all([
      getProcessosOverview(context.env),
      getPublicacoesOverview(context.env),
      listAdminJobs(context.env, { modulo: "processos", limit: 20 }),
      listAdminJobs(context.env, { modulo: "publicacoes", limit: 20 }),
    ]);

    const summarize = (items = []) => ({
      pending: items.filter((item) => String(item.status || "") === "pending").length,
      running: items.filter((item) => String(item.status || "") === "running").length,
      completed: items.filter((item) => String(item.status || "") === "completed").length,
      error: items.filter((item) => String(item.status || "") === "error").length,
      active: items.find((item) => ["pending", "running"].includes(String(item.status || ""))) || null,
    });

    return jsonOk({
      data: {
        processosOverview,
        publicacoesOverview,
        processosJobs: summarize(processJobs.items || []),
        publicacoesJobs: summarize(publicacaoJobs.items || []),
      },
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return jsonError(new Error(auth.error), auth.status);

  try {
    const body = await context.request.json();
    const action = String(body.action || "");
    if (action !== "drain_all") {
      return jsonError(new Error("Acao POST invalida."), 400);
    }

    const maxChunks = Number(body.maxChunks || 8);
    const [processos, publicacoes] = await Promise.all([
      drainModuleJobs(context.env, "processos", processProcessAdminJob, maxChunks),
      drainModuleJobs(context.env, "publicacoes", processPublicacoesAdminJob, maxChunks),
    ]);

    return jsonOk({
      data: {
        processos,
        publicacoes,
        completedAll: Boolean(processos.completedAll && publicacoes.completedAll),
      },
    });
  } catch (error) {
    return jsonError(error, 500);
  }
}
