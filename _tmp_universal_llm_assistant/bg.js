const DEFAULT_PROVIDER = "local";
const DEFAULT_SETTINGS = {
  runtimeUrl: "http://127.0.0.1:8010",
  runtimeModel: "aetherlab-legal-local-v1",
  appUrl: "http://localhost:3000",
  cloudModel: "aetherlab-legal-v1",
  cfModel: "@cf/meta/llama-3.1-8b-instruct",
  autoSaveSessions: true,
};

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error("Nao foi possivel abrir o painel.", error);
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["llm_provider", "llm_settings"], (result) => {
    chrome.storage.local.set({
      llm_provider: result.llm_provider || DEFAULT_PROVIDER,
      llm_settings: { ...DEFAULT_SETTINGS, ...(result.llm_settings || {}) },
    });
    chrome.storage.local.remove(["provider", "model", "settings"]);
  });
});
