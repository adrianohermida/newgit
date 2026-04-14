import { BRIDGE_URL, state } from "./state.js";
import { parseJsonResponse, safeFetch } from "./utils.js";
import { pushBridgeSettings } from "./settings.js";
import { pushErrorLog } from "./error-log.js";

export async function checkBridge(el, updateStatusDot) {
  try {
    const data = await parseJsonResponse(await safeFetch(`${BRIDGE_URL}/health`, {}, 3000));
    state.bridgeOk = data.ok === true;
    updateStatusDot(el, state.bridgeOk ? "online" : "degraded");
    return data;
  } catch (error) {
    state.bridgeOk = false;
    updateStatusDot(el, "offline");
    pushErrorLog({
      scope: "bridge.health",
      title: "Bridge local indisponivel",
      expected: "Ler JSON de /health em http://127.0.0.1:32123",
      actual: error?.message || "Falha ao consultar /health",
      trace: "panel/bridge.js -> checkBridge()",
      recommendation: "Confirme se o bridge da extensao esta ativo na porta 32123.",
    });
    return null;
  }
}

export async function testProvider(provider, resultEl) {
  const detailEl = getDetailElement(provider);
  resultEl.textContent = "Testando...";
  resultEl.style.color = "#6b7280";
  if (detailEl) detailEl.textContent = "";
  try {
    await pushBridgeSettings();
    const data = await parseJsonResponse(await safeFetch(`${BRIDGE_URL}/diagnostics/provider/${encodeURIComponent(provider)}`, {}, 15000));
    if (data.ok) {
      resultEl.textContent = `OK (${data.model || ""})${data.activeUrl ? ` -> ${data.activeUrl}` : ""}`;
      resultEl.style.color = "#16a34a";
      if (detailEl) detailEl.textContent = formatSuccessDetail(data);
      return;
    }
    const attempt = Array.isArray(data.attempts) ? data.attempts.find((item) => item && !item.ok) : null;
    resultEl.textContent = `Falha: ${attempt?.summary || attempt?.error || data.message || "Sem detalhes"}`;
    resultEl.style.color = "#dc2626";
    if (detailEl) detailEl.textContent = formatFailureDetail(data, attempt);
    pushProviderErrorLog(provider, data, attempt);
  } catch (error) {
    resultEl.textContent = `Falha: ${error.message}`;
    resultEl.style.color = "#dc2626";
    if (detailEl) detailEl.textContent = "O bridge nao conseguiu concluir o teste deste provider.";
    pushErrorLog({
      scope: `provider.${provider}`,
      title: `Falha ao testar provider ${provider}`,
      expected: `Receber JSON de diagnostico em ${BRIDGE_URL}/diagnostics/provider/${provider}`,
      actual: error?.message || "Erro desconhecido",
      trace: "panel/bridge.js -> testProvider()",
      recommendation: "Consulte o log da extensao para ver o retorno bruto do bridge.",
    });
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
  if (!data.ok) {
    pushErrorLog({
      scope: `chat.${provider}`,
      title: `Falha no chat com provider ${provider}`,
      expected: "Receber resposta estruturada do bridge /chat",
      actual: data.error || "Resposta invalida do bridge.",
      trace: "panel/bridge.js -> callChat()",
      details: data,
    });
    throw new Error(data.error || "Resposta invalida do bridge.");
  }
  return data;
}

export async function runTask(sessionId, query, tabId = "") {
  await pushBridgeSettings();
  const data = await parseJsonResponse(await safeFetch(`${BRIDGE_URL}/tasks/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, query, tabId }),
  }, 60000));
  if (!data.ok) {
    pushErrorLog({
      scope: "tasks.run",
      title: "Falha ao executar AI-Task",
      expected: "Receber plano e tasks do bridge /tasks/run",
      actual: data.error || "Falha ao executar AI-Task.",
      trace: "panel/bridge.js -> runTask()",
      details: data,
    });
    throw new Error(data.error || "Falha ao executar AI-Task.");
  }
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

function getDetailElement(provider) {
  if (provider === "local") return document.getElementById("test-local-detail");
  if (provider === "cloud") return document.getElementById("test-cloud-detail");
  return document.getElementById("test-cf-detail");
}

function formatSuccessDetail(data) {
  const attempt = Array.isArray(data.attempts) ? data.attempts.find((item) => item && item.ok) : null;
  return [
    `Endpoint ativo: ${data.activeUrl || "desconhecido"}`,
    data.message || "Conexao validada.",
    attempt?.warningSummary || "",
    attempt?.warningDetail || "",
  ].filter(Boolean).join(" | ");
}

function formatFailureDetail(data, attempt) {
  return [
    attempt?.url ? `URL: ${attempt.url}` : "",
    attempt?.recommendation || "",
    attempt?.hint || "",
  ].filter(Boolean).join(" | ");
}

function pushProviderErrorLog(provider, data, attempt) {
  pushErrorLog({
    scope: `provider.${provider}`,
    title: `Diagnostico com falha: ${provider}`,
    expected: `Conseguir validar o provider ${provider} com o modelo ${data?.model || ""}`.trim(),
    actual: attempt?.summary || attempt?.error || data?.message || "Sem detalhes",
    trace: `diagnostics/provider/${provider}${attempt?.url ? ` -> ${attempt.url}` : ""}`,
    recommendation: attempt?.recommendation || "Revise URL, modelo e autenticacao deste provider.",
    details: {
      provider,
      configuredUrl: data?.configuredUrl || null,
      recommendedUrl: data?.recommendedUrl || null,
      issue: attempt?.issue || data?.issue || null,
      attempt,
      payload: data,
    },
  });
}
