import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  getAgentLabDashboard,
  jsonError,
  jsonOk,
  syncFreshsalesActivitiesIntoAgentLab,
  syncWorkspaceConversations,
} from "../../lib/agentlab/server.js";

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const data = await getAgentLabDashboard(context.env);
    return jsonOk({ runs: data.intelligence.syncRuns || [] });
  } catch (error) {
    return jsonError(error, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const body = await context.request.json();
    const action = String(body.action || "").trim();

    if (action === "sync_workspace_conversations") {
      const result = await syncWorkspaceConversations(context.env);
      return jsonOk({ result });
    }

    if (action === "sync_freshsales_activities") {
      const result = await syncFreshsalesActivitiesIntoAgentLab(context.env, Number(body.limit || 25));
      return jsonOk({ result });
    }

    return jsonError(new Error("Acao de sync invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
