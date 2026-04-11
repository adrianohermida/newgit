import { fetchSupabaseAdmin } from "./supabase-rest.js";

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

export async function getAgentLabGovernance(env) {
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

  const [profilesRaw, queueRaw] = await Promise.all([
    fetchSupabaseAdmin(env, `agentlab_agent_profiles?${profileParams.toString()}`),
    fetchSupabaseAdmin(env, `agentlab_improvement_queue?${queueParams.toString()}`),
  ]);

  return {
    profiles: asArray(profilesRaw),
    queue: asArray(queueRaw),
  };
}

export async function updateAgentLabProfile(env, payload = {}) {
  const agentRef = String(payload.agentRef || payload.agent_ref || "").trim();
  if (!agentRef) {
    throw new Error("agentRef e obrigatorio para atualizar o perfil do agente.");
  }

  const updatePayload = {
    agent_ref: agentRef,
    agent_name: payload.agentName || payload.agent_name || null,
    owner_name: payload.ownerName || payload.owner_name || null,
    business_goal: payload.businessGoal || payload.business_goal || null,
    persona_prompt: payload.personaPrompt || payload.persona_prompt || null,
    response_policy: payload.responsePolicy || payload.response_policy || null,
    knowledge_strategy: normalizeStringArray(payload.knowledgeStrategy || payload.knowledge_strategy),
    workflow_strategy: normalizeStringArray(payload.workflowStrategy || payload.workflow_strategy),
    handoff_rules: normalizeStringArray(payload.handoffRules || payload.handoff_rules),
    settings: normalizeObject(payload.settings),
    metrics: normalizeObject(payload.metrics),
    status: payload.status || "active",
  };

  const inserted = await fetchSupabaseAdmin(env, "agentlab_agent_profiles?on_conflict=agent_ref", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(updatePayload),
  });

  return asArray(inserted)[0] || updatePayload;
}

export async function updateAgentLabQueueItem(env, payload = {}) {
  const itemId = String(payload.id || "").trim();
  if (!itemId) {
    throw new Error("id e obrigatorio para atualizar o item da fila.");
  }

  const patch = {};

  if (payload.status) {
    patch.status = payload.status;
  }

  if (payload.priority) {
    patch.priority = payload.priority;
  }

  if (payload.sprintBucket || payload.sprint_bucket) {
    patch.sprint_bucket = payload.sprintBucket || payload.sprint_bucket;
  }

  if (payload.description) {
    patch.description = payload.description;
  }

  if (payload.metadata && typeof payload.metadata === "object") {
    patch.metadata = payload.metadata;
  }

  if (!Object.keys(patch).length) {
    throw new Error("Nenhum campo valido foi enviado para atualizar a fila.");
  }

  const updated = await fetchSupabaseAdmin(env, `agentlab_improvement_queue?id=eq.${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(patch),
  });

  return asArray(updated)[0] || { id: itemId, ...patch };
}
