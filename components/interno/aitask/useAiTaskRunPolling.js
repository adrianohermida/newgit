import { useEffect } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog } from "../../../lib/admin/activity-log";
import { stringifyDiagnostic } from "./aiTaskRunDiagnostics";
import { AI_TASK_CONSOLE_META } from "./aiTaskRunConsoleMeta";
import { applyTaskRunPollingPayload, handleTaskRunPollingError, registerTaskRunPollSuccess } from "./aiTaskRunPollingState";

export default function useAiTaskRunPolling(props) {
  const { activeRun, automation, buildAdminInteractionMessage, classifyTaskAgent, detectModules, extractTaskRunMemoryMatches, formatExecutionSourceLabel, inferTaskPriority, lastEventCursorRef, lastEventSequenceRef, mission, normalizeTaskRunPayload, normalizeTaskStepStatus, nowIso, pollingInFlightRef, pushLog, routePath, runEventIdsRef, setActiveRun, setAutomation, setContextSnapshot, setError, setEventsTotal, setExecutionModel, setExecutionSource, setLatestResult, setMissionHistory, setSelectedTaskId, setTasks } = props;

  useEffect(() => {
    let runId = activeRun?.id;
    if (!runId) {
      const localRunId = `${Date.now()}_run`;
      setActiveRun({ id: localRunId, startedAt: nowIso(), mission });
      runId = localRunId;
    }
    if (new Set(["done", "failed", "stopped"]).has(automation)) return undefined;
    let disposed = false;
    let timerId = null;
    let nextDelayMs = 150;
    const scheduleNextPoll = (delayMs) => {
      if (!disposed) timerId = setTimeout(poll, Math.max(250, Number(delayMs) || 2500));
    };
    const poll = async () => {
      if (disposed || pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;
      try {
        const startedAt = Date.now();
        const logId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        appendActivityLog({
          id: logId,
          module: "ai-task",
          component: "AITaskPolling",
          label: "AI Task: consultar run",
          action: "ai_task_run_poll",
          method: "POST",
          path: "/api/admin-lawdesk-chat",
          expectation: "Consultar novos eventos e status da execucao",
          request: stringifyDiagnostic({ action: "task_run_get", runId, sinceEventId: lastEventCursorRef.current || null, sinceSequence: lastEventSequenceRef.current || null }),
          ...AI_TASK_CONSOLE_META,
          status: "running",
          startedAt,
        });
        const payload = await adminFetch("/api/admin-lawdesk-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "task_run_get", runId, sinceEventId: lastEventCursorRef.current || undefined, sinceSequence: lastEventSequenceRef.current || undefined, waitForChangeMs: Math.min(Math.max(nextDelayMs * 3, 1500), 10000) }),
        });
        const normalized = normalizeTaskRunPayload(payload);
        registerTaskRunPollSuccess(logId, startedAt, normalized);
        if (normalized.eventsCursor) lastEventCursorRef.current = normalized.eventsCursor;
        if (normalized.eventsCursorSequence != null) lastEventSequenceRef.current = normalized.eventsCursorSequence;
        nextDelayMs = applyTaskRunPollingPayload({
          classifyTaskAgent,
          detectModules,
          extractTaskRunMemoryMatches,
          formatExecutionSourceLabel,
          inferTaskPriority,
          mission,
          normalizeTaskStepStatus,
          normalized,
          nowIso,
          routePath,
          pushLog,
          runEventIdsRef,
          runId,
          setActiveRun,
          setAutomation,
          setContextSnapshot,
          setEventsTotal,
          setExecutionModel,
          setExecutionSource,
          setLatestResult,
          setMissionHistory,
          setSelectedTaskId,
          setTasks,
        });
      } catch (error) {
        if (!disposed) {
          nextDelayMs = handleTaskRunPollingError({
            buildAdminInteractionMessage,
            error,
            runId,
            cursors: { eventId: lastEventCursorRef.current, sequence: lastEventSequenceRef.current },
            pushLog,
            setActiveRun,
            setAutomation,
            setError,
          });
          if (!nextDelayMs) disposed = true;
        }
      } finally {
        pollingInFlightRef.current = false;
        if (!disposed && activeRun?.id && nextDelayMs > 0) scheduleNextPoll(nextDelayMs);
      }
    };
    scheduleNextPoll(nextDelayMs);
    return () => {
      disposed = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [activeRun?.id, automation, buildAdminInteractionMessage, classifyTaskAgent, detectModules, extractTaskRunMemoryMatches, formatExecutionSourceLabel, inferTaskPriority, mission, normalizeTaskRunPayload, normalizeTaskStepStatus, nowIso, pollingInFlightRef, pushLog, routePath, runEventIdsRef, setActiveRun, setAutomation, setContextSnapshot, setError, setEventsTotal, setExecutionModel, setExecutionSource, setLatestResult, setMissionHistory, setSelectedTaskId, setTasks]);
}
