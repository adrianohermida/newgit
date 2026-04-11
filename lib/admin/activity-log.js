const ACTIVITY_LOG_LIMIT = 400;
const ARCHIVE_LIMIT = 50;
const NOTES_LIMIT = 80;
const STORAGE_KEY = "hmadv.activity_log.entries";
const STORAGE_ARCHIVE_KEY = "hmadv.activity_log.archive";
const STORAGE_NOTES_KEY = "hmadv.activity_log.notes";

let logEntries = [];
let archivedLogs = [];
let operationalNotes = [];
let hydrated = false;
const listeners = new Set();

function getStorage() {
  if (typeof window === "undefined") return null;
  return window.localStorage || null;
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hydrateFromStorage() {
  if (hydrated) return;
  const storage = getStorage();
  if (!storage) return;
  hydrated = true;
  const storedEntries = safeJsonParse(storage.getItem(STORAGE_KEY) || "[]", []);
  const storedArchive = safeJsonParse(storage.getItem(STORAGE_ARCHIVE_KEY) || "[]", []);
  const storedNotes = safeJsonParse(storage.getItem(STORAGE_NOTES_KEY) || "[]", []);
  if (Array.isArray(storedEntries)) logEntries = storedEntries;
  if (Array.isArray(storedArchive)) archivedLogs = storedArchive;
  if (Array.isArray(storedNotes)) operationalNotes = storedNotes;
}

function persistToStorage() {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(logEntries));
  storage.setItem(STORAGE_ARCHIVE_KEY, JSON.stringify(archivedLogs));
  storage.setItem(STORAGE_NOTES_KEY, JSON.stringify(operationalNotes));
}

function emit() {
  hydrateFromStorage();
  const snapshot = [...logEntries];
  listeners.forEach((listener) => {
    try {
      listener(snapshot, [...archivedLogs], [...operationalNotes]);
    } catch {}
  });
}

export function getActivityLogSnapshot() {
  hydrateFromStorage();
  return [...logEntries];
}

export function appendActivityLog(entry) {
  hydrateFromStorage();
  logEntries = [entry, ...logEntries].slice(0, ACTIVITY_LOG_LIMIT);
  persistToStorage();
  emit();
}

export function updateActivityLog(entryId, patch = {}) {
  hydrateFromStorage();
  logEntries = logEntries.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry));
  persistToStorage();
  emit();
}

export function archiveActivityLog(reason = "Arquivo manual") {
  hydrateFromStorage();
  if (!logEntries.length) return null;
  const archiveEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    reason,
    entries: [...logEntries],
  };
  archivedLogs = [archiveEntry, ...archivedLogs].slice(0, ARCHIVE_LIMIT);
  logEntries = [];
  persistToStorage();
  emit();
  return archiveEntry;
}

export function clearActivityLog() {
  return archiveActivityLog("Limpeza solicitada (arquivado)");
}

export function getArchivedLogs() {
  hydrateFromStorage();
  return [...archivedLogs];
}

export function appendOperationalNote(note) {
  hydrateFromStorage();
  const payload = typeof note === "string" ? { text: note } : note || {};
  const entry = {
    id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: payload.createdAt || new Date().toISOString(),
    type: payload.type || "observacao",
    text: String(payload.text || "").trim(),
    meta: payload.meta || null,
  };
  if (!entry.text) return null;
  operationalNotes = [entry, ...operationalNotes].slice(0, NOTES_LIMIT);
  persistToStorage();
  emit();
  return entry;
}

export function getOperationalNotes() {
  hydrateFromStorage();
  return [...operationalNotes];
}

export function subscribeActivityLog(listener) {
  hydrateFromStorage();
  listeners.add(listener);
  listener([...logEntries], [...archivedLogs], [...operationalNotes]);
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

export function formatActivityLogMarkdown(entries, notes = []) {
  const logMd = formatActivityLogText(entries);
  const notesMd = (notes || [])
    .map((note) => `- **${note.type || "nota"}** (${note.createdAt || ""}): ${note.text}`)
    .join("\n");
  return [
    "# Log de atividades",
    logMd || "Sem entradas no log atual.",
    "",
    "# Memoria operacional",
    notesMd || "Sem notas registradas.",
  ].join("\n");
}
