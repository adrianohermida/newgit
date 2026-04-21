const { loadSettings } = require("./storage");

function redactSecret(value) {
  return value ? "[configured]" : "";
}

function buildSafeSettingsPayload() {
  const settings = loadSettings();
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
      skills: Array.isArray(settings?.local?.skills) ? settings.local.skills : [],
      apps: Array.isArray(settings?.local?.apps) ? settings.local.apps : [],
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

module.exports = {
  buildSafeSettingsPayload,
};
