import { requireAdminNode } from "../../lib/admin/node-auth.js";
import {
  executeCrmDispatchRun,
  createImprovementQueueItem,
  upsertIntent,
  upsertKnowledgeSource,
  upsertQuickReply,
  upsertCrmAutomationRule,
  upsertCrmResourceMap,
  upsertMessageTemplate,
  upsertWorkflowLibraryItem,
  updateAgentLabProfile,
  updateCrmActionQueueItem,
  updateCrmDispatchRun,
  updateIncidentItem,
  updateImprovementQueueItem,
} from "../../lib/agentlab/server.js";

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
      errorType: auth.errorType || "authentication",
      details: auth.details || null,
    });
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const action = String(req.body?.action || "").trim();
    if (action === "update_profile") {
      const item = await updateAgentLabProfile(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "update_queue_item") {
      const item = await updateImprovementQueueItem(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "create_queue_item") {
      const item = await createImprovementQueueItem(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "update_incident_item") {
      const item = await updateIncidentItem(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "upsert_crm_rule") {
      const item = await upsertCrmAutomationRule(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "upsert_crm_resource") {
      const item = await upsertCrmResourceMap(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "upsert_message_template") {
      const item = await upsertMessageTemplate(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "upsert_quick_reply") {
      const item = await upsertQuickReply(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "upsert_intent") {
      const item = await upsertIntent(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "upsert_knowledge_source") {
      const item = await upsertKnowledgeSource(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "upsert_workflow_library_item") {
      const item = await upsertWorkflowLibraryItem(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "update_dispatch_run") {
      const item = await updateCrmDispatchRun(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "execute_dispatch_run") {
      const item = await executeCrmDispatchRun(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "update_action_queue_item") {
      const item = await updateCrmActionQueueItem(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    return res.status(400).json({ ok: false, error: "Acao de governanca invalida." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao salvar governanca." });
  }
}
