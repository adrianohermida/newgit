const fs = require("fs");
const path = require("path");
const {
  SESSIONS_DIR,
  AUTOMATIONS_DIR,
  SCREENSHOTS_DIR,
  UPLOADS_DIR,
  SETTINGS_PATH,
  DEFAULT_SETTINGS,
  ENV_AICORE_CANDIDATES,
  LOCAL_RUNTIME_CANDIDATES,
  REPO_DIR,
  USER_HOME,
  cleanUrl,
} = require("./config");

function preferEnv(primary, fallback = "") {
  const value = String(primary || "").trim();
  if (value) return value;
  return String(fallback || "").trim();
}

function ensureDataDirs() {
  for (const dir of [SESSIONS_DIR, AUTOMATIONS_DIR, SCREENSHOTS_DIR, UPLOADS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

function safeRead(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function safeWrite(filePath, data) {
  fs.writeFileSync(filePath, typeof data === "string" ? data : JSON.stringify(data, null, 2), "utf8");
}

function listJsonDir(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((file) => file.endsWith(".json"))
      .map((file) => safeRead(path.join(dir, file)))
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  } catch {
    return [];
  }
}

function mergeSettings(base, patch) {
  return {
    local: { ...(base?.local || {}), ...(patch?.local || {}) },
    cloud: { ...(base?.cloud || {}), ...(patch?.cloud || {}) },
    cloudflare: { ...(base?.cloudflare || {}), ...(patch?.cloudflare || {}) },
  };
}

function normalizeStringList(values) {
  return Array.isArray(values)
    ? values.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeApps(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => ({
      name: String(item?.name || "").trim(),
      path: String(item?.path || "").trim(),
      args: normalizeStringList(item?.args),
    }))
    .filter((item) => item.name && item.path);
}

function normalizeSkills(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => ({
      name: String(item?.name || "").trim(),
      path: String(item?.path || "").trim(),
      description: String(item?.description || "").trim(),
      enabled: item?.enabled !== false,
    }))
    .filter((item) => item.name && item.path);
}

function defaultSkillRoots() {
  const roots = [
    path.join(REPO_DIR, ".agents", "skills"),
    path.join(REPO_DIR, ".codex", "skills"),
    USER_HOME ? path.join(USER_HOME, ".codex", "skills") : "",
    USER_HOME ? path.join(USER_HOME, ".agents", "skills") : "",
  ].filter(Boolean);
  return roots.filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeLoopbackUrl(value, fallback) {
  const normalized = cleanUrl(value, fallback);
  if (!normalized) return normalized;
  return normalized.replace(/^http:\/\/localhost:3000$/i, "http://127.0.0.1:3000");
}

function uniqueUrls(values) {
  return values
    .map((item) => cleanUrl(item))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

function normalizeSettings(raw) {
  const merged = mergeSettings(DEFAULT_SETTINGS, raw || {});
  const providerLabel = String(merged.local.providerLabel || DEFAULT_SETTINGS.local.providerLabel).trim();
  const normalizedProviderLabel = providerLabel === "Local Agent Runtime"
    ? DEFAULT_SETTINGS.local.providerLabel
    : providerLabel || DEFAULT_SETTINGS.local.providerLabel;
  return {
    local: {
      runtimeUrl: cleanUrl(merged.local.runtimeUrl, DEFAULT_SETTINGS.local.runtimeUrl),
      chatPath: String(merged.local.chatPath || DEFAULT_SETTINGS.local.chatPath).trim() || DEFAULT_SETTINGS.local.chatPath,
      executePath: String(merged.local.executePath || DEFAULT_SETTINGS.local.executePath).trim() || DEFAULT_SETTINGS.local.executePath,
      providerLabel: normalizedProviderLabel,
      runtimeModel: String(merged.local.runtimeModel || DEFAULT_SETTINGS.local.runtimeModel).trim(),
      alwaysAllowTabAccess: Boolean(merged.local.alwaysAllowTabAccess),
      trustedTabOrigins: normalizeStringList(merged.local.trustedTabOrigins),
      roots: normalizeStringList(merged.local.roots),
      apps: normalizeApps(merged.local.apps),
      skillRoots: normalizeStringList(merged.local.skillRoots).length ? normalizeStringList(merged.local.skillRoots) : defaultSkillRoots(),
      skills: normalizeSkills(merged.local.skills),
    },
    cloud: {
      appUrl: normalizeLoopbackUrl(merged.cloud.appUrl, DEFAULT_SETTINGS.cloud.appUrl),
      baseUrl: cleanUrl(merged.cloud.baseUrl, DEFAULT_SETTINGS.cloud.baseUrl),
      model: String(merged.cloud.model || DEFAULT_SETTINGS.cloud.model).trim(),
      authToken: preferEnv(DEFAULT_SETTINGS.cloud.authToken, merged.cloud.authToken),
    },
    cloudflare: {
      model: String(merged.cloudflare.model || DEFAULT_SETTINGS.cloudflare.model).trim(),
      accountId: preferEnv(DEFAULT_SETTINGS.cloudflare.accountId, merged.cloudflare.accountId),
      apiToken: preferEnv(DEFAULT_SETTINGS.cloudflare.apiToken, merged.cloudflare.apiToken),
    },
  };
}

function loadSettings() {
  return normalizeSettings(safeRead(SETTINGS_PATH));
}

function saveSettings(settings) {
  const normalized = normalizeSettings(settings);
  safeWrite(SETTINGS_PATH, normalized);
  return normalized;
}

function getConfigs() {
  const settings = loadSettings();
  const localCandidates = uniqueUrls([settings.local.runtimeUrl, ...ENV_AICORE_CANDIDATES]);
  const runtimeCatalogCandidates = uniqueUrls([
    ...LOCAL_RUNTIME_CANDIDATES,
    settings.local.runtimeUrl,
  ]);
  return {
    settings,
    local: {
      candidates: localCandidates,
      runtimeCatalogCandidates,
      chatPath: settings.local.chatPath,
      executePath: settings.local.executePath,
      providerLabel: settings.local.providerLabel,
      model: settings.local.runtimeModel,
      alwaysAllowTabAccess: settings.local.alwaysAllowTabAccess,
      trustedTabOrigins: settings.local.trustedTabOrigins,
      roots: settings.local.roots,
      apps: settings.local.apps,
      skillRoots: settings.local.skillRoots,
      skills: settings.local.skills,
    },
    cloud: settings.cloud,
    cloudflare: { ...settings.cloudflare, appUrl: settings.cloud.appUrl },
  };
}

module.exports = {
  ensureDataDirs,
  safeRead,
  safeWrite,
  listJsonDir,
  mergeSettings,
  loadSettings,
  saveSettings,
  getConfigs,
};
