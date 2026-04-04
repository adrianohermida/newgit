import { jsonError, jsonOk, logAdminOperation } from "../lib/hmadv-ops.js";
import {
  drainHmadvQueues,
  getHmadvQueueSnapshot,
  requireHmadvRunnerAccess,
} from "../lib/hmadv-runner.js";

export async function onRequestGet(context) {
  const auth = requireHmadvRunnerAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const data = await getHmadvQueueSnapshot(context.env);
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function onRequestPost(context) {
  const auth = requireHmadvRunnerAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const body = await context.request.json().catch(() => ({}));
    const action = String(body.action || "drain_all");
    if (action !== "drain_all") {
      return jsonError(new Error("Acao POST invalida."), 400);
    }

    const data = await drainHmadvQueues(context.env, {
      maxChunks: Number(body.maxChunks || 2),
    });
    await logAdminOperation(context.env, {
      modulo: "runner",
      acao: "drain_all",
      status: "success",
      payload: { maxChunks: Number(body.maxChunks || 2) },
      result: data,
    });
    return jsonOk({ data });
  } catch (error) {
    await logAdminOperation(context.env, {
      modulo: "runner",
      acao: "drain_all",
      status: "error",
      payload: {},
      error: error.message || "Falha no runner HMADV.",
    });
    return jsonError(error, 500);
  }
}
