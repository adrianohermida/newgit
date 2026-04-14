const EXTENSION_SOURCE = "universal-llm-assistant-extension";
const FRONTEND_SOURCE = "dotobot-frontend";

function buildResponse(type, extra = {}) {
  return {
    source: EXTENSION_SOURCE,
    type,
    pageUrl: location.href,
    pageTitle: document.title,
    timestamp: Date.now(),
    ...extra,
  };
}

function emitBridgeEvent(payload) {
  window.postMessage(payload, "*");
  window.dispatchEvent(new CustomEvent("DOTOBOT_EXTENSION_EVENT", { detail: payload }));
  document.dispatchEvent(new CustomEvent("DOTOBOT_EXTENSION_EVENT", { detail: payload }));
  window.dispatchEvent(new CustomEvent("UNIVERSAL_LLM_EXTENSION_EVENT", { detail: payload }));
  document.dispatchEvent(new CustomEvent("UNIVERSAL_LLM_EXTENSION_EVENT", { detail: payload }));
}

function sendReady(reason = "content_script_loaded") {
  emitBridgeEvent(buildResponse("EXTENSION_READY", { ok: true, reason }));
}

async function executeBridgeCommand(command, payload = {}) {
  const content = window.LLMAssistantContent;
  if (!content) return { ok: false, error: "content_not_ready", reason: "content/shared.js ainda nao foi carregado." };
  if (command === "health_check" || command === "ping") {
    return {
      ok: true,
      status: "ready",
      recording: !!content.recordingState.active,
      capabilities: ["health_check", "get_page_text", "get_page_meta", "get_page_scan", "get_selected_text", "start_recording", "stop_recording"],
    };
  }
  if (command === "get_page_text") {
    return { ok: true, text: (document.body?.innerText || "").substring(0, 8000) };
  }
  if (command === "get_page_meta") {
    return {
      ok: true,
      title: document.title || "",
      url: location.href || "",
      description: document.querySelector('meta[name="description"]')?.content || "",
      headings: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 10).map((el) => el.innerText.trim()).filter(Boolean),
    };
  }
  if (command === "get_page_scan" || command === "scan_page") {
    return { ok: true, scan: content.collectPageScan() };
  }
  if (command === "get_selected_text") {
    return { ok: true, text: window.getSelection()?.toString() || "" };
  }
  if (command === "start_recording") {
    content.startRecording(payload.automationId || `auto_${Date.now()}`);
    return { ok: true, recording: true, automationId: content.recordingState.automationId };
  }
  if (command === "stop_recording") {
    const automationId = content.recordingState.automationId;
    content.stopRecording();
    return { ok: true, recording: false, automationId };
  }
  if (command === "start_replay") {
    content.startReplayPolling(String(payload.tabId || ""));
    return { ok: true, replayPolling: true };
  }
  if (command === "stop_replay") {
    content.stopReplayPolling();
    return { ok: true, replayPolling: false };
  }
  return { ok: false, error: `Comando nao suportado: ${command}` };
}

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  const content = window.LLMAssistantContent;
  if (!content) return void sendResponse({ ok: false, error: "content_not_ready" });
  if (request.type === "GET_PAGE_TEXT") return void sendResponse({ ok: true, text: (document.body?.innerText || "").substring(0, 8000) });
  if (request.type === "GET_PAGE_META") return void sendResponse({ ok: true, title: document.title || "", url: location.href || "", description: document.querySelector('meta[name="description"]')?.content || "", headings: Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 10).map((el) => el.innerText.trim()).filter(Boolean) });
  if (request.type === "GET_PAGE_SCAN") return void sendResponse({ ok: true, scan: content.collectPageScan() });
  if (request.type === "GET_SELECTED_TEXT") return void sendResponse({ ok: true, text: window.getSelection()?.toString() || "" });
  if (request.type === "START_RECORDING") return void (content.startRecording(request.automationId), sendResponse({ ok: true }));
  if (request.type === "STOP_RECORDING") return void (content.stopRecording(), sendResponse({ ok: true }));
  if (request.type === "START_REPLAY") return void (content.startReplayPolling(request.tabId), sendResponse({ ok: true }));
  if (request.type === "STOP_REPLAY") return void (content.stopReplayPolling(), sendResponse({ ok: true }));
  if (request.type === "PING") return void sendResponse({ ok: true, recording: content.recordingState.active });
  return true;
});

window.addEventListener("message", async (event) => {
  if (event.source !== window || !event.data || event.data.source !== FRONTEND_SOURCE) return;
  const type = String(event.data.type || "");
  if (type === "DOTOBOT_EXTENSION_PING") {
    sendReady("ping");
    return;
  }
  if (type !== "DOTOBOT_COMMAND") return;

  const requestId = event.data.requestId || `req_${Date.now()}`;
  const command = String(event.data.command || "").trim().toLowerCase();
  try {
    const result = await executeBridgeCommand(command, event.data.payload || {});
    emitBridgeEvent(buildResponse("EXTENSION_RESPONSE", { requestId, command, ...result }));
  } catch (error) {
    emitBridgeEvent(buildResponse("EXTENSION_RESPONSE", {
      requestId,
      command,
      ok: false,
      error: String(error?.message || error || "Falha ao processar comando."),
    }));
  }
});

sendReady();
setTimeout(() => sendReady("delayed_handshake"), 600);
