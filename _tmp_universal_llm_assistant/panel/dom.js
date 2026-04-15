import { $, escHtml, renderMarkdown } from "./utils.js";
import { PROVIDER_META, state } from "./state.js";
import { renderErrorLog } from "./error-log.js";

const TABS = ["chat", "sessions", "tasks", "automations"];
const OVERLAYS = ["settings", "errors", "camera"];

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
    paneCamera: $("pane-camera"),
    paneErrors: $("pane-errors"),
    memoryStrip: $("memory-strip"),
    memoryStripBadge: $("memory-strip-badge"),
    memoryStripText: $("memory-strip-text"),
    skillStrip: $("skill-strip"),
    skillStripBadge: $("skill-strip-badge"),
    skillStripText: $("skill-strip-text"),
    projectStrip: $("project-strip"),
    projectStripBadge: $("project-strip-badge"),
    projectStripText: $("project-strip-text"),
    assetGroupStrip: $("asset-group-strip"),
    assetGroupBadge: $("asset-group-badge"),
    assetGroupText: $("asset-group-text"),
    assetGroupMeta: $("asset-group-meta"),
    btnClearAssetGroup: $("btn-clear-asset-group"),
    runtimeStrip: $("runtime-strip"),
    runtimeStripBadge: $("runtime-strip-badge"),
    runtimeStripText: $("runtime-strip-text"),
    runtimeStripQueue: $("runtime-strip-queue"),
    queueStrip: $("queue-strip"),
    queueSummary: $("queue-summary"),
    queueList: $("queue-list"),
    workspaceStrip: $("workspace-strip"),
    workspaceStripText: $("workspace-strip-text"),
    workspaceStripMeta: $("workspace-strip-meta"),
    btnRefreshWorkspace: $("btn-refresh-workspace"),
    btnPageText: $("btn-page-text"),
    btnAgentTab: $("btn-agent-tab"),
    btnSelection: $("btn-selection"),
    btnScreenshot: $("btn-screenshot"),
    btnCamera: $("btn-camera"),
    btnUpload: $("btn-upload"),
    fileInput: $("file-input"),
    btnRecord: $("btn-record"),
    btnReplay: $("btn-replay"),
    btnVoice: $("btn-voice"),
    btnLang: $("btn-lang"),
    btnMic: $("btn-mic"),
    btnCloseCamera: $("btn-close-camera"),
    btnCaptureCamera: $("btn-capture-camera"),
    cameraPreview: $("camera-preview"),
    cameraCanvas: $("camera-canvas"),
    recorderStatus: $("recorder-status"),
    btnCancelEdit: $("btn-cancel-edit"),
    composerMode: $("composer-mode"),
    composerHint: $("composer-hint"),
    inputRuntimeUrl: $("input-runtime-url"),
    inputRuntimeModel: $("input-runtime-model"),
    localModelList: $("local-model-list"),
    btnRefreshLocalModels: $("btn-refresh-local-models"),
    localModelsResult: $("local-models-result"),
    localModelsDetail: $("local-models-detail"),
    inputAlwaysAllowTabs: $("input-always-allow-tabs"),
    inputLocalRoots: $("input-local-roots"),
    inputLocalApps: $("input-local-apps"),
    inputLocalSkillRoots: $("input-local-skill-roots"),
    inputLocalSkills: $("input-local-skills"),
    btnRefreshSkills: $("btn-refresh-skills"),
    localSkillsResult: $("local-skills-result"),
    localSkillsDetail: $("local-skills-detail"),
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
  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "assistant" ? "Assistente" : role === "user" ? "Voce" : role;
  if (role === "assistant") bubble.innerHTML = renderMarkdown(content);
  else bubble.textContent = content;
  wrap.appendChild(meta);
  wrap.appendChild(bubble);
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}

export function addSystemMessage(el, text) {
  const wrap = document.createElement("div");
  wrap.className = "message system";
  wrap.innerHTML = `<div class="message-meta">Sistema</div><div class="message-bubble">${escHtml(text)}</div>`;
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}

export function addMediaPreview(el, title, dataUrl, caption = "") {
  el.chatArea.querySelector(".empty-state")?.remove();
  const wrap = document.createElement("div");
  wrap.className = "message system preview-row";
  wrap.innerHTML = `
    <div class="message-bubble media-preview">
      <div class="media-preview-title">${escHtml(title)}</div>
      <img src="${escHtml(dataUrl)}" alt="${escHtml(title)}" class="media-preview-image" />
      ${caption ? `<div class="media-preview-caption">${escHtml(caption)}</div>` : ""}
    </div>
  `;
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}

export function addContextPreview(el, title, rows = []) {
  el.chatArea.querySelector(".empty-state")?.remove();
  const safeRows = Array.isArray(rows) ? rows.filter(Boolean).slice(0, 5) : [];
  const wrap = document.createElement("div");
  wrap.className = "message system preview-row";
  wrap.innerHTML = `
    <div class="message-bubble media-preview context-preview">
      <div class="media-preview-title">${escHtml(title)}</div>
      ${safeRows.map((row) => `<div class="media-preview-caption">${escHtml(row)}</div>`).join("")}
    </div>
  `;
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}

export function addProgressMessage(el, title, detail = "") {
  el.chatArea.querySelector(".empty-state")?.remove();
  const wrap = document.createElement("div");
  const progressId = `progress_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  wrap.className = "message system progress-row";
  wrap.dataset.progressId = progressId;
  wrap.innerHTML = `
    <div class="message-bubble upload-progress-card">
      <div class="upload-progress-head">
        <div class="media-preview-title">${escHtml(title)}</div>
        <div class="upload-progress-pct">0%</div>
      </div>
      ${detail ? `<div class="media-preview-caption">${escHtml(detail)}</div>` : ""}
      <div class="upload-progress-track"><div class="upload-progress-bar" style="width:0%"></div></div>
    </div>
  `;
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
  return progressId;
}

export function updateProgressMessage(el, progressId, pct, detail = "") {
  const wrap = el.chatArea.querySelector(`[data-progress-id="${progressId}"]`);
  if (!wrap) return;
  const safePct = Math.max(0, Math.min(100, Number(pct || 0)));
  const bar = wrap.querySelector(".upload-progress-bar");
  const label = wrap.querySelector(".upload-progress-pct");
  const caption = wrap.querySelector(".media-preview-caption");
  if (bar) bar.style.width = `${safePct}%`;
  if (label) label.textContent = `${safePct}%`;
  if (caption && detail) caption.textContent = detail;
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}

export function finishProgressMessage(el, progressId, detail = "") {
  updateProgressMessage(el, progressId, 100, detail);
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

export function updateSkillStrip(el, skillNames = []) {
  if (!el.skillStrip || !el.skillStripText || !el.skillStripBadge) return;
  const names = Array.isArray(skillNames) ? skillNames.filter(Boolean) : [];
  if (!names.length) {
    el.skillStrip.classList.add("hidden");
    el.skillStripText.textContent = "";
    return;
  }
  el.skillStrip.classList.remove("hidden");
  el.skillStripBadge.textContent = "Skills";
  el.skillStripText.textContent = names.slice(0, 4).join(" | ") + (names.length > 4 ? ` | +${names.length - 4}` : "");
}

export function updateProjectStrip(el, project = null) {
  if (!el.projectStrip || !el.projectStripText || !el.projectStripBadge) return;
  const title = String(project?.name || "").trim();
  if (!title) {
    el.projectStrip.classList.add("hidden");
    el.projectStripText.textContent = "";
    return;
  }
  const meta = [project?.code || "", project?.color ? `cor ${project.color}` : ""].filter(Boolean).join(" | ");
  el.projectStrip.classList.remove("hidden");
  el.projectStripBadge.textContent = "Projeto";
  el.projectStripText.textContent = meta ? `${title} | ${meta}` : title;
}

export function updateActiveAssetGroup(el, group) {
  if (!el.assetGroupStrip || !el.assetGroupText || !el.assetGroupMeta || !el.assetGroupBadge) return;
  if (!group) {
    el.assetGroupStrip.classList.add("hidden");
    el.assetGroupText.textContent = "";
    el.assetGroupMeta.textContent = "";
    return;
  }

  const assetCount = Array.isArray(group.assets) ? group.assets.length : Array.isArray(group.assetRefs) ? group.assetRefs.length : 0;
  const previewNames = Array.isArray(group.assets)
    ? group.assets.map((item) => item.fileName || item.id).slice(0, 3).join(" | ")
    : "";

  el.assetGroupBadge.textContent = "Pacote ativo";
  el.assetGroupText.textContent = group.summaryTitle || group.title || group.id || "Grupo visual";
  el.assetGroupMeta.textContent = [assetCount ? `${assetCount} arquivos` : "", previewNames].filter(Boolean).join(" | ");
  el.assetGroupStrip.classList.remove("hidden");
}

export function updateChatRuntime(el, runtime = null) {
  if (!el.runtimeStrip || !el.runtimeStripBadge || !el.runtimeStripText || !el.runtimeStripQueue) return;
  if (!runtime || (!runtime.phase && !runtime.queueCount)) {
    el.runtimeStrip.classList.add("hidden");
    el.runtimeStripBadge.textContent = "Pronto";
    el.runtimeStripBadge.className = "runtime-badge";
    el.runtimeStripText.textContent = "";
    el.runtimeStripQueue.textContent = "";
    return;
  }

  const phaseMap = {
    queued: { label: "Na fila", cls: "queued" },
    thinking: { label: "Pensando", cls: "thinking" },
    memory: { label: "Memoria", cls: "memory" },
    responding: { label: "Respondendo", cls: "responding" },
    ready: { label: "Pronto", cls: "ready" },
    error: { label: "Erro", cls: "error" },
  };
  const meta = phaseMap[runtime.phase] || phaseMap.ready;
  el.runtimeStrip.classList.remove("hidden");
  el.runtimeStripBadge.textContent = meta.label;
  el.runtimeStripBadge.className = `runtime-badge ${meta.cls}`;
  el.runtimeStripText.textContent = runtime.text || "";
  el.runtimeStripQueue.textContent = runtime.queueCount > 1 ? `${runtime.queueCount} mensagens` : runtime.queueCount === 1 ? "1 mensagem" : "";
}

export function updateWorkspaceStrip(el, workspaceTabs = [], activeTabId = "") {
  if (!el.workspaceStrip || !el.workspaceStripText || !el.workspaceStripMeta) return;
  const tabs = Array.isArray(workspaceTabs) ? workspaceTabs : [];
  if (!tabs.length) {
    el.workspaceStrip.classList.add("hidden");
    el.workspaceStripText.textContent = "";
    el.workspaceStripMeta.textContent = "";
    return;
  }
  const activeTab = tabs.find((tab) => String(tab.id) === String(activeTabId)) || tabs.find((tab) => tab.active) || tabs[0];
  const origins = tabs.map((tab) => tab.origin).filter(Boolean);
  const uniqueOrigins = origins.filter((origin, index) => origins.indexOf(origin) === index);
  el.workspaceStripText.textContent = activeTab?.title || activeTab?.url || `Workspace com ${tabs.length} abas`;
  el.workspaceStripMeta.textContent = [`${tabs.length} abas`, uniqueOrigins.length ? `${uniqueOrigins.length} origens` : "", activeTab?.id ? `ativa ${activeTab.id}` : ""].filter(Boolean).join(" | ");
  el.workspaceStrip.classList.remove("hidden");
}
