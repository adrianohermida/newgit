import { requireAdminAccess } from "../lib/admin-auth.js";
import { getAgentLabDashboard, jsonError, jsonOk, runTrainingScenario } from "../../lib/agentlab/server.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError({
      message: auth.error || "Nao autorizado.",
      errorType: auth.errorType || "authentication",
      details: auth.details || null,
    }, auth.status);
  }

  try {
    const data = await getAgentLabDashboard(context.env);
    return jsonOk({ training: data.training, governance: data.governance });
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError({
      message: auth.error || "Nao autorizado.",
      errorType: auth.errorType || "authentication",
      details: auth.details || null,
    }, auth.status);
  }

  try {
    const body = await context.request.json();
    const result = await runTrainingScenario(context.env, body);
    return jsonOk({ result });
  } catch (error) {
    return jsonError(error, 500);
  }
}
