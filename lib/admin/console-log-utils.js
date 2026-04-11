export const SPECIAL_LOG_PANES = new Set(["history", "frontend", "schema", "notes"]);

export const TAG_LOG_PANES = new Set([
  "security",
  "functions",
  "routes",
  "jobs",
  "webhook",
  "crm",
  "supabase",
  "dotobot",
  "ai-task",
  "data-quality",
]);

export function normalizeConsoleFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters || {}).filter(([, value]) => String(value || "").trim() !== "")
  );
}

export function entryMatchesConsoleFilters(entry, filters = {}, search = "") {
  const normalizedFilters = normalizeConsoleFilters(filters);
  const normalizedSearch = String(search || "").trim().toLowerCase();

  if (
    normalizedFilters.module &&
    String(entry?.module || "").toLowerCase() !== normalizedFilters.module.toLowerCase()
  ) {
    return false;
  }

  const pageHaystack = [entry?.page, entry?.path, entry?.url].filter(Boolean).join(" ").toLowerCase();
  if (normalizedFilters.page && !pageHaystack.includes(normalizedFilters.page.toLowerCase())) {
    return false;
  }

  if (
    normalizedFilters.component &&
    !String(entry?.component || "").toLowerCase().includes(normalizedFilters.component.toLowerCase())
  ) {
    return false;
  }

  if (
    normalizedFilters.status &&
    String(entry?.status || "").toLowerCase() !== normalizedFilters.status.toLowerCase()
  ) {
    return false;
  }

  if (
    normalizedFilters.tag &&
    !(Array.isArray(entry?.tags) ? entry.tags : []).some((tag) =>
      String(tag).toLowerCase().includes(normalizedFilters.tag.toLowerCase())
    )
  ) {
    return false;
  }

  if (!normalizedSearch) return true;

  const haystack = [
    entry?.label,
    entry?.action,
    entry?.path,
    entry?.method,
    entry?.page,
    entry?.component,
    entry?.module,
    entry?.request,
    entry?.response,
    entry?.error,
    (entry?.tags || []).join(" "),
    entry?.schemaIssue ? JSON.stringify(entry.schemaIssue) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedSearch);
}

export function buildTagScopedLogs(entries = []) {
  const source = Array.isArray(entries) ? entries : [];
  return Object.fromEntries(
    Array.from(TAG_LOG_PANES).map((tag) => [
      tag,
      source.filter((entry) => (Array.isArray(entry?.tags) ? entry.tags : []).includes(tag)),
    ])
  );
}

export function countHistorySnapshots(moduleHistory = {}) {
  return Object.entries(moduleHistory || {}).filter(([, snapshot]) => snapshot && typeof snapshot === "object").length;
}

export function countUnclassifiedEntries(entries = []) {
  const source = Array.isArray(entries) ? entries : [];
  return source.filter((entry) => {
    const tags = Array.isArray(entry?.tags) ? entry.tags : [];
    return !Array.from(TAG_LOG_PANES).some((tag) => tags.includes(tag));
  }).length;
}
