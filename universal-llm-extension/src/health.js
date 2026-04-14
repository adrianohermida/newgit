const fs = require("fs");
const { PORT, SCREENSHOTS_DIR, UPLOADS_DIR } = require("./config");
const { getConfigs, loadSettings, listJsonDir } = require("./storage");
const { SESSIONS_DIR, AUTOMATIONS_DIR } = require("./config");

function buildHealthPayload() {
  const configs = getConfigs();
  return {
    ok: true,
    service: "universal-llm-extension",
    version: "0.5.0",
    port: PORT,
    providers: {
      local: { configured: Boolean(configs.local.candidates.length), candidates: configs.local.candidates, model: configs.local.model },
      cloud: { configured: Boolean(configs.cloud.baseUrl || configs.cloud.appUrl), baseUrl: configs.cloud.baseUrl || null, appUrl: configs.cloud.appUrl || null, model: configs.cloud.model },
      cloudflare: { model: configs.cloudflare.model, directApi: Boolean(configs.cloudflare.accountId && configs.cloudflare.apiToken), proxyApp: Boolean(configs.cloudflare.appUrl), appUrl: configs.cloudflare.appUrl || null },
    },
    settings: loadSettings(),
    data: {
      sessions: listJsonDir(SESSIONS_DIR).length,
      automations: listJsonDir(AUTOMATIONS_DIR).length,
      screenshots: fs.readdirSync(SCREENSHOTS_DIR).filter((file) => !file.endsWith(".json")).length,
      uploads: fs.readdirSync(UPLOADS_DIR).filter((file) => !file.endsWith(".json")).length,
    },
    commands: ["health_check", "search_files", "web_search", "open_url"],
    endpoints: ["/chat", "/settings", "/diagnostics/provider/:provider", "/sessions", "/screenshot", "/upload", "/record", "/automations", "/play/:id", "/commands", "/download"],
  };
}

module.exports = {
  buildHealthPayload,
};
