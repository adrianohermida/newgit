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
  cleanUrl,
} = require("./config");

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

function normalizeLoopbackUrl(value, fallback) {
  const normalized = cleanUrl(value, fallback);
  if (!normalized) return normalized;
  return normalized.replace(/^http:\/\/localhost:3000$/i, "http://127.0.0.1:3000");
}

function normalizeSettings(raw) {
  const merged = mergeSettings(DEFAULT_SETTINGS, raw || {});
  return {
    local: {
      runtimeUrl: cleanUrl(merged.local.runtimeUrl, DEFAULT_SETTINGS.local.runtimeUrl),
      runtimeModel: String(merged.local.runtimeModel || DEFAULT_SETTINGS.local.runtimeModel).trim(),
    },
    cloud: {
      appUrl: normalizeLoopbackUrl(merged.cloud.appUrl, DEFAULT_SETTINGS.cloud.appUrl),
      baseUrl: cleanUrl(merged.cloud.baseUrl, DEFAULT_SETTINGS.cloud.baseUrl),
      model: String(merged.cloud.model || DEFAULT_SETTINGS.cloud.model).trim(),
      authToken: String(merged.cloud.authToken || DEFAULT_SETTINGS.cloud.authToken || "").trim(),
    },
    cloudflare: {
      model: String(merged.cloudflare.model || DEFAULT_SETTINGS.cloudflare.model).trim(),
      accountId: String(merged.cloudflare.accountId || DEFAULT_SETTINGS.cloudflare.accountId || "").trim(),
      apiToken: String(merged.cloudflare.apiToken || DEFAULT_SETTINGS.cloudflare.apiToken || "").trim(),
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
  const localCandidates = [settings.local.runtimeUrl, ...ENV_AICORE_CANDIDATES]
    .filter(Boolean)
    .filter((value, index, list) => cleanUrl(value) && list.findIndex((item) => cleanUrl(item) === cleanUrl(value)) === index);
  const runtimeCatalogCandidates = LOCAL_RUNTIME_CANDIDATES
    .filter(Boolean)
    .filter((value, index, list) => cleanUrl(value) && list.findIndex((item) => cleanUrl(item) === cleanUrl(value)) === index);
  return {
    settings,
    local: {
      candidates: localCandidates,
      runtimeCatalogCandidates,
      model: settings.local.runtimeModel,
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
