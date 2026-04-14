import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog, updateActivityLog } from "../../../lib/admin/activity-log";
import { buildAiTaskDiagnostic, stringifyDiagnostic } from "./aiTaskRunDiagnostics";
import { AI_TASK_CONSOLE_META } from "./aiTaskRunConsoleMeta";
import { markTasksAsFailed, resetRunTracking } from "./aiTaskRunStateHelpers";

export async function stopAiTaskRun(props) {
  const { abortRef, activeRun, lastEventCursorRef, lastEventSequenceRef, nowIso, pushLog, runEventIdsRef, setActiveRun, setAutomation, setEventsTotal, setPaused, setTasks } = props;
  abortRef.current?.abort();
  const runId = activeRun?.id;
  if (runId) {
    try {
      const cancelStartedAt = Date.now();
      const cancelLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      appendActivityLog({
        id: cancelLogId,
        module: "ai-task",
        component: "AITaskRun",
        label: "AI Task: cancelar run",
        action: "ai_task_run_cancel",
        method: "POST",
        path: "/api/admin-lawdesk-chat",
        expectation: "Cancelar a execucao ativa",
        ...AI_TASK_CONSOLE_META,
        request: stringifyDiagnostic({ action: "task_run_cancel", runId }),
        status: "running",
        startedAt: cancelStartedAt,
      });
      const payload = await adminFetch("/api/admin-lawdesk-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "task_run_cancel", runId }),
      });
      updateActivityLog(cancelLogId, {
        status: "success",
        durationMs: Date.now() - cancelStartedAt,
        response: buildAiTaskDiagnostic({
          title: "AI Task cancel",
          summary: payload?.data?.run?.status || "cancel_requested",
          sections: [{ label: "payload", value: payload }],
        }),
      });
      if (payload?.data?.run?.status === "canceled") {
        pushLog({ type: "backend", action: "run.canceled", result: "Cancelamento confirmado pelo backend." });
      }
    } catch (cancelError) {
      appendActivityLog({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        module: "ai-task",
        component: "AITaskRun",
        label: "AI Task: falha ao cancelar",
        action: "ai_task_run_cancel_error",
        method: "POST",
        path: "/api/admin-lawdesk-chat",
        ...AI_TASK_CONSOLE_META,
        status: "error",
        startedAt: Date.now(),
        error: buildAiTaskDiagnostic({
          title: "Falha ao cancelar AI Task",
          summary: cancelError?.message || "Falha ao confirmar cancelamento.",
          sections: [
            { label: "runId", value: runId },
            { label: "error", value: cancelError?.payload || cancelError?.stack || cancelError },
          ],
        }),
      });
      pushLog({ type: "warning", action: "Cancelamento parcial", result: cancelError?.message || "Falha ao confirmar cancelamento no backend." });
    }
  }

  props.pauseRef.current = false;
  setPaused(false);
  setAutomation("stopped");
  resetRunTracking({ runEventIdsRef, lastEventCursorRef, lastEventSequenceRef });
  setEventsTotal(0);
  setActiveRun(null);
  setTasks((current) => markTasksAsFailed(current, nowIso, "Interrompido pelo operador."));
  pushLog({ type: "control", action: "Execucao parada", result: "Operador interrompeu a orquestracao." });
}
