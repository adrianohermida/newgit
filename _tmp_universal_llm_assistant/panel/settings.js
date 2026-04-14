import { BRIDGE_URL, state } from "./state.js";
import { parseJsonResponse, safeFetch } from "./utils.js";

export function fillSettingsInputs(el) {
  el.inputRuntimeUrl.value = state.settings.runtimeUrl;
  el.inputRuntimeModel.value = state.settings.runtimeModel;
  el.inputAppUrl.value = state.settings.appUrl;
  el.inputCloudModel.value = state.settings.cloudModel;
  el.inputCfModel.value = state.settings.cfModel;
}

export function hydrateSettings(settings) {
  if (!settings) return;
  state.settings.runtimeUrl = settings.local?.runtimeUrl || state.settings.runtimeUrl;
  state.settings.runtimeModel = settings.local?.runtimeModel || state.settings.runtimeModel;
  state.settings.appUrl = settings.cloud?.appUrl || state.settings.appUrl;
  state.settings.cloudModel = settings.cloud?.model || state.settings.cloudModel;
  state.settings.cfModel = settings.cloudflare?.model || state.settings.cfModel;
}

export async function loadSettings(el) {
  await new Promise((resolve) => {
    chrome.storage.local.get(["llm_settings", "llm_provider"], (result) => {
      if (result.llm_settings) state.settings = { ...state.settings, ...result.llm_settings };
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
        local: { runtimeUrl: state.settings.runtimeUrl, runtimeModel: state.settings.runtimeModel },
        cloud: { appUrl: state.settings.appUrl, model: state.settings.cloudModel },
        cloudflare: { model: state.settings.cfModel },
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
    appUrl: String(el.inputAppUrl.value || state.settings.appUrl).trim(),
    cloudModel: String(el.inputCloudModel.value || state.settings.cloudModel).trim(),
    cfModel: String(el.inputCfModel.value || state.settings.cfModel).trim(),
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
