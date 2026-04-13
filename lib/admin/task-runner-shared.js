export const TASK_RUN_TERMINAL_STATUSES = new Set(["completed", "failed", "canceled", "done", "error", "ok"]);

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
  const orchestration = data?.orchestration || runResult?.orchestration || null;
  const errors = Array.isArray(data?.errors) ? data.errors : Array.isArray(runResult?.errors) ? runResult.errors : [];
  const telemetry = Array.isArray(data?.telemetry) ? data.telemetry : Array.isArray(runResult?.telemetry) ? runResult.telemetry : [];
  const status = run?.status || data?.status || payload?.status || (payload?.ok ? "completed" : "failed");
  return {
    run,
    events,
    steps,
    rag: data?.rag || runResult?.rag || null,
    orchestration,
    errors,
    telemetry,
    resultText: extractTaskRunResultText(data, runResult, payload),
    source: data?.source || runResult?.source || null,
    model: data?.model || runResult?.model || null,
    status,
    isTerminal: TASK_RUN_TERMINAL_STATUSES.has(String(status || "").toLowerCase()),
    eventsCursor: data?.eventsCursor || null,
    eventsCursorSequence: Number.isFinite(Number(data?.eventsCursorSequence)) ? Number(data.eventsCursorSequence) : null,
    eventsTotal: Number.isFinite(Number(data?.eventsTotal)) ? Number(data.eventsTotal) : null,
    pollIntervalMs: Number.isFinite(Number(data?.pollIntervalMs)) ? Number(data.pollIntervalMs) : null,
  };
}
