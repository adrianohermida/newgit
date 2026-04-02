import { v4 as uuidv4 } from "uuid";
import {
  AGENTLAB_CRM_AUTOMATION_RULES,
  AGENTLAB_KNOWLEDGE_PACKS,
  AGENTLAB_ROLLOUT_PHASES,
  AGENTLAB_WEEKLY_SPRINT,
  AGENTLAB_WORKFLOW_BACKLOG,
} from "./catalog.js";
import {
  buildAgentMap,
  buildInsightSummary,
  normalizeAgentProfile,
  summarizeConversations,
  summarizeIncidents,
  summarizeTrainingRuns,
} from "./shared.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

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

function getSupabaseBaseUrl(env) {
  return cleanEnvValue(env.SUPABASE_URL) || cleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL) || null;
}

function getSupabaseServerKey(env) {
  return cleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) || null;
}

async function supabaseRequest(env, path, init = {}) {
  const baseUrl = getSupabaseBaseUrl(env);
  const apiKey = getSupabaseServerKey(env);

  if (!baseUrl || !apiKey) {
    throw new Error("Configuracao do Supabase incompleta para acesso administrativo.");
  }

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
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

async function safeQuery(env, source, path, warnings, fallback = []) {
  try {
    return await supabaseRequest(env, path);
  } catch (error) {
    warnings.push({
      source,
      message: `Fonte ${source} indisponivel neste ambiente. O painel seguira com dados parciais.`,
    });
    return fallback;
  }
}

function normalizeAgentRow(agent) {
  return {
    ...agent,
    name: agent.name || agent.nome || agent.agent_slug || "Agente",
    status: agent.status || (agent.active ? "ativo" : "inativo"),
    capabilities: Array.isArray(agent.capacidades) ? agent.capacidades : [],
  };
}

function normalizeCrmAutomationRule(rule) {
  return {
    id: rule.id,
    event_key: rule.event_key || rule.eventKey || "",
    title: rule.title || "Regra sem titulo",
    description: rule.description || null,
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
    enabled: Boolean(rule.enabled ?? true),
    execution_mode: rule.execution_mode || "manual",
    notes: rule.notes || null,
    updated_at: rule.updated_at || rule.created_at || null,
    source: rule.source || "custom",
  };
}

function summarizeCrmSnapshots(snapshots = []) {
  return snapshots.reduce((acc, item) => {
    const key = item.entity || "desconhecido";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function inferIssueMetadata(thread) {
  const message = String(thread.last_message || "").toLowerCase();
  const channel = String(thread.channel || "").toLowerCase();
  const handoff = Boolean(thread.handoff_required);

  if (thread.intent_label) return {};
  if (message.includes("boleto") || message.includes("pag")) {
    return { issue_category: "financeiro", urgency: "media" };
  }
  if (message.includes("processo") || message.includes("banco")) {
    return { issue_category: "processual", urgency: "alta" };
  }
  if (channel === "whatsapp" || handoff) {
    return { issue_category: "conversa_critica", urgency: "media" };
  }
  return { issue_category: "classificacao_gap", urgency: "media" };
}

async function upsertConversationThread(env, payload) {
  const existing = await supabaseRequest(
    env,
    `agentlab_conversation_threads?select=id&source_system=eq.${encodeURIComponent(
      payload.source_system
    )}&source_conversation_id=eq.${encodeURIComponent(payload.source_conversation_id)}&limit=1`
  ).catch(() => []);

  if (Array.isArray(existing) && existing[0]?.id) {
    return supabaseRequest(
      env,
      `agentlab_conversation_threads?id=eq.${encodeURIComponent(existing[0].id)}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          ...payload,
          updated_at: new Date().toISOString(),
        }),
        headers: {
          Prefer: "return=representation",
        },
      }
    );
  }

  return supabaseRequest(env, "agentlab_conversation_threads", {
    method: "POST",
    body: JSON.stringify({
      id: uuidv4(),
      ...payload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    headers: {
      Prefer: "return=representation",
    },
  });
}

async function ensureClassificationIncident(env, threads) {
  const missingIntent = threads.filter((item) => !item.intent_label);
  if (!missingIntent.length) return null;

  const existing = await supabaseRequest(
    env,
    "agentlab_incidents?select=id,status&category=eq.classification_gap&status=eq.open&limit=1"
  ).catch(() => []);

  if (Array.isArray(existing) && existing[0]?.id) {
    return existing[0];
  }

  const latest = missingIntent[0];
  const incident = {
    id: uuidv4(),
    source_system: "agentlab-sync",
    category: "classification_gap",
    severity: "media",
    status: "open",
    title: "Conversas sem intent_label",
    description: "Existem conversas importadas sem classificacao de intencao. Isso reduz roteamento, treino e previsao.",
    agent_ref: "dotobot-ai",
    conversation_id: latest.id,
    metadata: {
      affected_threads: missingIntent.length,
      channels: [...new Set(missingIntent.map((item) => item.channel).filter(Boolean))],
    },
    occurred_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await supabaseRequest(env, "agentlab_incidents", {
    method: "POST",
    body: JSON.stringify(incident),
    headers: { Prefer: "return=representation" },
  });

  return incident;
}

function buildFreshsalesCandidates(env) {
  const raw =
    cleanEnvValue(env.FRESHSALES_API_BASE) ||
    cleanEnvValue(env.FRESHSALES_BASE_URL) ||
    cleanEnvValue(env.FRESHSALES_DOMAIN);
  if (!raw) return [];

  const base = raw.startsWith("http") ? raw.replace(/\/+$/, "") : `https://${raw.replace(/\/+$/, "")}`;
  if (base.includes("/crm/sales/api") || base.includes("/api")) {
    return [base];
  }

  return [`${base}/crm/sales/api`, `${base}/api`];
}

async function fetchFreshsalesActivities(env, limit = 25) {
  const token = cleanEnvValue(env.FRESHSALES_API_KEY);
  const accessToken = cleanEnvValue(env.FRESHSALES_ACCESS_TOKEN);
  const candidates = buildFreshsalesCandidates(env);

  if (!candidates.length || (!token && !accessToken)) {
    throw new Error("Credenciais do Freshsales ausentes para sincronizacao viva.");
  }

  let lastError = null;
  for (const base of candidates) {
    for (const authHeader of [
      token ? { Authorization: `Token token=${token}` } : null,
      accessToken ? { Authorization: `Bearer ${accessToken}` } : null,
    ].filter(Boolean)) {
      const response = await fetch(`${base}/sales_activities?page=1&per_page=${Math.max(1, Math.min(limit, 100))}`, {
        headers: {
          Accept: "application/json",
          ...authHeader,
        },
      }).catch((error) => {
        lastError = error;
        return null;
      });

      if (!response) continue;
      if (!response.ok) {
        lastError = new Error(`Freshsales responded with ${response.status} for ${base}`);
        continue;
      }

      const payload = await response.json().catch(() => ({}));
      const items = payload.sales_activities || payload.activities || payload || [];
      if (Array.isArray(items)) {
        return { items, base };
      }
    }
  }

  throw lastError || new Error("Nao foi possivel consultar sales_activities no Freshsales.");
}

function buildTrainingPrompt({ scenario, profile }) {
  return [
    "Voce e um avaliador senior de agentes de IA para um escritorio juridico brasileiro.",
    "Analise a resposta ideal para o cenario abaixo e devolva JSON valido sem markdown.",
    "",
    `Agente: ${profile?.agent_ref || scenario.agent_ref || "dotobot-ai"}`,
    `Objetivo de negocio: ${profile?.business_goal || "Qualificar leads, orientar clientes e reduzir handoffs desnecessarios."}`,
    `Persona atual: ${profile?.persona_prompt || ""}`,
    `Politica de resposta: ${profile?.response_policy || ""}`,
    `Knowledge strategy: ${Array.isArray(profile?.knowledge_strategy) ? profile.knowledge_strategy.join("; ") : ""}`,
    `Workflow strategy: ${Array.isArray(profile?.workflow_strategy) ? profile.workflow_strategy.join("; ") : ""}`,
    `Handoff rules: ${Array.isArray(profile?.handoff_rules) ? profile.handoff_rules.join("; ") : ""}`,
    "",
    `Cenario: ${scenario.scenario_name}`,
    `Categoria: ${scenario.category}`,
    `Mensagem do usuario: ${scenario.user_message}`,
    `Intent esperada: ${scenario.expected_intent}`,
    `Outcome esperado: ${scenario.expected_outcome}`,
    `Workflow esperado: ${scenario.expected_workflow || "nenhum"}`,
    `Knowledge pack esperado: ${scenario.expected_knowledge_pack || "nenhum"}`,
    `Handoff esperado: ${scenario.expected_handoff ? "sim" : "nao"}`,
    "",
    "Devolva um JSON com esta estrutura:",
    "{\"generated_response\":\"...\",\"evaluator_summary\":\"...\",\"intent_detected\":\"...\",\"handoff_recommended\":false,\"scores\":{\"overall\":0.0,\"juridical_safety\":0.0,\"sales_effectiveness\":0.0,\"clarity\":0.0,\"workflow_fit\":0.0},\"recommendations\":[\"...\"]}",
  ].join("\n");
}

function extractJsonObject(text) {
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

async function callWorkersAi(env, prompt) {
  const accountId = cleanEnvValue(env.CLOUDFLARE_WORKER_ACCOUNT_ID);
  const apiToken = cleanEnvValue(env.CLOUDFLARE_WORKER_API_TOKEN);
  const model = cleanEnvValue(env.CLOUDFLARE_WORKERS_AI_MODEL) || "@cf/meta/llama-3.1-8b-instruct";

  if (!accountId || !apiToken) {
    throw new Error("Credenciais do Workers AI ausentes para executar o treinamento.");
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${encodeURIComponent(model)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: "Responda apenas com JSON valido." },
          { role: "user", content: prompt },
        ],
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Workers AI failed with status ${response.status}`);
  }

  const payload = await response.json();
  const resultText =
    payload?.result?.response ||
    payload?.result?.text ||
    payload?.result?.messages?.[0]?.content ||
    "";

  return {
    model,
    payload,
    parsed: extractJsonObject(resultText),
  };
}

export function jsonOk(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers: JSON_HEADERS,
  });
}

export function jsonError(error, status = 500) {
  return new Response(JSON.stringify({ ok: false, error: error?.message || String(error) }), {
    status,
    headers: JSON_HEADERS,
  });
}

export async function getAgentLabDashboard(env) {
  const warnings = [];

  const workspaceAgents = (await safeQuery(
    env,
    "workspace_ai_agents",
    "workspace_ai_agents?select=id,agent_slug,name,nome,status,active,capacidades,config,instructions,descricao,tipo,usage_count,total_credits_used,updated_at&order=created_at.asc",
    warnings
  )).map(normalizeAgentRow);

  const fallbackAgents = workspaceAgents.length
    ? []
    : (await safeQuery(
        env,
        "ai_agents",
        "ai_agents?select=id,name,status,workspace_id,config,metadata,created_at&limit=50",
        warnings
      )).map(normalizeAgentRow);

  const agentProfiles = (await safeQuery(
    env,
    "agentlab_agent_profiles",
    "agentlab_agent_profiles?select=*&order=created_at.asc",
    warnings
  )).map(normalizeAgentProfile);

  const improvementQueue = await safeQuery(
    env,
    "agentlab_improvement_queue",
    "agentlab_improvement_queue?select=*&order=created_at.desc",
    warnings
  );

  const freshsalesRuns = await safeQuery(
    env,
    "freshsales_sync_runs",
    "freshsales_sync_runs?select=id,entity,filter_name,status,records_synced,started_at,completed_at,source_total,source_base_url&order=started_at.desc&limit=12",
    warnings
  );

  const freshsalesSnapshots = await safeQuery(
    env,
    "freshsales_sync_snapshots",
    "freshsales_sync_snapshots?select=id,entity,source_id,display_name,status,synced_at,source_filter_name&order=synced_at.desc&limit=50",
    warnings
  );

  const workspaceConversations = await safeQuery(
    env,
    "conversas",
    "conversas?select=id,workspace_id,contato_id,processo_id,canal,status,assunto,ultima_mensagem,ultima_mensagem_at,updated_at&order=ultima_mensagem_at.desc.nullslast&limit=20",
    warnings
  );

  const conversationThreads = await safeQuery(
    env,
    "agentlab_conversation_threads",
    "agentlab_conversation_threads?select=*&order=last_message_at.desc.nullslast&limit=50",
    warnings
  );

  const incidents = await safeQuery(
    env,
    "agentlab_incidents",
    "agentlab_incidents?select=*&order=occurred_at.desc.nullslast&limit=20",
    warnings
  );

  const syncRuns = await safeQuery(
    env,
    "agentlab_source_sync_runs",
    "agentlab_source_sync_runs?select=*&order=created_at.desc&limit=20",
    warnings
  );

  const trainingScenarios = await safeQuery(
    env,
    "agentlab_training_scenarios",
    "agentlab_training_scenarios?select=*&order=created_at.asc",
    warnings
  );

  const trainingRuns = await safeQuery(
    env,
    "agentlab_training_runs",
    "agentlab_training_runs?select=*&order=created_at.desc&limit=20",
    warnings
  );

  const crmAutomationRulesRaw = await safeQuery(
    env,
    "agentlab_crm_automation_rules",
    "agentlab_crm_automation_rules?select=*&order=event_key.asc,created_at.asc",
    warnings,
    []
  );

  const crmAutomationRuns = await safeQuery(
    env,
    "agentlab_crm_automation_runs",
    "agentlab_crm_automation_runs?select=*&order=created_at.desc&limit=30",
    warnings,
    []
  );

  const agents = buildAgentMap(workspaceAgents.length ? workspaceAgents : fallbackAgents, agentProfiles);
  const conversationsSummary = summarizeConversations(conversationThreads);
  const incidentsSummary = summarizeIncidents(incidents);
  const trainingSummary = summarizeTrainingRuns(trainingRuns);
  const snapshotCounts = summarizeCrmSnapshots(freshsalesSnapshots);
  const crmAutomationRules = (Array.isArray(crmAutomationRulesRaw) && crmAutomationRulesRaw.length
    ? crmAutomationRulesRaw
    : AGENTLAB_CRM_AUTOMATION_RULES.map((item) => ({ ...item, source: "catalog" }))).map(normalizeCrmAutomationRule);

  return {
    overview: buildInsightSummary({
      agents,
      agentProfiles,
      improvementQueue,
      syncRuns,
      crmSnapshots: freshsalesSnapshots,
      conversationThreads,
      incidents,
      trainingRuns,
    }),
    agents,
    governance: {
      profiles: agentProfiles,
      queue: improvementQueue,
    },
    crm: {
      runs: freshsalesRuns,
      snapshots: freshsalesSnapshots,
      snapshotCounts,
      automationRules: crmAutomationRules,
      automationRuns: crmAutomationRuns,
    },
    conversations: {
      workspace: workspaceConversations,
      threads: conversationThreads.map((item) => ({
        ...item,
        ...inferIssueMetadata(item),
      })),
      summary: conversationsSummary,
    },
    intelligence: {
      incidents,
      summary: incidentsSummary,
      syncRuns,
    },
    training: {
      scenarios: trainingScenarios,
      runs: trainingRuns,
      summary: trainingSummary,
    },
    rollout: {
      phases: AGENTLAB_ROLLOUT_PHASES,
      sprint: AGENTLAB_WEEKLY_SPRINT,
      knowledgePacks: AGENTLAB_KNOWLEDGE_PACKS,
      workflows: AGENTLAB_WORKFLOW_BACKLOG,
    },
    warnings,
  };
}

export async function updateAgentLabProfile(env, body) {
  const id = String(body.id || "").trim();
  if (!id) {
    throw new Error("Informe o id do perfil do agente para atualizar.");
  }

  const payload = {
    business_goal: String(body.business_goal || "").trim() || null,
    persona_prompt: String(body.persona_prompt || "").trim() || null,
    response_policy: String(body.response_policy || "").trim() || null,
    knowledge_strategy: Array.isArray(body.knowledge_strategy) ? body.knowledge_strategy : [],
    workflow_strategy: Array.isArray(body.workflow_strategy) ? body.workflow_strategy : [],
    handoff_rules: Array.isArray(body.handoff_rules) ? body.handoff_rules : [],
    updated_at: new Date().toISOString(),
  };

  const rows = await supabaseRequest(env, `agentlab_agent_profiles?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    headers: { Prefer: "return=representation" },
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function updateImprovementQueueItem(env, body) {
  const id = String(body.id || "").trim();
  if (!id) {
    throw new Error("Informe o id do item da fila para atualizar.");
  }

  const payload = {
    status: String(body.status || "").trim() || "backlog",
    priority: String(body.priority || "").trim() || "media",
    updated_at: new Date().toISOString(),
  };

  const rows = await supabaseRequest(env, `agentlab_improvement_queue?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    headers: { Prefer: "return=representation" },
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function upsertCrmAutomationRule(env, body) {
  const nowIso = new Date().toISOString();
  const id = String(body.id || "").trim() || uuidv4();
  const payload = {
    id,
    event_key: String(body.event_key || "").trim(),
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim() || null,
    pipeline_stage: String(body.pipeline_stage || "").trim() || null,
    lifecycle_stage: String(body.lifecycle_stage || "").trim() || null,
    meeting_stage: String(body.meeting_stage || "").trim() || null,
    negotiation_stage: String(body.negotiation_stage || "").trim() || null,
    closing_stage: String(body.closing_stage || "").trim() || null,
    client_stage: String(body.client_stage || "").trim() || null,
    sequence_name: String(body.sequence_name || "").trim() || null,
    journey_name: String(body.journey_name || "").trim() || null,
    email_template: String(body.email_template || "").trim() || null,
    whatsapp_template: String(body.whatsapp_template || "").trim() || null,
    enabled: body.enabled !== false,
    execution_mode: String(body.execution_mode || "manual").trim() || "manual",
    notes: String(body.notes || "").trim() || null,
    updated_at: nowIso,
  };

  if (!payload.event_key || !payload.title) {
    throw new Error("Informe ao menos event_key e title para a regra de automacao.");
  }

  const existing = await supabaseRequest(
    env,
    `agentlab_crm_automation_rules?select=id&id=eq.${encodeURIComponent(id)}&limit=1`
  ).catch(() => []);

  if (Array.isArray(existing) && existing[0]?.id) {
    const rows = await supabaseRequest(env, `agentlab_crm_automation_rules?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: { Prefer: "return=representation" },
    });
    return Array.isArray(rows) ? rows[0] || null : rows;
  }

  const rows = await supabaseRequest(env, "agentlab_crm_automation_rules", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      created_at: nowIso,
    }),
    headers: { Prefer: "return=representation" },
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function syncWorkspaceConversations(env) {
  const conversations = await supabaseRequest(
    env,
    "conversas?select=id,workspace_id,contato_id,processo_id,canal,status,assunto,ultima_mensagem,ultima_mensagem_at,metadata,created_at,updated_at&order=ultima_mensagem_at.desc.nullslast&limit=100"
  );

  const synced = [];
  for (const item of conversations || []) {
    const rows = await upsertConversationThread(env, {
      source_system: "workspace_conversas",
      source_conversation_id: item.id,
      workspace_id: item.workspace_id || null,
      contact_id: item.contato_id || null,
      process_id: item.processo_id || null,
      channel: item.canal || "indefinido",
      status: item.status || "ativa",
      subject: item.assunto || `Conversa ${item.canal || "canal"}`,
      last_message: item.ultima_mensagem || null,
      started_at: item.created_at || item.updated_at || new Date().toISOString(),
      last_message_at: item.ultima_mensagem_at || item.updated_at || item.created_at || new Date().toISOString(),
      assigned_to: null,
      handoff_required: false,
      metadata: item.metadata || {},
      raw_payload: item,
    });

    if (Array.isArray(rows) && rows[0]) synced.push(rows[0]);
  }

  const incident = await ensureClassificationIncident(env, synced);

  await supabaseRequest(env, "agentlab_source_sync_runs", {
    method: "POST",
    body: JSON.stringify({
      id: uuidv4(),
      source_name: "workspace_conversas",
      sync_scope: "conversation_threads",
      status: "completed",
      records_synced: synced.length,
      notes: "Bootstrap de conversas internas para o AgentLab.",
      metadata: {
        incident_created: Boolean(incident?.id),
      },
      created_at: new Date().toISOString(),
    }),
  });

  return { synced: synced.length, incidentCreated: Boolean(incident?.id) };
}

export async function syncFreshsalesActivitiesIntoAgentLab(env, limit = 25) {
  const { items, base } = await fetchFreshsalesActivities(env, limit);
  const synced = [];

  for (const item of items) {
    const sourceId = String(item.id || item.sales_activity_id || uuidv4());
    const typeName =
      item.sales_activity_type?.name ||
      item.sales_activity_type_name ||
      item.activity_type?.name ||
      item.type ||
      "atividade";

    const message = item.description || item.notes || item.title || item.subject || item.content || null;

    const rows = await upsertConversationThread(env, {
      source_system: "freshsales",
      source_conversation_id: sourceId,
      workspace_id: null,
      contact_id: null,
      process_id: null,
      channel: String(typeName).toLowerCase().includes("chat") ? "chat" : "crm",
      status: item.status || "registrada",
      subject: item.title || item.subject || `Atividade ${typeName}`,
      last_message: message,
      started_at: item.created_at || item.start_time || new Date().toISOString(),
      last_message_at: item.updated_at || item.created_at || new Date().toISOString(),
      assigned_to: null,
      handoff_required: false,
      metadata: {
        type_name: typeName,
        deal_id: item.deal_id || null,
        contact_id: item.contact_id || null,
        owner_id: item.owner_id || null,
        error_flag: false,
        source_base_url: base,
      },
      raw_payload: item,
    });

    if (Array.isArray(rows) && rows[0]) synced.push(rows[0]);
  }

  await ensureClassificationIncident(env, synced);
  await supabaseRequest(env, "agentlab_source_sync_runs", {
    method: "POST",
    body: JSON.stringify({
      id: uuidv4(),
      source_name: "freshsales",
      sync_scope: "sales_activities",
      status: "completed",
      records_synced: synced.length,
      notes: "Importacao viva de atividades do Freshsales para inteligencia conversacional.",
      metadata: { source_base_url: base },
      created_at: new Date().toISOString(),
    }),
  });

  return { synced: synced.length, sourceBaseUrl: base };
}

export async function runTrainingScenario(env, body) {
  const scenarioId = String(body.scenario_id || "").trim();
  if (!scenarioId) {
    throw new Error("Informe o scenario_id para executar o treinamento.");
  }

  const scenarios = await supabaseRequest(
    env,
    `agentlab_training_scenarios?select=*&id=eq.${encodeURIComponent(scenarioId)}&limit=1`
  );
  const scenario = Array.isArray(scenarios) ? scenarios[0] : null;
  if (!scenario) {
    throw new Error("Cenario de treinamento nao encontrado.");
  }

  const profiles = await supabaseRequest(
    env,
    `agentlab_agent_profiles?select=*&agent_ref=eq.${encodeURIComponent(scenario.agent_ref)}&limit=1`
  ).catch(() => []);
  const profile = normalizeAgentProfile(Array.isArray(profiles) ? profiles[0] : null);

  const prompt = buildTrainingPrompt({ scenario, profile });
  const evaluation = await callWorkersAi(env, prompt);
  const parsed = evaluation.parsed || {
    generated_response: "",
    evaluator_summary: "Nao foi possivel parsear a resposta estruturada do avaliador.",
    intent_detected: null,
    handoff_recommended: false,
    scores: { overall: 0 },
    recommendations: ["Revisar prompt e parser do treinamento."],
  };

  const runPayload = {
    id: uuidv4(),
    scenario_id: scenario.id,
    agent_ref: scenario.agent_ref,
    provider: "cloudflare-workers-ai",
    model: evaluation.model,
    prompt_version: "agentlab-v1",
    generated_response: parsed.generated_response || null,
    evaluator_summary: parsed.evaluator_summary || null,
    intent_detected: parsed.intent_detected || null,
    handoff_recommended: Boolean(parsed.handoff_recommended),
    scores: parsed.scores || {},
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    raw_result: evaluation.payload || {},
    status: "completed",
    created_at: new Date().toISOString(),
  };

  const rows = await supabaseRequest(env, "agentlab_training_runs", {
    method: "POST",
    body: JSON.stringify(runPayload),
    headers: { Prefer: "return=representation" },
  });

  const overall = Number(parsed?.scores?.overall ?? 0);
  let queueItem = null;
  if (overall > 0 && overall < Number(scenario.score_threshold || 0.85)) {
    const queueRows = await supabaseRequest(env, "agentlab_improvement_queue", {
      method: "POST",
      body: JSON.stringify({
        id: uuidv4(),
        agent_ref: scenario.agent_ref,
        category: scenario.category || "evaluation",
        title: `Ajustar cenario: ${scenario.scenario_name}`,
        description: parsed.evaluator_summary || "Resultado abaixo da meta de treinamento.",
        priority: "alta",
        status: "backlog",
        source_channel: "training-center",
        sprint_bucket: "Sprint de melhoria",
        metadata: {
          scenario_id: scenario.id,
          score: overall,
          threshold: Number(scenario.score_threshold || 0.85),
          recommendations: parsed.recommendations || [],
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
      headers: { Prefer: "return=representation" },
    });
    queueItem = Array.isArray(queueRows) ? queueRows[0] || null : queueRows;
  }

  return {
    run: Array.isArray(rows) ? rows[0] || null : rows,
    queueItem,
  };
}
