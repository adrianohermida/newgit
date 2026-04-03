import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  backfillAudiencias,
  deleteProcessRelation,
  enrichProcessesViaDatajud,
  getProcessosOverview,
  inspectAudiencias,
  jsonError,
  jsonOk,
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
  updateMonitoringStatus,
  upsertProcessRelation,
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
    if (action === "backfill_audiencias") {
      const data = await backfillAudiencias(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 100),
        apply: Boolean(body.apply),
      });
      return jsonOk({ data });
    }
    if (action === "run_sync_worker") {
      const data = await runSyncWorker(context.env);
      return jsonOk({ data });
    }
    if (action === "push_orfaos") {
      const data = await pushOrphanAccounts(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 20),
      });
      return jsonOk({ data });
    }
    if (action === "repair_freshsales_accounts") {
      const data = await repairFreshsalesAccounts(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 10),
      });
      return jsonOk({ data });
    }
    if (action === "enriquecer_datajud") {
      const data = await enrichProcessesViaDatajud(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        limit: Number(body.limit || 10),
      });
      return jsonOk({ data });
    }
    if (action === "auditoria_sync") {
      const data = await runProcessAudit(context.env);
      return jsonOk({ data });
    }
    if (action === "monitoramento_status") {
      const data = await updateMonitoringStatus(context.env, {
        processNumbers: parseProcessNumbers(body.processNumbers),
        active: Boolean(body.active),
        limit: Number(body.limit || 20),
      });
      return jsonOk({ data });
    }
    if (action === "salvar_relacao") {
      const data = await upsertProcessRelation(context.env, body);
      return jsonOk({ data });
    }
    if (action === "remover_relacao") {
      const data = await deleteProcessRelation(context.env, body.id);
      return jsonOk({ data });
    }
    return jsonError(new Error("Acao POST invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
