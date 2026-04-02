import { AGENTLAB_CRM_AUTOMATION_RULES } from "../../lib/agentlab/catalog.js";
import { dispatchCrmAutomation } from "./crm-dispatcher.js";

function cleanEnvValue(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function getSupabaseContext(env) {
  const supabaseUrl = cleanEnvValue(env.SUPABASE_URL) || cleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL) || null;
  const supabaseKey = cleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) || null;
  return { supabaseUrl, supabaseKey };
}

async function supabaseRequest(env, path, init = {}) {
  const { supabaseUrl, supabaseKey } = getSupabaseContext(env);
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Configuracao do Supabase incompleta para automacao CRM.");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Supabase request failed with status ${response.status}`);
  }

  return response.status === 204 ? null : response.json();
}

function isMissingSourceError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("PGRST205") ||
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function buildPlannedActions(rule, context) {
  const actions = [];
  if (rule.lifecycle_stage) actions.push(`Atualizar ciclo de vida para "${rule.lifecycle_stage}"`);
  if (rule.meeting_stage) actions.push(`Atualizar etapa de reunião para "${rule.meeting_stage}"`);
  if (rule.negotiation_stage) actions.push(`Atualizar negociação para "${rule.negotiation_stage}"`);
  if (rule.closing_stage) actions.push(`Atualizar fechamento para "${rule.closing_stage}"`);
  if (rule.client_stage) actions.push(`Atualizar cliente para "${rule.client_stage}"`);
  if (rule.sequence_name) actions.push(`Disparar sequência "${rule.sequence_name}"`);
  if (rule.journey_name) actions.push(`Disparar jornada "${rule.journey_name}"`);
  if (rule.email_template) actions.push(`Usar template de e-mail "${rule.email_template}"`);
  if (rule.whatsapp_template) actions.push(`Usar template de WhatsApp "${rule.whatsapp_template}"`);
  if (context?.crm?.appointmentId) actions.push(`Usar appointment ${context.crm.appointmentId} como referência operacional`);
  return actions;
}

async function loadAutomationRules(env) {
  try {
    const rows = await supabaseRequest(
      env,
      "agentlab_crm_automation_rules?select=*&enabled=is.true&order=event_key.asc,created_at.asc"
    );
    if (Array.isArray(rows) && rows.length) {
      return rows;
    }
  } catch (error) {
    if (!isMissingSourceError(error)) {
      throw error;
    }
  }

  return AGENTLAB_CRM_AUTOMATION_RULES.filter((rule) => rule.enabled !== false);
}

async function persistAutomationRuns(env, runs) {
  if (!runs.length) return { persisted: false, warnings: [] };

  try {
    await supabaseRequest(env, "agentlab_crm_automation_runs", {
      method: "POST",
      body: JSON.stringify(runs),
      headers: { Prefer: "return=representation" },
    });
    return { persisted: true, warnings: [] };
  } catch (error) {
    if (isMissingSourceError(error)) {
      return {
        persisted: false,
        warnings: ["A tabela agentlab_crm_automation_runs ainda nao existe. As automacoes foram avaliadas, mas nao persistidas."],
      };
    }
    throw error;
  }
}

function generateRunId() {
  return crypto.randomUUID();
}

async function loadResourceMap(env) {
  try {
    const rows = await supabaseRequest(
      env,
      "agentlab_crm_resource_map?select=*&order=resource_type.asc,resource_key.asc"
    );
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    if (isMissingSourceError(error)) {
      return [];
    }
    throw error;
  }
}

function slugifyKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function resolveResource(resourceMap, resourceType, resourceName) {
  const normalizedName = String(resourceName || "").trim().toLowerCase();
  const desiredKey = `crm.${resourceType}.${slugifyKey(resourceName)}`;
  return (
    resourceMap.find((item) => item.resource_type === resourceType && String(item.resource_key || "").toLowerCase() === desiredKey) ||
    resourceMap.find((item) => item.resource_type === resourceType && String(item.resource_name || "").trim().toLowerCase() === normalizedName) ||
    null
  );
}

async function persistActionQueue(env, rows) {
  if (!rows.length) return { persisted: false, warnings: [] };

  try {
    await supabaseRequest(env, "agentlab_crm_action_queue", {
      method: "POST",
      body: JSON.stringify(rows),
      headers: { Prefer: "return=representation" },
    });
    return { persisted: true, warnings: [] };
  } catch (error) {
    if (isMissingSourceError(error)) {
      return {
        persisted: false,
        warnings: ["A tabela agentlab_crm_action_queue ainda nao existe. Sequences e journeys foram planejadas, mas nao persistidas."],
      };
    }
    throw error;
  }
}

async function createActionQueueFromRuns(env, runs) {
  if (!runs.length) {
    return { actionQueue: [], warnings: [], persisted: false };
  }

  const resourceMap = await loadResourceMap(env);
  const nowIso = new Date().toISOString();
  const rows = [];

  for (const run of runs) {
    if (run.sequence_name) {
      const resource = resolveResource(resourceMap, "sequence", run.sequence_name);
      rows.push({
        id: generateRunId(),
        automation_run_id: run.id,
        source_ref: run.source_ref || null,
        event_key: run.event_key,
        action_type: "execute_sequence",
        resource_type: "sequence",
        resource_key: resource?.resource_key || `crm.sequence.${slugifyKey(run.sequence_name)}`,
        resource_id: resource?.resource_id || null,
        resource_name: resource?.resource_name || run.sequence_name,
        status: resource?.resource_id ? "ready" : "missing_mapping",
        execution_mode: run.execution_mode || "semi_auto",
        detail: resource?.resource_id
          ? `Sequence pronta para execucao guiada: ${resource.resource_name || run.sequence_name}.`
          : `Sequence sem mapeamento salvo no AgentLab: ${run.sequence_name}.`,
        payload: {
          event_key: run.event_key,
          source_ref: run.source_ref || null,
          rule_id: run.rule_id || null,
          planned_action: "sequence",
          resource_metadata: resource?.metadata || {},
        },
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    if (run.journey_name) {
      const resource = resolveResource(resourceMap, "journey", run.journey_name);
      rows.push({
        id: generateRunId(),
        automation_run_id: run.id,
        source_ref: run.source_ref || null,
        event_key: run.event_key,
        action_type: "execute_journey",
        resource_type: "journey",
        resource_key: resource?.resource_key || `crm.journey.${slugifyKey(run.journey_name)}`,
        resource_id: resource?.resource_id || null,
        resource_name: resource?.resource_name || run.journey_name,
        status: resource?.resource_id ? "ready" : "missing_mapping",
        execution_mode: run.execution_mode || "semi_auto",
        detail: resource?.resource_id
          ? `Journey pronta para execucao guiada: ${resource.resource_name || run.journey_name}.`
          : `Journey sem mapeamento salvo no AgentLab: ${run.journey_name}.`,
        payload: {
          event_key: run.event_key,
          source_ref: run.source_ref || null,
          rule_id: run.rule_id || null,
          planned_action: "journey",
          resource_metadata: resource?.metadata || {},
        },
        created_at: nowIso,
        updated_at: nowIso,
      });
    }
  }

  const persistence = await persistActionQueue(env, rows);
  return {
    actionQueue: rows,
    warnings: persistence.warnings,
    persisted: persistence.persisted,
  };
}

export async function executeCrmAutomationRules(env, eventKey, context = {}) {
  const rules = await loadAutomationRules(env);
  const matchedRules = rules.filter((rule) => String(rule.event_key || "") === String(eventKey || "") && rule.enabled !== false);

  const nowIso = new Date().toISOString();
  const runs = matchedRules.map((rule) => ({
    id: generateRunId(),
    rule_id: rule.id || null,
    event_key: eventKey,
    source_system: context.sourceSystem || "agendamento",
    source_ref: context.sourceRef || context.agendamento?.id || null,
    agent_ref: context.agentRef || "dotobot-ai",
    status: rule.execution_mode === "auto" ? "ready" : "planned",
    execution_mode: rule.execution_mode || "manual",
    pipeline_stage: rule.pipeline_stage || null,
    lifecycle_stage: rule.lifecycle_stage || null,
    meeting_stage: rule.meeting_stage || null,
    negotiation_stage: rule.negotiation_stage || null,
    closing_stage: rule.closing_stage || null,
    client_stage: rule.client_stage || null,
    sequence_name: rule.sequence_name || null,
    journey_name: rule.journey_name || null,
    email_template: rule.email_template || null,
    whatsapp_template: rule.whatsapp_template || null,
    notes: rule.notes || null,
    planned_actions: buildPlannedActions(rule, context),
    payload: {
      rule,
      agendamento: context.agendamento || null,
      crm: context.crm || null,
      zoom: context.zoom || null,
    },
    created_at: nowIso,
    updated_at: nowIso,
  }));

  const persistence = await persistAutomationRuns(env, runs);
  const actionQueue = await createActionQueueFromRuns(env, runs);
  const dispatch = await dispatchCrmAutomation(env, runs, context).catch((error) => ({
    dispatchRuns: [],
    warnings: [error.message],
    persisted: false,
  }));

  return {
    rulesMatched: matchedRules.length,
    runs,
    actionQueue: actionQueue.actionQueue,
    dispatchRuns: dispatch.dispatchRuns,
    warnings: [...persistence.warnings, ...actionQueue.warnings, ...dispatch.warnings],
    persisted: persistence.persisted,
    actionQueuePersisted: actionQueue.persisted,
    dispatchPersisted: dispatch.persisted,
  };
}
