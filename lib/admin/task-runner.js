import { adminFetch } from "./api.js";
import { appendActivityLog, updateActivityLog } from "./activity-log.js";
import { normalizeTaskRunPayload } from "./task-runner-shared.js";

const TASK_RUN_ENDPOINT = "/api/admin-lawdesk-chat";
const DEFAULT_POLL_INTERVAL_MS = 1200;
const DEFAULT_TASK_RUN_CONSOLE_META = {
  consolePane: ["functions", "jobs"],
  domain: "orchestration",
  system: "task-run",
};

function stringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function createPendingTaskRunRecord(query, extra = {}) {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    status: "running",
    query,
    logs: ["Execucao iniciada..."],
    startedAt: new Date().toISOString(),
    ...extra,
  };
}

export async function startAdminTaskRun({
  query,
  mode,
  provider,
  contextEnabled,
  context,
  logModule = "dotobot",
  logComponent = "TaskRun",
  logAction = "task_run_start",
  logLabel = "Iniciar task run",
}) {
  const startedAt = Date.now();
  const entryId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const requestPayload = {
    action: "task_run_start",
    query,
    mode,
    provider,
    contextEnabled,
    context,
  };
  appendActivityLog({
    id: entryId,
    module: logModule,
    component: logComponent,
    label: logLabel,
    action: logAction,
    method: "POST",
    path: TASK_RUN_ENDPOINT,
    consolePane: logModule === "dotobot" ? ["dotobot", ...DEFAULT_TASK_RUN_CONSOLE_META.consolePane] : [logModule, ...DEFAULT_TASK_RUN_CONSOLE_META.consolePane],
    domain: DEFAULT_TASK_RUN_CONSOLE_META.domain,
    system: DEFAULT_TASK_RUN_CONSOLE_META.system,
    request: stringify(requestPayload),
    status: "running",
    startedAt,
  });
  try {
    const response = await adminFetch(TASK_RUN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    });
    updateActivityLog(entryId, {
      status: "success",
      durationMs: Date.now() - startedAt,
      response: stringify(response),
    });
    return normalizeTaskRunPayload(response);
  } catch (error) {
    updateActivityLog(entryId, {
      status: "error",
      durationMs: Date.now() - startedAt,
      error: stringify(error?.payload || error?.message || error),
    });
    throw error;
  }
}

export async function pollAdminTaskRun(runId, { onUpdate, initialCursor, initialSequence, intervalMs } = {}) {
  let finished = false;
  let cursor = initialCursor || null;
  let sequence = initialSequence ?? null;
  let lastPayload = null;

  while (!finished) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(300, Number(intervalMs) || DEFAULT_POLL_INTERVAL_MS)));
    const response = await adminFetch(TASK_RUN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "task_run_get",
        runId,
        sinceEventId: cursor || undefined,
        sinceSequence: sequence ?? undefined,
        waitForChangeMs: 2500,
      }),
    });

    const normalized = normalizeTaskRunPayload(response);
    lastPayload = normalized;
    if (normalized.eventsCursor) cursor = normalized.eventsCursor;
    if (normalized.eventsCursorSequence != null) sequence = normalized.eventsCursorSequence;
    onUpdate?.(normalized);
    finished = normalized.isTerminal;
  }

  return lastPayload;
}

export async function cancelAdminTaskRun(runId) {
  const payload = await adminFetch(TASK_RUN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "task_run_cancel", runId }),
  });
  return normalizeTaskRunPayload(payload);
}
