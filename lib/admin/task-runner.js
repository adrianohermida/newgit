import { adminFetch } from "./api";
import { appendActivityLog, updateActivityLog } from "./activity-log";

const TASK_RUN_ENDPOINT = "/functions/api/admin-lawdesk-chat";
const DEFAULT_POLL_INTERVAL_MS = 1200;
const TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "done", "error", "ok"]);

function stringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function extractTaskRunResultText(...sources) {
  for (const source of sources) {
    if (!source) continue;
    if (typeof source?.result?.message === "string" && source.result.message.trim()) return source.result.message.trim();
    if (typeof source?.resultText === "string" && source.resultText.trim()) return source.resultText.trim();
    if (typeof source?.result === "string" && source.result.trim()) return source.result.trim();
    if (source?.result != null && typeof source.result !== "string") return stringify(source.result);
  }
  return "";
}

export function normalizeTaskRunPayload(payload) {
  const data = payload?.data || payload?.result || {};
  const run = data?.run || payload?.run || null;
  const runResult = run?.result || null;
  const events = Array.isArray(data?.events) ? data.events : Array.isArray(runResult?.events) ? runResult.events : [];
  const steps = Array.isArray(data?.steps) ? data.steps : Array.isArray(runResult?.steps) ? runResult.steps : [];
  const status = run?.status || data?.status || payload?.status || (payload?.ok ? "completed" : "failed");
  return {
    run,
    events,
    steps,
    rag: data?.rag || runResult?.rag || null,
    resultText: extractTaskRunResultText(data, runResult, payload),
    source: data?.source || runResult?.source || null,
    model: data?.model || runResult?.model || null,
    status,
    isTerminal: TERMINAL_STATUSES.has(String(status || "").toLowerCase()),
    eventsCursor: data?.eventsCursor || null,
    eventsCursorSequence: Number.isFinite(Number(data?.eventsCursorSequence)) ? Number(data.eventsCursorSequence) : null,
    eventsTotal: Number.isFinite(Number(data?.eventsTotal)) ? Number(data.eventsTotal) : null,
    pollIntervalMs: Number.isFinite(Number(data?.pollIntervalMs)) ? Number(data.pollIntervalMs) : DEFAULT_POLL_INTERVAL_MS,
  };
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
