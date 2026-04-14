import { $, escHtml, renderMarkdown } from "./utils.js";
import { PROVIDER_META, state } from "./state.js";

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
    tabChat: $("tab-chat"),
    tabSessions: $("tab-sessions"),
    tabAutomations: $("tab-automations"),
    tabSettings: $("tab-settings"),
    paneChat: $("pane-chat"),
    paneSessions: $("pane-sessions"),
    paneAutomations: $("pane-automations"),
    paneSettings: $("pane-settings"),
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
    inputCloudModel: $("input-cloud-model"),
    inputCfModel: $("input-cf-model"),
    btnSaveSettings: $("btn-save-settings"),
    btnTestLocal: $("btn-test-local"),
    btnTestCloud: $("btn-test-cloud"),
    btnTestCf: $("btn-test-cf"),
    testLocalResult: $("test-local-result"),
    testCloudResult: $("test-cloud-result"),
    testCfResult: $("test-cf-result"),
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
  for (const name of ["chat", "sessions", "automations", "settings"]) {
    el[`tab${name.charAt(0).toUpperCase() + name.slice(1)}`].classList.toggle("active", name === tab);
    el[`pane${name.charAt(0).toUpperCase() + name.slice(1)}`].style.display = name === tab ? "flex" : "none";
  }
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
