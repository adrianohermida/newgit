import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildDiagnosticReport } from "./dotobotPanelUtils";
import { createPendingTaskRun, pollTaskRun, startTaskRun } from "./dotobotTaskRun";

export async function executeDotobotTaskRun(params) {
  params.setUiState("executing");
  const dotobotHandoff = {
    id: `${Date.now()}_dotobot_handoff`,
    label: "Tarefa criada no Dotobot",
    mission: params.trimmedQuestion,
    moduleKey: "dotobot",
    moduleLabel: "Dotobot",
    routePath: params.routePath || "/interno",
    mode: params.nextMode,
    provider: params.nextProvider,
    tags: ["ai-task", "dotobot", "task"],
    createdAt: params.nowIso(),
    conversationId: params.activeConversationId || null,
  };
  setModuleHistory("ai-task", { routePath: "/interno/ai-task", handoffFromDotobot: dotobotHandoff, consoleTags: dotobotHandoff.tags });
  appendActivityLog({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    module: "ai-task",
    component: "DotobotTaskRun",
    label: "Dotobot: handoff para AI Task",
    action: "dotobot_to_ai_task_handoff",
    method: "UI",
    path: "/interno/ai-task",
    consolePane: ["dotobot", "ai-task"],
    domain: "handoff",
    system: "copilot",
    status: "success",
    tags: dotobotHandoff.tags,
    response: buildDiagnosticReport({ title: "Handoff Dotobot -> AI Task", summary: params.trimmedQuestion, sections: [{ label: "handoff", value: dotobotHandoff }] }),
  });
  const pendingTask = createPendingTaskRun(params.trimmedQuestion, { mode: params.nextMode, provider: params.nextProvider, contextEnabled: params.nextContextEnabled });
  params.setTaskHistory((tasks) => [pendingTask, ...tasks]);
  try {
    const data = await startTaskRun({
      query: params.trimmedQuestion,
      mode: params.nextMode,
      provider: params.nextProvider,
      contextEnabled: params.nextContextEnabled,
      selectedSkillId: params.selectedSkillId,
      context: params.globalContext,
    });
    const runId = data?.run?.id || null;
    if (!runId) {
      const taskError = data?.error || "Falha ao iniciar TaskRun.";
      params.setTaskHistory((tasks) => tasks.map((task) => (task.id === pendingTask.id ? { ...task, status: "failed", logs: [...(task.logs || []), taskError] } : task)));
      params.setError(taskError);
      return;
    }
    params.setTaskHistory((tasks) => tasks.map((task) => (task.id === pendingTask.id ? { ...task, id: runId, status: data.status || "running", logs: data.events?.map((event) => event?.message).filter(Boolean) || task.logs } : task)));
    params.logDotobotUi("Dotobot task run iniciado", "dotobot_task_started", { runId, query: params.trimmedQuestion, mode: params.nextMode, provider: params.nextProvider }, { component: "DotobotTaskRun" });
    await pollTaskRun(runId, {
      onUpdate: (result) => {
        params.setTaskHistory((tasks) => tasks.map((task) => (task.id === runId ? { ...task, status: result.status, logs: result.events?.map((event) => event?.message).filter(Boolean) || [], result: result.run?.result || result.resultText || null, finishedAt: result.run?.updated_at || result.run?.finished_at || null } : task)));
      },
    });
  } catch (err) {
    params.setError(err.message || "Erro ao executar TaskRun.");
  }
}
