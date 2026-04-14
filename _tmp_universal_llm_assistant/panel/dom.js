import { $, escHtml, renderMarkdown } from "./utils.js";
import { PROVIDER_META, state } from "./state.js";
import { renderErrorLog } from "./error-log.js";

const TABS = ["chat", "sessions", "tasks", "automations"];
const OVERLAYS = ["settings", "errors"];

export function collectElements() {
  return {
    root: $("app"),
    chatArea: $("chat-area"),
    msgInput: $("msg-input"),
    btnSend: $("btn-send"),
    providerSelect: $("provider-select"),
    providerBadge: $("provider-badge"),
    statusDot: $("status-dot"),
    btnSettings: $("btn-settings"),
    btnErrors: $("btn-errors"),
    btnCloseSettings: $("btn-close-settings"),
    tabChat: $("tab-chat"),
    tabSessions: $("tab-sessions"),
    tabTasks: $("tab-tasks"),
    tabAutomations: $("tab-automations"),
    paneChat: $("pane-chat"),
    paneSessions: $("pane-sessions"),
    paneTasks: $("pane-tasks"),
    paneAutomations: $("pane-automations"),
    paneSettings: $("pane-settings"),
    paneErrors: $("pane-errors"),
    memoryStrip: $("memory-strip"),
    memoryStripBadge: $("memory-strip-badge"),
    memoryStripText: $("memory-strip-text"),
    btnPageText: $("btn-page-text"),
    btnSelection: $("btn-selection"),
    btnScreenshot: $("btn-screenshot"),
    btnUpload: $("btn-upload"),
    fileInput: $("file-input"),
    btnRecord: $("btn-record"),
    btnReplay: $("btn-replay"),
    recorderStatus: $("recorder-status"),
    inputRuntimeUrl: $("input-runtime-url"),
    inputRuntimeModel: $("input-runtime-model"),
    inputAppUrl: $("input-app-url"),
    inputCloudBaseUrl: $("input-cloud-base-url"),
    inputCloudAuthToken: $("input-cloud-auth-token"),
    inputCloudModel: $("input-cloud-model"),
    inputCfModel: $("input-cf-model"),
    inputCfAccountId: $("input-cf-account-id"),
    inputCfApiToken: $("input-cf-api-token"),
    btnSaveSettings: $("btn-save-settings"),
    btnTestLocal: $("btn-test-local"),
    btnTestCloud: $("btn-test-cloud"),
    btnTestCf: $("btn-test-cf"),
    testLocalResult: $("test-local-result"),
    testLocalDetail: $("test-local-detail"),
    testCloudResult: $("test-cloud-result"),
    testCloudDetail: $("test-cloud-detail"),
    testCfResult: $("test-cf-result"),
    testCfDetail: $("test-cf-detail"),
  };
}

export function updateProviderBadge(el) {
  const meta = PROVIDER_META[state.provider] || { label: state.provider, color: "#6b7280" };
  el.providerBadge.textContent = meta.label;
  el.providerBadge.style.color = meta.color;
  el.providerSelect.value = state.provider;
}

export function updateStatusDot(el, status) {
  el.statusDot.className = `status-dot ${status}`;
}

export function switchTab(el, tab) {
  state.activeTab = tab;
  TABS.forEach((name) => {
    el[`tab${name.charAt(0).toUpperCase() + name.slice(1)}`].classList.toggle("active", name === tab);
    el[`pane${name.charAt(0).toUpperCase() + name.slice(1)}`].style.display = name === tab ? "flex" : "none";
  });
}

export function openOverlay(el, name) {
  OVERLAYS.forEach((item) => {
    const pane = el[`pane${item.charAt(0).toUpperCase() + item.slice(1)}`];
    if (!pane) return;
    pane.style.display = item === name ? "flex" : "none";
  });
  if (name === "errors") renderErrorLog();
}

export function closeOverlays(el) {
  OVERLAYS.forEach((item) => {
    const pane = el[`pane${item.charAt(0).toUpperCase() + item.slice(1)}`];
    if (pane) pane.style.display = "none";
  });
}

export function addMessage(el, role, content) {
  el.chatArea.querySelector(".empty-state")?.remove();
  const wrap = document.createElement("div");
  wrap.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  if (role === "assistant") bubble.innerHTML = renderMarkdown(content);
  else bubble.textContent = content;
  wrap.appendChild(bubble);
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}

export function addSystemMessage(el, text) {
  const wrap = document.createElement("div");
  wrap.className = "message system";
  wrap.innerHTML = `<div class="message-bubble">${escHtml(text)}</div>`;
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}

export function updateMemoryStrip(el, metadata) {
  if (!el.memoryStrip || !el.memoryStripText || !el.memoryStripBadge) return;
  if (!metadata || state.provider !== "local") {
    el.memoryStrip.classList.add("hidden");
    el.memoryStripText.textContent = "";
    return;
  }

  const parts = [];
  if (metadata.performance_profile) parts.push(metadata.performance_profile);
  if (Number(metadata.memory_entries_used || 0) > 0) parts.push(`${metadata.memory_entries_used} memorias`);
  if (Number(metadata.rag_matches_used || 0) > 0) parts.push(`${metadata.rag_matches_used} referencias`);
  if (Array.isArray(metadata.rag_sources) && metadata.rag_sources.length) {
    parts.push(metadata.rag_sources.join(" + "));
  }

  if (!parts.length) {
    el.memoryStrip.classList.add("hidden");
    el.memoryStripText.textContent = "";
    return;
  }

  el.memoryStrip.classList.remove("hidden");
  el.memoryStripBadge.textContent = "Memoria local";
  el.memoryStripText.textContent = parts.join(" | ");
}
