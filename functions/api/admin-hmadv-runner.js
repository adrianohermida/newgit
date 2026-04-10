import { jsonError, jsonOk, logAdminOperation, runFullIntegrationCron } from "../lib/hmadv-ops.js";
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
    if (!["drain_all", "cron_integracao_total"].includes(action)) {
      return jsonError(new Error("Acao POST invalida."), 400);
    }

    const data = action === "cron_integracao_total"
      ? (() => {
          const integrationPayload = {
            scanLimit: Number(body.scanLimit || 50),
            monitorLimit: Number(body.monitorLimit || 100),
            movementLimit: Number(body.movementLimit || 120),
            advisePages: Number(body.advisePages || 2),
            advisePerPage: Number(body.advisePerPage || 50),
            publicacoesBatch: Number(body.publicacoesBatch || 20),
          };
          return runFullIntegrationCron(context.env, integrationPayload)
            .then(async (integration) => {
              const drain = await drainHmadvQueues(context.env, {
                maxChunks: Number(body.maxChunks || 2),
              });
              return { ...drain, integration };
            });
        })()
      : await drainHmadvQueues(context.env, {
          maxChunks: Number(body.maxChunks || 2),
        });
    await logAdminOperation(context.env, {
      modulo: "runner",
      acao: action,
      status: "success",
      payload: action === "cron_integracao_total"
        ? {
            scanLimit: Number(body.scanLimit || 50),
            monitorLimit: Number(body.monitorLimit || 100),
            movementLimit: Number(body.movementLimit || 120),
            advisePages: Number(body.advisePages || 2),
            advisePerPage: Number(body.advisePerPage || 50),
            publicacoesBatch: Number(body.publicacoesBatch || 20),
            maxChunks: Number(body.maxChunks || 2),
          }
        : { maxChunks: Number(body.maxChunks || 2) },
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
