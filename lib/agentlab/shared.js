function toArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

export function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = typeof key === "function" ? key(item) : item?.[key];
    const normalized = value || "nao_informado";
    acc[normalized] = (acc[normalized] || 0) + 1;
    return acc;
  }, {});
}

export function topEntries(record, limit = 5) {
  return Object.entries(record || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

export function summarizeConversations(threads = []) {
  const channelCounts = countBy(threads, "channel");
  const statusCounts = countBy(threads, "status");
  const intentCounts = countBy(
    threads.filter((item) => item.intent_label),
    "intent_label"
  );
  const handoffs = threads.filter((item) => item.handoff_required).length;
  const withErrors = threads.filter((item) => item.metadata?.error_flag).length;

  return {
    total: threads.length,
    handoffs,
    withErrors,
    channels: topEntries(channelCounts, 6),
    statuses: topEntries(statusCounts, 6),
    intents: topEntries(intentCounts, 8),
  };
}

export function summarizeIncidents(incidents = []) {
  return {
    total: incidents.length,
    open: incidents.filter((item) => item.status === "open").length,
    byCategory: topEntries(countBy(incidents, "category"), 8),
    bySeverity: topEntries(countBy(incidents, "severity"), 8),
  };
}

export function summarizeTrainingRuns(runs = []) {
  const scores = runs
    .map((item) => Number(item?.scores?.overall ?? item?.raw_result?.overall ?? 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  const averageScore = scores.length
    ? Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100)
    : 0;

  return {
    total: runs.length,
    averageScore,
    statusBreakdown: topEntries(countBy(runs, "status"), 6),
  };
}

export function normalizeAgentProfile(profile) {
  if (!profile) return null;
  return {
    ...profile,
    knowledge_strategy: toArray(profile.knowledge_strategy),
    workflow_strategy: toArray(profile.workflow_strategy),
    handoff_rules: toArray(profile.handoff_rules),
  };
}

export function buildInsightSummary(data) {
  const conversations = summarizeConversations(data.conversationThreads || []);
  const incidents = summarizeIncidents(data.incidents || []);
  const training = summarizeTrainingRuns(data.trainingRuns || []);

  return {
    mappedAgents: (data.agents || []).length,
    configuredProfiles: (data.agentProfiles || []).length,
    queueItems: (data.improvementQueue || []).length,
    syncRuns: (data.syncRuns || []).length,
    crmSnapshots: (data.crmSnapshots || []).length,
    importedConversations: conversations.total,
    openIncidents: incidents.open,
    trainingRuns: training.total,
    trainingAverageScore: training.averageScore,
  };
}

export function buildAgentMap(agents = [], profiles = []) {
  const profileMap = new Map(
    profiles.map((profile) => [String(profile.agent_ref || "").toLowerCase(), normalizeAgentProfile(profile)])
  );

  const mapped = agents.map((agent) => {
    const keys = [agent.agent_slug, agent.name, agent.nome, agent.agent_ref]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());

    const profile = keys.map((key) => profileMap.get(key)).find(Boolean) || null;

    return {
      ...agent,
      profile,
    };
  });

  for (const profile of profiles) {
    const key = String(profile.agent_ref || "").trim().toLowerCase();
    const alreadyMapped = mapped.some((item) => {
      const candidates = [item.agent_slug, item.name, item.nome, item.agent_ref]
        .filter(Boolean)
        .map((value) => String(value).trim().toLowerCase());
      return candidates.includes(key);
    });

    if (!alreadyMapped) {
      mapped.push({
        id: profile.id,
        agent_slug: profile.agent_ref,
        name: profile.agent_ref,
        status: "externo",
        profile: normalizeAgentProfile(profile),
      });
    }
  }

  return mapped;
}
