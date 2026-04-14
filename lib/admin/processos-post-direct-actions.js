import {
  backfillAudiencias,
  enrichProcessesViaDatajud,
  pushOrphanAccounts,
  repairFreshsalesAccounts,
  runProcessAudit,
  runSyncWorker,
  syncMovementActivities,
  syncProcessesSupabaseCrm,
  syncPublicationActivities,
  updateMonitoringStatus,
} from "../../functions/lib/hmadv-ops.js";
import { reconcilePartesContacts } from "../../functions/lib/hmadv-contacts.js";
import {
  bulkSaveSuggestedRelations,
  bulkUpdateProcessRelations,
  deleteProcessRelation as deleteManualProcessRelation,
  saveProcessRelation,
} from "./hmadv-ops.js";
import { runtimeEnv } from "./processos-post-core.js";
import { parseProcessNumbers } from "./processos-api-shared.js";

export function tryHandleRelationAction(action, body) {
  if (action === "salvar_relacao") return saveProcessRelation(body || {});
  if (action === "remover_relacao") return deleteManualProcessRelation(body?.id);
  if (action === "bulk_relacoes") {
    return bulkUpdateProcessRelations({
      ids: Array.isArray(body?.ids) ? body.ids : [],
      status: body?.status,
      remove: Boolean(body?.remove),
    });
  }
  if (action === "bulk_salvar_relacoes") {
    return bulkSaveSuggestedRelations({ items: Array.isArray(body?.items) ? body.items : [] });
  }
  return null;
}

export function tryHandleLoggedProcessAction(action, body, runLogged) {
  const processNumbers = parseProcessNumbers(body?.processNumbers);
  if (action === "backfill_audiencias") {
    return runLogged(() => backfillAudiencias(runtimeEnv, {
      processNumbers,
      limit: Number(body?.limit || 100),
      apply: Boolean(body?.apply),
    }));
  }
  if (action === "run_sync_worker") return runLogged(() => runSyncWorker(runtimeEnv));
  if (action === "push_orfaos") {
    return runLogged(() => pushOrphanAccounts(runtimeEnv, { processNumbers, limit: Number(body?.limit || 5) }));
  }
  if (action === "repair_freshsales_accounts") {
    return runLogged(() => repairFreshsalesAccounts(runtimeEnv, { processNumbers, limit: Number(body?.limit || 1) }));
  }
  if (action === "enriquecer_datajud") {
    return runLogged(() => enrichProcessesViaDatajud(runtimeEnv, {
      processNumbers,
      limit: Number(body?.limit || 5),
      intent: String(body?.intent || ""),
    }));
  }
  if (action === "sync_supabase_crm") {
    return runLogged(() => syncProcessesSupabaseCrm(runtimeEnv, {
      processNumbers,
      limit: Number(body?.limit || 1),
      intent: String(body?.intent || ""),
    }));
  }
  if (action === "sincronizar_movimentacoes_activity") {
    return runLogged(() => syncMovementActivities(runtimeEnv, { processNumbers, limit: Number(body?.limit || 5) }));
  }
  if (action === "sincronizar_publicacoes_activity") {
    return runLogged(() => syncPublicationActivities(runtimeEnv, { processNumbers, limit: Number(body?.limit || 5) }));
  }
  if (action === "reconciliar_partes_contatos") {
    return runLogged(() => reconcilePartesContacts(runtimeEnv, { processNumbers, limit: Number(body?.limit || 10), apply: true }));
  }
  if (action === "auditoria_sync") return runLogged(() => runProcessAudit(runtimeEnv));
  if (action === "monitoramento_status") {
    return runLogged(() => updateMonitoringStatus(runtimeEnv, {
      processNumbers,
      active: Boolean(body?.active),
      limit: Number(body?.limit || 20),
    }));
  }
  return null;
}
