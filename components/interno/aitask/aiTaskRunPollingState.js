import { appendActivityLog, updateActivityLog } from "../../../lib/admin/activity-log";
import { summarizeTaskRunOrchestration } from "./aiTaskAdapters";
import { buildAiTaskDiagnostic, isAdminAuthenticationFailure, isAdminRuntimeUnavailable } from "./aiTaskRunDiagnostics";
import { mapTaskRunSteps } from "./aiTaskRunStepMapper";
import { markTasksAsDone, markTasksAsFailed, updateHistoryItem } from "./aiTaskRunStateHelpers";
import { AI_TASK_CONSOLE_META } from "./aiTaskRunConsoleMeta";

export function applyTaskRunPollingPayload(props) {
  const { detectModules, extractTaskRunMemoryMatches, formatExecutionSourceLabel, normalized, nowIso, pushLog, runId, runEventIdsRef, setActiveRun, setAutomation, setContextSnapshot, setEventsTotal, setExecutionModel, setExecutionSource, setLatestResult, setMissionHistory, setSelectedTaskId, setTasks } = props;
  const run = normalized.run;
  if (normalized.eventsTotal != null) setEventsTotal(normalized.eventsTotal);
  for (const event of normalized.events.slice(-20)) {
    const eventId = event?.id;
    if (!eventId || runEventIdsRef.current.has(eventId)) continue;
    runEventIdsRef.current.add(eventId);
    const eventSource = event?.data?.source ? formatExecutionSourceLabel(event.data.source) : null;
    const eventModel = event?.data?.model || null;
    pushLog({ type: "backend", action: event?.type || "task_run_event", result: `${event?.message || "Evento sem mensagem."}${eventSource ? ` [${eventSource}${eventModel ? ` / ${eventModel}` : ""}]` : ""}` });
  }
  if (normalized.source) setExecutionSource(normalized.source);
  if (normalized.model) setExecutionModel(normalized.model);
  if (normalized.resultText) setLatestResult(normalized.resultText);
  if (normalized.steps.length) {
    const mappedTasks = mapTaskRunSteps(normalized.steps, {
      runId: run?.id || runId,
      nowIso,
      fallbackDescription: "Execucao do backend",
      normalizeTaskStepStatus: props.normalizeTaskStepStatus,
      inferTaskPriority: props.inferTaskPriority,
      classifyTaskAgent: props.classifyTaskAgent,
    });
    setTasks(mappedTasks);
    setSelectedTaskId(mappedTasks[0]?.id || null);
  }
  if (normalized.rag) {
    setContextSnapshot((current) => ({
      ...(current || {}),
      module: detectModules(run?.mission || props.mission).join(", "),
      memory: extractTaskRunMemoryMatches(normalized.rag),
      documents: normalized.rag?.documents || [],
      ragEnabled: Boolean(normalized.rag?.retrieval?.enabled || normalized.rag?.documents?.length),
      route: props.routePath || "/interno/ai-task",
      orchestration: normalized.orchestration || current?.orchestration || null,
    }));
  }
  if (normalized.orchestration) {
    const orchestrationSummary = summarizeTaskRunOrchestration(normalized.orchestration);
    setMissionHistory((current) => updateHistoryItem(current, (item) => item.id === runId, (item) => ({ ...item, orchestration: normalized.orchestration, module: orchestrationSummary.moduleKeys.join(", ") || item.module || null })));
  }
  const runStatus = run?.status;
  if (!["completed", "failed", "canceled"].includes(runStatus)) return normalized.pollIntervalMs != null ? normalized.pollIntervalMs : 2500;
  setAutomation(runStatus === "completed" ? "done" : runStatus === "canceled" ? "stopped" : "failed");
  setActiveRun(null);
  setMissionHistory((current) => updateHistoryItem(current, (item) => item.id === runId, (item) => ({ ...item, status: runStatus === "completed" ? "done" : "failed", updated_at: nowIso(), result: run?.result?.status || runStatus, error: run?.error || item.error })));
  if (runStatus === "completed") setTasks((current) => markTasksAsDone(current, nowIso));
  if (runStatus === "failed" || runStatus === "canceled") setTasks((current) => markTasksAsFailed(current, nowIso, run?.error || "Execucao interrompida.", true));
  return 0;
}

export function handleTaskRunPollingError(props) {
  const { error, runId, cursors, pushLog, setActiveRun, setAutomation, setError } = props;
  appendActivityLog({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    module: "ai-task",
    component: "AITaskPolling",
    label: "AI Task: falha ao consultar run",
    action: "ai_task_run_poll_error",
    method: "POST",
    path: "/api/admin-lawdesk-chat",
    ...AI_TASK_CONSOLE_META,
    status: "error",
    startedAt: Date.now(),
    error: buildAiTaskDiagnostic({
      title: "Falha no polling do AI Task",
      summary: error?.message || "Falha ao consultar status da execucao.",
      sections: [
        { label: "error", value: error?.payload || error?.stack || error },
        { label: "runId", value: runId },
        { label: "cursor", value: cursors },
      ],
    }),
  });
  pushLog({ type: "warning", action: "Polling TaskRun", result: error?.message || "Falha ao consultar status da execucao." });
  if (isAdminRuntimeUnavailable(error)) {
    setError(error?.message || "Runtime administrativo indisponivel.");
    setAutomation("failed");
    setActiveRun(null);
    return 0;
  }
  if (isAdminAuthenticationFailure(error)) {
    setError(props.buildAdminInteractionMessage(error, "Sessao administrativa indisponivel."));
    setAutomation("failed");
    setActiveRun(null);
    return 0;
  }
  return 4000;
}

export function registerTaskRunPollSuccess(logId, startedAt, normalized) {
  updateActivityLog(logId, {
    status: "success",
    durationMs: Date.now() - startedAt,
    response: buildAiTaskDiagnostic({
      title: "AI Task poll",
      summary: normalized?.status || "poll_ok",
      sections: [
        { label: "run", value: normalized?.run || null },
        { label: "events", value: (normalized?.events || []).slice(-8) },
        { label: "steps", value: (normalized?.steps || []).slice(-8) },
        { label: "rag", value: normalized?.rag || null },
      ],
    }),
  });
}
