import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog, updateActivityLog } from "../../../lib/admin/activity-log";
import { buildAdminInteractionMessage, buildAiTaskDiagnostic } from "./aiTaskRunDiagnostics";
import { AI_TASK_CONSOLE_META } from "./aiTaskRunConsoleMeta";
import { mapTaskRunSteps } from "./aiTaskRunStepMapper";
import { markTasksAsFailed } from "./aiTaskRunStateHelpers";
import { applyAiTaskRagSnapshot, applyAiTaskResultMeta, buildAiTaskExecutionContext, updateAiTaskRunHistory } from "./aiTaskRunExecuteShared";

export async function executeAiTaskRunRemote(props) {
  const { detectModules, extractTaskRunMemoryMatches, formatExecutionSourceLabel, normalizedMission, nowIso, patchThinking, pushLog, routePath, runEventIdsRef, setActiveRun, setAutomation, setContextSnapshot, setError, setEventsTotal, setMissionHistory, setSelectedTaskId, setTasks } = props;
  const startStartedAt = Date.now();
  const startLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const context = buildAiTaskExecutionContext({ ...props, normalizedMission, effectiveProvider: props.effectiveProvider });
  pushLog({ type: "api", action: "Iniciando TaskRun", result: "POST /api/admin-lawdesk-chat (action=task_run_start)" });
  try {
    appendActivityLog({
      id: startLogId, module: "ai-task", component: "AITaskRun", label: "AI Task: iniciar run", action: "ai_task_run_start", method: "POST", path: "/api/admin-lawdesk-chat", expectation: "Criar uma nova run da missao no backend", ...AI_TASK_CONSOLE_META, status: "running", startedAt: startStartedAt,
      request: buildAiTaskDiagnostic({ title: "AI Task start", summary: normalizedMission, sections: [{ label: "mission", value: normalizedMission }, { label: "mode", value: props.mode }, { label: "provider", value: props.effectiveProvider }, { label: "attachments", value: props.attachments }, { label: "context", value: context }] }),
    });
    const payload = await adminFetch("/api/admin-lawdesk-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "task_run_start", query: normalizedMission, mode: props.mode, provider: props.effectiveProvider, context }) });
    const normalized = props.normalizeTaskRunPayload(payload);
    updateActivityLog(startLogId, {
      status: normalized?.status === "failed" ? "error" : "success",
      durationMs: Date.now() - startStartedAt,
      response: buildAiTaskDiagnostic({ title: "AI Task start result", summary: normalized?.status || "run_started", sections: [{ label: "run", value: normalized?.run || null }, { label: "events", value: (normalized?.events || []).slice(-12) }, { label: "steps", value: (normalized?.steps || []).slice(-12) }, { label: "rag", value: normalized?.rag || null }] }),
    });
    const run = normalized.run;
    if (run?.id) setActiveRun({ id: run.id, startedAt: run.created_at || nowIso(), mission: normalizedMission });
    normalized.events.slice(-12).forEach((event) => {
      if (event?.id) runEventIdsRef.current.add(event.id);
      const source = event?.data?.source ? formatExecutionSourceLabel(event.data.source) : null;
      const model = event?.data?.model || null;
      pushLog({ type: "backend", action: event?.type || "task_run_event", result: `${event?.message || "Evento sem mensagem."}${source ? ` [${source}${model ? ` / ${model}` : ""}]` : ""}` });
    });
    props.lastEventCursorRef.current = normalized.eventsCursor || normalized.events.at(-1)?.id || null;
    props.lastEventSequenceRef.current = normalized.eventsCursorSequence ?? Number(normalized.events.at(-1)?.seq) || null;
    if (normalized.eventsTotal != null) setEventsTotal(normalized.eventsTotal); else if (normalized.events.length) setEventsTotal(normalized.events.length);
    if (normalized.steps.length) {
      const mappedTasks = mapTaskRunSteps(normalized.steps, { runId: run?.id || props.localRunId, nowIso, fallbackDescription: "Execucao do backend", normalizeTaskStepStatus: (status) => (status === "ok" ? "done" : status === "fail" ? "failed" : "running"), inferTaskPriority: () => "high", classifyTaskAgent: (step) => step?.tool || "Dotobot" });
      setTasks(mappedTasks);
      setSelectedTaskId(mappedTasks[0]?.id || null);
      patchThinking((current) => [{ id: `${Date.now()}_response`, title: "Resposta operacional", timestamp: nowIso(), summary: "Backend retornou passos reais para auditoria.", details: normalized.steps.slice(0, 6).map((step) => step?.action || step?.title || JSON.stringify(step)), expanded: true }, ...current]);
    } else {
      setTasks((current) => current.map((task) => ({ ...task, status: run?.status === "failed" ? "failed" : run?.status === "completed" ? "done" : task.status, updated_at: nowIso() })));
    }
    applyAiTaskResultMeta({ normalized, pushLog, setExecutionModel: props.setExecutionModel, setExecutionSource: props.setExecutionSource, setEventsTotal: props.setEventsTotal, setLatestResult: props.setLatestResult });
    applyAiTaskRagSnapshot({ detectModules, extractTaskRunMemoryMatches, normalized, normalizedMission, routePath, setContextSnapshot });
    updateAiTaskRunHistory({ historyId: props.localRunId, normalized, nowIso, setMissionHistory });
    if (["completed", "failed", "canceled"].includes(normalized.status)) setActiveRun(null);
    setAutomation(normalized.status === "completed" ? "done" : normalized.status === "failed" ? "failed" : "running");
    pushLog({ type: "critic", action: "Validacao", result: normalized.status === "completed" ? "Execucao concluida com trilha de eventos do backend." : normalized.status === "failed" ? "Execucao falhou no backend com status rastreavel." : "Execucao iniciada no backend e aguardando conclusao." });
  } catch (missionError) {
    const message = buildAdminInteractionMessage(missionError, "Falha ao executar a missao.");
    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, module: "ai-task", component: "AITaskRun", label: "AI Task: falha na execucao", action: "ai_task_run_error", method: "POST", path: "/api/admin-lawdesk-chat", ...AI_TASK_CONSOLE_META, status: "error", startedAt: Date.now(),
      error: buildAiTaskDiagnostic({ title: "Falha na execucao do AI Task", summary: message, sections: [{ label: "mission", value: normalizedMission }, { label: "mode", value: props.mode }, { label: "provider", value: props.provider }, { label: "error", value: missionError?.payload || missionError?.stack || missionError }] }),
    });
    setError(message);
    setAutomation("failed");
    setMissionHistory((current) => current.map((item) => (item.id === props.localRunId ? { ...item, status: "failed", updated_at: nowIso(), error: message } : item)));
    setTasks((current) => markTasksAsFailed(current, nowIso, message));
    pushLog({ type: "error", action: "Execucao interrompida", result: message });
  } finally {
    props.abortRef.current = null;
  }
}
