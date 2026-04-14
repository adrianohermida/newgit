/**
 * Content Script — Universal LLM Assistant v9
 * Executa no contexto da página.
 * Responsabilidades:
 *  1. Responder mensagens do panel (texto, meta, seleção)
 *  2. Modo de gravação: captura cliques, inputs, navegação e POST → bridge
 *  3. Modo de replay: polling bridge /commands e executa cada passo
 */

const BRIDGE_URL    = "http://127.0.0.1:32123";
const POLL_INTERVAL = 2000; // ms — intervalo de polling para replay

let recordingState = { active: false, automationId: null };
let replayPollTimer = null;

// ─── Mensagens do panel ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  switch (request.type) {
    case "GET_PAGE_TEXT":
      sendResponse({ ok: true, text: (document.body?.innerText || "").substring(0, 8000) });
      return true;

    case "GET_PAGE_META":
      sendResponse({
        ok: true,
        title:       document.title || "",
        url:         location.href  || "",
        description: document.querySelector('meta[name="description"]')?.content || "",
        headings:    Array.from(document.querySelectorAll("h1,h2,h3"))
          .slice(0, 10).map(el => el.innerText.trim()).filter(Boolean),
      });
      return true;

    case "GET_SELECTED_TEXT":
      sendResponse({ ok: true, text: window.getSelection()?.toString() || "" });
      return true;

    case "START_RECORDING":
      startRecording(request.automationId);
      sendResponse({ ok: true });
      return true;

    case "STOP_RECORDING":
      stopRecording();
      sendResponse({ ok: true });
      return true;

    case "START_REPLAY":
      startReplayPolling(request.tabId);
      sendResponse({ ok: true });
      return true;

    case "STOP_REPLAY":
      stopReplayPolling();
      sendResponse({ ok: true });
      return true;

    case "PING":
      sendResponse({ ok: true, recording: recordingState.active });
      return true;
  }
});

// ─── GRAVADOR ─────────────────────────────────────────────────────────────────
function startRecording(automationId) {
  recordingState = { active: true, automationId };
  document.addEventListener("click",   onRecordClick,   { capture: true });
  document.addEventListener("input",   onRecordInput,   { capture: true });
  document.addEventListener("submit",  onRecordSubmit,  { capture: true });
  document.addEventListener("keydown", onRecordKey,     { capture: true });
  window.addEventListener("beforeunload", onRecordNav,  { capture: true });

  // Grava passo de navegação inicial
  postStep({ type: "navigate", url: location.href, title: document.title });
}

function stopRecording() {
  recordingState = { active: false, automationId: null };
  document.removeEventListener("click",   onRecordClick,   { capture: true });
  document.removeEventListener("input",   onRecordInput,   { capture: true });
  document.removeEventListener("submit",  onRecordSubmit,  { capture: true });
  document.removeEventListener("keydown", onRecordKey,     { capture: true });
  window.removeEventListener("beforeunload", onRecordNav,  { capture: true });
}

function buildSelector(el) {
  if (!el || el === document.body) return "body";
  if (el.id) return `#${CSS.escape(el.id)}`;
  const tag = el.tagName.toLowerCase();
  const cls = el.className && typeof el.className === "string"
    ? "." + el.className.trim().split(/\s+/).slice(0, 2).map(c => CSS.escape(c)).join(".")
    : "";
  const label = el.getAttribute("aria-label") || el.getAttribute("name") || el.getAttribute("placeholder");
  if (label) return `${tag}[aria-label="${label}"], ${tag}[name="${label}"], ${tag}[placeholder="${label}"]`;
  return `${tag}${cls}`;
}

function postStep(step) {
  if (!recordingState.active || !recordingState.automationId) return;
  fetch(`${BRIDGE_URL}/record`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      automationId: recordingState.automationId,
      tabUrl:   location.href,
      tabTitle: document.title,
      step,
    }),
  }).catch(() => {});
}

function onRecordClick(e) {
  const el = e.target;
  if (!el || el.tagName === "HTML") return;
  postStep({
    type:     "click",
    selector: buildSelector(el),
    text:     (el.innerText || el.value || "").substring(0, 80),
    tagName:  el.tagName,
    href:     el.href || null,
  });
}

function onRecordInput(e) {
  const el = e.target;
  if (!el || !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return;
  if (el.type === "password") return; // nunca grava senhas
  postStep({
    type:     "input",
    selector: buildSelector(el),
    value:    String(el.value || "").substring(0, 200),
    inputType: el.type || "text",
  });
}

function onRecordSubmit(e) {
  const form = e.target;
  postStep({ type: "submit", selector: buildSelector(form), action: form.action || location.href });
}

function onRecordKey(e) {
  if (!["Enter", "Tab", "Escape"].includes(e.key)) return;
  postStep({ type: "key", key: e.key, selector: buildSelector(e.target) });
}

function onRecordNav() {
  postStep({ type: "navigate", url: location.href, title: document.title });
}

// ─── REPLAY ───────────────────────────────────────────────────────────────────
function startReplayPolling(tabId) {
  stopReplayPolling();
  const id = tabId || "default";
  replayPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/commands?tabId=${encodeURIComponent(id)}`);
      const data = await res.json();
      for (const cmd of data.commands || []) {
        if (cmd.type === "REPLAY_STEP") await executeStep(cmd.payload);
      }
    } catch {}
  }, POLL_INTERVAL);
}

function stopReplayPolling() {
  if (replayPollTimer) { clearInterval(replayPollTimer); replayPollTimer = null; }
}

async function executeStep(step) {
  await sleep(300); // pequena pausa entre passos
  switch (step.type) {
    case "navigate":
      if (step.url && step.url !== location.href) location.href = step.url;
      break;

    case "click": {
      const el = document.querySelector(step.selector);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); await sleep(200); el.click(); }
      break;
    }

    case "input": {
      const el = document.querySelector(step.selector);
      if (el) {
        el.focus();
        el.value = step.value || "";
        el.dispatchEvent(new Event("input",  { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      break;
    }

    case "submit": {
      const form = document.querySelector(step.selector);
      if (form) form.submit();
      break;
    }

    case "key": {
      const el = step.selector ? document.querySelector(step.selector) : document.activeElement;
      if (el) el.dispatchEvent(new KeyboardEvent("keydown", { key: step.key, bubbles: true }));
      break;
    }

    case "scroll":
      window.scrollTo({ top: step.y || 0, left: step.x || 0, behavior: "smooth" });
      break;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
