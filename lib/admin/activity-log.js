const ACTIVITY_LOG_LIMIT = 400;

let logEntries = [];
const listeners = new Set();

function emit() {
  const snapshot = [...logEntries];
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {}
  });
}

export function getActivityLogSnapshot() {
  return [...logEntries];
}

export function appendActivityLog(entry) {
  logEntries = [entry, ...logEntries].slice(0, ACTIVITY_LOG_LIMIT);
  emit();
}

export function updateActivityLog(entryId, patch = {}) {
  logEntries = logEntries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry));
  emit();
}

export function clearActivityLog() {
  logEntries = [];
  emit();
}

export function subscribeActivityLog(listener) {
  listeners.add(listener);
  listener([...logEntries]);
  return () => listeners.delete(listener);
}

export function formatActivityLogText(entries) {
  return (entries || [])
    .map((entry) => {
      return [
        `# ${entry.label || entry.action || "Chamada"}`,
        `status: ${entry.status}`,
        `metodo: ${entry.method}`,
        `acao: ${entry.action || ""}`,
        `rota: ${entry.path || ""}`,
        `duracao_ms: ${entry.durationMs ?? ""}`,
        entry.request ? `request:\n${entry.request}` : "",
        entry.response ? `response:\n${entry.response}` : "",
        entry.error ? `error:\n${entry.error}` : "",
        "---",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}
