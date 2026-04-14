import {
  backfillAudiencias,
  enrichProcessesViaDatajud,
  getProcessAdminJob,
  listAdminJobs,
  processProcessAdminJob,
  pushOrphanAccounts,
  repairFreshsalesAccounts,
  runProcessAudit,
  runSyncWorker,
  syncMovementActivities,
  syncProcessesSupabaseCrm,
  syncPublicationActivities,
} from "../../functions/lib/hmadv-ops.js";
import { reconcilePartesContacts } from "../../functions/lib/hmadv-contacts.js";
import { parseProcessNumbers } from "./processos-api-shared.js";
import { runtimeEnv } from "./processos-post-core.js";

export async function runInlineProcessAction(action, body = {}) {
  const processNumbers = parseProcessNumbers(body.processNumbers);
  const requestedLimit = Number(body.limit || 0);
  if (action === "push_orfaos") {
    return pushOrphanAccounts(runtimeEnv, { processNumbers, limit: requestedLimit || 5 });
  }
  if (action === "repair_freshsales_accounts") {
    return repairFreshsalesAccounts(runtimeEnv, { processNumbers, limit: requestedLimit || 1 });
  }
  if (action === "enriquecer_datajud") {
    return enrichProcessesViaDatajud(runtimeEnv, {
      processNumbers,
      limit: requestedLimit || 5,
      intent: String(body.intent || ""),
    });
  }
  if (action === "sync_supabase_crm") {
    return syncProcessesSupabaseCrm(runtimeEnv, {
      processNumbers,
      limit: requestedLimit || 1,
      intent: String(body.intent || ""),
    });
  }
  if (action === "backfill_audiencias") {
    return backfillAudiencias(runtimeEnv, {
      processNumbers,
      limit: requestedLimit || 5,
      apply: Boolean(body.apply),
    });
  }
  if (action === "sincronizar_movimentacoes_activity") {
    return syncMovementActivities(runtimeEnv, { processNumbers, limit: requestedLimit || 5 });
  }
  if (action === "sincronizar_publicacoes_activity") {
    return syncPublicationActivities(runtimeEnv, { processNumbers, limit: requestedLimit || 5 });
  }
  if (action === "reconciliar_partes_contatos") {
    return reconcilePartesContacts(runtimeEnv, { processNumbers, limit: requestedLimit || 10, apply: true });
  }
  if (action === "auditoria_sync") {
    return runProcessAudit(runtimeEnv);
  }
  if (action === "run_sync_worker") {
    return runSyncWorker(runtimeEnv);
  }
  throw new Error(`Acao inline nao suportada: ${action}`);
}

export async function drainProcessJobs({ preferredId = null, maxChunks = 1 } = {}) {
  const safeChunks = Math.max(1, Math.min(Number(maxChunks || 1), 1));
  let chunks = 0;
  let activeJob = null;
  let completedAll = false;
  let nextPreferredId = preferredId;

  while (chunks < safeChunks) {
    let job = null;
    if (nextPreferredId) {
      job = await getProcessAdminJob(runtimeEnv, nextPreferredId);
      nextPreferredId = null;
      if (job && !["pending", "running"].includes(String(job.status || ""))) job = null;
    }
    if (!job) {
      const listed = await listAdminJobs(runtimeEnv, { modulo: "processos", limit: 20 });
      job = (listed.items || []).find((item) => ["pending", "running"].includes(String(item.status || ""))) || null;
    }
    if (!job?.id) {
      completedAll = true;
      break;
    }
    activeJob = await processProcessAdminJob(runtimeEnv, job.id);
    chunks += 1;
  }

  if (!completedAll) {
    const listed = await listAdminJobs(runtimeEnv, { modulo: "processos", limit: 20 });
    completedAll = !(listed.items || []).some((item) => ["pending", "running"].includes(String(item.status || "")));
    if (!activeJob?.id) activeJob = (listed.items || [])[0] || null;
  }

  return { job: activeJob, chunksProcessed: chunks, completedAll };
}
