import { logAdminOperation } from "../../functions/lib/hmadv-ops.js";
import { drainHmadvQueues } from "../../functions/lib/hmadv-runner.js";
import { buildProcessActionLogName, runtimeEnv } from "./processos-post-core.js";
import { tryHandleLoggedProcessAction, tryHandleRelationAction } from "./processos-post-direct-actions.js";
import { handleProcessJobAction } from "./processos-post-job-actions.js";

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

  const relationResponse = await tryHandleRelationAction(action, body);
  if (relationResponse) return { ok: true, data: relationResponse };

  const jobResponse = await handleProcessJobAction(action, body);
  if (jobResponse) return jobResponse;

  if (action === "executar_integracao_total_hmadv") {
    return runLogged(() => drainHmadvQueues(runtimeEnv, { maxChunks: Number(body?.maxChunks || 2) }));
  }

  const directResponse = await tryHandleLoggedProcessAction(action, body, runLogged);
  if (directResponse) return directResponse;
  return null;
}
