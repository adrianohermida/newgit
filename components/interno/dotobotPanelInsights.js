export function extractAgentLabSubagents(agentLabData, activeTask) {
  const orchestrationAgents = Array.isArray(activeTask?.orchestration?.subagents) ? activeTask.orchestration.subagents : [];
  const governanceAgents = Array.isArray(agentLabData?.governance?.profiles) ? agentLabData.governance.profiles : [];
  if (orchestrationAgents.length) {
    return orchestrationAgents.map((agent, index) => ({
      id: agent?.id || `subagent_${index}`,
      role: agent?.role || agent?.label || `Subagente ${index + 1}`,
      stageCount: Array.isArray(agent?.stages) ? agent.stages.length : 0,
      moduleCount: Array.isArray(agent?.module_keys) ? agent.module_keys.length : 0,
      status: activeTask?.status || "running",
    }));
  }
  return governanceAgents.slice(0, 6).map((agent, index) => ({
    id: agent?.id || `agentlab_${index}`,
    role: agent?.label || agent?.name || `AgentLab ${index + 1}`,
    stageCount: 0,
    moduleCount: 0,
    status: agent?.status || "ready",
  }));
}

export function formatRuntimeTimeLabel(value) {
  if (!value) return "agora";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "sem data";
  const diffMinutes = Math.max(0, Math.round((Date.now() - parsed) / 60000));
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} h`;
  return `${Math.round(diffHours / 24)} d`;
}

export function buildAgentLabQueuePreview(queue = [], limit = 4) {
  return queue.slice(0, limit).map((item, index) => ({ id: item?.id || `queue_${index}`, title: item?.title || item?.description || `Fila ${index + 1}`, priority: item?.priority || "media", status: item?.status || "backlog", agentRef: item?.agent_ref || "dotobot-ai", updatedAt: item?.updated_at || item?.created_at || null }));
}

export function buildAgentLabSyncPreview(syncRuns = [], limit = 4) {
  return syncRuns.slice(0, limit).map((item, index) => ({ id: item?.id || `sync_${index}`, source: item?.source_name || item?.entity || "fonte", scope: item?.sync_scope || item?.filter_name || "sync", status: item?.status || "completed", records: Number(item?.records_synced || item?.source_total || 0) || 0, createdAt: item?.created_at || item?.started_at || item?.completed_at || null }));
}

export function buildAgentLabTrainingPreview(runs = [], limit = 3) {
  return runs.slice(0, limit).map((item, index) => ({ id: item?.id || `training_${index}`, agentRef: item?.agent_ref || "dotobot-ai", status: item?.status || "completed", provider: item?.provider || "local", score: Number(item?.scores?.overall ?? 0), createdAt: item?.created_at || null }));
}

export function buildAgentLabIncidentPreview(incidents = [], limit = 4) {
  return incidents.slice(0, limit).map((item, index) => ({ id: item?.id || `incident_${index}`, title: item?.title || item?.description || `Incidente ${index + 1}`, severity: item?.severity || "media", status: item?.status || "open", category: item?.category || "geral", occurredAt: item?.occurred_at || item?.created_at || null }));
}

export function buildLinkedDotobotTaskRuns(taskRuns = [], { routePath, activeTask, activeConversation } = {}) {
  const normalizedMission = String(activeTask?.query || activeTask?.title || "").trim().toLowerCase();
  const normalizedConversation = String(activeConversation?.title || "").trim().toLowerCase();
  return taskRuns.filter((run) => {
    if (!run) return false;
    if (activeTask?.id && run.id === activeTask.id) return true;
    if (routePath && run.route === routePath) return true;
    const mission = String(run.mission || "").trim().toLowerCase();
    return Boolean((normalizedMission && mission && mission.includes(normalizedMission.slice(0, 24))) || (normalizedConversation && mission && mission.includes(normalizedConversation.slice(0, 24))));
  }).slice(0, 4);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseProviderPresentation(value) {
  if (value && typeof value === "object") {
    const meta = [value.model, value.status, value.transport, value.runtimeMode, value.host ? `host:${value.host}` : null].filter(Boolean);
    return { name: value.displayLabel || value.label || value.value || "Provider", meta: meta.slice(0, 5), status: value.status || null, endpoint: value.endpoint || null, reason: value.reason || null };
  }
  const segments = String(value || "").split("·").map((item) => item.trim()).filter(Boolean);
  const status = segments.slice(1).find((item) => ["operational", "degraded", "failed"].includes(String(item).toLowerCase())) || null;
  return { name: segments[0] || String(value || "Provider"), meta: segments.slice(1), status, endpoint: null, reason: null };
}

export function formatInlinePanelValue(value) {
  if (value == null || value === "") return "n/a";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return value.map((entry) => formatInlinePanelValue(entry)).join(", ");
  if (typeof value === "object") {
    if (typeof value.label === "string" && value.label.trim()) return value.label;
    if (typeof value.value === "string" || typeof value.value === "number") return String(value.value);
    if (typeof value.type === "string" && value.type.trim()) return value.type;
    try { return JSON.stringify(value); } catch { return "[objeto]"; }
  }
  return String(value);
}
