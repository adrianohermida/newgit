const LOCAL_RUNTIME_BASE_KEY = "hmadv_local_ai_core_base_url";
const LOCAL_EXTENSION_BASE_KEY = "hmadv_local_extension_base_url";
const LOCAL_MODEL_KEY = "hmadv_local_ai_core_model";
const DEFAULT_LOCAL_RUNTIME_BASE_URL = "http://127.0.0.1:8000";
const FALLBACK_LOCAL_RUNTIME_BASE_URL = "http://127.0.0.1:8010";
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
    localModel: safeReadStorage(LOCAL_MODEL_KEY, DEFAULT_LOCAL_MODEL),
  };
}

function safeUrlMeta(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || "").trim());
    return {
      host: parsed.host || null,
      endpoint: parsed.toString().replace(/\/+$/, ""),
    };
  } catch {
    return {
      host: null,
      endpoint: rawUrl || null,
    };
  }
}

function humanizeRuntimeFamily(runtimeFamily, transport) {
  if (runtimeFamily === "ollama" || transport === "ollama_chat") return "Ollama local";
  if (runtimeFamily === "openai_compatible" || transport === "openai_chat_completions") return "OpenAI-compatible local";
  if (runtimeFamily === "anthropic_compatible" || transport === "anthropic_messages") return "Anthropic-compatible local";
  return "Runtime local";
}

function getRuntimeCandidates(preferredBaseUrl) {
  const candidates = [preferredBaseUrl, DEFAULT_LOCAL_RUNTIME_BASE_URL, FALLBACK_LOCAL_RUNTIME_BASE_URL]
    .filter(Boolean)
    .map((item) => String(item).trim().replace(/\/+$/, ""));
  return [...new Set(candidates)];
}

export function persistBrowserLocalRuntimeConfig({ runtimeBaseUrl, extensionBaseUrl, localModel } = {}) {
  if (runtimeBaseUrl) safeWriteStorage(LOCAL_RUNTIME_BASE_KEY, runtimeBaseUrl);
  if (extensionBaseUrl) safeWriteStorage(LOCAL_EXTENSION_BASE_KEY, extensionBaseUrl);
  if (localModel) safeWriteStorage(LOCAL_MODEL_KEY, localModel);
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
  const candidates = getRuntimeCandidates(baseUrl);
  let lastError = null;

  for (const candidateBaseUrl of candidates) {
    const endpoint = joinRuntimeUrl(candidateBaseUrl, path);
    try {
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
      persistBrowserLocalRuntimeConfig({ runtimeBaseUrl: candidateBaseUrl });
      return json;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Falha ao acessar runtime local.");
}

async function requestOptionalHealth(baseUrl) {
  const endpoint = joinRuntimeUrl(baseUrl, "/health");
  try {
    const response = await fetch(endpoint, {
      method: "GET",
    });
    const json = await readJsonResponse(response);
    return {
      ok: response.ok,
      status: response.status,
      endpoint,
      payload: json,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      endpoint,
      payload: null,
      error: error?.message || "Falha ao consultar health local.",
    };
  }
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

export async function probeBrowserLocalCapabilities() {
  const { runtimeBaseUrl } = getBrowserLocalRuntimeConfig();
  return requestBrowserLocalJson(runtimeBaseUrl, "/v1/capabilities", undefined, { method: "GET" });
}

export async function hydrateBrowserLocalProviderOptions(providerOptions = []) {
  const normalizedOptions = Array.isArray(providerOptions) ? providerOptions : [];
  const localIndex = normalizedOptions.findIndex((item) => String(item?.value || item?.id || "").toLowerCase() === "local");
  if (localIndex < 0) return normalizedOptions;

  try {
    const health = await probeBrowserLocalRuntime();
    const localProvider = health?.providers?.local || {};
    const runtimeConfig = getBrowserLocalRuntimeConfig();
    const runtimeMeta = safeUrlMeta(joinRuntimeUrl(runtimeConfig.runtimeBaseUrl, "/v1/messages"));
    const previous = normalizedOptions[localIndex] || {};
    const nextOptions = [...normalizedOptions];
    nextOptions[localIndex] = {
      ...previous,
      disabled: false,
      available: true,
      configured: true,
      model: localProvider?.model || previous.model || runtimeConfig.localModel || DEFAULT_LOCAL_MODEL,
      status: "operational",
      runtimeMode: "browser-local-runtime",
      host: runtimeMeta.host,
      endpoint: runtimeMeta.endpoint,
      reason: health?.offline_mode ? "Runtime local ativo em modo offline." : "Runtime local ativo e pronto para o Copilot.",
      source: "browser_local_runtime",
      offlineMode: Boolean(health?.offline_mode),
      label: `${previous.displayLabel || previous.label || "LLM local"} · ${localProvider?.model || previous.model || DEFAULT_LOCAL_MODEL} · operational`,
    };
    return nextOptions;
  } catch (error) {
    const previous = normalizedOptions[localIndex] || {};
    const nextOptions = [...normalizedOptions];
    nextOptions[localIndex] = {
      ...previous,
      reason: previous.reason || error?.message || "Runtime local indisponivel no navegador.",
      source: previous.source || "browser_local_runtime",
    };
    return nextOptions;
  }
}

export function applyBrowserLocalOfflinePolicy(providerOptions = [], stackSummary = null) {
  const normalizedOptions = Array.isArray(providerOptions) ? providerOptions : [];
  if (!stackSummary?.offlineMode) return normalizedOptions;

  return normalizedOptions.map((item) => {
    const providerId = String(item?.value || item?.id || "").toLowerCase();
    if (providerId === "local") {
      return {
        ...item,
        disabled: !(stackSummary?.localProvider?.available),
        available: Boolean(stackSummary?.localProvider?.available),
        configured: Boolean(stackSummary?.localProvider?.configured ?? item?.configured),
        offlineMode: true,
        status: stackSummary?.localProvider?.available ? "operational" : item?.status || "degraded",
        reason:
          item?.reason ||
          (stackSummary?.localProvider?.available
            ? "Runtime local isolado pronto para operacao offline."
            : "Modo offline ativo, mas o runtime local ainda nao respondeu."),
      };
    }

    return {
      ...item,
      disabled: true,
      available: false,
      offlineMode: true,
      status: item?.status === "failed" ? item.status : "offline_blocked",
      reason: "Bloqueado pelo modo offline do ai-core. Use o provider local isolado.",
      label: String(item?.label || item?.displayLabel || providerId).includes("offline")
        ? String(item?.label || item?.displayLabel || providerId)
        : `${item?.label || item?.displayLabel || providerId} · offline bloqueado`,
    };
  });
}

export async function probeBrowserLocalStackSummary() {
  const [health, capabilities] = await Promise.all([
    probeBrowserLocalRuntime(),
    probeBrowserLocalCapabilities().catch(() => null),
  ]);
  const runtimeConfig = getBrowserLocalRuntimeConfig();
  const localProvider = health?.providers?.local || {};
  const cloudProvider = health?.providers?.cloud || {};
  const runtimeMeta = safeUrlMeta(runtimeConfig.runtimeBaseUrl);
  const extensionHealth = await requestOptionalHealth(runtimeConfig.extensionBaseUrl);
  const recommendations = [];
  const actions = [];
  const skillsSummary = capabilities?.skills_summary || health?.capabilities?.skills || null;
  const commandSummary = capabilities?.commands || health?.capabilities?.commands || null;
  const extensionProfiles = capabilities?.browser_extension?.profiles || null;

  if (!health?.offline_mode) {
    recommendations.push("Ative o modo offline no app para travar a operacao local.");
    actions.push({ id: "open_environment", label: "Revisar ambiente" });
  }
  if (!localProvider?.available) {
    recommendations.push("Suba o ai-core local e confirme o runtime do modelo na sua maquina.");
    actions.push({ id: "open_runtime_config", label: "Editar runtime local" });
    actions.push({ id: "open_llm_test", label: "Testar LLM local" });
  }
  if (localProvider?.diagnostics?.runtime_family) {
    recommendations.push(
      `Runtime local detectado como ${humanizeRuntimeFamily(localProvider.diagnostics.runtime_family, localProvider.diagnostics.transport)}.`
    );
  }
  if (localProvider?.diagnostics?.error) {
    recommendations.push(`Diagnostico do provider local: ${localProvider.diagnostics.error}`);
  }
  if (!extensionHealth.ok) {
    recommendations.push("Ligue a Universal LLM Extension local para automacoes e navegacao assistida.");
    actions.push({ id: "open_environment", label: "Abrir diagnostico" });
  }
  if (skillsSummary?.total) {
    recommendations.push(`ai-core local expoe ${skillsSummary.total} skills para Copilot e AI Task.`);
  }
  if (commandSummary?.skill_like) {
    recommendations.push(`Catalogo local inclui ${commandSummary.skill_like} comandos orientados a skills.`);
  }
  if (cloudProvider?.offline_blocked) {
    recommendations.push("Cloud permanece bloqueado em offline, entao o fluxo deve priorizar o provider local.");
    actions.push({ id: "open_ai_task", label: "Abrir AI Task" });
  }

  return {
    ok: Boolean(health?.status === "ok"),
    offlineMode: Boolean(health?.offline_mode),
    runtimeBaseUrl: runtimeMeta.endpoint,
    runtimeHost: runtimeMeta.host,
    extensionBaseUrl: runtimeConfig.extensionBaseUrl,
    configuredLocalModel: runtimeConfig.localModel || DEFAULT_LOCAL_MODEL,
    extensionHealth: {
      ok: Boolean(extensionHealth.ok),
      endpoint: extensionHealth.endpoint,
      status: extensionHealth.status,
      error: extensionHealth.error || null,
    },
    localProvider: {
      configured: Boolean(localProvider?.configured),
      available: Boolean(localProvider?.available),
      model: localProvider?.model || runtimeConfig.localModel || DEFAULT_LOCAL_MODEL,
      baseUrl: localProvider?.base_url || null,
      auth: localProvider?.auth || null,
      runtimeFamily: localProvider?.diagnostics?.runtime_family || null,
      runtimeLabel: humanizeRuntimeFamily(localProvider?.diagnostics?.runtime_family, localProvider?.diagnostics?.transport),
      transport: localProvider?.diagnostics?.transport || null,
      transportEndpoint: localProvider?.diagnostics?.transport_endpoint || null,
      reachable: Boolean(localProvider?.diagnostics?.reachable),
      diagnosticsError: localProvider?.diagnostics?.error || null,
    },
    cloudProvider: {
      configured: Boolean(cloudProvider?.configured),
      available: Boolean(cloudProvider?.available),
      model: cloudProvider?.model || null,
      offlineBlocked: Boolean(cloudProvider?.offline_blocked),
    },
    capabilities: {
      skills: skillsSummary,
      skillList: Array.isArray(capabilities?.skills) ? capabilities.skills : [],
      commands: commandSummary,
      browserExtensionProfiles: extensionProfiles,
    },
    recommendations,
    actions: actions.filter((item, index, collection) => collection.findIndex((candidate) => candidate.id === item.id) === index),
  };
}

export async function invokeBrowserLocalMessages({
  query,
  mode,
  routePath,
  contextEnabled,
  context,
  model = getBrowserLocalRuntimeConfig().localModel || DEFAULT_LOCAL_MODEL,
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
        model,
        requestedModel: model,
        resolvedModel,
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
