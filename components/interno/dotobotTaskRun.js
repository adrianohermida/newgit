import { adminFetch } from "../../lib/admin/api";
import { nowIso } from "./dotobotPanelState";

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
  return adminFetch(TASK_RUN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "task_run_start",
      query,
      mode,
      provider,
      contextEnabled,
      context,
    }),
  });
}

export async function pollTaskRun(runId, { onUpdate } = {}) {
  let finished = false;
  let lastPayload = null;

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

  return lastPayload;
}
