import { adminFetch } from "../../lib/admin/api";
import { nowIso } from "./dotobotPanelState";
import { appendActivityLog, updateActivityLog } from "../../lib/admin/activity-log";

const TASK_RUN_ENDPOINT = "/functions/api/admin-lawdesk-chat";
const TASK_RUN_POLL_INTERVAL_MS = 1200;
const TASK_RUN_FINISHED_STATUSES = new Set(["ok", "error", "canceled"]);

export function createPendingTaskRun(query) {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: "running",
    query,
    logs: ["Execução iniciada..."],
    startedAt: nowIso(),
  };
}

export async function startTaskRun({
  query,
  mode,
  provider,
  contextEnabled,
  context,
}) {
  const startedAt = Date.now();
  const entryId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const payload = {
    action: "task_run_start",
    query,
    mode,
    provider,
    contextEnabled,
    context,
  };
  appendActivityLog({
    id: entryId,
    module: "dotobot",
    component: "dotobot",
    label: "Dotobot: iniciar tarefa",
    action: "dotobot_task_run_start",
    method: "POST",
    path: TASK_RUN_ENDPOINT,
    request: JSON.stringify(payload, null, 2),
    status: "running",
    startedAt,
  });
  try {
    const result = await adminFetch(TASK_RUN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    updateActivityLog(entryId, {
      status: "success",
      durationMs: Date.now() - startedAt,
      response: JSON.stringify(result, null, 2),
    });
    return result;
  } catch (error) {
    updateActivityLog(entryId, {
      status: "error",
      durationMs: Date.now() - startedAt,
      error: JSON.stringify(error?.payload || error?.message || error, null, 2),
    });
    throw error;
  }
}

export async function pollTaskRun(runId, { onUpdate } = {}) {
  let finished = false;
  let lastPayload = null;
  const startedAt = Date.now();

  while (!finished) {
    await new Promise((resolve) => setTimeout(resolve, TASK_RUN_POLL_INTERVAL_MS));
    const pollData = await adminFetch(TASK_RUN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "task_run_get", id: runId }),
    });

    if (pollData?.ok && pollData?.result) {
      lastPayload = pollData.result;
      onUpdate?.(pollData.result);
      finished = TASK_RUN_FINISHED_STATUSES.has(pollData.result.status);
    } else {
      finished = true;
    }
  }

  if (lastPayload) {
    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      module: "dotobot",
      component: "dotobot",
      label: "Dotobot: resultado tarefa",
      action: "dotobot_task_run_finish",
      method: "POST",
      path: TASK_RUN_ENDPOINT,
      status: lastPayload.status === "error" ? "error" : "success",
      startedAt,
      durationMs: Date.now() - startedAt,
      response: JSON.stringify(lastPayload, null, 2),
    });
  }

  return lastPayload;
}
