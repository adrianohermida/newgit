const DEFAULT_PROVIDER = "local";
const ERROR_LOG_KEY = "llm_error_log";
const DEFAULT_SETTINGS = {
  runtimeUrl: "http://127.0.0.1:8000",
  runtimeModel: "aetherlab-legal-local-v1",
  appUrl: "http://127.0.0.1:3000",
  cloudModel: "aetherlab-legal-v1",
  cfModel: "@cf/meta/llama-3.1-8b-instruct",
  autoSaveSessions: true,
};

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    appendErrorLog({
      scope: "bg.sidepanel",
      title: "Falha ao abrir o painel lateral",
      expected: "Abrir o side panel da extensao na aba ativa.",
      actual: error?.message || "Erro ao abrir o painel.",
      trace: error?.stack || "bg.js -> chrome.sidePanel.open()",
      recommendation: "Verifique se a extensao esta ativa e se o navegador suporta sidePanel nesta pagina.",
    });
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

self.addEventListener("error", (event) => {
  appendErrorLog({
    scope: "bg.runtime",
    title: "Erro nao tratado no service worker",
    expected: "Executar o background sem excecoes nao tratadas.",
    actual: event.message || "Erro desconhecido no background.",
    trace: [event.filename, event.lineno, event.colno].filter(Boolean).join(":"),
    recommendation: "Abra os detalhes tecnicos e verifique o stack do service worker.",
    details: event.error?.stack || event.error || null,
  });
});

self.addEventListener("unhandledrejection", (event) => {
  appendErrorLog({
    scope: "bg.promise",
    title: "Promise rejeitada no service worker",
    expected: "Promises do background finalizadas com tratamento de erro.",
    actual: event.reason?.message || String(event.reason || "Rejeicao desconhecida"),
    trace: "bg.js -> unhandledrejection",
    recommendation: "Verifique a chamada assíncrona e o retorno bruto do Chrome API/bridge.",
    details: event.reason?.stack || event.reason || null,
  });
});

function appendErrorLog(entry) {
  chrome.storage.local.get([ERROR_LOG_KEY], (result) => {
    const current = Array.isArray(result?.[ERROR_LOG_KEY]) ? result[ERROR_LOG_KEY] : [];
    const next = [{
      id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      details: "",
      ...entry,
    }, ...current].slice(0, 40);
    chrome.storage.local.set({ [ERROR_LOG_KEY]: next });
  });
}
