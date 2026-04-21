export function safeLocalSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    if (e?.name !== "QuotaExceededError" && e?.code !== 22) return;
    try {
      const parsed = JSON.parse(value);
      const trimmed = Array.isArray(parsed) ? parsed.slice(-Math.ceil(parsed.length / 2)) : parsed;
      window.localStorage.setItem(key, JSON.stringify(trimmed));
    } catch {
      // quota insuficiente — silent fail
    }
  }
}

export function safeLocalGet(key, fallback = "") {
  try {
    const value = window.localStorage.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export function detectAttachmentKind(file) {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

export function normalizeAttachment(file) {
  const kind = detectAttachmentKind(file);
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    file,
    name: file.name || "Arquivo",
    size: file.size,
    type: file.type || "application/octet-stream",
    previewUrl: file.type?.startsWith("image/") ? URL.createObjectURL(file) : undefined,
  };
}

export function getLastTask(taskHistory) {
  return taskHistory.find((task) => task.status === "running") || taskHistory[0] || null;
}

export function stringifyDiagnostic(value, limit = 12000) {
  if (value === undefined || value === null) return "";
  let text = "";
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function buildDiagnosticReport({ title, summary = "", sections = [] }) {
  return [
    title ? `# ${title}` : "",
    summary ? String(summary).trim() : "",
    ...sections
      .filter((section) => section?.value !== undefined && section?.value !== null && section?.value !== "")
      .map((section) => `${section.label}:\n${stringifyDiagnostic(section.value)}`),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export const DOTOBOT_CONSOLE_META = {
  consolePane: "dotobot",
  domain: "copilot",
  system: "chat",
};

export const DOTOBOT_TASK_CONSOLE_META = {
  consolePane: ["dotobot", "functions", "jobs"],
  domain: "copilot-task",
  system: "task-run",
};
