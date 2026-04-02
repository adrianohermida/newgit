import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  jsonError,
  jsonOk,
  upsertCrmAutomationRule,
  updateAgentLabProfile,
  updateImprovementQueueItem,
} from "../../lib/agentlab/server.js";

export async function onRequestPatch(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const body = await context.request.json();
    const action = String(body.action || "").trim();

    if (action === "update_profile") {
      const item = await updateAgentLabProfile(context.env, body);
      return jsonOk({ item });
    }

    if (action === "update_queue_item") {
      const item = await updateImprovementQueueItem(context.env, body);
      return jsonOk({ item });
    }

    if (action === "upsert_crm_rule") {
      const item = await upsertCrmAutomationRule(context.env, body);
      return jsonOk({ item });
    }

    return jsonError(new Error("Acao de governanca invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
