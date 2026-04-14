const fs = require("fs");
const {
  SESSIONS_DIR,
  AUTOMATIONS_DIR,
  SCREENSHOTS_DIR,
  UPLOADS_DIR,
  SETTINGS_PATH,
  DEFAULT_SETTINGS,
  ENV_AICORE_CANDIDATES,
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
      .map((file) => safeRead(`${dir}\\${file}`))
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
      authToken: String(merged.cloud.authToken || "").trim(),
    },
    cloudflare: {
      model: String(merged.cloudflare.model || DEFAULT_SETTINGS.cloudflare.model).trim(),
      accountId: String(merged.cloudflare.accountId || "").trim(),
      apiToken: String(merged.cloudflare.apiToken || "").trim(),
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
  return {
    settings,
    local: {
      candidates: [settings.local.runtimeUrl, ...ENV_AICORE_CANDIDATES.filter((url) => cleanUrl(url) !== cleanUrl(settings.local.runtimeUrl))].filter(Boolean),
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
