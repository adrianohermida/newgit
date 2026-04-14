import { createProcessAdminJob, logAdminOperation, processProcessAdminJob } from "../../functions/lib/hmadv-ops.js";
import { runtimeEnv, buildProcessActionLogName, isJobInfraError, isQueueOverloadError } from "./processos-post-core.js";
import { drainProcessJobs, runInlineProcessAction } from "./processos-post-jobs.js";
import { parseProcessNumbers } from "./processos-api-shared.js";

export async function handleCreateProcessJob(body) {
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
    return handleInlineJobFallback(body);
  }
}

async function handleInlineJobFallback(body) {
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

export async function handleProcessJobAction(action, body) {
  if (action === "create_job") return handleCreateProcessJob(body);
  if (action === "run_job_chunk") {
    return { ok: true, data: await processProcessAdminJob(runtimeEnv, body?.id) };
  }
  if (action !== "run_pending_jobs") return null;
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
