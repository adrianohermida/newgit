import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  backfillAudiencias,
  createProcessAdminJob,
  deleteProcessRelation,
  enrichProcessesViaDatajud,
  getProcessAdminJob,
  getProcessosOverview,
  getLocalProcessAudit,
  inspectAudiencias,
  jsonError,
  jsonOk,
  listAdminJobs,
  listAdminOperations,
  listAudienciaBackfillCandidates,
  listFieldGapProcesses,
  listMovementActivityBacklog,
  listMonitoringProcesses,
  listPartesSemContatoBacklog,
  listPublicationActivityBacklog,
  listProcessRelations,
  listProcessesWithoutMovements,
  pushOrphanAccounts,
  repairFreshsalesAccounts,
  runProcessAudit,
  runSyncWorker,
  scanOrphanProcesses,
  searchProcessesForRelations,
  syncMovementActivities,
  syncProcessesSupabaseCrm,
  processProcessAdminJob,
  updateMonitoringStatus,
  upsertProcessRelation,
  logAdminOperation,
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

function buildProcessActionLogName(action, payload = {}, suffix = "") {
  const baseAction = String(action || "").trim();
  const intent = String(payload?.intent || "").trim();
  let variant = baseAction;
  if (baseAction === "enriquecer_datajud" && intent) {
    variant = `${baseAction}_${intent}`;
  }
  return suffix ? `${variant}_${suffix}` : variant;
}

async function runInlineProcessAction(env, action, body) {
  const processNumbers = parseProcessNumbers(body.processNumbers);
  const requestedLimit = Number(body.limit || 0);
  if (action === "push_orfaos") {
    return pushOrphanAccounts(env, { processNumbers, limit: requestedLimit || 2 });
  }
  if (action === "repair_freshsales_accounts") {
    return repairFreshsalesAccounts(env, { processNumbers, limit: requestedLimit || 2 });
  }
  if (action === "enriquecer_datajud") {
    return enrichProcessesViaDatajud(env, { processNumbers, limit: requestedLimit || 2 });
  }
  if (action === "sync_supabase_crm") {
    return syncProcessesSupabaseCrm(env, {
      processNumbers,
      limit: requestedLimit || 1,
      intent: String(body.intent || ""),
    });
  }
  if (action === "backfill_audiencias") {
    return backfillAudiencias(env, { processNumbers, limit: requestedLimit || 2, apply: true });
  }
  if (action === "sincronizar_movimentacoes_activity") {
    return syncMovementActivities(env, { processNumbers, limit: requestedLimit || 10 });
  }
  throw new Error(`Acao inline nao suportada: ${action}`);
}

async function drainProcessJobs(env, { preferredId = null, maxChunks = 6 } = {}) {
  const safeChunks = Math.max(1, Math.min(Number(maxChunks || 1), 1));
  let chunks = 0;
  let activeJob = null;
  let completedAll = false;

  while (chunks < safeChunks) {
    let job = null;
    if (preferredId) {
      job = await getProcessAdminJob(env, preferredId);
      preferredId = null;
      if (job && !["pending", "running"].includes(String(job.status || ""))) {
        job = null;
      }
    }
    if (!job) {
      const listed = await listAdminJobs(env, { modulo: "processos", limit: 20 });
      job = (listed.items || []).find((item) => ["pending", "running"].includes(String(item.status || ""))) || null;
    }
    if (!job?.id) {
      completedAll = true;
      break;
    }
    activeJob = await processProcessAdminJob(env, job.id);
    chunks += 1;
    if (!activeJob || !["pending", "running"].includes(String(activeJob.status || ""))) {
      continue;
    }
  }

  if (!completedAll) {
    const listed = await listAdminJobs(env, { modulo: "processos", limit: 20 });
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
      const data = await getProcessosOverview(context.env);
      return jsonOk({ data });
    }
    if (action === "auditoria_completude") {
      const data = await getLocalProcessAudit(context.env, {
        sampleSize: Number(url.searchParams.get("sampleSize") || 8),
      });
      return jsonOk({ data });
    }
    if (action === "orfaos") {
      const data = await scanOrphanProcesses(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || url.searchParams.get("limit") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "inspect_audiencias") {
      const data = await inspectAudiencias(context.env, Number(url.searchParams.get("limit") || 10));
      return jsonOk({ data });
    }
    if (action === "sem_movimentacoes") {
      const data = await listProcessesWithoutMovements(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "monitoramento_ativo") {
      const data = await listMonitoringProcesses(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
        active: true,
      });
      return jsonOk({ data });
    }
    if (action === "monitoramento_inativo") {
      const data = await listMonitoringProcesses(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
        active: false,
      });
      return jsonOk({ data });
    }
    if (action === "campos_orfaos") {
      const data = await listFieldGapProcesses(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "audiencias_pendentes") {
      const data = await listAudienciaBackfillCandidates(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "publicacoes_pendentes") {
      const data = await listPublicationActivityBacklog(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "movimentacoes_pendentes") {
      const data = await listMovementActivityBacklog(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "partes_sem_contato") {
      const data = await listPartesSemContatoBacklog(context.env, {
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "relacoes") {
      const data = await listProcessRelations(context.env, {
        query: String(url.searchParams.get("query") || ""),
        page: Number(url.searchParams.get("page") || 1),
        pageSize: Number(url.searchParams.get("pageSize") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "historico") {
      const data = await listAdminOperations(context.env, {
        modulo: "processos",
        limit: Number(url.searchParams.get("limit") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "jobs") {
      const data = await listAdminJobs(context.env, {
        modulo: "processos",
        limit: Number(url.searchParams.get("limit") || 20),
      });
      return jsonOk({ data });
    }
    if (action === "job_status") {
      const data = await getProcessAdminJob(context.env, url.searchParams.get("id"));
      return jsonOk({ data });
    }
    if (action === "buscar_processos") {
      const data = await searchProcessesForRelations(context.env, {
        query: String(url.searchParams.get("query") || ""),
        limit: Number(url.searchParams.get("limit") || 12),
      });
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
        await logAdminOperation(context.env, { modulo: "processos", acao: action, status: "success", payload: body, result: data });
        return jsonOk({ data });
      } catch (error) {
        await logAdminOperation(context.env, { modulo: "processos", acao: action, status: "error", payload: body, error: error.message || "Falha operacional." });
        return jsonError(error, 500);
      }
    }
    if (action === "backfill_audiencias") {
      return runLogged(async () => backfillAudiencias(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 2),
        apply: Boolean(body.apply),
      }));
    }
    if (action === "run_sync_worker") {
      return runLogged(async () => runSyncWorker(context.env));
    }
    if (action === "create_job") {
      try {
          const data = await createProcessAdminJob(context.env, {
            action: String(body.jobAction || ""),
            payload: {
              processNumbers: parseProcessNumbers(body.processNumbers),
              limit: Number(body.limit || 0),
              intent: String(body.intent || ""),
            },
          });
        return jsonOk({ data });
      } catch (error) {
        if (isJobInfraError(error)) {
          try {
            const result = await runInlineProcessAction(context.env, String(body.jobAction || ""), body);
            await logAdminOperation(context.env, {
              modulo: "processos",
              acao: buildProcessActionLogName(String(body.jobAction || ""), body, "inline_fallback"),
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
              modulo: "processos",
              acao: buildProcessActionLogName(String(body.jobAction || ""), body, "inline_fallback"),
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
        const data = await processProcessAdminJob(context.env, body.id);
        return jsonOk({ data });
      } catch (error) {
        return jsonError(error, 500);
      }
    }
    if (action === "run_pending_jobs") {
      try {
        const data = await drainProcessJobs(context.env, {
          preferredId: body.id || null,
          maxChunks: Number(body.maxChunks || 1),
        });
        return jsonOk({ data });
      } catch (error) {
        return jsonError(error, 500);
      }
    }
    if (action === "push_orfaos") {
      return runLogged(async () => pushOrphanAccounts(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 2),
      }));
    }
    if (action === "repair_freshsales_accounts") {
      return runLogged(async () => repairFreshsalesAccounts(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 2),
      }));
    }
    if (action === "enriquecer_datajud") {
      return runLogged(async () => enrichProcessesViaDatajud(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 2),
      }));
    }
    if (action === "sync_supabase_crm") {
      return runLogged(async () => syncProcessesSupabaseCrm(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 1),
        intent: String(body.intent || ""),
      }));
    }
    if (action === "sincronizar_movimentacoes_activity") {
      return runLogged(async () => syncMovementActivities(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 10),
      }));
    }
    if (action === "auditoria_sync") {
      return runLogged(async () => runProcessAudit(context.env));
    }
    if (action === "monitoramento_status") {
      return runLogged(async () => updateMonitoringStatus(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        active: Boolean(body.active),
        limit: Number(body.limit || 20),
      }));
    }
    if (action === "salvar_relacao") {
      return runLogged(async () => upsertProcessRelation(context.env, body));
    }
    if (action === "remover_relacao") {
      return runLogged(async () => deleteProcessRelation(context.env, body.id));
    }
    return jsonError(new Error("Acao POST invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
