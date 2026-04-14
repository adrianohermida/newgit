/**
 * Universal LLM Assistant — Panel JS v9.1
 * Providers reais: AetherLab Local (ai-core), LLM Customizado (cloud), Cloudflare Workers AI
 * Features: seletor LLM com status real, configurações persistentes, sessões, upload,
 *           screenshot, gravação de navegação, replay de automações.
 */

const BRIDGE_URL = "http://127.0.0.1:32123";
const DEFAULT_SESSION_ID = () => `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const PROVIDER_META = {
  local:      { label: "AetherLab Local",     color: "#16a34a", defaultModel: "aetherlab-legal-local-v1" },
  cloud:      { label: "LLM Customizado",      color: "#7c3aed", defaultModel: "aetherlab-legal-v1" },
  cloudflare: { label: "Cloudflare Workers AI", color: "#f97316", defaultModel: "@cf/meta/llama-3.1-8b-instruct" },
};

// ─── Estado global ────────────────────────────────────────────────────────────
const state = {
  provider:    "local",
  sessionId:   DEFAULT_SESSION_ID(),
  isLoading:   false,
  isRecording: false,
  activeTab:   "chat",   // chat | sessions | automations | settings
  messages:    [],
  bridgeOk:    false,
  providerStatus: { local: null, cloud: null, cloudflare: null }, // null | "ok" | "error"

  settings: {
    runtimeUrl:    "http://127.0.0.1:8010",
    runtimeModel:  "aetherlab-legal-local-v1",
    appUrl:        "http://localhost:3000",
    cloudModel:    "aetherlab-legal-v1",
    cfModel:       "@cf/meta/llama-3.1-8b-instruct",
    autoSaveSessions: true,
  },
};

// ─── DOM refs (preenchido em DOMContentLoaded) ───────────────────────────────
const $ = id => document.getElementById(id);
let el = {};

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  el = {
    chatArea:       $("chat-area"),
    msgInput:       $("msg-input"),
    btnSend:        $("btn-send"),
    providerSelect: $("provider-select"),
    providerBadge:  $("provider-badge"),
    statusDot:      $("status-dot"),
    btnSettings:    $("btn-settings"),

    // Abas
    tabChat:        $("tab-chat"),
    tabSessions:    $("tab-sessions"),
    tabAutomations: $("tab-automations"),
    tabSettings:    $("tab-settings"),
    paneChat:       $("pane-chat"),
    paneSessions:   $("pane-sessions"),
    paneAutomations:$("pane-automations"),
    paneSettings:   $("pane-settings"),

    // Ações rápidas
    btnPageText:    $("btn-page-text"),
    btnSelection:   $("btn-selection"),
    btnScreenshot:  $("btn-screenshot"),
    btnUpload:      $("btn-upload"),
    fileInput:      $("file-input"),

    // Recorder
    btnRecord:      $("btn-record"),
    btnReplay:      $("btn-replay"),
    recorderStatus: $("recorder-status"),

    // Settings
    inputRuntimeUrl:   $("input-runtime-url"),
    inputRuntimeModel: $("input-runtime-model"),
    inputAppUrl:       $("input-app-url"),
    inputCloudModel:   $("input-cloud-model"),
    inputCfModel:      $("input-cf-model"),
    btnSaveSettings:   $("btn-save-settings"),
    btnTestLocal:      $("btn-test-local"),
    btnTestCloud:      $("btn-test-cloud"),
    btnTestCf:         $("btn-test-cf"),
    testLocalResult:   $("test-local-result"),
    testCloudResult:   $("test-cloud-result"),
    testCfResult:      $("test-cf-result"),

    // Lists
    sessionsList:    $("sessions-list"),
    automationsList: $("automations-list"),
  };

  await loadSettings();
  await checkBridge();
  bindEvents();

  // Refresh periódico do health
  setInterval(checkBridge, 20000);
});

// ─── Health check ─────────────────────────────────────────────────────────────
async function checkBridge() {
  try {
    const res  = await safeFetch(`${BRIDGE_URL}/health`, {}, 3000);
    const data = await res.json();
    state.bridgeOk = data.ok === true;
    updateStatusDot(state.bridgeOk ? "online" : "degraded");
    // Atualiza status visual dos providers
    updateProviderBadge();
  } catch {
    state.bridgeOk = false;
    updateStatusDot("offline");
  }
}

function updateStatusDot(status) {
  if (!el.statusDot) return;
  el.statusDot.className = "status-dot " + status;
  el.statusDot.title = { online: "Bridge ativo", degraded: "Bridge parcial", offline: "Bridge offline" }[status] || "";
}

// ─── Testar provider individualmente ─────────────────────────────────────────
async function testProvider(provider, resultEl) {
  if (!resultEl) return;
  resultEl.textContent = "Testando...";
  resultEl.style.color = "#6b7280";
  try {
    const res = await safeFetch(`${BRIDGE_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        messages: [{ role: "user", content: "Responda com uma única palavra: OK" }],
        model: getModelForProvider(provider),
      }),
    }, 15000);
    const data = await res.json();
    if (data.ok) {
      resultEl.textContent = `✓ OK  (${data.model || ""})`;
      resultEl.style.color = "#16a34a";
      state.providerStatus[provider] = "ok";
    } else {
      resultEl.textContent = `✗ ${data.error || "Falha"}`;
      resultEl.style.color = "#dc2626";
      state.providerStatus[provider] = "error";
    }
  } catch (err) {
    resultEl.textContent = `✗ ${err.message}`;
    resultEl.style.color = "#dc2626";
    state.providerStatus[provider] = "error";
  }
}

function getModelForProvider(provider) {
  if (provider === "local")      return state.settings.runtimeModel;
  if (provider === "cloud")      return state.settings.cloudModel;
  if (provider === "cloudflare") return state.settings.cfModel;
  return "";
}

// ─── Bind events ──────────────────────────────────────────────────────────────
function bindEvents() {
  // Enviar mensagem
  el.btnSend?.addEventListener("click", sendMessage);
  el.msgInput?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  el.msgInput?.addEventListener("input", () => {
    el.msgInput.style.height = "auto";
    el.msgInput.style.height = Math.min(el.msgInput.scrollHeight, 100) + "px";
  });

  // Provider select
  el.providerSelect?.addEventListener("change", () => {
    state.provider = el.providerSelect.value;
    updateProviderBadge();
    saveSettings();
  });

  // Abas
  el.tabChat?.addEventListener("click",        () => switchTab("chat"));
  el.tabSessions?.addEventListener("click",    () => { switchTab("sessions"); loadSessions(); });
  el.tabAutomations?.addEventListener("click", () => { switchTab("automations"); loadAutomations(); });
  el.tabSettings?.addEventListener("click",    () => switchTab("settings"));

  // Ações
  el.btnPageText?.addEventListener("click",   injectPageText);
  el.btnSelection?.addEventListener("click",  injectSelection);
  el.btnScreenshot?.addEventListener("click", takeScreenshot);
  el.btnUpload?.addEventListener("click",     () => el.fileInput?.click());
  el.fileInput?.addEventListener("change",    onFileSelected);

  // Recorder
  el.btnRecord?.addEventListener("click",  toggleRecording);
  el.btnReplay?.addEventListener("click",  showAutomationsForReplay);

  // Settings
  el.btnSaveSettings?.addEventListener("click", saveSettings);
  el.btnSettings?.addEventListener("click",     () => switchTab("settings"));
  el.btnTestLocal?.addEventListener("click",    () => testProvider("local",      el.testLocalResult));
  el.btnTestCloud?.addEventListener("click",    () => testProvider("cloud",      el.testCloudResult));
  el.btnTestCf?.addEventListener("click",       () => testProvider("cloudflare", el.testCfResult));
}

// ─── Provider badge ───────────────────────────────────────────────────────────
function updateProviderBadge() {
  const meta = PROVIDER_META[state.provider] || { label: state.provider, color: "#6b7280" };
  if (el.providerBadge) {
    el.providerBadge.textContent = meta.label;
    el.providerBadge.style.color = meta.color;
    el.providerBadge.title = `Provider ativo: ${meta.label}`;
  }
  if (el.providerSelect) el.providerSelect.value = state.provider;
}

// ─── Abas ─────────────────────────────────────────────────────────────────────
function switchTab(tab) {
  state.activeTab = tab;
  ["chat", "sessions", "automations", "settings"].forEach(t => {
    const btn  = el[`tab${t.charAt(0).toUpperCase() + t.slice(1)}`];
    const pane = el[`pane${t.charAt(0).toUpperCase() + t.slice(1)}`];
    if (btn)  btn.classList.toggle("active", t === tab);
    if (pane) pane.style.display = t === tab ? "flex" : "none";
  });
}

// ─── Enviar mensagem ──────────────────────────────────────────────────────────
async function sendMessage() {
  const text = el.msgInput?.value.trim();
  if (!text || state.isLoading) return;

  addMsg("user", text);
  el.msgInput.value = "";
  el.msgInput.style.height = "auto";
  setLoading(true);

  state.messages.push({ role: "user", content: text });

  try {
    const data = await callBridge({ provider: state.provider, messages: state.messages });
    const reply = data.content || "(sem resposta)";
    state.messages.push({ role: "assistant", content: reply });
    addMsg("assistant", reply);

    // Auto-salva sessão
    if (state.settings.autoSaveSessions) await syncSession();
  } catch (err) {
    addMsg("error", `Erro (${state.provider}): ${err.message}`);
    if (!state.bridgeOk) {
      addSystemMsg("Bridge offline — inicie: npm run start:universal-llm-extension");
    }
  } finally {
    setLoading(false);
  }
}

async function callBridge(opts) {
  if (!state.bridgeOk) throw new Error("Bridge local offline (porta 32123).");
  const res = await safeFetch(`${BRIDGE_URL}/chat`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ ...opts, model: getModelForProvider(opts.provider) }),
  }, 60000);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Resposta inválida do bridge.");
  return data;
}

// ─── Sincroniza sessão com bridge → ai-core /memory ──────────────────────────
async function syncSession() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await safeFetch(`${BRIDGE_URL}/sessions`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        sessionId: state.sessionId,
        messages:  state.messages,
        provider:  state.provider,
        model:     getModelForProvider(state.provider),
        metadata:  { tabUrl: tab?.url, tabTitle: tab?.title, savedAt: new Date().toISOString() },
      }),
    }, 10000);
  } catch { /* silencioso — sincronização é best-effort */ }
}

// ─── Screenshot ───────────────────────────────────────────────────────────────
async function takeScreenshot() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });

    // Salva no bridge
    await safeFetch(`${BRIDGE_URL}/screenshot`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        dataUrl,
        sessionId: state.sessionId,
        tabUrl:    tab?.url,
        tabTitle:  tab?.title,
      }),
    }, 10000);

    // Injeta descrição no chat
    el.msgInput.value = `[Screenshot capturado de: ${tab?.title || tab?.url}]\n\nDescreva ou analise o que está visível na tela:`;
    el.msgInput.focus();
    // Injeta a imagem como contexto na próxima mensagem
    addSystemMsg(`Screenshot salvo. Descreva ou faça perguntas sobre a tela atual.`);

    // Armazena dataUrl temporariamente para incluir no próximo envio
    state._pendingScreenshot = dataUrl;
  } catch (err) {
    addSystemMsg(`Erro ao capturar screenshot: ${err.message}`);
  }
}

// ─── Upload de arquivo ────────────────────────────────────────────────────────
async function onFileSelected(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  e.target.value = "";

  const reader = new FileReader();
  reader.onload = async (ev) => {
    try {
      const dataUrl = ev.target.result;
      const res = await safeFetch(`${BRIDGE_URL}/upload`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          dataUrl,
          fileName:  file.name,
          mimeType:  file.type,
          sessionId: state.sessionId,
        }),
      }, 15000);
      const data = await res.json();

      if (data.textContent) {
        el.msgInput.value = `[Arquivo: ${file.name}]\n${data.textContent.substring(0, 1500)}\n\nAnalise o conteúdo acima:`;
        addSystemMsg(`Arquivo "${file.name}" carregado e pronto para análise.`);
      } else {
        el.msgInput.value = `[Arquivo enviado: ${file.name}]\n\nAnalise este arquivo:`;
        addSystemMsg(`Arquivo "${file.name}" enviado (tipo: ${file.type}).`);
      }
      el.msgInput.focus();
    } catch (err) {
      addSystemMsg(`Erro ao enviar arquivo: ${err.message}`);
    }
  };
  reader.readAsDataURL(file);
}

// ─── Injetar contexto de página / seleção ─────────────────────────────────────
async function injectPageText() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return addSystemMsg("Nenhuma aba ativa.");
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ title: document.title, url: location.href, text: (document.body?.innerText || "").substring(0, 5000) }),
    });
    const { title, text } = result?.result || {};
    if (!text) return addSystemMsg("Sem conteúdo na página.");
    el.msgInput.value = `[Página: ${title}]\n${text.substring(0, 1200)}\n\nPergunta sobre esta página: `;
    el.msgInput.focus();
    addSystemMsg(`Contexto de "${title}" injetado.`);
  } catch (err) { addSystemMsg(`Erro: ${err.message}`); }
}

async function injectSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return addSystemMsg("Nenhuma aba ativa.");
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || "",
    });
    const text = (result?.result || "").trim();
    if (!text) return addSystemMsg("Nenhum texto selecionado.");
    el.msgInput.value = `"${text.substring(0, 1000)}"\n\nExplique o trecho selecionado:`;
    el.msgInput.focus();
    addSystemMsg("Seleção injetada.");
  } catch (err) { addSystemMsg(`Erro: ${err.message}`); }
}

// ─── Recorder ─────────────────────────────────────────────────────────────────
async function toggleRecording() {
  if (!state.isRecording) {
    state.isRecording       = true;
    state.currentAutomation = `auto_${Date.now()}`;
    if (el.btnRecord)      { el.btnRecord.textContent = "⏹ Parar"; el.btnRecord.classList.add("recording"); }
    if (el.recorderStatus) el.recorderStatus.textContent = "Gravando...";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "START_RECORDING", automationId: state.currentAutomation }).catch(() => {});
    }
    addSystemMsg(`Gravação iniciada — ID: ${state.currentAutomation}`);
  } else {
    state.isRecording = false;
    if (el.btnRecord)      { el.btnRecord.textContent = "⏺ Gravar"; el.btnRecord.classList.remove("recording"); }
    if (el.recorderStatus) el.recorderStatus.textContent = "Parado";

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "STOP_RECORDING" }).catch(() => {});
    }
    addSystemMsg(`Gravação salva — ID: ${state.currentAutomation}`);
    state.currentAutomation = null;
  }
}

async function showAutomationsForReplay() {
  switchTab("automations");
  await loadAutomations();
}

async function replayAutomation(automationId) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await safeFetch(`${BRIDGE_URL}/play/${automationId}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ tabId: String(tab?.id || "default") }),
    }, 5000);

    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "START_REPLAY", tabId: String(tab.id) }).catch(() => {});
    }
    addSystemMsg(`Replay iniciado para automação ${automationId}.`);
    switchTab("chat");
  } catch (err) {
    addSystemMsg(`Erro ao iniciar replay: ${err.message}`);
  }
}

// ─── Lista de sessões ─────────────────────────────────────────────────────────
async function loadSessions() {
  if (!el.sessionsList) return;
  el.sessionsList.innerHTML = '<p style="color:#6b7280;font-size:12px;padding:8px">Carregando...</p>';
  try {
    const res  = await safeFetch(`${BRIDGE_URL}/sessions`, {}, 5000);
    const data = await res.json();
    const sessions = data.sessions || [];
    if (!sessions.length) { el.sessionsList.innerHTML = '<p style="color:#6b7280;font-size:12px;padding:8px">Nenhuma sessão salva.</p>'; return; }
    el.sessionsList.innerHTML = sessions.map(s => `
      <div class="list-item" data-id="${s.id}">
        <div class="list-item-title">${escHtml(s.metadata?.tabTitle || s.id)}</div>
        <div class="list-item-meta">${s.messageCount} msgs · ${s.provider} · ${formatDate(s.updatedAt)}</div>
        <div class="list-item-actions">
          <button class="btn-list-action" onclick="loadSessionChat('${s.id}')">Retomar</button>
          <button class="btn-list-action danger" onclick="deleteSession('${s.id}', this)">Apagar</button>
        </div>
      </div>`).join("");
  } catch { el.sessionsList.innerHTML = '<p style="color:#dc2626;font-size:12px;padding:8px">Bridge offline.</p>'; }
}

window.loadSessionChat = async function(id) {
  try {
    const res  = await safeFetch(`${BRIDGE_URL}/sessions/${id}`, {}, 5000);
    const data = await res.json();
    if (!data.session) return;
    state.sessionId = id;
    state.messages  = data.session.messages || [];
    state.provider  = data.session.provider || state.provider;
    el.chatArea.innerHTML = "";
    state.messages.forEach(m => addMsg(m.role, m.content));
    updateProviderBadge();
    switchTab("chat");
    addSystemMsg(`Sessão "${id}" retomada.`);
  } catch (err) { addSystemMsg(`Erro: ${err.message}`); }
};

window.deleteSession = async function(id, btn) {
  try {
    await safeFetch(`${BRIDGE_URL}/sessions/${id}`, { method: "DELETE" }, 5000);
    btn.closest(".list-item")?.remove();
  } catch (err) { addSystemMsg(`Erro: ${err.message}`); }
};

// ─── Lista de automações ──────────────────────────────────────────────────────
async function loadAutomations() {
  if (!el.automationsList) return;
  el.automationsList.innerHTML = '<p style="color:#6b7280;font-size:12px;padding:8px">Carregando...</p>';
  try {
    const res  = await safeFetch(`${BRIDGE_URL}/automations`, {}, 5000);
    const data = await res.json();
    const autos = data.automations || [];
    if (!autos.length) { el.automationsList.innerHTML = '<p style="color:#6b7280;font-size:12px;padding:8px">Nenhuma automação gravada.</p>'; return; }
    el.automationsList.innerHTML = autos.map(a => `
      <div class="list-item" data-id="${a.id}">
        <div class="list-item-title">${escHtml(a.title || a.id)}</div>
        <div class="list-item-meta">${a.stepCount} passos · ${formatDate(a.createdAt)}</div>
        <div class="list-item-actions">
          <button class="btn-list-action" onclick="doReplay('${a.id}')">▶ Reproduzir</button>
          <button class="btn-list-action danger" onclick="deleteAuto('${a.id}', this)">Apagar</button>
        </div>
      </div>`).join("");
  } catch { el.automationsList.innerHTML = '<p style="color:#dc2626;font-size:12px;padding:8px">Bridge offline.</p>'; }
}

window.doReplay    = (id) => replayAutomation(id);
window.deleteAuto  = async function(id, btn) {
  try {
    await safeFetch(`${BRIDGE_URL}/automations/${id}`, { method: "DELETE" }, 5000);
    btn.closest(".list-item")?.remove();
  } catch {}
};

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  return new Promise(resolve => {
    chrome.storage.local.get(["llm_settings", "llm_provider"], r => {
      if (r.llm_settings) state.settings = { ...state.settings, ...r.llm_settings };
      if (r.llm_provider) state.provider  = r.llm_provider;

      // Preencher inputs
      if (el.inputRuntimeUrl)   el.inputRuntimeUrl.value   = state.settings.runtimeUrl;
      if (el.inputRuntimeModel) el.inputRuntimeModel.value  = state.settings.runtimeModel;
      if (el.inputAppUrl)       el.inputAppUrl.value        = state.settings.appUrl;
      if (el.inputCloudModel)   el.inputCloudModel.value    = state.settings.cloudModel;
      if (el.inputCfModel)      el.inputCfModel.value       = state.settings.cfModel;

      updateProviderBadge();
      resolve();
    });
  });
}

async function saveSettings() {
  state.provider = el.providerSelect?.value || state.provider;
  state.settings = {
    ...state.settings,
    runtimeUrl:   el.inputRuntimeUrl?.value.trim()   || state.settings.runtimeUrl,
    runtimeModel: el.inputRuntimeModel?.value.trim() || state.settings.runtimeModel,
    appUrl:       el.inputAppUrl?.value.trim()        || state.settings.appUrl,
    cloudModel:   el.inputCloudModel?.value.trim()    || state.settings.cloudModel,
    cfModel:      el.inputCfModel?.value.trim()       || state.settings.cfModel,
  };

  await new Promise(resolve => {
    chrome.storage.local.set({ llm_settings: state.settings, llm_provider: state.provider }, resolve);
  });

  updateProviderBadge();
  addSystemMsg("Configurações salvas.");
  await checkBridge();
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
function addMsg(role, content) {
  if (!el.chatArea) return;
  el.chatArea.querySelector(".empty-state")?.remove();

  const wrap   = document.createElement("div");
  wrap.className = `message ${role}`;
  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (role === "assistant") bubble.innerHTML = renderMarkdown(content);
  else                      bubble.textContent = content;

  wrap.appendChild(bubble);
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}

function addSystemMsg(text) {
  if (!el.chatArea) return;
  const wrap = document.createElement("div");
  wrap.className = "message system";
  wrap.innerHTML = `<div class="message-bubble">${escHtml(text)}</div>`;
  el.chatArea.appendChild(wrap);
  el.chatArea.scrollTop = el.chatArea.scrollHeight;
}

function setLoading(on) {
  state.isLoading = on;
  if (el.btnSend) { el.btnSend.disabled = on; el.btnSend.textContent = on ? "..." : "Enviar"; }
  document.getElementById("typing-indicator")?.remove();
  if (on) {
    const wrap = document.createElement("div");
    wrap.id = "typing-indicator";
    wrap.className = "message assistant";
    wrap.innerHTML = '<div class="message-bubble typing"><span></span><span></span><span></span></div>';
    el.chatArea?.appendChild(wrap);
    el.chatArea.scrollTop = el.chatArea.scrollHeight;
  }
}

function escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderMarkdown(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

function formatDate(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

async function safeFetch(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally { clearTimeout(timer); }
}

console.log("[LLM Assistant] panel.js v9.1 carregado");
