import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  executeCrmDispatchRun,
  createImprovementQueueItem,
  jsonError,
  jsonOk,
  upsertIntent,
  upsertKnowledgeSource,
  upsertQuickReply,
  upsertCrmAutomationRule,
  upsertCrmResourceMap,
  upsertMessageTemplate,
  upsertWorkflowLibraryItem,
  updateCrmActionQueueItem,
  updateCrmDispatchRun,
  updateIncidentItem,
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

    if (action === "create_queue_item") {
      const item = await createImprovementQueueItem(context.env, body);
      return jsonOk({ item });
    }

    if (action === "update_incident_item") {
      const item = await updateIncidentItem(context.env, body);
      return jsonOk({ item });
    }

    if (action === "upsert_crm_rule") {
      const item = await upsertCrmAutomationRule(context.env, body);
      return jsonOk({ item });
    }

    if (action === "upsert_crm_resource") {
      const item = await upsertCrmResourceMap(context.env, body);
      return jsonOk({ item });
    }

    if (action === "upsert_message_template") {
      const item = await upsertMessageTemplate(context.env, body);
      return jsonOk({ item });
    }

    if (action === "upsert_quick_reply") {
      const item = await upsertQuickReply(context.env, body);
      return jsonOk({ item });
    }

    if (action === "upsert_intent") {
      const item = await upsertIntent(context.env, body);
      return jsonOk({ item });
    }

    if (action === "upsert_knowledge_source") {
      const item = await upsertKnowledgeSource(context.env, body);
      return jsonOk({ item });
    }

    if (action === "upsert_workflow_library_item") {
      const item = await upsertWorkflowLibraryItem(context.env, body);
      return jsonOk({ item });
    }

    if (action === "update_dispatch_run") {
      const item = await updateCrmDispatchRun(context.env, body);
      return jsonOk({ item });
    }

    if (action === "execute_dispatch_run") {
      const item = await executeCrmDispatchRun(context.env, body);
      return jsonOk({ item });
    }

    if (action === "update_action_queue_item") {
      const item = await updateCrmActionQueueItem(context.env, body);
      return jsonOk({ item });
    }

    return jsonError(new Error("Acao de governanca invalida."), 400);
  } catch (error) {
    return jsonError(error, 500);
  }
}
