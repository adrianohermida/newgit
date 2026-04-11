const ACTIVITY_LOG_LIMIT = 400;
const ARCHIVE_LIMIT = 50;
const NOTES_LIMIT = 80;
const STORAGE_KEY = "hmadv.activity_log.entries";
const STORAGE_ARCHIVE_KEY = "hmadv.activity_log.archive";
const STORAGE_NOTES_KEY = "hmadv.activity_log.notes";
const STORAGE_FILTERS_KEY = "hmadv.activity_log.filters";
const STORAGE_FRONTEND_ISSUES_KEY = "hmadv.activity_log.frontend_issues";
const STORAGE_SCHEMA_ISSUES_KEY = "hmadv.activity_log.schema_issues";
const STORAGE_MODULE_HISTORY_KEY = "hmadv.activity_log.module_history";

let logEntries = [];
let archivedLogs = [];
let operationalNotes = [];
let persistedFilters = null;
let frontendIssues = [];
let schemaIssues = [];
let moduleHistory = {};
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

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function normalizeLogMultilineText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function collapseDuplicateLogSections(text) {
  const normalized = normalizeLogMultilineText(text);
  if (!normalized.includes("\n---")) return normalized;
  const sections = normalized
    .split(/\n---\s*\n?/g)
    .map((section) => section.trim())
    .filter(Boolean);
  if (!sections.length) return normalized;
  const deduped = sections.filter((section, index) => index === 0 || section !== sections[index - 1]);
  return deduped.join("\n---\n");
}

export function getActivityLogResponseText(entry) {
  const header = `# ${entry?.label || entry?.action || "Chamada"}`;
  let response = collapseDuplicateLogSections(entry?.response || "");
  if (!response) return "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!response.startsWith(header)) break;
    const nestedResponseMatch = response.match(/\nresponse:\n([\s\S]*?)(?:\n---\s*)?$/);
    if (!nestedResponseMatch) break;
    response = collapseDuplicateLogSections(nestedResponseMatch[1]);
  }

  return response;
}

function inferModule(entry) {
  if (entry?.module) return entry.module;
  const haystack = normalizeText(
    [entry?.page, entry?.path, entry?.url, entry?.action, entry?.label].filter(Boolean).join(" ")
  );
  if (haystack.includes("admin-hmadv-processos") || haystack.includes("/interno/processos")) return "processos";
  if (haystack.includes("admin-hmadv-publicacoes") || haystack.includes("/interno/publicacoes")) return "publicacoes";
  if (haystack.includes("admin-hmadv-contacts") || haystack.includes("/interno/contacts")) return "contacts";
  if (haystack.includes("dotobot") || haystack.includes("lawdesk-chat") || haystack.includes("admin-lawdesk-chat")) return "dotobot";
  return "";
}

function extractSchemaIssue(rawText) {
  const text = String(rawText || "");
  if (!text) return null;
  const codeMatch = text.match(/PGRST\d+/i);
  const columnMatch = text.match(/'([^']+)' column of '([^']+)'/i);
  if (columnMatch) {
    return {
      type: "column_missing",
      column: columnMatch[1],
      table: columnMatch[2],
      code: codeMatch ? codeMatch[0] : null,
    };
  }
  const tableMatch = text.match(/table '([^']+)'/i);
  if (tableMatch) {
    return {
      type: "table_missing",
      table: tableMatch[1],
      code: codeMatch ? codeMatch[0] : null,
    };
  }
  if (text.toLowerCase().includes("schema cache") || codeMatch) {
    return {
      type: "schema_issue",
      table: null,
      column: null,
      code: codeMatch ? codeMatch[0] : null,
    };
  }
  return null;
}

function pushSchemaIssue(issue, source = "log") {
  if (!issue) return;
  const fingerprint = JSON.stringify(issue);
  if (schemaIssues.some((item) => JSON.stringify(item.issue) === fingerprint)) return;
  schemaIssues = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      source,
      issue,
    },
    ...schemaIssues,
  ].slice(0, 120);
}

function deriveTags(entry) {
  const tags = new Set(Array.isArray(entry?.tags) ? entry.tags : []);
  const module = inferModule(entry);
  if (module) tags.add(module);
  if (entry?.component) tags.add(String(entry.component));
  if (entry?.status) tags.add(String(entry.status));
  if (entry?.action === "debug_ui" || (Array.isArray(entry?.tags) && entry.tags.includes("debug-ui"))) tags.add("debug-ui");
  if (entry?.schemaIssue) {
    tags.add("schema");
    tags.add("sql");
  }
  return { module, tags: Array.from(tags) };
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
  const storedFilters = safeJsonParse(storage.getItem(STORAGE_FILTERS_KEY) || "null", null);
  if (storedFilters && typeof storedFilters === "object") {
    persistedFilters = storedFilters;
  }
  const storedFrontend = safeJsonParse(storage.getItem(STORAGE_FRONTEND_ISSUES_KEY) || "[]", []);
  if (Array.isArray(storedFrontend)) frontendIssues = storedFrontend;
  const storedSchema = safeJsonParse(storage.getItem(STORAGE_SCHEMA_ISSUES_KEY) || "[]", []);
  if (Array.isArray(storedSchema)) schemaIssues = storedSchema;
  const storedHistory = safeJsonParse(storage.getItem(STORAGE_MODULE_HISTORY_KEY) || "{}", {});
  if (storedHistory && typeof storedHistory === "object") moduleHistory = storedHistory;
}

function persistToStorage() {
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEY, JSON.stringify(logEntries));
  storage.setItem(STORAGE_ARCHIVE_KEY, JSON.stringify(archivedLogs));
  storage.setItem(STORAGE_NOTES_KEY, JSON.stringify(operationalNotes));
  if (persistedFilters) {
    storage.setItem(STORAGE_FILTERS_KEY, JSON.stringify(persistedFilters));
  }
  storage.setItem(STORAGE_FRONTEND_ISSUES_KEY, JSON.stringify(frontendIssues));
  storage.setItem(STORAGE_SCHEMA_ISSUES_KEY, JSON.stringify(schemaIssues));
  storage.setItem(STORAGE_MODULE_HISTORY_KEY, JSON.stringify(moduleHistory));
}

function emit() {
  hydrateFromStorage();
  const snapshot = [...logEntries];
  listeners.forEach((listener) => {
    try {
      listener(
        snapshot,
        [...archivedLogs],
        [...operationalNotes],
        persistedFilters || {},
        [...frontendIssues],
        [...schemaIssues],
        { ...moduleHistory }
      );
    } catch {}
  });
}

export function getActivityLogSnapshot() {
  hydrateFromStorage();
  return [...logEntries];
}

export function appendActivityLog(entry) {
  hydrateFromStorage();
  const schemaIssue = extractSchemaIssue(entry?.error || entry?.response || "");
  const enriched = {
    ...entry,
    createdAt: entry.createdAt || new Date().toISOString(),
    schemaIssue: entry.schemaIssue || schemaIssue,
  };
  if (typeof window !== "undefined") {
    enriched.page = enriched.page || window.location.pathname || "";
    enriched.url = enriched.url || window.location.href || "";
  }
  const { module, tags } = deriveTags(enriched);
  if (module && !enriched.module) enriched.module = module;
  enriched.tags = tags;
  if (schemaIssue) {
    pushSchemaIssue(schemaIssue, "log");
  }
  logEntries = [enriched, ...logEntries].slice(0, ACTIVITY_LOG_LIMIT);
  persistToStorage();
  emit();
}

export function updateActivityLog(entryId, patch = {}) {
  hydrateFromStorage();
  logEntries = logEntries.map((entry) => {
    if (entry.id !== entryId) return entry;
    const merged = { ...entry, ...patch };
    const schemaIssue = extractSchemaIssue(merged?.error || merged?.response || "");
    merged.schemaIssue = merged.schemaIssue || schemaIssue;
    const { module, tags } = deriveTags(merged);
    if (module && !merged.module) merged.module = module;
    merged.tags = tags;
    if (schemaIssue) {
      pushSchemaIssue(schemaIssue, "log");
    }
    return merged;
  });
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

export function appendFrontendIssue(issue) {
  hydrateFromStorage();
  const payload = typeof issue === "string" ? { detail: issue } : issue || {};
  const entry = {
    id: payload.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: payload.createdAt || new Date().toISOString(),
    page: String(payload.page || ""),
    component: String(payload.component || ""),
    detail: String(payload.detail || "").trim(),
    status: String(payload.status || "aberto"),
  };
  if (!entry.detail) return null;
  frontendIssues = [entry, ...frontendIssues].slice(0, 200);
  persistToStorage();
  emit();
  return entry;
}

export function getFrontendIssues() {
  hydrateFromStorage();
  return [...frontendIssues];
}

export function appendSchemaIssue(issue) {
  hydrateFromStorage();
  if (!issue) return null;
  pushSchemaIssue(issue, "manual");
  persistToStorage();
  emit();
  return issue;
}

export function getSchemaIssues() {
  hydrateFromStorage();
  return [...schemaIssues];
}

export function setModuleHistory(moduleKey, payload) {
  hydrateFromStorage();
  if (!moduleKey) return;
  moduleHistory = {
    ...moduleHistory,
    [moduleKey]: {
      updatedAt: new Date().toISOString(),
      ...payload,
    },
  };
  persistToStorage();
  emit();
}

export function getModuleHistory(moduleKey) {
  hydrateFromStorage();
  return moduleHistory?.[moduleKey] || null;
}

export function subscribeActivityLog(listener) {
  hydrateFromStorage();
  listeners.add(listener);
  listener(
    [...logEntries],
    [...archivedLogs],
    [...operationalNotes],
    persistedFilters || {},
    [...frontendIssues],
    [...schemaIssues],
    { ...moduleHistory }
  );
  return () => listeners.delete(listener);
}

export function formatActivityLogText(entries) {
  return (entries || [])
    .map((entry) => {
      const responseText = getActivityLogResponseText(entry);
      return [
        `# ${entry.label || entry.action || "Chamada"}`,
        `status: ${entry.status}`,
        `metodo: ${entry.method}`,
        `acao: ${entry.action || ""}`,
        `rota: ${entry.path || ""}`,
        `duracao_ms: ${entry.durationMs ?? ""}`,
        entry.request ? `request:\n${entry.request}` : "",
        responseText ? `response:\n${responseText}` : "",
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

export function formatFrontendIssuesMarkdown(items = []) {
  const lines = (items || []).map((item) => {
    return `- [${item.status || "aberto"}] ${item.page || "pagina n/a"} ${item.component || ""} - ${item.detail}`;
  });
  return ["# Frontend UX", lines.length ? lines.join("\n") : "Sem itens registrados."].join("\n");
}

export function formatSchemaIssuesMarkdown(items = []) {
  const lines = (items || []).map((item) => {
    return `- ${item.issue?.type || "issue"} ${item.issue?.table || ""} ${item.issue?.column || ""} ${item.issue?.code || ""}`;
  });
  return ["# Schema", lines.length ? lines.join("\n") : "Sem itens registrados."].join("\n");
}

export function setActivityLogFilters(filters = {}) {
  hydrateFromStorage();
  persistedFilters = { ...filters };
  persistToStorage();
  emit();
}

export function getActivityLogFilters() {
  hydrateFromStorage();
  return { ...(persistedFilters || {}) };
}
