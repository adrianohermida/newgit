import { BRIDGE_URL, state } from "./state.js";
import { parseJsonResponse, safeFetch } from "./utils.js";

function normalizeLoopback(url) {
  return String(url || "").trim().replace(/^http:\/\/localhost:3000$/i, "http://127.0.0.1:3000");
}

function parseLines(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function formatLines(values) {
  return Array.isArray(values) ? values.join("\n") : "";
}

function parseApps(value) {
  return parseLines(value).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`JSON invalido em aplicativos locais: ${line}`);
    }
  }).filter((item) => item?.name && item?.path);
}

function formatApps(values) {
  return Array.isArray(values) ? values.map((item) => JSON.stringify(item)).join("\n") : "";
}

export function fillSettingsInputs(el) {
  el.inputRuntimeUrl.value = state.settings.runtimeUrl;
  el.inputRuntimeModel.value = state.settings.runtimeModel;
  el.inputAlwaysAllowTabs.checked = !!state.settings.alwaysAllowTabAccess;
  el.inputLocalRoots.value = formatLines(state.settings.localRoots);
  el.inputLocalApps.value = formatApps(state.settings.localApps);
  el.inputAppUrl.value = state.settings.appUrl;
  el.inputCloudBaseUrl.value = state.settings.cloudBaseUrl;
  el.inputCloudAuthToken.value = state.settings.cloudAuthToken;
  el.inputCloudModel.value = state.settings.cloudModel;
  el.inputCfModel.value = state.settings.cfModel;
  el.inputCfAccountId.value = state.settings.cfAccountId;
  el.inputCfApiToken.value = state.settings.cfApiToken;
}

export function hydrateSettings(settings) {
  if (!settings) return;
  state.settings.runtimeUrl = settings.local?.runtimeUrl || state.settings.runtimeUrl;
  state.settings.runtimeModel = settings.local?.runtimeModel || state.settings.runtimeModel;
  state.settings.alwaysAllowTabAccess = Boolean(settings.local?.alwaysAllowTabAccess ?? state.settings.alwaysAllowTabAccess);
  state.settings.trustedTabOrigins = Array.isArray(settings.local?.trustedTabOrigins) ? settings.local.trustedTabOrigins : state.settings.trustedTabOrigins;
  state.settings.localRoots = Array.isArray(settings.local?.roots) ? settings.local.roots : state.settings.localRoots;
  state.settings.localApps = Array.isArray(settings.local?.apps) ? settings.local.apps : state.settings.localApps;
  state.settings.appUrl = normalizeLoopback(settings.cloud?.appUrl || state.settings.appUrl);
  state.settings.cloudBaseUrl = settings.cloud?.baseUrl || state.settings.cloudBaseUrl;
  state.settings.cloudModel = settings.cloud?.model || state.settings.cloudModel;
  state.settings.cloudAuthToken = settings.cloud?.authToken || state.settings.cloudAuthToken;
  state.settings.cfModel = settings.cloudflare?.model || state.settings.cfModel;
  state.settings.cfAccountId = settings.cloudflare?.accountId || state.settings.cfAccountId;
  state.settings.cfApiToken = settings.cloudflare?.apiToken || state.settings.cfApiToken;
}

export async function loadSettings(el) {
  await new Promise((resolve) => {
    chrome.storage.local.get(["llm_settings", "llm_provider"], (result) => {
      if (result.llm_settings) state.settings = { ...state.settings, ...result.llm_settings, appUrl: normalizeLoopback(result.llm_settings.appUrl || state.settings.appUrl) };
      if (result.llm_provider) state.provider = result.llm_provider;
      resolve();
    });
  });
  fillSettingsInputs(el);
}

export async function pushBridgeSettings() {
  await safeFetch(`${BRIDGE_URL}/settings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      settings: {
        local: { runtimeUrl: state.settings.runtimeUrl, runtimeModel: state.settings.runtimeModel, alwaysAllowTabAccess: state.settings.alwaysAllowTabAccess, trustedTabOrigins: state.settings.trustedTabOrigins, roots: state.settings.localRoots, apps: state.settings.localApps },
        cloud: { appUrl: state.settings.appUrl, baseUrl: state.settings.cloudBaseUrl, model: state.settings.cloudModel, authToken: state.settings.cloudAuthToken },
        cloudflare: { model: state.settings.cfModel, accountId: state.settings.cfAccountId, apiToken: state.settings.cfApiToken },
      },
    }),
  }, 6000);
}

export async function saveSettings(el) {
  state.provider = el.providerSelect.value || state.provider;
  state.settings = {
    ...state.settings,
    runtimeUrl: String(el.inputRuntimeUrl.value || state.settings.runtimeUrl).trim(),
    runtimeModel: String(el.inputRuntimeModel.value || state.settings.runtimeModel).trim(),
    alwaysAllowTabAccess: !!el.inputAlwaysAllowTabs.checked,
    localRoots: parseLines(el.inputLocalRoots.value),
    localApps: parseApps(el.inputLocalApps.value),
    appUrl: normalizeLoopback(el.inputAppUrl.value || state.settings.appUrl),
    cloudBaseUrl: String(el.inputCloudBaseUrl.value || state.settings.cloudBaseUrl).trim(),
    cloudAuthToken: String(el.inputCloudAuthToken.value || state.settings.cloudAuthToken).trim(),
    cloudModel: String(el.inputCloudModel.value || state.settings.cloudModel).trim(),
    cfModel: String(el.inputCfModel.value || state.settings.cfModel).trim(),
    cfAccountId: String(el.inputCfAccountId.value || state.settings.cfAccountId).trim(),
    cfApiToken: String(el.inputCfApiToken.value || state.settings.cfApiToken).trim(),
  };
  await new Promise((resolve) => chrome.storage.local.set({ llm_settings: state.settings, llm_provider: state.provider }, resolve));
  await pushBridgeSettings();
}

export async function syncFromBridge(el) {
  const response = await safeFetch(`${BRIDGE_URL}/health`, {}, 3000);
  const data = await parseJsonResponse(response);
  if (data.settings) hydrateSettings(data.settings);
  fillSettingsInputs(el);
  return data;
}
