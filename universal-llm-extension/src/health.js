const fs = require("fs");
const { PORT, SCREENSHOTS_DIR, UPLOADS_DIR } = require("./config");
const { getConfigs, loadSettings, listJsonDir } = require("./storage");
const { SESSIONS_DIR, AUTOMATIONS_DIR } = require("./config");
const { getLocalChatPath, getLocalExecutePath, getLocalProviderLabel } = require("./local-provider");
const { getLocalRuntimeBootstrapState } = require("./local-runtime-bootstrap");

function redactSecret(value) {
  return value ? "[configured]" : "";
}

function sanitizeSettings(settings) {
  return {
    local: {
      providerLabel: settings?.local?.providerLabel || "",
      runtimeUrl: settings?.local?.runtimeUrl || "",
      chatPath: settings?.local?.chatPath || "",
      executePath: settings?.local?.executePath || "",
      runtimeModel: settings?.local?.runtimeModel || "",
      alwaysAllowTabAccess: Boolean(settings?.local?.alwaysAllowTabAccess),
      trustedTabOrigins: Array.isArray(settings?.local?.trustedTabOrigins) ? settings.local.trustedTabOrigins : [],
      roots: Array.isArray(settings?.local?.roots) ? settings.local.roots : [],
      skillRoots: Array.isArray(settings?.local?.skillRoots) ? settings.local.skillRoots : [],
      skills: Array.isArray(settings?.local?.skills)
        ? settings.local.skills.map((item) => ({ name: item?.name || "", path: item?.path || "", description: item?.description || "", enabled: item?.enabled !== false }))
        : [],
      apps: Array.isArray(settings?.local?.apps)
        ? settings.local.apps.map((item) => ({ name: item?.name || "", path: item?.path || "", args: Array.isArray(item?.args) ? item.args : [] }))
        : [],
    },
    cloud: {
      appUrl: settings?.cloud?.appUrl || "",
      baseUrl: settings?.cloud?.baseUrl || "",
      model: settings?.cloud?.model || "",
      authToken: redactSecret(settings?.cloud?.authToken),
    },
    cloudflare: {
      model: settings?.cloudflare?.model || "",
      accountId: redactSecret(settings?.cloudflare?.accountId),
      apiToken: redactSecret(settings?.cloudflare?.apiToken),
    },
  };
}

function buildHealthPayload() {
  const configs = getConfigs();
  return {
    ok: true,
    service: "universal-llm-extension",
    version: "0.5.14",
    port: PORT,
    providers: {
      local: {
        configured: Boolean(configs.local.candidates.length),
        providerLabel: getLocalProviderLabel(configs),
        candidates: configs.local.candidates,
        chatPath: getLocalChatPath(configs),
        executePath: getLocalExecutePath(configs),
        model: configs.local.model,
        bootstrap: getLocalRuntimeBootstrapState(),
        roots: configs.local.roots,
        apps: configs.local.apps.map((item) => item.name),
        skillRoots: Array.isArray(configs.local.skillRoots) ? configs.local.skillRoots : [],
        skills: Array.isArray(configs.local.skills) ? configs.local.skills.filter((item) => item.enabled !== false).map((item) => item.name) : [],
      },
      cloud: { configured: Boolean(configs.cloud.baseUrl || configs.cloud.appUrl), baseUrl: configs.cloud.baseUrl || null, appUrl: configs.cloud.appUrl || null, model: configs.cloud.model },
      cloudflare: { model: configs.cloudflare.model, directApi: Boolean(configs.cloudflare.accountId && configs.cloudflare.apiToken), proxyApp: Boolean(configs.cloudflare.appUrl), appUrl: configs.cloudflare.appUrl || null },
    },
    settings: sanitizeSettings(loadSettings()),
    data: {
      sessions: listJsonDir(SESSIONS_DIR).length,
      automations: listJsonDir(AUTOMATIONS_DIR).length,
      screenshots: fs.readdirSync(SCREENSHOTS_DIR).filter((file) => !file.endsWith(".json")).length,
      uploads: fs.readdirSync(UPLOADS_DIR).filter((file) => !file.endsWith(".json")).length,
    },
    commands: ["health_check", "search_files", "open_local_file", "launch_app", "run_local_command", "web_search", "open_url"],
    endpoints: ["/chat", "/settings", "/settings/local-models", "/settings/skills", "/diagnostics/provider/:provider", "/sessions", "/tasks/run", "/screenshot", "/upload", "/record", "/automations", "/play/:id", "/commands", "/download", "/demo/task-lab"],
  };
}

module.exports = {
  buildHealthPayload,
};
