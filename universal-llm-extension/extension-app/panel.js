import { buildPanelMarkup } from "./panel/template.js";
import { state } from "./panel/state.js";
import { collectElements, addMessage, addSystemMessage, switchTab, updateActiveAssetGroup, updateProjectStrip, updateProviderBadge, updateStatusDot, openOverlay, closeOverlays, updateMemoryStrip, updateSkillStrip, updateWorkspaceStrip } from "./panel/dom.js";
import { bindChat, enqueueOutgoingMessage } from "./panel/chat.js";
import { bindRecorder, bindUpload, injectPageText, injectSelection, openAgentTab, refreshWorkspaceContext, takeScreenshot } from "./panel/browser.js";
import { renderAutomations, renderSessions, renderTasks, syncSession } from "./panel/lists.js";
import { checkBridge, testProvider } from "./panel/bridge.js";
import { fillSettingsInputs, hydrateSettings, loadLocalModelCatalog, loadSettings, loadSkillCatalog, saveSettings } from "./panel/settings.js";
import { installGlobalErrorHandlers, loadErrorLog, renderErrorLog } from "./panel/error-log.js";
import { bindMediaControls } from "./panel/media.js";

let bootstrapTimer = null;

async function initPanel() {
  try {
    installGlobalErrorHandlers();
    const root = document.getElementById("app");
    if (!root) throw new Error("Elemento #app nao encontrado no painel.");
    root.innerHTML = buildPanelMarkup();
    const el = collectElements();
    await loadErrorLog();
    await loadSettings(el);
    await loadSkillCatalog(el).catch(() => {});
    bindChat(el, addMessage, addSystemMessage, renderTasks);
    bindMediaControls(el, addSystemMessage, () => document.getElementById("btn-send")?.click());
    bindUpload(el, addSystemMessage, enqueueOutgoingMessage, addMessage, renderTasks);
    bindRecorder(el, addSystemMessage);
    bindUiActions(el);
    renderErrorLog();
    await bootstrapBridge(el);
    startBridgePolling(el);
    startTaskRefreshLoop(el);
  } catch (error) {
    renderPanelFatalError(error);
    throw error;
  }
}

function bindUiActions(el) {
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
  el.providerSelect?.addEventListener("change", async () => {
    state.provider = el.providerSelect.value;
    await saveSettings(el);
    updateProviderBadge(el);
  });
  el.btnSettings?.addEventListener("click", async () => {
    openOverlay(el, "settings");
    await loadLocalModelCatalog(el).catch(() => {});
    await loadSkillCatalog(el).catch(() => {});
  });
  el.btnErrors?.addEventListener("click", () => openOverlay(el, "errors"));
  el.btnCloseSettings?.addEventListener("click", () => closeOverlays(el));
  el.paneSettings?.addEventListener("click", (event) => { if (event.target === el.paneSettings) closeOverlays(el); });
  el.paneErrors?.addEventListener("click", (event) => { if (event.target === el.paneErrors) closeOverlays(el); });
  el.tabChat?.addEventListener("click", () => { closeOverlays(el); switchTab(el, "chat"); });
  el.tabSessions?.addEventListener("click", async () => {
    closeOverlays(el);
    switchTab(el, "sessions");
    await renderSessions(el, addSystemMessage, switchTab, addMessage, updateProviderBadge, enqueueOutgoingMessage, updateActiveAssetGroup);
  });
  el.tabTasks?.addEventListener("click", async () => {
    closeOverlays(el);
    switchTab(el, "tasks");
    await renderTasks(el);
  });
  el.tabAutomations?.addEventListener("click", async () => {
    closeOverlays(el);
    switchTab(el, "automations");
    await renderAutomations(el, addSystemMessage, switchTab);
  });
  el.btnPageText?.addEventListener("click", () => injectPageText(el, addSystemMessage, enqueueOutgoingMessage, addMessage, renderTasks));
  el.btnAgentTab?.addEventListener("click", () => openAgentTab(el, addSystemMessage));
  el.btnSelection?.addEventListener("click", () => injectSelection(el, addSystemMessage, enqueueOutgoingMessage, addMessage, renderTasks));
  el.btnScreenshot?.addEventListener("click", () => takeScreenshot(el, addSystemMessage, enqueueOutgoingMessage, addMessage, renderTasks));
  el.btnReplay?.addEventListener("click", async () => {
    switchTab(el, "automations");
    await renderAutomations(el, addSystemMessage, switchTab);
  });
  el.btnSaveSettings?.addEventListener("click", async () => {
    await saveSettings(el);
    updateProviderBadge(el);
    addSystemMessage(el, "Configuracoes salvas.");
    await bootstrapBridge(el);
    closeOverlays(el);
  });
  el.btnTestLocal?.addEventListener("click", () => testProvider("local", el.testLocalResult));
  el.btnRefreshLocalModels?.addEventListener("click", () => loadLocalModelCatalog(el).catch(() => {}));
  el.btnRefreshSkills?.addEventListener("click", () => loadSkillCatalog(el).catch(() => {}));
  el.btnTestCloud?.addEventListener("click", () => testProvider("cloud", el.testCloudResult));
  el.btnTestCf?.addEventListener("click", () => testProvider("cloudflare", el.testCfResult));
}

function startBridgePolling(el) {
  stopTaskRefreshLoop();
  if (bootstrapTimer) clearInterval(bootstrapTimer);
  bootstrapTimer = setInterval(() => bootstrapBridge(el).catch(() => {}), 20000);
}

async function bootstrapBridge(el) {
  const health = await checkBridge(el, updateStatusDot);
  if (health?.settings) hydrateSettings(health.settings);
  fillSettingsInputs(el);
  updateProviderBadge(el);
  updateMemoryStrip(el, state.localMemoryMeta);
  updateSkillStrip(el, state.sessionSkillNames);
  updateProjectStrip(el, state.sessionProject);
  updateActiveAssetGroup(el, state.activeAssetGroup);
  updateWorkspaceStrip(el, state.workspaceTabs, state.activeWorkspaceTabId);
  await refreshWorkspaceContext(el).catch(() => {});
  if (state.activeTab === "tasks") await renderTasks(el);
}

function startTaskRefreshLoop(el) {
  stopTaskRefreshLoop();
  state.taskRefreshTimer = window.setInterval(() => {
    if (!state.bridgeOk) return;
    if (state.activeTab !== "tasks") return;
    renderTasks(el).catch(() => {});
  }, 1500);
}

function stopTaskRefreshLoop() {
  if (!state.taskRefreshTimer) return;
  window.clearInterval(state.taskRefreshTimer);
  state.taskRefreshTimer = null;
}

function renderPanelFatalError(error) {
  const root = document.getElementById("app");
  if (!root) return;
  const message = String(error?.message || "Falha ao iniciar o painel.");
  const stack = String(error?.stack || "").slice(0, 1200);
  root.innerHTML = `
    <div style="font-family:Arial,'Segoe UI',sans-serif;padding:20px;color:#0f172a;background:#f8fafc;min-height:100vh;box-sizing:border-box;">
      <div style="max-width:720px;margin:0 auto;background:#fff;border:1px solid #dbe2ea;border-radius:18px;padding:20px;box-shadow:0 16px 40px rgba(15,23,42,.08);">
        <div style="font-size:20px;font-weight:700;margin-bottom:8px;">Falha ao carregar a extensao</div>
        <div style="font-size:14px;line-height:1.6;color:#475569;margin-bottom:14px;">O painel encontrou um erro no bootstrap. A interface nao fica mais em branco: abaixo esta o erro tecnico para depuracao.</div>
        <div style="padding:12px 14px;border-radius:12px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-size:13px;margin-bottom:12px;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        <pre style="white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.55;background:#0f172a;color:#e2e8f0;border-radius:12px;padding:14px;overflow:auto;">${stack.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
      </div>
    </div>
  `;
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initPanel);
else initPanel();
