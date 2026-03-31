function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeConversationThread(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    source_system: row.source_system || "workspace",
    source_conversation_id: row.source_conversation_id || null,
    workspace_id: row.workspace_id || null,
    contact_id: row.contact_id || row.contato_id || null,
    process_id: row.process_id || row.processo_id || null,
    channel: row.channel || row.canal || "desconhecido",
    status: row.status || "sem_status",
    subject: row.subject || row.assunto || "Sem assunto",
    last_message: row.last_message || row.ultima_mensagem || null,
    started_at: row.started_at || row.created_at || row.created_date || null,
    last_message_at:
      row.last_message_at || row.ultima_mensagem_at || row.updated_at || row.updated_date || null,
    assigned_to: row.assigned_to || null,
    sentiment_label: row.sentiment_label || metadata.sentiment_label || null,
    urgency_label: row.urgency_label || metadata.urgency_label || null,
    intent_label: row.intent_label || metadata.intent_label || null,
    handoff_required:
      typeof row.handoff_required === "boolean"
        ? row.handoff_required
        : Boolean(metadata.handoff_required || false),
    metadata,
    raw_payload: row.raw_payload || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export function normalizeIncident(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    id: row.id,
    source_system: row.source_system || "agentlab",
    category: row.category || "operacional",
    severity: row.severity || "media",
    status: row.status || "open",
    title: row.title || "Incidente sem titulo",
    description: row.description || "",
    agent_ref: row.agent_ref || null,
    conversation_id: row.conversation_id || null,
    internal_user_id: row.internal_user_id || null,
    internal_user_email: row.internal_user_email || null,
    metadata,
    occurred_at: row.occurred_at || row.created_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export function summarizeConversationThreads(rows = []) {
  const threads = rows.map(normalizeConversationThread);
  const channelMap = new Map();
  const statusMap = new Map();
  const intentMap = new Map();
  let handoffCount = 0;

  for (const thread of threads) {
    channelMap.set(thread.channel, (channelMap.get(thread.channel) || 0) + 1);
    statusMap.set(thread.status, (statusMap.get(thread.status) || 0) + 1);
    if (thread.intent_label) {
      intentMap.set(thread.intent_label, (intentMap.get(thread.intent_label) || 0) + 1);
    }
    if (thread.handoff_required || String(thread.status).toLowerCase().includes("handoff")) {
      handoffCount += 1;
    }
  }

  return {
    total_threads: threads.length,
    handoff_threads: handoffCount,
    by_channel: Array.from(channelMap.entries())
      .map(([channel, total]) => ({ channel, total }))
      .sort((left, right) => right.total - left.total),
    thread_statuses: Array.from(statusMap.entries())
      .map(([status, total]) => ({ status, total }))
      .sort((left, right) => right.total - left.total),
    top_intents: Array.from(intentMap.entries())
      .map(([intent, total]) => ({ intent, total }))
      .sort((left, right) => right.total - left.total)
      .slice(0, 8),
  };
}

export function summarizeIncidents(rows = []) {
  const incidents = rows.map(normalizeIncident);
  const bySeverity = new Map();
  const byStatus = new Map();
  const byCategory = new Map();

  for (const incident of incidents) {
    bySeverity.set(incident.severity, (bySeverity.get(incident.severity) || 0) + 1);
    byStatus.set(incident.status, (byStatus.get(incident.status) || 0) + 1);
    byCategory.set(incident.category, (byCategory.get(incident.category) || 0) + 1);
  }

  return {
    total_incidents: incidents.length,
    open_incidents: incidents.filter((incident) => incident.status === "open").length,
    by_severity: Array.from(bySeverity.entries())
      .map(([severity, total]) => ({ severity, total }))
      .sort((left, right) => right.total - left.total),
    incident_statuses: Array.from(byStatus.entries())
      .map(([status, total]) => ({ status, total }))
      .sort((left, right) => right.total - left.total),
    by_category: Array.from(byCategory.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((left, right) => right.total - left.total),
  };
}

export function buildConversationIntelligencePayload(threads = [], incidents = []) {
  const normalizedThreads = threads.map(normalizeConversationThread);
  const normalizedIncidents = incidents.map(normalizeIncident);

  return {
    summary: {
      ...summarizeConversationThreads(normalizedThreads),
      ...summarizeIncidents(normalizedIncidents),
    },
    threads: normalizedThreads,
    incidents: normalizedIncidents,
  };
}

export function normalizeImportedThread(row = {}) {
  return {
    source_system: row.source_system || "freshworks",
    source_conversation_id: row.source_conversation_id || row.id || null,
    workspace_id: row.workspace_id || null,
    contact_id: row.contact_id || row.contato_id || null,
    process_id: row.process_id || row.processo_id || null,
    channel: row.channel || row.canal || "desconhecido",
    status: row.status || "open",
    subject: row.subject || row.assunto || "Sem assunto",
    last_message: row.last_message || row.ultima_mensagem || null,
    started_at: row.started_at || row.created_at || row.created_date || null,
    last_message_at:
      row.last_message_at || row.ultima_mensagem_at || row.updated_at || row.updated_date || null,
    assigned_to: row.assigned_to || null,
    sentiment_label: row.sentiment_label || null,
    urgency_label: row.urgency_label || null,
    intent_label: row.intent_label || null,
    handoff_required: Boolean(row.handoff_required || false),
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    raw_payload: row.raw_payload || row,
  };
}

export function normalizeImportedIncident(row = {}) {
  return {
    source_system: row.source_system || "agentlab",
    category: row.category || "operacional",
    severity: row.severity || "media",
    status: row.status || "open",
    title: row.title || "Incidente sem titulo",
    description: row.description || "",
    agent_ref: row.agent_ref || null,
    conversation_id: row.conversation_id || null,
    internal_user_id: row.internal_user_id || null,
    internal_user_email: row.internal_user_email || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    occurred_at: row.occurred_at || row.created_at || null,
  };
}
