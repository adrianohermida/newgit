import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog, updateActivityLog } from "../../../lib/admin/activity-log";
import { buildAdminInteractionMessage, buildAiTaskDiagnostic, stringifyDiagnostic } from "./aiTaskRunDiagnostics";
import { AI_TASK_CONSOLE_META } from "./aiTaskRunConsoleMeta";
import { resetRunTracking } from "./aiTaskRunStateHelpers";

export async function continueAiTaskRun(props) {
  const { lastEventCursorRef, lastEventSequenceRef, mission, missionHistory, mode, nowIso, provider, pushLog, runEventIdsRef, setActiveRun, setAutomation, setError, setEventsTotal, setMission, setMissionHistory } = props;
  const lastRecoverable = missionHistory.find((item) => item.status === "failed" || item.status === "stopped");
  if (!lastRecoverable?.id) {
    pushLog({ type: "warning", action: "Retomada", result: "Nao ha run falhada/parada para retomar." });
    return;
  }

  try {
    setError(null);
    setAutomation("running");
    resetRunTracking({ runEventIdsRef, lastEventCursorRef, lastEventSequenceRef });
    setEventsTotal(0);
    const continueStartedAt = Date.now();
    const continueLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    appendActivityLog({
      id: continueLogId,
      module: "ai-task",
      component: "AITaskRun",
      label: "AI Task: retomar run",
      action: "ai_task_run_continue",
      method: "POST",
      path: "/api/admin-lawdesk-chat",
      expectation: "Retomar uma run falhada ou parada",
      ...AI_TASK_CONSOLE_META,
      request: stringifyDiagnostic({ action: "task_run_continue", runId: lastRecoverable.id, mission: lastRecoverable.mission, mode: lastRecoverable.mode, provider: lastRecoverable.provider }),
      status: "running",
      startedAt: continueStartedAt,
    });
    const payload = await adminFetch("/api/admin-lawdesk-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "task_run_continue", runId: lastRecoverable.id, waitForCompletion: false }),
    });

    const normalized = props.normalizeTaskRunPayload(payload);
    updateActivityLog(continueLogId, {
      status: "success",
      durationMs: Date.now() - continueStartedAt,
      response: buildAiTaskDiagnostic({
        title: "AI Task continue",
        summary: normalized?.status || "continue_requested",
        sections: [
          { label: "run", value: normalized?.run || null },
          { label: "events", value: (normalized?.events || []).slice(-8) },
        ],
      }),
    });
    const continuedRun = normalized.run;
    if (continuedRun?.id) {
      setActiveRun({ id: continuedRun.id, startedAt: continuedRun.created_at || nowIso(), mission: continuedRun.mission || lastRecoverable.mission || mission });
      setMission(continuedRun.mission || lastRecoverable.mission || mission);
      setMissionHistory((current) => [
        {
          id: continuedRun.id,
          mission: continuedRun.mission || lastRecoverable.mission || mission,
          mode: continuedRun.mode || mode,
          provider: continuedRun.provider || provider,
          status: "running",
          source: null,
          model: null,
          created_at: continuedRun.created_at || nowIso(),
          updated_at: continuedRun.updated_at || nowIso(),
        },
        ...current,
      ].slice(0, 80));
    }
    if (normalized.eventsTotal != null) setEventsTotal(normalized.eventsTotal);
    pushLog({
      type: "control",
      action: "Retomada iniciada",
      result: continuedRun?.id ? `Run retomado com novo id ${continuedRun.id}.` : "Run anterior ainda estava em execucao; acompanhamento mantido.",
    });
  } catch (continueError) {
    const message = buildAdminInteractionMessage(continueError, "Falha ao retomar run.");
    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      module: "ai-task",
      component: "AITaskRun",
      label: "AI Task: falha ao retomar",
      action: "ai_task_run_continue_error",
      method: "POST",
      path: "/api/admin-lawdesk-chat",
      ...AI_TASK_CONSOLE_META,
      status: "error",
      startedAt: Date.now(),
      error: buildAiTaskDiagnostic({
        title: "Falha ao retomar AI Task",
        summary: message,
        sections: [
          { label: "run", value: lastRecoverable },
          { label: "error", value: continueError?.payload || continueError?.stack || continueError },
        ],
      }),
    });
    setError(message);
    setAutomation("failed");
    pushLog({ type: "error", action: "Retomada falhou", result: message });
  }
}
