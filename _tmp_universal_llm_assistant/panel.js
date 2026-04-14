import { buildPanelMarkup } from "./panel/template.js";
import { state } from "./panel/state.js";
import { collectElements, addMessage, addSystemMessage, switchTab, updateProviderBadge, updateStatusDot } from "./panel/dom.js";
import { bindChat } from "./panel/chat.js";
import { bindRecorder, bindUpload, injectPageText, injectSelection, takeScreenshot } from "./panel/browser.js";
import { renderAutomations, renderSessions } from "./panel/lists.js";
import { checkBridge, testProvider } from "./panel/bridge.js";
import { fillSettingsInputs, hydrateSettings, loadSettings, saveSettings, syncFromBridge } from "./panel/settings.js";

async function initPanel() {
  document.getElementById("app").innerHTML = buildPanelMarkup();
  const el = collectElements();
  await loadSettings(el);
  bindChat(el, addMessage, addSystemMessage);
  bindUpload(el, addSystemMessage);
  bindRecorder(el, addSystemMessage);

  el.providerSelect.addEventListener("change", async () => { state.provider = el.providerSelect.value; await saveSettings(el); updateProviderBadge(el); });
  el.btnSettings.addEventListener("click", () => switchTab(el, "settings"));
  el.tabChat.addEventListener("click", () => switchTab(el, "chat"));
  el.tabSessions.addEventListener("click", async () => { switchTab(el, "sessions"); await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge); });
  el.tabAutomations.addEventListener("click", async () => { switchTab(el, "automations"); await renderAutomations(el, addSystemMessage, switchTab); });
  el.tabSettings.addEventListener("click", () => switchTab(el, "settings"));
  el.btnPageText.addEventListener("click", () => injectPageText(el));
  el.btnSelection.addEventListener("click", () => injectSelection(el, addSystemMessage));
  el.btnScreenshot.addEventListener("click", () => takeScreenshot(el, addSystemMessage));
  el.btnReplay.addEventListener("click", async () => { switchTab(el, "automations"); await renderAutomations(el, addSystemMessage, switchTab); });
  el.btnSaveSettings.addEventListener("click", async () => { await saveSettings(el); updateProviderBadge(el); addSystemMessage(el, "Configuracoes salvas."); await bootstrapBridge(el); });
  el.btnTestLocal.addEventListener("click", () => testProvider("local", el.testLocalResult));
  el.btnTestCloud.addEventListener("click", () => testProvider("cloud", el.testCloudResult));
  el.btnTestCf.addEventListener("click", () => testProvider("cloudflare", el.testCfResult));

  await bootstrapBridge(el);
  setInterval(() => bootstrapBridge(el), 20000);
}

async function bootstrapBridge(el) {
  const health = await checkBridge(el, updateStatusDot);
  if (health?.settings) hydrateSettings(health.settings);
  fillSettingsInputs(el);
  updateProviderBadge(el);
}

document.addEventListener("DOMContentLoaded", initPanel);
