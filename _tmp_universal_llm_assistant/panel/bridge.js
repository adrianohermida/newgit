import { BRIDGE_URL, state } from "./state.js";
import { parseJsonResponse, safeFetch } from "./utils.js";
import { pushBridgeSettings } from "./settings.js";

export async function checkBridge(el, updateStatusDot) {
  try {
    const data = await parseJsonResponse(await safeFetch(`${BRIDGE_URL}/health`, {}, 3000));
    state.bridgeOk = data.ok === true;
    updateStatusDot(el, state.bridgeOk ? "online" : "degraded");
    return data;
  } catch {
    state.bridgeOk = false;
    updateStatusDot(el, "offline");
    return null;
  }
}

export async function testProvider(provider, resultEl) {
  resultEl.textContent = "Testando...";
  resultEl.style.color = "#6b7280";
  try {
    await pushBridgeSettings();
    const data = await parseJsonResponse(await safeFetch(`${BRIDGE_URL}/diagnostics/provider/${encodeURIComponent(provider)}`, {}, 15000));
    if (data.ok) {
      resultEl.textContent = `OK (${data.model || ""})${data.activeUrl ? ` -> ${data.activeUrl}` : ""}`;
      resultEl.style.color = "#16a34a";
      return;
    }
    const attempt = Array.isArray(data.attempts) ? data.attempts.find((item) => item && !item.ok) : null;
    resultEl.textContent = `Falha: ${attempt?.rawSnippet || attempt?.error || data.message || "Sem detalhes"}`;
    resultEl.style.color = "#dc2626";
  } catch (error) {
    resultEl.textContent = `Falha: ${error.message}`;
    resultEl.style.color = "#dc2626";
  }
}

export async function callChat(provider, messages) {
  if (!state.bridgeOk) throw new Error("Bridge local offline (porta 32123).");
  await pushBridgeSettings();
  const response = await safeFetch(`${BRIDGE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, model: getModelForProvider(provider), messages }),
  }, 60000);
  const data = await parseJsonResponse(response);
  if (!data.ok) throw new Error(data.error || "Resposta invalida do bridge.");
  return data;
}

export async function runTask(sessionId, query) {
  await pushBridgeSettings();
  const data = await parseJsonResponse(await safeFetch(`${BRIDGE_URL}/tasks/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, query }),
  }, 60000));
  if (!data.ok) throw new Error(data.error || "Falha ao executar AI-Task.");
  return data;
}

export async function fetchJson(path, opts = {}, timeout = 5000) {
  return parseJsonResponse(await safeFetch(`${BRIDGE_URL}${path}`, opts, timeout));
}

export function getModelForProvider(provider) {
  if (provider === "local") return state.settings.runtimeModel;
  if (provider === "cloud") return state.settings.cloudModel;
  return state.settings.cfModel;
}
