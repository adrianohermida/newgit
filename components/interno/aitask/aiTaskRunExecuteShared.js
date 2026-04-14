import { summarizeTaskRunOrchestration } from "./aiTaskAdapters";
import { updateHistoryItem } from "./aiTaskRunStateHelpers";

export function buildAiTaskExecutionContext(props) {
  const { attachments, approved, effectiveProvider, mode, normalizedMission, profile, routePath, selectedSkillId } = props;
  return {
    route: routePath || "/interno/ai-task",
    mission: normalizedMission,
    mode,
    provider: effectiveProvider,
    forceIntent: selectedSkillId ? "skill" : undefined,
    selectedSkillId: selectedSkillId || undefined,
    selectedSkill: selectedSkillId ? { id: selectedSkillId } : undefined,
    approved,
    attachments,
    assistant: { surface: "ai-task", orchestration: "planner-executor-critic" },
    profile: { id: profile?.id || null, email: profile?.email || null, role: profile?.role || null },
  };
}

export function applyAiTaskResultMeta(props) {
  const { normalized, pushLog, setExecutionModel, setExecutionSource, setEventsTotal, setLatestResult } = props;
  if (normalized.source) setExecutionSource(normalized.source);
  if (normalized.model) setExecutionModel(normalized.model);
  if (normalized.eventsTotal != null) setEventsTotal(normalized.eventsTotal);
  if (!normalized.resultText) return;
  setLatestResult(normalized.resultText);
  pushLog({
    type: "reporter",
    action: props.emptyLabel || "Resposta recebida",
    result: `${normalized.resultText.slice(0, 160)}${normalized.model ? ` [${normalized.model}]` : ""}`,
  });
}

export function applyAiTaskRagSnapshot(props) {
  const { detectModules, extractTaskRunMemoryMatches, normalized, normalizedMission, routePath, setContextSnapshot } = props;
  if (!normalized.rag) return;
  setContextSnapshot({
    module: detectModules(normalizedMission).join(", "),
    memory: extractTaskRunMemoryMatches(normalized.rag),
    documents: normalized.rag?.documents || [],
    ragEnabled: Boolean(normalized.rag?.retrieval?.enabled || normalized.rag?.documents?.length),
    route: routePath || "/interno/ai-task",
    orchestration: normalized.orchestration || null,
  });
}

export function updateAiTaskRunHistory(props) {
  const { historyId, normalized, nowIso, setMissionHistory } = props;
  const orchestrationSummary = summarizeTaskRunOrchestration(normalized.orchestration);
  setMissionHistory((current) =>
    updateHistoryItem(current, (item) => item.id === historyId, (item) => ({
      ...item,
      id: normalized.run?.id || item.id,
      status: normalized.status === "completed" ? "done" : normalized.status === "failed" ? "failed" : "running",
      updated_at: nowIso(),
      result: normalized.run?.result?.status || normalized.status,
      source: normalized.source || item.source || null,
      model: normalized.model || item.model || null,
      orchestration: normalized.orchestration || item.orchestration || null,
      module: orchestrationSummary.moduleKeys.join(", ") || item.module || null,
      eventsTotal: normalized.eventsTotal != null ? normalized.eventsTotal : item.eventsTotal,
      error: normalized.run?.error || item.error,
    }))
  );
}
