import { buildPanelMarkup } from "./panel/template.js";
import { state } from "./panel/state.js";
import { collectElements, addMessage, addSystemMessage, switchTab, updateProviderBadge, updateStatusDot, openOverlay, closeOverlays } from "./panel/dom.js";
import { bindChat } from "./panel/chat.js";
import { bindRecorder, bindUpload, injectPageText, injectSelection, takeScreenshot } from "./panel/browser.js";
import { renderAutomations, renderSessions, renderTasks } from "./panel/lists.js";
import { checkBridge, testProvider } from "./panel/bridge.js";
import { fillSettingsInputs, hydrateSettings, loadSettings, saveSettings } from "./panel/settings.js";
import { installGlobalErrorHandlers, loadErrorLog, renderErrorLog } from "./panel/error-log.js";

let bootstrapTimer = null;

async function initPanel() {
  installGlobalErrorHandlers();
  document.getElementById("app").innerHTML = buildPanelMarkup();
  const el = collectElements();
  await loadErrorLog();
  await loadSettings(el);
  bindChat(el, addMessage, addSystemMessage, renderTasks);
  bindUpload(el, addSystemMessage);
  bindRecorder(el, addSystemMessage);

  el.providerSelect.addEventListener("change", async () => {
    state.provider = el.providerSelect.value;
    await saveSettings(el);
    updateProviderBadge(el);
  });
  el.btnSettings.addEventListener("click", () => openOverlay(el, "settings"));
  el.btnErrors.addEventListener("click", () => openOverlay(el, "errors"));
  el.btnCloseSettings?.addEventListener("click", () => closeOverlays(el));
  el.paneSettings?.addEventListener("click", (event) => { if (event.target === el.paneSettings) closeOverlays(el); });
  el.paneErrors?.addEventListener("click", (event) => { if (event.target === el.paneErrors) closeOverlays(el); });
  el.tabChat.addEventListener("click", () => { closeOverlays(el); switchTab(el, "chat"); });
  el.tabSessions.addEventListener("click", async () => {
    closeOverlays(el);
    switchTab(el, "sessions");
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge);
  });
  el.tabTasks.addEventListener("click", async () => {
    closeOverlays(el);
    switchTab(el, "tasks");
    await renderTasks(el);
  });
  el.tabAutomations.addEventListener("click", async () => {
    closeOverlays(el);
    switchTab(el, "automations");
    await renderAutomations(el, addSystemMessage, switchTab);
  });
  el.btnPageText.addEventListener("click", () => injectPageText(el));
  el.btnSelection.addEventListener("click", () => injectSelection(el, addSystemMessage));
  el.btnScreenshot.addEventListener("click", () => takeScreenshot(el, addSystemMessage));
  el.btnReplay.addEventListener("click", async () => {
    switchTab(el, "automations");
    await renderAutomations(el, addSystemMessage, switchTab);
  });
  el.btnSaveSettings.addEventListener("click", async () => {
    await saveSettings(el);
    updateProviderBadge(el);
    addSystemMessage(el, "Configuracoes salvas.");
    await bootstrapBridge(el);
    closeOverlays(el);
  });
  el.btnTestLocal.addEventListener("click", () => testProvider("local", el.testLocalResult));
  el.btnTestCloud.addEventListener("click", () => testProvider("cloud", el.testCloudResult));
  el.btnTestCf.addEventListener("click", () => testProvider("cloudflare", el.testCfResult));

  renderErrorLog();
  await bootstrapBridge(el);

  // um único intervalo de polling; limpa o anterior se initPanel for chamado de novo
  if (bootstrapTimer) clearInterval(bootstrapTimer);
  bootstrapTimer = setInterval(() => bootstrapBridge(el).catch(() => {}), 20000);
}

async function bootstrapBridge(el) {
  const health = await checkBridge(el, updateStatusDot);
  if (health?.settings) hydrateSettings(health.settings);
  fillSettingsInputs(el);
  updateProviderBadge(el);
  if (state.activeTab === "tasks") await renderTasks(el);
}

document.addEventListener("DOMContentLoaded", initPanel);
