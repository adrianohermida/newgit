import { appendActivityLog, updateActivityLog } from "../../../lib/admin/activity-log";
import { invokeBrowserLocalExecute, normalizeBrowserLocalTaskRun } from "../../../lib/lawdesk/browser-local-runtime";
import { buildAiTaskDiagnostic } from "./aiTaskRunDiagnostics";
import { AI_TASK_CONSOLE_META } from "./aiTaskRunConsoleMeta";
import { mapTaskRunSteps } from "./aiTaskRunStepMapper";
import { markTasksAsFailed } from "./aiTaskRunStateHelpers";
import { applyAiTaskRagSnapshot, applyAiTaskResultMeta, buildAiTaskExecutionContext, updateAiTaskRunHistory } from "./aiTaskRunExecuteShared";

export async function executeAiTaskRunLocal(props) {
  const { attachments, classifyTaskAgent, detectModules, effectiveProvider, extractTaskRunMemoryMatches, inferTaskPriority, mode, normalizeTaskStepStatus, normalizedMission, nowIso, patchThinking, profile, pushLog, routePath, selectedSkillId, setActiveRun, setAutomation, setContextSnapshot, setError, setEventsTotal, setExecutionModel, setExecutionSource, setLatestResult, setMissionHistory, setSelectedTaskId, setTasks } = props;
  const localStartedAt = nowIso();
  const startStartedAt = Date.now();
  const startLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const localContext = buildAiTaskExecutionContext({ ...props, effectiveProvider, normalizedMission, profile, routePath, selectedSkillId });
  pushLog({ type: "api", action: "Iniciando AI Core local", result: "POST browser://local-ai-core/execute" });
  appendActivityLog({
    id: startLogId, module: "ai-task", component: "AITaskRun", label: "AI Task: iniciar run local", action: "ai_task_run_start_local", method: "POST", path: "browser://local-ai-core/execute",
    expectation: "Criar uma execucao local no ai-core do navegador", ...AI_TASK_CONSOLE_META, startedAt: startStartedAt, status: "running",
    request: buildAiTaskDiagnostic({ title: "AI Task local start", summary: normalizedMission, sections: [{ label: "mission", value: normalizedMission }, { label: "mode", value: mode }, { label: "provider", value: effectiveProvider }, { label: "attachments", value: attachments }, { label: "context", value: localContext }] }),
  });
  try {
    const rawLocalPayload = await invokeBrowserLocalExecute({ query: normalizedMission, context: localContext });
    const normalized = normalizeBrowserLocalTaskRun(rawLocalPayload, { runId: props.localRunId, mission: normalizedMission, mode, provider: effectiveProvider, startedAt: localStartedAt });
    const backendSteps = normalized.steps || [];
    updateActivityLog(startLogId, {
      status: normalized?.status === "failed" ? "error" : "success",
      durationMs: Date.now() - startStartedAt,
      response: buildAiTaskDiagnostic({ title: "AI Task local result", summary: normalized?.status || "completed", sections: [{ label: "run", value: normalized?.run || null }, { label: "events", value: normalized?.events || [] }, { label: "steps", value: backendSteps }, { label: "rag", value: normalized?.rag || null }] }),
    });
    if (backendSteps.length) {
      const mappedTasks = mapTaskRunSteps(backendSteps, { runId: normalized.run?.id || props.localRunId, nowIso, fallbackDescription: "Execucao local do ai-core", normalizeTaskStepStatus, inferTaskPriority, classifyTaskAgent }).map((task) => ({ ...task, created_at: localStartedAt }));
      setTasks(mappedTasks);
      setSelectedTaskId(mappedTasks[0]?.id || null);
    }
    applyAiTaskResultMeta({ normalized, pushLog, setExecutionModel, setExecutionSource, setEventsTotal, setLatestResult, emptyLabel: "Resposta local recebida" });
    applyAiTaskRagSnapshot({ detectModules, extractTaskRunMemoryMatches, normalized, normalizedMission, routePath, setContextSnapshot });
    patchThinking((current) => [{ id: `${Date.now()}_local_response`, title: "Resposta operacional local", timestamp: nowIso(), summary: normalized.orchestration?.multi_agent ? `O ai-core local distribuiu a missao entre ${normalized.orchestration?.subagents?.length || 0} subagentes.` : "O ai-core local executou a trilha diretamente no navegador.", details: (backendSteps.length ? backendSteps : normalized.events || []).slice(0, 6).map((item) => item?.action || item?.title || item?.type || `${item?.agent_role || "Executor"} · ${item?.stage || "execution"}`), expanded: true }, ...current]);
    updateAiTaskRunHistory({ historyId: props.localRunId, normalized, nowIso, setMissionHistory });
    setAutomation(normalized.status === "completed" ? "done" : "failed");
    setActiveRun(null);
    pushLog({ type: "critic", action: "Validacao local", result: normalized.status === "completed" ? "Execucao local concluida com sucesso." : "Execucao local terminou com falhas rastreaveis no ai-core." });
  } catch (missionError) {
    const message = missionError?.message || "Falha ao executar a missao no ai-core local.";
    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, module: "ai-task", component: "AITaskRun", label: "AI Task: falha na execucao local", action: "ai_task_run_local_error", method: "POST", path: "browser://local-ai-core/execute", ...AI_TASK_CONSOLE_META, status: "error", startedAt: Date.now(),
      error: buildAiTaskDiagnostic({ title: "Falha na execucao local do AI Task", summary: message, sections: [{ label: "mission", value: normalizedMission }, { label: "mode", value: mode }, { label: "provider", value: props.provider }, { label: "error", value: missionError?.payload || missionError?.stack || missionError }] }),
    });
    setError(message);
    setAutomation("failed");
    setMissionHistory((current) => current.map((item) => (item.id === props.localRunId ? { ...item, status: "failed", updated_at: nowIso(), error: message } : item)));
    setTasks((current) => markTasksAsFailed(current, nowIso, message, true));
    setActiveRun(null);
    pushLog({ type: "error", action: "Execucao local interrompida", result: message });
  } finally {
    props.abortRef.current = null;
  }
}
