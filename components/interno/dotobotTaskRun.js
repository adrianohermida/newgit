import {
  createPendingTaskRunRecord,
  startAdminTaskRun,
  pollAdminTaskRun,
  cancelAdminTaskRun,
} from "../../lib/admin/task-runner.js";

export function createPendingTaskRun(query, extra = {}) {
  return createPendingTaskRunRecord(query, extra);
}

export async function startTaskRun({ query, mode, provider, contextEnabled, context }) {
  return startAdminTaskRun({
    query,
    mode,
    provider,
    contextEnabled,
    context,
    logModule: "dotobot",
    logComponent: "DotobotTaskRun",
    logAction: "dotobot_task_run_start",
    logLabel: "Dotobot: iniciar tarefa",
  });
}

export async function pollTaskRun(runId, options = {}) {
  return pollAdminTaskRun(runId, options);
}

export async function cancelTaskRun(runId) {
  return cancelAdminTaskRun(runId);
}
