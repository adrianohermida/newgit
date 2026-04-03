import { v4 as uuidv4 } from "uuid";
import {
  AGENTLAB_CRM_AUTOMATION_RULES,
  AGENTLAB_DEFAULT_AGENT_PROFILES,
  AGENTLAB_DEFAULT_HANDOFF_PLAYBOOKS,
  AGENTLAB_DEFAULT_IMPROVEMENT_QUEUE,
  AGENTLAB_DEFAULT_INTENTS,
  AGENTLAB_DEFAULT_KNOWLEDGE_SOURCES,
  AGENTLAB_DEFAULT_QUICK_REPLIES,
  AGENTLAB_DEFAULT_TRAINING_SCENARIOS,
  AGENTLAB_DEFAULT_WORKFLOW_LIBRARY,
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
import { runDotobotRagHealth } from "../lawdesk/rag.js";
import { executeDispatchRun } from "../../functions/lib/crm-dispatcher.js";
import { getFreshchatWebConfig } from "../../functions/lib/freshchat-web.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const AGENTLAB_SCHEMA_TABLES = [
  "agentlab_agent_profiles",
  "agentlab_improvement_queue",
  "agentlab_conversation_threads",
  "agentlab_incidents",
  "agentlab_source_sync_runs",
  "agentlab_training_scenarios",
  "agentlab_training_runs",
  "agentlab_crm_automation_rules",
  "agentlab_crm_automation_runs",
  "agentlab_crm_resource_map",
  "agentlab_crm_dispatch_runs",
  "agentlab_message_templates",
  "agentlab_crm_action_queue",
  "agentlab_quick_replies",
  "agentlab_intents",
  "agentlab_knowledge_sources",
  "agentlab_workflow_library",
  "agentlab_source_states",
  "agentlab_conversation_messages",
];
const AGENTLAB_OPTIONAL_SOURCES = new Set([
  "freshsales_sync_runs",
  "freshsales_sync_snapshots",
  "conversas",
  "agentlab_conversation_messages",
  "agentlab_widget_events",
]);

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

function getRemoteDashboardUrl(env) {
  return cleanEnvValue(env.AGENTLAB_REMOTE_DASHBOARD_URL) || null;
}

function getFreshchatBaseUrl(env) {
  const raw =
    cleanEnvValue(env.FRESHCHAT_API_BASE) ||
    cleanEnvValue(env.FRESHCHAT_ACCOUNT_URL) ||
    cleanEnvValue(env.FRESHCHAT_BASE_URL);
  if (!raw) return null;
  return raw.startsWith("http") ? raw.replace(/\/+$/, "") : `https://${raw.replace(/\/+$/, "")}`;
}

function getFreshchatApiKey(env) {
  return cleanEnvValue(env.FRESHCHAT_API_KEY) || cleanEnvValue(env.FRESHCHAT_ACCESS_TOKEN) || null;
}

function validateFreshchatApiConfig(baseUrl, token) {
  const issues = [];
  const normalizedBase = String(baseUrl || "").toLowerCase();
  const normalizedToken = String(token || "").trim();
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (!baseUrl || !token) {
    return {
      ok: false,
      message: "Credenciais do Freshchat ausentes para sincronizacao viva.",
      issues: ["missing_base_or_token"],
    };
  }

  if (normalizedBase.includes("msdk.")) {
    issues.push("sdk_domain");
  }

  if (normalizedBase.includes(".wchat.") || normalizedBase.includes(".webpush.")) {
    issues.push("web_messenger_domain");
  }

  if (uuidLike.test(normalizedToken)) {
    issues.push("sdk_app_key");
  }

  if (issues.length) {
    return {
      ok: false,
      issues,
      message:
        "As credenciais configuradas parecem ser do SDK/widget ou do Web Messenger do Freshchat, e nao da API administrativa. Para o sync do AgentLab, use 'Your chat URL' e 'Your API Key' em Settings > Admin Settings > Website Tracking and APIs > API Settings.",
    };
  }

  return { ok: true, issues: [] };
}

function buildFreshchatEnvironmentStatus(env) {
  const baseUrl = getFreshchatBaseUrl(env);
  const token = getFreshchatApiKey(env);
  const validation = validateFreshchatApiConfig(baseUrl, token);

  return {
    configured: Boolean(baseUrl && token),
    ok: validation.ok,
    issues: validation.issues || [],
    message: validation.message || "Configuracao da API do Freshchat valida.",
    baseUrlPreview: baseUrl || null,
    tokenType: token
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(token))
        ? "uuid_like"
        : "token_present"
      : "missing",
  };
}

function buildFreshchatWebEnvironmentStatus(env) {
  const config = getFreshchatWebConfig(env);

  return {
    enabled: config.enabled,
    mode: config.mode,
    scriptUrl: config.scriptUrl,
    widgetHost: config.widgetHost || null,
    messengerTokenPresent: Boolean(config.messengerToken),
    jwtEnabled: config.jwtEnabled,
    issues: config.issues || [],
    resolvedKeys: config.resolvedKeys || {},
    acceptedKeys: config.acceptedKeys || {},
    message: config.jwtEnabled
      ? "Web Messenger com JWT pronto para autenticacao via backend."
      : "Widget configurado sem JWT. Se a autenticacao obrigatoria estiver ativa no Freshchat, informe FRESHCHAT_JWT_SECRET.",
  };
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
    if (!AGENTLAB_OPTIONAL_SOURCES.has(source)) {
      warnings.push({
        source,
        message: `Fonte ${source} indisponivel neste ambiente. O painel seguira com dados parciais.`,
      });
    }
    return fallback;
  }
}

async function getSourceState(env, sourceName) {
  const rows = await supabaseRequest(
    env,
    `agentlab_source_states?select=*&source_name=eq.${encodeURIComponent(sourceName)}&limit=1`
  ).catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function upsertSourceState(env, sourceName, patch = {}) {
  const nowIso = new Date().toISOString();
  const current = await getSourceState(env, sourceName);
  const payload = {
    source_name: sourceName,
    cursor: patch.cursor ?? current?.cursor ?? null,
    page: Number(patch.page ?? current?.page ?? 1) || 1,
    items_per_page: Number(patch.items_per_page ?? current?.items_per_page ?? 20) || 20,
    last_synced_at: patch.last_synced_at ?? current?.last_synced_at ?? null,
    metadata: {
      ...(current?.metadata || {}),
      ...((patch.metadata && typeof patch.metadata === "object") ? patch.metadata : {}),
    },
    updated_at: nowIso,
  };

  if (current?.source_name) {
    const rows = await supabaseRequest(env, `agentlab_source_states?source_name=eq.${encodeURIComponent(sourceName)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: { Prefer: "return=representation" },
    });
    return Array.isArray(rows) ? rows[0] || null : rows;
  }

  const rows = await supabaseRequest(env, "agentlab_source_states", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      created_at: nowIso,
    }),
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function createSourceSyncRun(env, payload) {
  await supabaseRequest(env, "agentlab_source_sync_runs", {
    method: "POST",
    body: JSON.stringify({
      id: uuidv4(),
      created_at: new Date().toISOString(),
      ...payload,
    }),
  });
}

function shouldUseRemoteDashboard(localData, warnings) {
  const missingWarnings = warnings.filter((item) => String(item.source || "").startsWith("agentlab_") || item.source === "workspace_ai_agents" || item.source === "ai_agents");
  const hasAlmostNoLocalData =
    !localData.agents.length &&
    !localData.agentProfiles.length &&
    !localData.improvementQueue.length &&
    !localData.freshsalesRuns.length &&
    !localData.freshsalesSnapshots.length &&
    !localData.conversationThreads.length &&
    !localData.trainingRuns.length &&
    !localData.trainingScenarios.length;
  return hasAlmostNoLocalData && missingWarnings.length >= 4;
}

async function fetchRemoteDashboard(env) {
  const remoteUrl = getRemoteDashboardUrl(env);
  if (!remoteUrl) return null;

  const response = await fetch(remoteUrl, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Remote AgentLab dashboard failed with status ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  return payload?.data || payload || null;
}

function normalizeAgentRow(agent) {
  return {
    ...agent,
    name: agent.name || agent.nome || agent.agent_slug || "Agente",
    status: agent.status || (agent.active ? "ativo" : "inativo"),
    capabilities: Array.isArray(agent.capacidades) ? agent.capacidades : [],
  };
}

function buildDefaultAgentsFromProfiles(profiles = []) {
  return profiles.map((profile, index) => ({
    id: profile.id || `default-agent-${index + 1}`,
    agent_slug: profile.agent_ref || `agente-${index + 1}`,
    name:
      profile.agent_name ||
      (profile.agent_ref === "dotobot-ai"
        ? "DotoBot AI"
        : profile.agent_ref === "dotobot-chatbot"
          ? "DotoBot"
          : String(profile.agent_ref || `Agente ${index + 1}`))
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, (char) => char.toUpperCase()),
    status: "ativo",
    capabilities: ["triagem", "agendamento", "financeiro", "handoff"],
    agent_kind: profile.agent_kind || "agent",
    primary_channel: profile.primary_channel || null,
    source: "default-profile",
  }));
}

function getConversationalFreshsalesTypes(env) {
  const raw = cleanEnvValue(env.AGENTLAB_FRESHSALES_CONVERSATION_TYPES);
  const defaults = ["Chat", "Meeting", "Phone", "Email", "SMS Incoming", "SMS Outgoing"];
  const values = raw
    ? raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : defaults;
  return new Set(values.map((item) => item.toLowerCase()));
}

function splitConversationViews(threads = []) {
  const conversational = [];
  const crmSignals = [];

  for (const thread of threads) {
    const source = String(thread.source_system || "").toLowerCase();
    const channel = String(thread.channel || "").toLowerCase();
    const typeName = String(thread.metadata?.type_name || "").toLowerCase();
    const isCrmSignal =
      source === "freshsales" &&
      channel !== "chat" &&
      !typeName.includes("chat") &&
      !typeName.includes("meeting") &&
      !typeName.includes("phone") &&
      !typeName.includes("email") &&
      !typeName.includes("sms");

    if (isCrmSignal) {
      crmSignals.push(thread);
    } else {
      conversational.push(thread);
    }
  }

  return { conversational, crmSignals };
}

function inferIntentFromMessage(message = "") {
  const text = String(message || "").toLowerCase();
  if (!text) return "triagem_geral";
  if (text.includes("processo") || text.includes("publica") || text.includes("andamento")) {
    return "status_processual";
  }
  if (
    text.includes("honorario") ||
    text.includes("parcel") ||
    text.includes("boleto") ||
    text.includes("pix") ||
    text.includes("pagamento")
  ) {
    return "honorarios_pagamento";
  }
  if (text.includes("agendar") || text.includes("consulta") || text.includes("horario")) {
    return "agendamento_consulta";
  }
  if (text.includes("remar") || text.includes("reagend") || text.includes("perdi minha consulta")) {
    return "remarcacao";
  }
  return "triagem_geral";
}

function buildHeuristicTrainingEvaluation({ scenario, profile }) {
  const intentDetected = inferIntentFromMessage(scenario.user_message);
  const expectedIntent = String(scenario.expected_intent || "").trim();
  const intentMatched = !expectedIntent || intentDetected === expectedIntent;
  const shouldHandoff =
    expectedIntent === "status_processual" ||
    String(scenario.category || "").toLowerCase() === "processual";
  const overall = intentMatched ? (shouldHandoff ? 0.9 : 0.86) : 0.64;

  return {
    provider: "local-heuristic",
    parsed: {
      generated_response: shouldHandoff
        ? "Posso registrar seu pedido com seguranca e encaminhar ao time responsavel para analisar o contexto do seu processo."
        : "Posso te orientar no proximo passo e, se quiser, seguimos com o fluxo adequado agora.",
      evaluator_summary: intentMatched
        ? "Avaliacao heuristica executada com sucesso. O cenario foi classificado e pontuado com base nas regras internas do AgentLab."
        : "Avaliacao heuristica detectou divergencia entre a intent esperada e a intent inferida. Recomenda-se revisar prompts, exemplos e handoff.",
      intent_detected: intentDetected,
      handoff_recommended: shouldHandoff,
      scores: {
        overall,
        juridical_safety: shouldHandoff ? 0.94 : 0.82,
        sales_effectiveness: shouldHandoff ? 0.72 : 0.88,
        clarity: 0.84,
        workflow_fit: intentMatched ? 0.86 : 0.61,
      },
      recommendations: intentMatched
        ? [
            `Manter o cenario vinculado ao agente ${profile?.agent_name || profile?.agent_ref || scenario.agent_ref}.`,
            "Expandir exemplos de linguagem natural para aumentar a robustez da classificacao.",
          ]
        : [
            `Reforcar exemplos da intent ${expectedIntent}.`,
            "Ajustar politica de resposta e handoff para reduzir ambiguidade.",
          ],
    },
    payload: {
      mode: "heuristic_fallback",
      expected_intent: expectedIntent,
      detected_intent: intentDetected,
    },
  };
}

function normalizeWidgetEvent(item) {
  return {
    id: item.id,
    source: item.source || "freshchat_web",
    event_name: item.event_name || "",
    route_path: item.route_path || "/",
    identity_mode: item.identity_mode || "visitor",
    reference_id: item.reference_id || null,
    success: typeof item.success === "boolean" ? item.success : null,
    widget_state: item.widget_state || null,
    metadata: item.metadata || {},
    created_at: item.created_at || null,
  };
}

function buildWidgetEventSummary(events = []) {
  const byEvent = new Map();
  let successCount = 0;
  let failureCount = 0;
  let authCount = 0;
  let openedCount = 0;

  for (const event of events) {
    const key = event.event_name || "unknown";
    byEvent.set(key, (byEvent.get(key) || 0) + 1);
    if (event.success === true) successCount += 1;
    if (event.success === false) failureCount += 1;
    if (["widget_user_authenticated", "widget_auth_requested", "widget_auth_failed"].includes(key)) {
      authCount += 1;
    }
    if (key === "widget_opened") {
      openedCount += 1;
    }
  }

  return {
    total: events.length,
    successCount,
    failureCount,
    authCount,
    openedCount,
    byEvent: Array.from(byEvent.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10),
  };
}

function normalizeQuickReply(item) {
  return {
    id: item.id,
    agent_ref: item.agent_ref || "dotobot-ai",
    category: item.category || "geral",
    title: item.title || "Resposta rapida",
    shortcut: item.shortcut || null,
    body: item.body || "",
    status: item.status || "active",
    metadata: item.metadata || {},
    updated_at: item.updated_at || item.created_at || null,
  };
}

function normalizeIntent(item) {
  return {
    id: item.id,
    agent_ref: item.agent_ref || "dotobot-ai",
    label: item.label || "",
    examples: Array.isArray(item.examples) ? item.examples : [],
    policy: item.policy || "",
    status: item.status || "active",
    metadata: item.metadata || {},
    updated_at: item.updated_at || item.created_at || null,
  };
}

function normalizeKnowledgeSource(item) {
  return {
    id: item.id,
    agent_ref: item.agent_ref || "dotobot-ai",
    source_type: item.source_type || "faq",
    title: item.title || "",
    status: item.status || "draft",
    notes: item.notes || "",
    metadata: item.metadata || {},
    updated_at: item.updated_at || item.created_at || null,
  };
}

function normalizeWorkflowLibraryItem(item) {
  return {
    id: item.id,
    agent_ref: item.agent_ref || "dotobot-ai",
    title: item.title || "",
    type: item.type || "workflow",
    status: item.status || "backlog",
    notes: item.notes || "",
    metadata: item.metadata || {},
    updated_at: item.updated_at || item.created_at || null,
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

function normalizeCrmResourceMap(item) {
  return {
    id: item.id,
    resource_key: item.resource_key || "",
    resource_type: item.resource_type || "",
    resource_id: item.resource_id || "",
    resource_name: item.resource_name || "",
    provider: item.provider || "freshsales",
    notes: item.notes || null,
    metadata: item.metadata || {},
    updated_at: item.updated_at || item.created_at || null,
  };
}

function normalizeMessageTemplate(item) {
  return {
    id: item.id,
    channel: item.channel || "email",
    template_name: item.template_name || "",
    subject: item.subject || null,
    body_html: item.body_html || null,
    body_text: item.body_text || null,
    enabled: item.enabled !== false,
    notes: item.notes || null,
    updated_at: item.updated_at || item.created_at || null,
  };
}

function normalizeCrmActionQueueItem(item) {
  return {
    id: item.id,
    automation_run_id: item.automation_run_id || null,
    source_ref: item.source_ref || null,
    event_key: item.event_key || "",
    action_type: item.action_type || "",
    resource_type: item.resource_type || "",
    resource_key: item.resource_key || null,
    resource_id: item.resource_id || null,
    resource_name: item.resource_name || null,
    status: item.status || "pending",
    execution_mode: item.execution_mode || "semi_auto",
    detail: item.detail || null,
    payload: item.payload || {},
    updated_at: item.updated_at || item.created_at || null,
    created_at: item.created_at || null,
  };
}

function normalizeConversationMessage(item) {
  return {
    id: item.id,
    thread_id: item.thread_id || null,
    source_system: item.source_system || "freshchat",
    source_conversation_id: item.source_conversation_id || null,
    source_message_id: item.source_message_id || null,
    actor_type: item.actor_type || "unknown",
    actor_id: item.actor_id || null,
    message_type: item.message_type || "normal",
    body_text: item.body_text || "",
    created_at_source: item.created_at_source || item.created_at || null,
    metadata: item.metadata || {},
    created_at: item.created_at || null,
    updated_at: item.updated_at || null,
  };
}

function inferMessageRole(message) {
  const actor = String(message.actor_type || "").toLowerCase();
  if (["customer", "user", "contact", "visitor"].includes(actor)) return "customer";
  if (["agent", "admin", "bot", "assistant"].includes(actor)) return "agent";
  if (["system", "event"].includes(actor)) return "system";
  return "unknown";
}

function inferSuggestedAgentRefFromText(text = "", thread = null) {
  const lower = String(text || "").toLowerCase();
  if (
    lower.includes("processo") ||
    lower.includes("andamento") ||
    lower.includes("publicacao") ||
    lower.includes("liminar")
  ) {
    return "dotobot-ai";
  }
  if (thread?.issue_category === "processual") {
    return "dotobot-ai";
  }
  return "dotobot-chatbot";
}

function detectMessageQualitySignals(message, role) {
  const text = String(message.body_text || "").toLowerCase();
  const signals = [];

  if (role === "agent") {
    if (text.length > 0 && text.length < 18) {
      signals.push("resposta_curta_demais");
    }
    if (
      text.includes("deixe-me coloc") ||
      text.includes("um dos meus colegas") ||
      text.includes("time vai entrar em contato")
    ) {
      signals.push("handoff_generico");
    }
    if (text.includes("nao sei") || text.includes("não sei")) {
      signals.push("baixa_confianca");
    }
  }

  if (role === "customer") {
    if (text.includes("nao respondeu") || text.includes("não respondeu")) {
      signals.push("cliente_sem_resposta");
    }
    if (
      text.includes("urgente") ||
      text.includes("desesperado") ||
      text.includes("reclam") ||
      text.includes("cancelar")
    ) {
      signals.push("risco_humano");
    }
  }

  return signals;
}

function buildMessageAnalytics(messages = [], threads = []) {
  const threadById = new Map((threads || []).map((thread) => [thread.id, thread]));
  const threadBySourceConversation = new Map(
    (threads || []).map((thread) => [String(thread.source_conversation_id || ""), thread])
  );

  const enriched = messages.map((message) => {
    const thread =
      threadById.get(message.thread_id) ||
      threadBySourceConversation.get(String(message.source_conversation_id || "")) ||
      null;
    const role = inferMessageRole(message);
    const intent = role === "customer" ? inferIntentFromMessage(message.body_text) : null;
    const qualitySignals = detectMessageQualitySignals(message, role);
    const suggestedAgentRef = inferSuggestedAgentRefFromText(message.body_text, thread);

    return {
      ...message,
      role,
      inferred_intent: intent,
      quality_signals: qualitySignals,
      suggested_agent_ref: suggestedAgentRef,
      thread_subject: thread?.subject || null,
      thread_channel: thread?.channel || null,
    };
  });

  const countsBy = (items, key) =>
    items.reduce((acc, item) => {
      const value = typeof key === "function" ? key(item) : item?.[key];
      const normalized = value || "nao_informado";
      acc[normalized] = (acc[normalized] || 0) + 1;
      return acc;
    }, {});

  const topEntries = (record, limit = 6) =>
    Object.entries(record)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label, value]) => ({ label, value }));

  const customerMessages = enriched.filter((item) => item.role === "customer");
  const agentMessages = enriched.filter((item) => item.role === "agent");
  const qualityEvents = enriched.filter((item) => item.quality_signals.length);

  return {
    enriched,
    summary: {
      total: enriched.length,
      customerMessages: customerMessages.length,
      agentMessages: agentMessages.length,
      qualityEvents: qualityEvents.length,
      byRole: topEntries(countsBy(enriched, "role")),
      topIntents: topEntries(countsBy(customerMessages.filter((item) => item.inferred_intent), "inferred_intent")),
      bySuggestedAgent: topEntries(countsBy(enriched, "suggested_agent_ref")),
      qualitySignals: topEntries(
        qualityEvents.reduce((acc, item) => {
          item.quality_signals.forEach((signal) => {
            acc[signal] = (acc[signal] || 0) + 1;
          });
          return acc;
        }, {})
      ),
    },
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

async function bulkUpsertConversationThreads(env, items = []) {
  if (!items.length) return [];

  const nowIso = new Date().toISOString();
  const payload = items.map((item) => ({
    id: item.id || uuidv4(),
    created_at: item.created_at || nowIso,
    updated_at: nowIso,
    ...item,
  }));

  const rows = await supabaseRequest(
    env,
    "agentlab_conversation_threads?on_conflict=source_system,source_conversation_id",
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
    }
  );

  return Array.isArray(rows) ? rows : [];
}

async function bulkUpsertConversationMessages(env, items = []) {
  if (!items.length) return [];

  const nowIso = new Date().toISOString();
  const payload = items.map((item) => ({
    id: item.id || uuidv4(),
    created_at: item.created_at || nowIso,
    updated_at: nowIso,
    ...item,
  }));

  const rows = await supabaseRequest(
    env,
    "agentlab_conversation_messages?on_conflict=source_system,source_conversation_id,source_message_id",
    {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        Prefer: "resolution=merge-duplicates,return=representation",
      },
    }
  );

  return Array.isArray(rows) ? rows : [];
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

async function fetchFreshsalesActivities(env, { page = 1, perPage = 10 } = {}) {
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
      const response = await fetch(`${base}/sales_activities?page=${Math.max(1, page)}&per_page=${Math.max(1, Math.min(perPage, 25))}`, {
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

      const rawText = await response.text().catch(() => "");
      const payload = rawText ? JSON.parse(rawText) : {};
      const items = payload.sales_activities || payload.activities || payload || [];
      if (Array.isArray(items)) {
        return { items, base, payload };
      }
    }
  }

  throw lastError || new Error("Nao foi possivel consultar sales_activities no Freshsales.");
}

async function fetchFreshchatConversations(env, { page = 1, itemsPerPage = 10 } = {}) {
  const baseUrl = getFreshchatBaseUrl(env);
  const token = getFreshchatApiKey(env);
  const validation = validateFreshchatApiConfig(baseUrl, token);

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const response = await fetch(
    `${baseUrl}/v2/conversations?page=${Math.max(1, page)}&items_per_page=${Math.max(1, Math.min(itemsPerPage, 20))}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Freshchat responded with status ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  const items = payload.conversations || payload.data || [];
  return {
    items: Array.isArray(items) ? items : [],
    base: baseUrl,
    payload,
    pagination: payload.pagination || {},
  };
}

function extractFreshchatMessageText(message) {
  const parts = Array.isArray(message?.message_parts) ? message.message_parts : [];
  const combined = parts
    .map((part) => part?.text?.content || part?.reply_button?.label || part?.label || "")
    .filter(Boolean)
    .join(" ");
  return combined || message?.message || message?.text || "";
}

async function fetchFreshchatConversationMessages(
  env,
  conversationId,
  { page = 1, itemsPerPage = 20, fromTime = null } = {}
) {
  const baseUrl = getFreshchatBaseUrl(env);
  const token = getFreshchatApiKey(env);
  const validation = validateFreshchatApiConfig(baseUrl, token);

  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const params = new URLSearchParams();
  params.set("page", String(Math.max(1, page)));
  params.set("items_per_page", String(Math.max(1, Math.min(itemsPerPage, 50))));
  if (fromTime) {
    params.set("from_time", fromTime);
  }

  const response = await fetch(`${baseUrl}/v2/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Freshchat messages responded with status ${response.status}`);
  }

  const payload = await response.json().catch(() => ({}));
  const items = payload.messages || payload.data || [];
  return {
    items: Array.isArray(items) ? items : [],
    payload,
    pagination: payload.pagination || {},
  };
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
  const conversationMessagesRaw = await safeQuery(
    env,
    "agentlab_conversation_messages",
    "agentlab_conversation_messages?select=*&order=created_at_source.desc.nullslast&limit=80",
    warnings,
    []
  );
  const widgetEventsRaw = await safeQuery(
    env,
    "agentlab_widget_events",
    "agentlab_widget_events?select=*&order=created_at.desc&limit=50",
    warnings,
    []
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

  const crmResourceMapRaw = await safeQuery(
    env,
    "agentlab_crm_resource_map",
    "agentlab_crm_resource_map?select=*&order=resource_type.asc,resource_key.asc",
    warnings,
    []
  );

  const messageTemplatesRaw = await safeQuery(
    env,
    "agentlab_message_templates",
    "agentlab_message_templates?select=*&order=channel.asc,template_name.asc",
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

  const crmDispatchRuns = await safeQuery(
    env,
    "agentlab_crm_dispatch_runs",
    "agentlab_crm_dispatch_runs?select=*&order=created_at.desc&limit=30",
    warnings,
    []
  );

  const crmActionQueueRaw = await safeQuery(
    env,
    "agentlab_crm_action_queue",
    "agentlab_crm_action_queue?select=*&order=created_at.desc&limit=30",
    warnings,
    []
  );

  if (
    shouldUseRemoteDashboard(
      {
        agents: workspaceAgents.length ? workspaceAgents : fallbackAgents,
        agentProfiles,
        improvementQueue,
        freshsalesRuns,
        freshsalesSnapshots,
        conversationThreads,
        trainingRuns,
        trainingScenarios,
      },
      warnings
    )
  ) {
    try {
      const remoteData = await fetchRemoteDashboard(env);
      if (remoteData) {
        return {
          ...remoteData,
          warnings: [],
        };
      }
    } catch (error) {
      warnings.push({
        source: "agentlab_remote_dashboard",
        message: `Fallback remoto do AgentLab indisponivel: ${error.message}`,
      });
    }
  }

  const normalizedAgentProfiles =
    Array.isArray(agentProfiles) && agentProfiles.length
      ? agentProfiles
      : AGENTLAB_DEFAULT_AGENT_PROFILES.map(normalizeAgentProfile);
  const resolvedBaseAgents =
    workspaceAgents.length || fallbackAgents.length
      ? workspaceAgents.length
        ? workspaceAgents
        : fallbackAgents
      : buildDefaultAgentsFromProfiles(normalizedAgentProfiles);
  const normalizedImprovementQueue =
    Array.isArray(improvementQueue) && improvementQueue.length ? improvementQueue : AGENTLAB_DEFAULT_IMPROVEMENT_QUEUE;
  const normalizedTrainingScenarios =
    Array.isArray(trainingScenarios) && trainingScenarios.length ? trainingScenarios : AGENTLAB_DEFAULT_TRAINING_SCENARIOS;
  const quickRepliesRaw = await safeQuery(
    env,
    "agentlab_quick_replies",
    "agentlab_quick_replies?select=*&order=updated_at.desc",
    warnings
  );
  const intentsRaw = await safeQuery(
    env,
    "agentlab_intents",
    "agentlab_intents?select=*&order=updated_at.desc",
    warnings
  );
  const knowledgeSourcesRaw = await safeQuery(
    env,
    "agentlab_knowledge_sources",
    "agentlab_knowledge_sources?select=*&order=updated_at.desc",
    warnings
  );
  const workflowLibraryRaw = await safeQuery(
    env,
    "agentlab_workflow_library",
    "agentlab_workflow_library?select=*&order=updated_at.desc",
    warnings
  );
  const normalizedQuickReplies =
    Array.isArray(quickRepliesRaw) && quickRepliesRaw.length
      ? quickRepliesRaw.map(normalizeQuickReply)
      : AGENTLAB_DEFAULT_QUICK_REPLIES.map(normalizeQuickReply);
  const normalizedIntents =
    Array.isArray(intentsRaw) && intentsRaw.length
      ? intentsRaw.map(normalizeIntent)
      : AGENTLAB_DEFAULT_INTENTS.map(normalizeIntent);
  const normalizedKnowledgeSources =
    Array.isArray(knowledgeSourcesRaw) && knowledgeSourcesRaw.length
      ? knowledgeSourcesRaw.map(normalizeKnowledgeSource)
      : AGENTLAB_DEFAULT_KNOWLEDGE_SOURCES.map(normalizeKnowledgeSource);
  const normalizedWorkflowLibrary =
    Array.isArray(workflowLibraryRaw) && workflowLibraryRaw.length
      ? workflowLibraryRaw.map(normalizeWorkflowLibraryItem)
      : AGENTLAB_DEFAULT_WORKFLOW_LIBRARY.map(normalizeWorkflowLibraryItem);
  const filteredWarnings = warnings.filter((item) => {
    if (item.source === "workspace_ai_agents" && resolvedBaseAgents.length) return false;
    if (item.source === "ai_agents" && resolvedBaseAgents.length) return false;
    if (item.source === "agentlab_agent_profiles" && !agentProfiles.length && normalizedAgentProfiles.length) return false;
    if (item.source === "agentlab_improvement_queue" && !improvementQueue.length && normalizedImprovementQueue.length) return false;
    if (item.source === "agentlab_training_scenarios" && !trainingScenarios.length && normalizedTrainingScenarios.length) return false;
    if (item.source === "agentlab_quick_replies" && normalizedQuickReplies.length) return false;
    if (item.source === "agentlab_intents" && normalizedIntents.length) return false;
    if (item.source === "agentlab_knowledge_sources" && normalizedKnowledgeSources.length) return false;
    if (item.source === "agentlab_workflow_library" && normalizedWorkflowLibrary.length) return false;
    return true;
  });
  const isDegradedEnvironment = filteredWarnings.length > 6;
  const finalWarnings =
    isDegradedEnvironment
      ? []
      : filteredWarnings;

  const agents = buildAgentMap(resolvedBaseAgents, normalizedAgentProfiles);
  const conversationViews = splitConversationViews(conversationThreads);
  const conversationMessages = (Array.isArray(conversationMessagesRaw) ? conversationMessagesRaw : []).map(normalizeConversationMessage);
  const widgetEvents = (Array.isArray(widgetEventsRaw) ? widgetEventsRaw : []).map(normalizeWidgetEvent);
  const messageAnalytics = buildMessageAnalytics(conversationMessages, conversationThreads);
    const widgetEventSummary = buildWidgetEventSummary(widgetEvents);
    const conversationsSummary = summarizeConversations(conversationViews.conversational);
    const incidentsSummary = summarizeIncidents(incidents);
    const trainingSummary = summarizeTrainingRuns(trainingRuns);
    const snapshotCounts = summarizeCrmSnapshots(freshsalesSnapshots);
    const dotobotRagHealth = await runDotobotRagHealth(env, {
      query: "healthcheck dotobot memory retrieval",
      includeUpsert: false,
      topK: 3,
    });
    const crmAutomationRules = (Array.isArray(crmAutomationRulesRaw) && crmAutomationRulesRaw.length
      ? crmAutomationRulesRaw
      : AGENTLAB_CRM_AUTOMATION_RULES.map((item) => ({ ...item, source: "catalog" }))).map(normalizeCrmAutomationRule);
  const crmResourceMap = (Array.isArray(crmResourceMapRaw) ? crmResourceMapRaw : []).map(normalizeCrmResourceMap);
  const messageTemplates = (Array.isArray(messageTemplatesRaw) ? messageTemplatesRaw : []).map(normalizeMessageTemplate);
  const crmActionQueue = (Array.isArray(crmActionQueueRaw) ? crmActionQueueRaw : []).map(normalizeCrmActionQueueItem);

  return {
    overview: buildInsightSummary({
      agents,
      agentProfiles: normalizedAgentProfiles,
      improvementQueue: normalizedImprovementQueue,
      syncRuns,
      crmSnapshots: freshsalesSnapshots,
      conversationThreads,
      incidents,
      trainingRuns,
    }),
    agents,
    governance: {
      profiles: normalizedAgentProfiles,
      queue: normalizedImprovementQueue,
      quickReplies: normalizedQuickReplies,
      handoffPlaybooks: AGENTLAB_DEFAULT_HANDOFF_PLAYBOOKS,
    },
    crm: {
      runs: freshsalesRuns,
      snapshots: freshsalesSnapshots,
      snapshotCounts,
      automationRules: crmAutomationRules,
      automationRuns: crmAutomationRuns,
      resourceMap: crmResourceMap,
      dispatchRuns: crmDispatchRuns,
      messageTemplates,
      actionQueue: crmActionQueue,
    },
    conversations: {
      workspace: workspaceConversations,
      threads: conversationThreads.map((item) => ({
        ...item,
        ...inferIssueMetadata(item),
      })),
      primaryThreads: conversationViews.conversational.map((item) => ({
        ...item,
        ...inferIssueMetadata(item),
      })),
      crmSignals: conversationViews.crmSignals.map((item) => ({
        ...item,
        ...inferIssueMetadata(item),
      })),
      messages: messageAnalytics.enriched,
      widgetEvents,
      widgetEventSummary,
      messageSummary: messageAnalytics.summary,
      summary: conversationsSummary,
    },
    intelligence: {
      incidents,
      summary: incidentsSummary,
      syncRuns,
      widgetEvents,
      widgetEventSummary,
      messageSummary: messageAnalytics.summary,
    },
    training: {
      scenarios: normalizedTrainingScenarios,
      runs: trainingRuns,
      summary: trainingSummary,
    },
    rollout: {
      phases: AGENTLAB_ROLLOUT_PHASES,
      sprint: AGENTLAB_WEEKLY_SPRINT,
      knowledgePacks: AGENTLAB_KNOWLEDGE_PACKS,
      workflows: AGENTLAB_WORKFLOW_BACKLOG,
      workflowLibrary: normalizedWorkflowLibrary,
      intents: normalizedIntents,
      knowledgeSources: normalizedKnowledgeSources,
    },
    environment: {
      mode: isDegradedEnvironment ? "degraded" : "connected",
      missingSources: filteredWarnings.map((item) => item.source).filter(Boolean),
      schemaChecklist: AGENTLAB_SCHEMA_TABLES.map((table) => ({
        table,
        status: filteredWarnings.some((item) => item.source === table) ? "missing" : "ready",
      })),
        freshchatApi: buildFreshchatEnvironmentStatus(env),
        freshchatWeb: buildFreshchatWebEnvironmentStatus(env),
        dotobotRagHealth,
        message: isDegradedEnvironment
          ? "Este ambiente esta operando em modo de contingencia, usando fallbacks do AgentLab."
          : "AgentLab conectado ao schema principal.",
        bootstrapSqlPath: "/docs/agentlab-bootstrap-supabase.sql",
      bootstrapRunbookPath: "/docs/agentlab-bootstrap-supabase.md",
    },
    warnings: finalWarnings,
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

export async function createImprovementQueueItem(env, body) {
  const nowIso = new Date().toISOString();
  const payload = {
    id: String(body.id || "").trim() || uuidv4(),
    agent_ref: String(body.agent_ref || "dotobot-ai").trim() || "dotobot-ai",
    category: String(body.category || "evaluation").trim() || "evaluation",
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim() || null,
    priority: String(body.priority || "media").trim() || "media",
    status: String(body.status || "backlog").trim() || "backlog",
    source_channel: String(body.source_channel || "agentlab").trim() || "agentlab",
    sprint_bucket: String(body.sprint_bucket || "Sprint atual").trim() || "Sprint atual",
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    created_at: nowIso,
    updated_at: nowIso,
  };

  if (!payload.title) {
    throw new Error("Informe o titulo do item de melhoria.");
  }

  const rows = await supabaseRequest(env, "agentlab_improvement_queue", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { Prefer: "return=representation" },
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function updateIncidentItem(env, body) {
  const id = String(body.id || "").trim();
  if (!id) {
    throw new Error("Informe o id do incidente para atualizar.");
  }

  const payload = {
    status: String(body.status || "").trim() || "open",
    severity: String(body.severity || "").trim() || undefined,
    updated_at: new Date().toISOString(),
  };

  if (body.description !== undefined) {
    payload.description = String(body.description || "").trim() || null;
  }

  const rows = await supabaseRequest(env, `agentlab_incidents?id=eq.${encodeURIComponent(id)}`, {
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

export async function upsertCrmResourceMap(env, body) {
  const nowIso = new Date().toISOString();
  const id = String(body.id || "").trim() || uuidv4();
  const payload = {
    id,
    resource_key: String(body.resource_key || "").trim(),
    resource_type: String(body.resource_type || "").trim(),
    resource_id: String(body.resource_id || "").trim(),
    resource_name: String(body.resource_name || "").trim() || null,
    provider: String(body.provider || "freshsales").trim() || "freshsales",
    notes: String(body.notes || "").trim() || null,
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    updated_at: nowIso,
  };

  if (!payload.resource_key || !payload.resource_type || !payload.resource_id) {
    throw new Error("Informe resource_key, resource_type e resource_id para o mapa de recursos.");
  }

  const existing = await supabaseRequest(
    env,
    `agentlab_crm_resource_map?select=id&id=eq.${encodeURIComponent(id)}&limit=1`
  ).catch(() => []);

  if (Array.isArray(existing) && existing[0]?.id) {
    const rows = await supabaseRequest(env, `agentlab_crm_resource_map?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: { Prefer: "return=representation" },
    });
    return Array.isArray(rows) ? rows[0] || null : rows;
  }

  const rows = await supabaseRequest(env, "agentlab_crm_resource_map", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      created_at: nowIso,
    }),
    headers: { Prefer: "return=representation" },
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function upsertMessageTemplate(env, body) {
  const nowIso = new Date().toISOString();
  const id = String(body.id || "").trim() || uuidv4();
  const payload = {
    id,
    channel: String(body.channel || "email").trim() || "email",
    template_name: String(body.template_name || "").trim(),
    subject: String(body.subject || "").trim() || null,
    body_html: String(body.body_html || "").trim() || null,
    body_text: String(body.body_text || "").trim() || null,
    enabled: body.enabled !== false,
    notes: String(body.notes || "").trim() || null,
    updated_at: nowIso,
  };

  if (!payload.template_name) {
    throw new Error("Informe template_name para salvar o template operacional.");
  }

  const existing = await supabaseRequest(
    env,
    `agentlab_message_templates?select=id&id=eq.${encodeURIComponent(id)}&limit=1`
  ).catch(() => []);

  if (Array.isArray(existing) && existing[0]?.id) {
    const rows = await supabaseRequest(env, `agentlab_message_templates?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: { Prefer: "return=representation" },
    });
    return Array.isArray(rows) ? rows[0] || null : rows;
  }

  const rows = await supabaseRequest(env, "agentlab_message_templates", {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      created_at: nowIso,
    }),
    headers: { Prefer: "return=representation" },
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function upsertAgentLabCollectionItem(env, table, body, options) {
  const nowIso = new Date().toISOString();
  const id = String(body.id || "").trim() || uuidv4();
  const payload = {
    id,
    ...options.buildPayload(body),
    updated_at: nowIso,
  };

  if (typeof options.validate === "function") {
    options.validate(payload);
  }

  const existing = await supabaseRequest(
    env,
    `${table}?select=id&id=eq.${encodeURIComponent(id)}&limit=1`
  ).catch(() => []);

  if (Array.isArray(existing) && existing[0]?.id) {
    const rows = await supabaseRequest(env, `${table}?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
      headers: { Prefer: "return=representation" },
    });
    return Array.isArray(rows) ? rows[0] || null : rows;
  }

  const rows = await supabaseRequest(env, table, {
    method: "POST",
    body: JSON.stringify({
      ...payload,
      created_at: nowIso,
    }),
    headers: { Prefer: "return=representation" },
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function upsertQuickReply(env, body) {
  return upsertAgentLabCollectionItem(env, "agentlab_quick_replies", body, {
    buildPayload(input) {
      return {
        agent_ref: String(input.agent_ref || "dotobot-ai").trim() || "dotobot-ai",
        category: String(input.category || "geral").trim() || "geral",
        title: String(input.title || "").trim(),
        shortcut: String(input.shortcut || "").trim() || null,
        body: String(input.body || "").trim(),
        status: String(input.status || "active").trim() || "active",
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      };
    },
    validate(payload) {
      if (!payload.title || !payload.body) {
        throw new Error("Informe titulo e corpo para salvar a resposta rapida.");
      }
    },
  });
}

export async function upsertIntent(env, body) {
  return upsertAgentLabCollectionItem(env, "agentlab_intents", body, {
    buildPayload(input) {
      return {
        agent_ref: String(input.agent_ref || "dotobot-ai").trim() || "dotobot-ai",
        label: String(input.label || "").trim(),
        examples: Array.isArray(input.examples)
          ? input.examples
          : String(input.examples || "")
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
        policy: String(input.policy || "").trim() || null,
        status: String(input.status || "active").trim() || "active",
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      };
    },
    validate(payload) {
      if (!payload.label) {
        throw new Error("Informe o rotulo da intent.");
      }
    },
  });
}

export async function upsertKnowledgeSource(env, body) {
  return upsertAgentLabCollectionItem(env, "agentlab_knowledge_sources", body, {
    buildPayload(input) {
      return {
        agent_ref: String(input.agent_ref || "dotobot-ai").trim() || "dotobot-ai",
        source_type: String(input.source_type || "faq").trim() || "faq",
        title: String(input.title || "").trim(),
        status: String(input.status || "draft").trim() || "draft",
        notes: String(input.notes || "").trim() || null,
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      };
    },
    validate(payload) {
      if (!payload.title) {
        throw new Error("Informe o titulo da fonte de conhecimento.");
      }
    },
  });
}

export async function upsertWorkflowLibraryItem(env, body) {
  return upsertAgentLabCollectionItem(env, "agentlab_workflow_library", body, {
    buildPayload(input) {
      return {
        agent_ref: String(input.agent_ref || "dotobot-ai").trim() || "dotobot-ai",
        title: String(input.title || "").trim(),
        type: String(input.type || "workflow").trim() || "workflow",
        status: String(input.status || "backlog").trim() || "backlog",
        notes: String(input.notes || "").trim() || null,
        metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      };
    },
    validate(payload) {
      if (!payload.title) {
        throw new Error("Informe o titulo do item da workflow library.");
      }
    },
  });
}

export async function updateCrmDispatchRun(env, body) {
  const id = String(body.id || "").trim();
  if (!id) {
    throw new Error("Informe o id do dispatch para atualizar.");
  }

  const payload = {
    status: String(body.status || "").trim() || "queued",
    detail: String(body.detail || "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  const rows = await supabaseRequest(env, `agentlab_crm_dispatch_runs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    headers: { Prefer: "return=representation" },
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function executeCrmDispatchRun(env, body) {
  const id = String(body.id || "").trim();
  if (!id) {
    throw new Error("Informe o id do dispatch para executar.");
  }

  const rows = await supabaseRequest(
    env,
    `agentlab_crm_dispatch_runs?select=*&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  const dispatchRun = Array.isArray(rows) ? rows[0] || null : null;
  if (!dispatchRun) {
    throw new Error("Dispatch nao encontrado.");
  }

  const execution = await executeDispatchRun(env, dispatchRun);
  const mergedPayload = {
    ...(dispatchRun.payload || {}),
    provider_result: execution.payload || {},
  };

  const updatedRows = await supabaseRequest(env, `agentlab_crm_dispatch_runs?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: execution.status || "sent",
      detail: execution.detail || "Dispatch executado com sucesso.",
      payload: mergedPayload,
      updated_at: new Date().toISOString(),
    }),
    headers: { Prefer: "return=representation" },
  });

  return Array.isArray(updatedRows) ? updatedRows[0] || null : updatedRows;
}

export async function updateCrmActionQueueItem(env, body) {
  const id = String(body.id || "").trim();
  if (!id) {
    throw new Error("Informe o id da acao CRM para atualizar.");
  }

  const payload = {
    status: String(body.status || "").trim() || "pending",
    detail: String(body.detail || "").trim() || null,
    updated_at: new Date().toISOString(),
  };

  const rows = await supabaseRequest(env, `agentlab_crm_action_queue?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    headers: { Prefer: "return=representation" },
  });

  return Array.isArray(rows) ? rows[0] || null : rows;
}

export async function syncWorkspaceConversations(env) {
  const sourceState = await getSourceState(env, "workspace_conversas");
  const page = Math.max(1, Number(sourceState?.page || 1));
  const itemsPerPage = Math.max(1, Math.min(Number(sourceState?.items_per_page || 10), 25));
  const conversations = await supabaseRequest(
    env,
    `conversas?select=id,workspace_id,contato_id,processo_id,canal,status,assunto,ultima_mensagem,ultima_mensagem_at,metadata,created_at,updated_at&order=ultima_mensagem_at.desc.nullslast&limit=${itemsPerPage}&offset=${(page - 1) * itemsPerPage}`
  );

  const payloads = (conversations || []).map((item) => ({
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
    }));
  const synced = await bulkUpsertConversationThreads(env, payloads);

  const incident = await ensureClassificationIncident(env, synced);
  const hasMore = (conversations || []).length >= itemsPerPage;
  await upsertSourceState(env, "workspace_conversas", {
    page: hasMore ? page + 1 : 1,
    items_per_page: itemsPerPage,
    last_synced_at: new Date().toISOString(),
    metadata: {
      last_batch_size: synced.length,
      has_more: hasMore,
    },
  });

  await createSourceSyncRun(env, {
      source_name: "workspace_conversas",
      sync_scope: "conversation_threads",
      status: "completed",
      records_synced: synced.length,
      notes: "Bootstrap de conversas internas para o AgentLab.",
      metadata: {
        incident_created: Boolean(incident?.id),
        page,
        items_per_page: itemsPerPage,
        has_more: hasMore,
      },
  });

  return { synced: synced.length, incidentCreated: Boolean(incident?.id), page, hasMore };
}

export async function syncFreshsalesActivitiesIntoAgentLab(env, limit = 10) {
  const sourceState = await getSourceState(env, "freshsales");
  const page = Math.max(1, Number(sourceState?.page || 1));
  const perPage = Math.max(1, Math.min(Number(limit || sourceState?.items_per_page || 10), 25));
  const { items, base, payload } = await fetchFreshsalesActivities(env, { page, perPage });
  const allowedTypes = getConversationalFreshsalesTypes(env);
  const conversationalItems = items.filter((item) => {
    const typeName =
      item.sales_activity_type?.name ||
      item.sales_activity_type_name ||
      item.activity_type?.name ||
      item.type ||
      "";
    return allowedTypes.has(String(typeName).toLowerCase());
  });
  const payloads = conversationalItems.map((item) => {
    const sourceId = String(item.id || item.sales_activity_id || uuidv4());
    const typeName =
      item.sales_activity_type?.name ||
      item.sales_activity_type_name ||
      item.activity_type?.name ||
      item.type ||
      "atividade";

    const message = item.description || item.notes || item.title || item.subject || item.content || null;

    return {
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
    };
  });
  const synced = await bulkUpsertConversationThreads(env, payloads);

  await ensureClassificationIncident(env, synced);
  const hasMore = items.length >= perPage;
  await upsertSourceState(env, "freshsales", {
    page: hasMore ? page + 1 : 1,
    items_per_page: perPage,
    last_synced_at: new Date().toISOString(),
    metadata: {
      source_base_url: base,
      last_batch_size: synced.length,
      filtered_out: Math.max(0, items.length - conversationalItems.length),
      has_more: hasMore,
    },
  });
  await createSourceSyncRun(env, {
      source_name: "freshsales",
      sync_scope: "sales_activities",
      status: "completed",
      records_synced: synced.length,
      notes: "Importacao viva de atividades do Freshsales para inteligencia conversacional.",
      metadata: {
        source_base_url: base,
        page,
        items_per_page: perPage,
        filtered_out: Math.max(0, items.length - conversationalItems.length),
        has_more: hasMore,
        total_items_hint: payload?.meta?.total || null,
      },
  });

  return { synced: synced.length, sourceBaseUrl: base, page, hasMore };
}

export async function syncFreshchatConversationsIntoAgentLab(env, limit = 10) {
  const sourceState = await getSourceState(env, "freshchat");
  const page = Math.max(1, Number(sourceState?.page || 1));
  const itemsPerPage = Math.max(1, Math.min(Number(limit || sourceState?.items_per_page || 10), 20));
  const { items, base, pagination } = await fetchFreshchatConversations(env, { page, itemsPerPage });

  const payloads = items.map((item) => ({
    source_system: "freshchat",
    source_conversation_id: String(item.id || item.conversation_id || uuidv4()),
    workspace_id: null,
    contact_id: null,
    process_id: null,
    channel: item.channel?.name || item.channel_name || "freshchat",
    status: item.status || item.state || "open",
    subject: item.topic?.name || item.topic_name || item.reference_id || "Conversa Freshchat",
    last_message:
      item.last_message?.message_parts?.map((part) => part.text?.content || "").filter(Boolean).join(" ") ||
      item.last_message?.message ||
      item.last_message?.text ||
      null,
    started_at: item.created_time || item.created_at || new Date().toISOString(),
    last_message_at: item.last_updated_time || item.updated_time || item.created_time || new Date().toISOString(),
    assigned_to: null,
    handoff_required: Boolean(item.status === "new" || item.status === "assigned"),
    metadata: {
      channel_id: item.channel_id || item.channel?.id || null,
      inbox_id: item.inbox_id || null,
      priority: item.priority || null,
      freshchat_status: item.status || null,
      participants: item.users || item.members || [],
      source_base_url: base,
    },
    raw_payload: item,
  }));

  const synced = await bulkUpsertConversationThreads(env, payloads);
  await ensureClassificationIncident(env, synced);

  const totalPages = Number(pagination.total_pages || 0) || null;
  const hasMore = totalPages ? page < totalPages : items.length >= itemsPerPage;
  await upsertSourceState(env, "freshchat", {
    page: hasMore ? page + 1 : 1,
    items_per_page: itemsPerPage,
    last_synced_at: new Date().toISOString(),
    metadata: {
      source_base_url: base,
      last_batch_size: synced.length,
      has_more: hasMore,
      total_pages: totalPages,
      total_items: Number(pagination.total_items || 0) || null,
    },
  });

  await createSourceSyncRun(env, {
    source_name: "freshchat",
    sync_scope: "conversations",
    status: "completed",
    records_synced: synced.length,
    notes: "Importacao incremental de conversas do Freshchat para o AgentLab.",
    metadata: {
      source_base_url: base,
      page,
      items_per_page: itemsPerPage,
      has_more: hasMore,
      total_pages: totalPages,
      total_items: Number(pagination.total_items || 0) || null,
    },
  });

  return { synced: synced.length, sourceBaseUrl: base, page, hasMore, totalPages };
}

export async function syncFreshchatMessagesIntoAgentLab(env, threadLimit = 2, itemsPerPage = 20) {
  const threads = await supabaseRequest(
    env,
    `agentlab_conversation_threads?select=id,source_conversation_id,subject,last_message_at&source_system=eq.freshchat&order=last_message_at.desc.nullslast&limit=${Math.max(1, Math.min(Number(threadLimit || 2), 5))}`
  );

  const targets = Array.isArray(threads) ? threads : [];
  if (!targets.length) {
    return {
      synced: 0,
      threadsProcessed: 0,
      message: "Nenhuma thread do Freshchat disponivel para sincronizar mensagens.",
    };
  }

  let totalSynced = 0;
  const perThread = [];

  for (const thread of targets) {
    const conversationId = String(thread.source_conversation_id || "").trim();
    if (!conversationId) continue;

    const sourceKey = `freshchat_messages:${conversationId}`;
    const sourceState = await getSourceState(env, sourceKey);
    const page = Math.max(1, Number(sourceState?.page || 1));
    const pageSize = Math.max(1, Math.min(Number(itemsPerPage || sourceState?.items_per_page || 20), 50));
    const { items, pagination } = await fetchFreshchatConversationMessages(env, conversationId, {
      page,
      itemsPerPage: pageSize,
    });

    const payloads = items.map((message) => ({
      thread_id: thread.id,
      source_system: "freshchat",
      source_conversation_id: conversationId,
      source_message_id: String(message.id || message.message_id || uuidv4()),
      actor_type: message.actor_type || message.actor?.type || message.user_type || "unknown",
      actor_id: String(message.actor_id || message.actor?.id || message.user_id || "") || null,
      message_type: message.message_type || message.type || "normal",
      body_text: extractFreshchatMessageText(message),
      created_at_source: message.created_time || message.created_at || new Date().toISOString(),
      metadata: {
        private: Boolean(message.private),
        attachments: message.attachments || [],
        raw_type: message.message_type || message.type || null,
      },
    }));

    const syncedRows = await bulkUpsertConversationMessages(env, payloads);
    totalSynced += syncedRows.length;

    const totalPages = Number(pagination.total_pages || 0) || null;
    const hasMore = totalPages ? page < totalPages : items.length >= pageSize;
    await upsertSourceState(env, sourceKey, {
      page: hasMore ? page + 1 : 1,
      items_per_page: pageSize,
      last_synced_at: new Date().toISOString(),
      metadata: {
        thread_id: thread.id,
        last_batch_size: syncedRows.length,
        has_more: hasMore,
        total_pages: totalPages,
      },
    });

    perThread.push({
      thread_id: thread.id,
      conversation_id: conversationId,
      synced: syncedRows.length,
      page,
      has_more: hasMore,
    });
  }

  await createSourceSyncRun(env, {
    source_name: "freshchat_messages",
    sync_scope: "messages",
    status: "completed",
    records_synced: totalSynced,
    notes: "Importacao incremental de mensagens do Freshchat para o AgentLab.",
    metadata: {
      threads_processed: perThread.length,
      items_per_page: Math.max(1, Math.min(Number(itemsPerPage || 20), 50)),
      per_thread: perThread,
    },
  });

  return {
    synced: totalSynced,
    threadsProcessed: perThread.length,
    perThread,
  };
}

export async function runTrainingScenario(env, body) {
  const scenarioId = String(body.scenario_id || "").trim();
  if (!scenarioId) {
    throw new Error("Informe o scenario_id para executar o treinamento.");
  }

  const scenarios = await supabaseRequest(
    env,
    `agentlab_training_scenarios?select=*&id=eq.${encodeURIComponent(scenarioId)}&limit=1`
  ).catch(() => []);
  const scenario = Array.isArray(scenarios) && scenarios[0]
    ? scenarios[0]
    : AGENTLAB_DEFAULT_TRAINING_SCENARIOS.find((item) => item.id === scenarioId) || null;
  if (!scenario) {
    throw new Error("Cenario de treinamento nao encontrado.");
  }

  const profiles = await supabaseRequest(
    env,
    `agentlab_agent_profiles?select=*&agent_ref=eq.${encodeURIComponent(scenario.agent_ref)}&limit=1`
  ).catch(() => []);
  const profile =
    normalizeAgentProfile(Array.isArray(profiles) ? profiles[0] : null) ||
    normalizeAgentProfile(AGENTLAB_DEFAULT_AGENT_PROFILES.find((item) => item.agent_ref === scenario.agent_ref));

  const prompt = buildTrainingPrompt({ scenario, profile });
  let evaluation;
  try {
    evaluation = await callWorkersAi(env, prompt);
  } catch (error) {
    evaluation = buildHeuristicTrainingEvaluation({ scenario, profile });
    evaluation.payload = {
      ...(evaluation.payload || {}),
      fallback_reason: error.message || "Workers AI indisponivel",
    };
  }
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
    provider: evaluation.provider || "cloudflare-workers-ai",
    model: evaluation.model || "heuristic-fallback",
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
  }).catch(() => [runPayload]);

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
    }).catch(() => [{
      id: uuidv4(),
      agent_ref: scenario.agent_ref,
      category: scenario.category || "evaluation",
      title: `Ajustar cenario: ${scenario.scenario_name}`,
      description: parsed.evaluator_summary || "Resultado abaixo da meta de treinamento.",
      priority: "alta",
      status: "backlog",
    }]);
    queueItem = Array.isArray(queueRows) ? queueRows[0] || null : queueRows;
  }

  return {
    run: Array.isArray(rows) ? rows[0] || null : rows,
    queueItem,
  };
}
