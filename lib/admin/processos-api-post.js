import {
  backfillAudiencias,
  createProcessAdminJob,
  enrichProcessesViaDatajud,
  getProcessAdminJob,
  listAdminJobs,
  logAdminOperation,
  processProcessAdminJob,
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
import { drainHmadvQueues } from "../../functions/lib/hmadv-runner.js";
import {
  bulkSaveSuggestedRelations,
  bulkUpdateProcessRelations,
  deleteProcessRelation as deleteManualProcessRelation,
  saveProcessRelation,
} from "./hmadv-ops.js";
import { parseProcessNumbers } from "./processos-api-shared.js";

const runtimeEnv = process.env;

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

function buildProcessActionLogName(action, payload = {}, suffix = "") {
  const baseAction = String(action || "").trim();
  const intent = String(payload?.intent || "").trim();
  const variant = baseAction === "enriquecer_datajud" && intent ? `${baseAction}_${intent}` : baseAction;
  return suffix ? `${variant}_${suffix}` : variant;
}

async function runInlineProcessAction(action, body = {}) {
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
    return reconcilePartesContacts(runtimeEnv, {
      processNumbers,
      limit: requestedLimit || 10,
      apply: true,
    });
  }
  if (action === "auditoria_sync") {
    return runProcessAudit(runtimeEnv);
  }
  if (action === "run_sync_worker") {
    return runSyncWorker(runtimeEnv);
  }
  throw new Error(`Acao inline nao suportada: ${action}`);
}

async function drainProcessJobs({ preferredId = null, maxChunks = 1 } = {}) {
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
      if (job && !["pending", "running"].includes(String(job.status || ""))) {
        job = null;
      }
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

export async function handleProcessosPost(body) {
  const action = String(body?.action || "");

  async function runLogged(fn) {
    const loggedAction = buildProcessActionLogName(action, body);
    try {
      const data = await fn();
      await logAdminOperation(runtimeEnv, {
        modulo: "processos",
        acao: loggedAction,
        status: "success",
        payload: body,
        result: data,
      });
      return { ok: true, data };
    } catch (error) {
      await logAdminOperation(runtimeEnv, {
        modulo: "processos",
        acao: loggedAction,
        status: "error",
        payload: body,
        error: error.message || "Falha operacional.",
      });
      throw error;
    }
  }

  if (action === "backfill_audiencias") {
    return runLogged(async () => backfillAudiencias(runtimeEnv, {
      processNumbers: parseProcessNumbers(body?.processNumbers),
      limit: Number(body?.limit || 100),
      apply: Boolean(body?.apply),
    }));
  }
  if (action === "run_sync_worker") {
    return runLogged(async () => runSyncWorker(runtimeEnv));
  }
  if (action === "create_job") {
    try {
      const data = await createProcessAdminJob(runtimeEnv, {
        action: String(body?.jobAction || ""),
        payload: {
          processNumbers: parseProcessNumbers(body?.processNumbers),
          limit: Number(body?.limit || 0),
          intent: String(body?.intent || ""),
          jobControl: body?.jobControl || null,
        },
      });
      return { ok: true, data };
    } catch (error) {
      if (isQueueOverloadError(error)) {
        return {
          ok: true,
          data: {
            legacy_inline: true,
            action: String(body?.jobAction || ""),
            reason: "queue_overload",
            result: { ok: false, skipped: true, error: error.message || "Fila em sobrecarga." },
          },
        };
      }
      if (!isJobInfraError(error)) throw error;
      try {
        const result = await runInlineProcessAction(String(body?.jobAction || ""), body);
        await logAdminOperation(runtimeEnv, {
          modulo: "processos",
          acao: buildProcessActionLogName(String(body?.jobAction || ""), body, "inline_fallback"),
          status: "success",
          payload: body,
          result,
        });
        return {
          ok: true,
          data: {
            legacy_inline: true,
            action: String(body?.jobAction || ""),
            reason: "operacao_jobs_unavailable",
            result,
          },
        };
      } catch (inlineError) {
        await logAdminOperation(runtimeEnv, {
          modulo: "processos",
          acao: buildProcessActionLogName(String(body?.jobAction || ""), body, "inline_fallback"),
          status: "error",
          payload: body,
          error: inlineError.message || "Falha no fallback inline.",
        });
        throw inlineError;
      }
    }
  }
  if (action === "run_job_chunk") {
    return { ok: true, data: await processProcessAdminJob(runtimeEnv, body?.id) };
  }
  if (action === "run_pending_jobs") {
    try {
      return {
        ok: true,
        data: await drainProcessJobs({
          preferredId: body?.id || null,
          maxChunks: Number(body?.maxChunks || 1),
        }),
      };
    } catch (error) {
      if (!isQueueOverloadError(error)) throw error;
      return {
        ok: true,
        data: {
          completedAll: false,
          chunksProcessed: 0,
          job: null,
          limited: true,
          error: error.message || "Fila em sobrecarga.",
        },
      };
    }
  }
  if (action === "push_orfaos") {
    return runLogged(async () => pushOrphanAccounts(runtimeEnv, {
      processNumbers: parseProcessNumbers(body?.processNumbers),
      limit: Number(body?.limit || 5),
    }));
  }
  if (action === "repair_freshsales_accounts") {
    return runLogged(async () => repairFreshsalesAccounts(runtimeEnv, {
      processNumbers: parseProcessNumbers(body?.processNumbers),
      limit: Number(body?.limit || 1),
    }));
  }
  if (action === "enriquecer_datajud") {
    return runLogged(async () => enrichProcessesViaDatajud(runtimeEnv, {
      processNumbers: parseProcessNumbers(body?.processNumbers),
      limit: Number(body?.limit || 5),
      intent: String(body?.intent || ""),
    }));
  }
  if (action === "sync_supabase_crm") {
    return runLogged(async () => syncProcessesSupabaseCrm(runtimeEnv, {
      processNumbers: parseProcessNumbers(body?.processNumbers),
      limit: Number(body?.limit || 1),
      intent: String(body?.intent || ""),
    }));
  }
  if (action === "sincronizar_movimentacoes_activity") {
    return runLogged(async () => syncMovementActivities(runtimeEnv, {
      processNumbers: parseProcessNumbers(body?.processNumbers),
      limit: Number(body?.limit || 5),
    }));
  }
  if (action === "sincronizar_publicacoes_activity") {
    return runLogged(async () => syncPublicationActivities(runtimeEnv, {
      processNumbers: parseProcessNumbers(body?.processNumbers),
      limit: Number(body?.limit || 5),
    }));
  }
  if (action === "reconciliar_partes_contatos") {
    return runLogged(async () => reconcilePartesContacts(runtimeEnv, {
      processNumbers: parseProcessNumbers(body?.processNumbers),
      limit: Number(body?.limit || 10),
      apply: true,
    }));
  }
  if (action === "auditoria_sync") {
    return runLogged(async () => runProcessAudit(runtimeEnv));
  }
  if (action === "executar_integracao_total_hmadv") {
    return runLogged(async () => drainHmadvQueues(runtimeEnv, {
      maxChunks: Number(body?.maxChunks || 2),
    }));
  }
  if (action === "monitoramento_status") {
    return runLogged(async () => updateMonitoringStatus(runtimeEnv, {
      processNumbers: parseProcessNumbers(body?.processNumbers),
      active: Boolean(body?.active),
      limit: Number(body?.limit || 20),
    }));
  }
  if (action === "salvar_relacao") {
    return { ok: true, data: await saveProcessRelation(body || {}) };
  }
  if (action === "remover_relacao") {
    return { ok: true, data: await deleteManualProcessRelation(body?.id) };
  }
  if (action === "bulk_relacoes") {
    return {
      ok: true,
      data: await bulkUpdateProcessRelations({
        ids: Array.isArray(body?.ids) ? body.ids : [],
        status: body?.status,
        remove: Boolean(body?.remove),
      }),
    };
  }
  if (action === "bulk_salvar_relacoes") {
    return {
      ok: true,
      data: await bulkSaveSuggestedRelations({
        items: Array.isArray(body?.items) ? body.items : [],
      }),
    };
  }
  return null;
}
