const LOCAL_RUNTIME_BASE_KEY = "hmadv_local_ai_core_base_url";
const LOCAL_EXTENSION_BASE_KEY = "hmadv_local_extension_base_url";
const DEFAULT_LOCAL_RUNTIME_BASE_URL = "http://127.0.0.1:8000";
const DEFAULT_LOCAL_EXTENSION_BASE_URL = "http://127.0.0.1:32123";
const DEFAULT_LOCAL_MODEL = "aetherlab-legal-local-v1";

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function safeReadStorage(key, fallback) {
  const browserWindow = safeWindow();
  if (!browserWindow?.localStorage) return fallback;
  try {
    const value = browserWindow.localStorage.getItem(key);
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  } catch {
    return fallback;
  }
}

function safeWriteStorage(key, value) {
  const browserWindow = safeWindow();
  if (!browserWindow?.localStorage) return;
  try {
    browserWindow.localStorage.setItem(key, String(value || ""));
  } catch {
    // Silent fallback: runtime local is optional.
  }
}

export function getBrowserLocalRuntimeConfig() {
  return {
    runtimeBaseUrl: safeReadStorage(LOCAL_RUNTIME_BASE_KEY, DEFAULT_LOCAL_RUNTIME_BASE_URL),
    extensionBaseUrl: safeReadStorage(LOCAL_EXTENSION_BASE_KEY, DEFAULT_LOCAL_EXTENSION_BASE_URL),
  };
}

export function persistBrowserLocalRuntimeConfig({ runtimeBaseUrl, extensionBaseUrl } = {}) {
  if (runtimeBaseUrl) safeWriteStorage(LOCAL_RUNTIME_BASE_KEY, runtimeBaseUrl);
  if (extensionBaseUrl) safeWriteStorage(LOCAL_EXTENSION_BASE_KEY, extensionBaseUrl);
}

export function isBrowserLocalProvider(provider) {
  return String(provider || "").toLowerCase() === "local";
}

function joinRuntimeUrl(baseUrl, path) {
  return `${String(baseUrl || "").replace(/\/+$/, "")}/${String(path || "").replace(/^\/+/, "")}`;
}

async function readJsonResponse(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function extractRuntimeError(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload?.detail === "string" && payload.detail.trim()) return payload.detail.trim();
  if (typeof payload?.message === "string" && payload.message.trim()) return payload.message.trim();
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error.trim();
  if (typeof payload?.raw === "string" && payload.raw.trim()) return payload.raw.trim();
  return fallback;
}

async function requestBrowserLocalJson(baseUrl, path, payload, init = {}) {
  const endpoint = joinRuntimeUrl(baseUrl, path);
  const response = await fetch(endpoint, {
    method: init.method || "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const json = await readJsonResponse(response);
  if (!response.ok) {
    const message = extractRuntimeError(json, `Falha ao acessar runtime local (${response.status}).`);
    const error = new Error(message);
    error.payload = json;
    error.status = response.status;
    error.endpoint = endpoint;
    throw error;
  }
  return json;
}

function extractAssistantTextFromContent(content) {
  if (typeof content === "string" && content.trim()) return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      if (typeof item?.text === "string") return item.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export function buildBrowserLocalChatSystemPrompt({ mode, contextEnabled, routePath }) {
  const normalizedMode = String(mode || "chat").toLowerCase();
  const modeLine =
    normalizedMode === "analysis"
      ? "Modo analise: priorize leitura tecnica, riscos, inferencias e proximo passo."
      : normalizedMode === "task"
        ? "Modo tarefa: responda com orientacao operacional objetiva e proximo passo executavel."
        : "Modo conversa: responda com clareza, objetividade e foco juridico-operacional.";
  const contextLine = contextEnabled
    ? "Considere o contexto compartilhado pelo dashboard quando ele vier no prompt."
    : "Nao invente contexto ausente; assuma somente o que estiver no pedido.";
  const routeLine = routePath ? `Superficie atual: ${routePath}.` : "";
  return [modeLine, contextLine, routeLine, "Responda sempre em PT-BR."].filter(Boolean).join(" ");
}

export async function probeBrowserLocalRuntime() {
  const { runtimeBaseUrl } = getBrowserLocalRuntimeConfig();
  return requestBrowserLocalJson(runtimeBaseUrl, "/health", undefined, { method: "GET" });
}

export async function invokeBrowserLocalMessages({
  query,
  mode,
  routePath,
  contextEnabled,
  context,
  model = DEFAULT_LOCAL_MODEL,
}) {
  const { runtimeBaseUrl } = getBrowserLocalRuntimeConfig();
  const payload = await requestBrowserLocalJson(runtimeBaseUrl, "/v1/messages", {
    provider: "local",
    model,
    system: buildBrowserLocalChatSystemPrompt({ mode, contextEnabled, routePath }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: typeof query === "string" ? query : "",
          },
        ],
      },
    ],
    context: context || {},
  });

  const text = extractAssistantTextFromContent(payload?.content);
  const resolvedModel = payload?.metadata?.resolved_model || payload?.model || model;

  return {
    ok: true,
    data: {
      result: {
        kind: "structured",
        message: text || "Sem resposta textual.",
        data: {
          message: text || "Sem resposta textual.",
          provider: "local_llm_api",
          model: resolvedModel,
        },
      },
      status: "ok",
      session_id: null,
      steps: [],
      logs: [],
      errors: [],
      rag: null,
      telemetry: [],
      resultText: text || "Sem resposta textual.",
      _metadata: {
        source: "local_llm_api",
        model: resolvedModel,
        provider: "local",
        route: "/v1/messages",
      },
    },
  };
}

export async function invokeBrowserLocalExecute({ query, context }) {
  const { runtimeBaseUrl } = getBrowserLocalRuntimeConfig();
  return requestBrowserLocalJson(runtimeBaseUrl, "/execute", {
    query,
    context: context || {},
  });
}

function mapLocalExecutionStatus(status) {
  return status === "ok" ? "completed" : "failed";
}

function summarizeLocalTelemetryEvents(telemetry = []) {
  if (!Array.isArray(telemetry)) return [];
  return telemetry.map((event, index) => ({
    id: `local_event_${index + 1}`,
    type: event?.event || "local_event",
    message: typeof event?.event === "string" ? event.event : "Evento local",
    data: event,
    seq: index + 1,
  }));
}

export function normalizeBrowserLocalTaskRun(payload, {
  runId,
  mission,
  mode,
  provider,
  startedAt,
} = {}) {
  const resultMessage =
    payload?.result?.message ||
    payload?.resultText ||
    (typeof payload?.result === "string" ? payload.result : "") ||
    "Execucao local concluida sem mensagem textual.";
  const resolvedStatus = mapLocalExecutionStatus(payload?.status);
  const telemetry = Array.isArray(payload?.telemetry) ? payload.telemetry : [];
  const sourceModel = DEFAULT_LOCAL_MODEL;

  return {
    run: {
      id: payload?.session_id || runId || `local_${Date.now()}`,
      mission: mission || "",
      mode: mode || "assisted",
      provider: provider || "local",
      status: resolvedStatus,
      created_at: startedAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result: {
        message: resultMessage,
        status: payload?.status || "ok",
      },
      error:
        payload?.status && payload.status !== "ok"
          ? payload?.errors?.[0]?.message || "Execucao local finalizada com falha."
          : null,
    },
    events: summarizeLocalTelemetryEvents(telemetry),
    steps: Array.isArray(payload?.steps) ? payload.steps : [],
    rag: payload?.rag || null,
    resultText: resultMessage,
    source: "local_llm_api",
    model: sourceModel,
    status: resolvedStatus,
    isTerminal: true,
    eventsCursor: null,
    eventsCursorSequence: telemetry.length || 0,
    eventsTotal: telemetry.length || 0,
    pollIntervalMs: null,
  };
}

export async function invokeBrowserLocalExtensionCommand(command, payload = {}) {
  const { extensionBaseUrl } = getBrowserLocalRuntimeConfig();
  return requestBrowserLocalJson(extensionBaseUrl, "/execute", {
    command,
    payload,
  });
}
