const path = require("path");

function cleanUrl(value, fallback = "") {
  const text = String(value || "").trim();
  return text ? text.replace(/\/+$/, "") : fallback;
}

const DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(DIR, "data");
const SESSIONS_DIR = path.join(DATA_DIR, "sessions");
const AUTOMATIONS_DIR = path.join(DATA_DIR, "automations");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

const ENV_AICORE_CANDIDATES = [
  process.env.AICORE_API_BASE_URL,
  "http://127.0.0.1:8000",
].filter(Boolean);

const LOCAL_RUNTIME_CANDIDATES = [
  process.env.LOCAL_LLM_BASE_URL,
  process.env.LLM_BASE_URL,
  "http://127.0.0.1:11434",
].filter(Boolean);

const DEFAULT_SETTINGS = {
  local: {
    runtimeUrl: ENV_AICORE_CANDIDATES[0] || "http://127.0.0.1:8000",
    runtimeModel: "aetherlab-legal-local-v1",
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
    accountId: String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim(),
    apiToken: String(process.env.CLOUDFLARE_API_TOKEN || "").trim(),
  },
};

module.exports = {
  PORT: Number(process.env.UNIVERSAL_LLM_EXTENSION_PORT || 32123),
  DIR,
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
