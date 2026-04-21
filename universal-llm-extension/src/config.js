const fs = require("fs");
const path = require("path");

function cleanUrl(value, fallback = "") {
  const text = String(value || "").trim();
  return text ? text.replace(/\/+$/, "") : fallback;
}

const DIR = path.resolve(__dirname, "..");
const REPO_DIR = path.resolve(DIR, "..");
const DATA_DIR = path.join(DIR, "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const AUTOMATIONS_DIR = path.join(DATA_DIR, "automations");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

loadLocalEnvFiles();

function uniqueUrls(values) {
  return values
    .map((item) => cleanUrl(item))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
}

const ENV_AICORE_CANDIDATES = [
  process.env.LOCAL_PROVIDER_URL,
  process.env.LOCAL_AGENT_URL,
  process.env.AICORE_API_BASE_URL,
  "http://127.0.0.1:8000",
].filter(Boolean);

const LOCAL_RUNTIME_CANDIDATES = uniqueUrls([
  process.env.LOCAL_PROVIDER_BASE_URL,
  process.env.LOCAL_RUNTIME_URL,
  process.env.LOCAL_LLM_BASE_URL,
  process.env.LLM_BASE_URL,
  process.env.AICORE_LOCAL_LLM_BASE_URL,
  process.env.AETHERLAB_LOCAL_RUNTIME_URL,
  process.env.AETHERLAB_LOCAL_BASE_URL,
  "http://127.0.0.1:1234",
  "http://127.0.0.1:11434",
  "http://127.0.0.1:8001",
]);

const DEFAULT_SETTINGS = {
  local: {
    runtimeUrl: ENV_AICORE_CANDIDATES[0] || "http://127.0.0.1:8000",
    chatPath: String(
      process.env.LOCAL_PROVIDER_CHAT_PATH ||
      process.env.LOCAL_AGENT_CHAT_PATH ||
      "/v1/messages"
    ).trim() || "/v1/messages",
    executePath: String(
      process.env.LOCAL_PROVIDER_EXECUTE_PATH ||
      process.env.LOCAL_AGENT_EXECUTE_PATH ||
      "/execute"
    ).trim() || "/execute",
    providerLabel: String(
      process.env.LOCAL_PROVIDER_LABEL ||
      process.env.LOCAL_AGENT_LABEL ||
      "Ai-Core Local"
    ).trim() || "Ai-Core Local",
    runtimeModel: String(
      process.env.LOCAL_PROVIDER_MODEL ||
      process.env.LOCAL_AGENT_MODEL ||
      process.env.LOCAL_LLM_MODEL ||
      process.env.LLM_MODEL ||
      process.env.AICORE_LOCAL_LLM_MODEL ||
      "aetherlab-legal-local-v1",
    ).trim(),
    alwaysAllowTabAccess: false,
    trustedTabOrigins: [],
    roots: [],
    apps: [],
    skillRoots: [],
    skills: [],
  },
  cloud: {
    appUrl: cleanUrl(process.env.APP_BASE_URL || process.env.NEXTJS_APP_URL || "http://127.0.0.1:3000"),
    baseUrl: cleanUrl(
      process.env.CUSTOM_LLM_BASE_URL ||
      process.env.PROCESS_AI_BASE ||
      process.env.LAWDESK_AI_BASE_URL ||
      process.env.HMADV_RUNNER_URL ||
      "",
    ),
    model: "aetherlab-legal-v1",
    authToken: String(
      process.env.CUSTOM_LLM_AUTH_TOKEN ||
      process.env.HMADV_AI_SHARED_SECRET ||
      process.env.LAWDESK_AI_SHARED_SECRET ||
      "",
    ).trim(),
  },
  cloudflare: {
    model: String(process.env.CLOUDFLARE_WORKERS_AI_MODEL || process.env.CF_WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct").trim(),
    accountId: String(process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CLOUDFLARE_WORKER_ACCOUNT_ID || "").trim(),
    apiToken: String(process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_WORKER_API_TOKEN || "").trim(),
  },
};

function loadLocalEnvFiles() {
  for (const candidate of [".dev.vars", ".env.local"]) {
    const filePath = path.join(REPO_DIR, candidate);
    if (!fs.existsSync(filePath)) continue;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const trimmed = String(line || "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) continue;
      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();
      if (!key || process.env[key]) continue;
      process.env[key] = stripOptionalQuotes(value);
    }
  }
}

function stripOptionalQuotes(value) {
  const text = String(value || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

module.exports = {
  PORT: Number(process.env.UNIVERSAL_LLM_EXTENSION_PORT || 32123),
  DIR,
  REPO_DIR,
  USER_HOME: process.env.USERPROFILE || process.env.HOME || "",
  DATA_DIR,
  SESSIONS_DIR,
  AUTOMATIONS_DIR,
  SCREENSHOTS_DIR,
  UPLOADS_DIR,
  SETTINGS_PATH,
  ENV_AICORE_CANDIDATES,
  LOCAL_RUNTIME_CANDIDATES,
  DEFAULT_SETTINGS,
  cleanUrl,
};
