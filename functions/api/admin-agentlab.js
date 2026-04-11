import { requireAdminAccess } from "../lib/admin-auth.js";
import { getAgentLabDashboard, jsonError, jsonOk } from "../../lib/agentlab/server.js";

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
    return jsonOk({ data });
  } catch (error) {
    return jsonError(error, 500);
  }
}
