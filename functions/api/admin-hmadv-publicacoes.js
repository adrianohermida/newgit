import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  backfillPartesFromPublicacoes,
  createPublicacoesAdminJob,
  createProcessesFromPublicacoes,
  getPublicacoesAdminJob,
  getPublicationActivityTypes,
  getPublicacoesOverview,
  jsonError,
  jsonOk,
  listAdminJobs,
  listAdminOperations,
  listCreateProcessCandidates,
  listPublicationActivityBacklog,
  listPartesExtractionCandidates,
  logAdminOperation,
  processPublicacoesAdminJob,
  runSyncWorker,
  syncPublicationActivities,
  syncPartesFromPublicacoes,
} from "../lib/hmadv-ops.js";

function parseProcessNumbers(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value)
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isJobInfraError(error) {
  const message = String(error?.message || "");
  return message.includes("operacao_jobs") && (
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("PGRST205")
  );
}

function isQueueOverloadError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Too many subrequests") ||
    message.includes("subrequests") ||
    message.includes("Worker exceeded resource limits") ||
    message.includes("exceeded resource limits")
  );
}

function buildQueueFallback({ page, pageSize, error }) {
  return {
    page,
    pageSize,
    totalRows: 0,
    items: [],
    limited: true,
    error: error?.message || "Fila em modo reduzido por sobrecarga.",
  };
}

async function runInlinePublicacoesAction(env, action, body) {
  const processNumbers = parseProcessNumbers(body.processNumbers);
  const requestedLimit = Number(body.limit || 0);
  if (action === "backfill_partes") {
    return backfillPartesFromPublicacoes(env, {
      processNumbers,
      limit: requestedLimit || 15,
      apply: Boolean(body.apply),
    });
  }
  if (action === "sincronizar_partes") {
    return syncPartesFromPublicacoes(env, {
      processNumbers,
      limit: requestedLimit || 10,
    });
  }
  if (action === "criar_processos_publicacoes") {
    return createProcessesFromPublicacoes(env, {
      processNumbers,
      limit: requestedLimit || 10,
    });
  }
  if (action === "sincronizar_publicacoes_activity") {
    return syncPublicationActivities(env, {
      processNumbers,
      limit: requestedLimit || 5,
    });
  }
  throw new Error(`Acao inline de publicacoes nao suportada: ${action}`);
}

async function drainPublicacoesJobs(env, { preferredId = null, maxChunks = 6 } = {}) {
  const safeChunks = Math.max(1, Math.min(Number(maxChunks || 1), 1));
  let chunks = 0;
  let activeJob = null;
  let completedAll = false;

  while (chunks < safeChunks) {
    let job = null;
    if (preferredId) {
      job = await getPublicacoesAdminJob(env, preferredId);
      preferredId = null;
      if (job && !["pending", "running"].includes(String(job.status || ""))) {
        job = null;
      }
    }
    if (!job) {
      const listed = await listAdminJobs(env, { modulo: "publicacoes", limit: 20 });
      job = (listed.items || []).find((item) => ["pending", "running"].includes(String(item.status || ""))) || null;
    }
    if (!job?.id) {
      completedAll = true;
      break;
    }
    activeJob = await processPublicacoesAdminJob(env, job.id);
    chunks += 1;
    if (!activeJob || !["pending", "running"].includes(String(activeJob.status || ""))) {
      continue;
    }
  }

  if (!completedAll) {
    const listed = await listAdminJobs(env, { modulo: "publicacoes", limit: 20 });
    completedAll = !(listed.items || []).some((item) => ["pending", "running"].includes(String(item.status || "")));
    if (!activeJob?.id) {
      activeJob = (listed.items || [])[0] || null;
    }
  }

  return {
    job: activeJob,
    chunksProcessed: chunks,
    completedAll,
  };
}

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const url = new URL(context.request.url);
    const action = String(url.searchParams.get("action") || "overview");
    if (action === "overview") {
      const data = await getPublicacoesOverview(context.env);
      return jsonOk({ data });
    }
    if (action === "candidatos_processos") {
      const page = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 20);
      try {
        const data = await listCreateProcessCandidates(context.env, { page, pageSize });
        return jsonOk({ data });
      } catch (error) {
        if (isQueueOverloadError(error)) {
          return jsonOk({ data: buildQueueFallback({ page, pageSize, error }) });
        }
        throw error;
      }
    }
    if (action === "candidatos_partes") {
      const page = Number(url.searchParams.get("page") || 1);
      const pageSize = Number(url.searchParams.get("pageSize") || 20);
      try {
        const data = await listPartesExtractionCandidates(context.env, { page, pageSize });
        return jsonOk({ data });
      } catch (error) {
        if (isQueueOverloadError(error)) {
          return jsonOk({ data: buildQueueFallback({ page, pageSize, error }) });
        }
        throw error;
      }
    }
    if (action === "publicacoes_pendentes") {
      const data = await listPublicationActivityBacklog(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "activity_types") {
      const data = await getPublicationActivityTypes(context.env);
      return jsonOk({ data });
    }
    if (action === "historico") {
      const data = await listAdminOperations(context.env, {
        modulo: "publicacoes",
        limit: Number(url.searchParams.get("limit") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "jobs") {
      const data = await listAdminJobs(context.env, {
        modulo: "publicacoes",
        limit: Number(url.searchParams.get("limit") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "job_status") {
      const data = await getPublicacoesAdminJob(context.env, url.searchParams.get("id"));
      return jsonOk({ data });
    }
    return jsonError(new Error("Acao GET invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const body = await context.request.json();
    const action = String(body.action || "");
    async function runLogged(fn) {
      try {
        const data = await fn();
        await logAdminOperation(context.env, { modulo: "publicacoes", acao: action, status: "success", payload: body, result: data });
        return jsonOk({ data });
      } catch (error) {
        await logAdminOperation(context.env, { modulo: "publicacoes", acao: action, status: "error", payload: body, error: error.message || "Falha operacional." });
        return jsonError(error, 500);
      }
    }
    if (action === "backfill_partes") {
      return runLogged(async () => backfillPartesFromPublicacoes(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 15),
        apply: Boolean(body.apply),
      }));
    }
    if (action === "create_job") {
      try {
          const data = await createPublicacoesAdminJob(context.env, {
            action: String(body.jobAction || ""),
            payload: {
              processNumbers: parseProcessNumbers(body.processNumbers),
              limit: Number(body.limit || 0),
            },
          });
        return jsonOk({ data });
      } catch (error) {
        if (isJobInfraError(error)) {
          try {
            const result = await runInlinePublicacoesAction(context.env, String(body.jobAction || ""), body);
            await logAdminOperation(context.env, {
              modulo: "publicacoes",
              acao: `${String(body.jobAction || "")}_inline_fallback`,
              status: "success",
              payload: body,
              result,
            });
            return jsonOk({
              data: {
                legacy_inline: true,
                action: String(body.jobAction || ""),
                reason: "operacao_jobs_unavailable",
                result,
              },
            });
          } catch (inlineError) {
            await logAdminOperation(context.env, {
              modulo: "publicacoes",
              acao: `${String(body.jobAction || "")}_inline_fallback`,
              status: "error",
              payload: body,
              error: inlineError.message || "Falha no fallback inline.",
            });
            return jsonError(inlineError, 500);
          }
        }
        return jsonError(error, 500);
      }
    }
    if (action === "run_job_chunk") {
      try {
        const data = await processPublicacoesAdminJob(context.env, body.id);
        return jsonOk({ data });
      } catch (error) {
        return jsonError(error, 500);
      }
    }
    if (action === "run_pending_jobs") {
      try {
        const data = await drainPublicacoesJobs(context.env, {
          preferredId: body.id || null,
          maxChunks: Number(body.maxChunks || 1),
        });
        return jsonOk({ data });
      } catch (error) {
        return jsonError(error, 500);
      }
    }
    if (action === "sincronizar_partes") {
      return runLogged(async () => syncPartesFromPublicacoes(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 10),
      }));
    }
    if (action === "criar_processos_publicacoes") {
      return runLogged(async () => createProcessesFromPublicacoes(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 10),
      }));
    }
    if (action === "sincronizar_publicacoes_activity") {
      return runLogged(async () => syncPublicationActivities(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 5),
      }));
    }
    if (action === "run_sync_worker") {
      return runLogged(async () => runSyncWorker(context.env));
    }
    return jsonError(new Error("Acao POST invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
