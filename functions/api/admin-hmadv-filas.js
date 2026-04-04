import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  jsonError,
  jsonOk,
} from "../lib/hmadv-ops.js";
import { drainHmadvQueues, getHmadvQueueSnapshot } from "../lib/hmadv-runner.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return jsonError(new Error(auth.error), auth.status);

  try {
    const data = await getHmadvQueueSnapshot(context.env);
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return jsonError(new Error(auth.error), auth.status);

  try {
    const body = await context.request.json();
    const action = String(body.action || "");
    if (action !== "drain_all") {
      return jsonError(new Error("Acao POST invalida."), 400);
    }

    const data = await drainHmadvQueues(context.env, {
      maxChunks: Number(body.maxChunks || 8),
    });
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error, 500);
  }
}
