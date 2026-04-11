<<<<<<< HEAD
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
=======
import { fetchSupabaseAdmin, requireAdminApiAccess } from "../../lib/admin/server.js";

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function getGovernance() {
  const profileParams = new URLSearchParams();
  profileParams.set(
    "select",
    "id,agent_ref,agent_name,owner_name,business_goal,persona_prompt,response_policy,knowledge_strategy,workflow_strategy,handoff_rules,settings,metrics,status,updated_at"
  );
  profileParams.set("order", "updated_at.desc");

  const queueParams = new URLSearchParams();
  queueParams.set(
    "select",
    "id,agent_ref,category,title,description,priority,status,source_channel,sprint_bucket,metadata,updated_at"
  );
  queueParams.set("order", "updated_at.desc");
  queueParams.set("limit", "100");

  const [profiles, queue] = await Promise.all([
    fetchSupabaseAdmin(`agentlab_agent_profiles?${profileParams.toString()}`),
    fetchSupabaseAdmin(`agentlab_improvement_queue?${queueParams.toString()}`),
  ]);

  return {
    profiles: asArray(profiles),
    queue: asArray(queue),
  };
}

async function updateProfile(body) {
  const agentRef = String(body.agentRef || body.agent_ref || "").trim();
  if (!agentRef) {
    throw new Error("agentRef e obrigatorio para atualizar o perfil do agente.");
  }

  const payload = {
    agent_ref: agentRef,
    agent_name: body.agentName || body.agent_name || null,
    owner_name: body.ownerName || body.owner_name || null,
    business_goal: body.businessGoal || body.business_goal || null,
    persona_prompt: body.personaPrompt || body.persona_prompt || null,
    response_policy: body.responsePolicy || body.response_policy || null,
    knowledge_strategy: normalizeStringArray(body.knowledgeStrategy || body.knowledge_strategy),
    workflow_strategy: normalizeStringArray(body.workflowStrategy || body.workflow_strategy),
    handoff_rules: normalizeStringArray(body.handoffRules || body.handoff_rules),
    settings: normalizeObject(body.settings),
    metrics: normalizeObject(body.metrics),
    status: body.status || "active",
  };

  const inserted = await fetchSupabaseAdmin("agentlab_agent_profiles?on_conflict=agent_ref", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
  });

  return asArray(inserted)[0] || payload;
}

async function updateQueueItem(body) {
  const itemId = String(body.id || "").trim();
  if (!itemId) {
    throw new Error("id e obrigatorio para atualizar o item da fila.");
  }

  const patch = {};

  if (body.status) patch.status = body.status;
  if (body.priority) patch.priority = body.priority;
  if (body.sprintBucket || body.sprint_bucket) patch.sprint_bucket = body.sprintBucket || body.sprint_bucket;
  if (body.description) patch.description = body.description;
  if (body.metadata && typeof body.metadata === "object") patch.metadata = body.metadata;

  if (!Object.keys(patch).length) {
    throw new Error("Nenhum campo valido foi enviado para atualizar a fila.");
  }

  const updated = await fetchSupabaseAdmin(`agentlab_improvement_queue?id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });

  return asArray(updated)[0] || { id: itemId, ...patch };
}

export default async function handler(req, res) {
  const auth = await requireAdminApiAccess(req);
>>>>>>> codex/hmadv-tpu-fase53
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

<<<<<<< HEAD
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
=======
  if (req.method === "GET") {
    try {
      const governance = await getGovernance();
      return res.status(200).json({ ok: true, governance });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Falha ao carregar governance." });
    }
  }

  if (req.method === "POST") {
    try {
      const action = req.body?.action;

      if (action === "update_profile") {
        const profile = await updateProfile(req.body);
        return res.status(200).json({ ok: true, profile });
      }

      if (action === "update_queue_item") {
        const item = await updateQueueItem(req.body);
        return res.status(200).json({ ok: true, item });
      }

      return res.status(400).json({ ok: false, error: "Acao administrativa nao suportada." });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : "Falha ao atualizar governance." });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
>>>>>>> codex/hmadv-tpu-fase53
}
