import { buildPanelMarkup } from "./panel/template.js";
import { state } from "./panel/state.js";
import { collectElements, addMediaPreview, addMessage, addSystemMessage, switchTab, updateActiveAssetGroup, updateProviderBadge, updateStatusDot, openOverlay, closeOverlays, updateMemoryStrip, updateWorkspaceStrip } from "./panel/dom.js";
import { bindChat, enqueueOutgoingMessage } from "./panel/chat.js";
import { bindRecorder, bindUpload, injectPageText, injectSelection, openAgentTab, refreshWorkspaceContext, takeScreenshot } from "./panel/browser.js";
import { renderAutomations, renderSessions, renderTasks, syncSession } from "./panel/lists.js";
import { checkBridge, testProvider } from "./panel/bridge.js";
import { fillSettingsInputs, hydrateSettings, loadSettings, saveSettings } from "./panel/settings.js";
import { installGlobalErrorHandlers, loadErrorLog, renderErrorLog } from "./panel/error-log.js";
import { bindMediaControls } from "./panel/media.js";

let bootstrapTimer = null;

async function initPanel() {
  installGlobalErrorHandlers();
  document.getElementById("app").innerHTML = buildPanelMarkup();
  const el = collectElements();
  await loadErrorLog();
  await loadSettings(el);
  bindChat(el, addMessage, addSystemMessage, renderTasks);
  bindMediaControls(el, addSystemMessage, () => document.getElementById("btn-send")?.click());
  bindUpload(el, addSystemMessage, enqueueOutgoingMessage, addMessage, renderTasks);
  bindRecorder(el, addSystemMessage);
  el.btnClearAssetGroup?.addEventListener("click", () => {
    state.activeAssetGroup = null;
    updateActiveAssetGroup(el, null);
    addSystemMessage(el, "Pacote visual removido do contexto ativo.");
    syncSession().catch(() => {});
  });
  el.btnRefreshWorkspace?.addEventListener("click", async () => {
    await refreshWorkspaceContext(el);
    addSystemMessage(el, "Workspace de abas atualizado.");
  });

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
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
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
  el.btnPageText.addEventListener("click", () => injectPageText(el, addSystemMessage, enqueueOutgoingMessage, addMessage, renderTasks));
  el.btnAgentTab.addEventListener("click", () => openAgentTab(el, addSystemMessage));
  el.btnSelection.addEventListener("click", () => injectSelection(el, addSystemMessage, enqueueOutgoingMessage, addMessage, renderTasks));
  el.btnScreenshot.addEventListener("click", async () => {
    const shot = await takeScreenshot(el, addSystemMessage);
    if (!shot?.dataUrl) return;
    addMediaPreview(el, "Screenshot capturado", shot.dataUrl, shot.tab?.title || shot.tab?.url || "");
    enqueueOutgoingMessage(
      el,
      {
        text: `[Screenshot capturado de: ${shot.tab?.title || shot.tab?.url || "aba ativa"}]\n\nDescreva a interface, os elementos relevantes e as proximas acoes recomendadas.`,
        visibleText: "Analise a captura de tela que acabei de enviar.",
      },
      addMessage,
      addSystemMessage,
      renderTasks,
    );
  });
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
  updateMemoryStrip(el, state.localMemoryMeta);
  updateActiveAssetGroup(el, state.activeAssetGroup);
  updateWorkspaceStrip(el, state.workspaceTabs, state.activeWorkspaceTabId);
  await refreshWorkspaceContext(el).catch(() => {});
  if (state.activeTab === "tasks") await renderTasks(el);
}

document.addEventListener("DOMContentLoaded", initPanel);
