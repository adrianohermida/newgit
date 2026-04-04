import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  backfillAudiencias,
  createProcessAdminJob,
  deleteProcessRelation,
  enrichProcessesViaDatajud,
  getProcessAdminJob,
  getProcessosOverview,
  inspectAudiencias,
  jsonError,
  jsonOk,
  listAdminJobs,
  listAdminOperations,
  listFieldGapProcesses,
  listMonitoringProcesses,
  listProcessRelations,
  listProcessesWithoutMovements,
  pushOrphanAccounts,
  repairFreshsalesAccounts,
  runProcessAudit,
  runSyncWorker,
  scanOrphanProcesses,
  searchProcessesForRelations,
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
        limit: Number(body.limit || 100),
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
            limit: Number(body.limit || 10),
          },
        });
        return jsonOk({ data });
      } catch (error) {
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
    if (action === "push_orfaos") {
      return runLogged(async () => pushOrphanAccounts(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 20),
      }));
    }
    if (action === "repair_freshsales_accounts") {
      return runLogged(async () => repairFreshsalesAccounts(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 10),
      }));
    }
    if (action === "enriquecer_datajud") {
      return runLogged(async () => enrichProcessesViaDatajud(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 10),
      }));
    }
    if (action === "sync_supabase_crm") {
      return runLogged(async () => syncProcessesSupabaseCrm(context.env, {
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
