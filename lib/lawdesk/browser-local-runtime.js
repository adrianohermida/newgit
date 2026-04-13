const LOCAL_RUNTIME_BASE_KEY = "hmadv_local_ai_core_base_url";
const LOCAL_EXTENSION_BASE_KEY = "hmadv_local_extension_base_url";
const LOCAL_MODEL_KEY = "hmadv_local_ai_core_model";
const LOCAL_INFERENCE_FAILURE_KEY = "hmadv_local_ai_core_inference_failure";
const LOCAL_EXTENSION_HEALTH_CACHE_KEY = "hmadv_local_extension_health_cache";
const LOCAL_RUNTIME_HEALTH_CACHE_KEY = "hmadv_local_runtime_health_cache";
const DEFAULT_LOCAL_RUNTIME_BASE_URL = "http://127.0.0.1:8000";
const FALLBACK_LOCAL_RUNTIME_BASE_URL = "http://127.0.0.1:8010";
const DEFAULT_LOCAL_EXTENSION_BASE_URL = "http://127.0.0.1:32123";
const DEFAULT_LOCAL_MODEL = "qwen3:4b";
const LOCAL_MODEL_FALLBACKS = ["qwen3:4b", "llama3.1:latest", "llama2:latest"];
const LOCAL_INFERENCE_FAILURE_COOLDOWN_MS = 3 * 60 * 1000;
const EXTENSION_HEALTH_SUCCESS_CACHE_MS = 15 * 1000;
const EXTENSION_HEALTH_FAILURE_CACHE_MS = 2 * 60 * 1000;
const RUNTIME_HEALTH_SUCCESS_CACHE_MS = 15 * 1000;
const RUNTIME_HEALTH_FAILURE_CACHE_MS = 60 * 1000;
let extensionHealthCache = null;
let runtimeHealthCache = null;

function safeWindow() {
  return typeof window !== "undefined" ? window : null;
}

function canAutoProbeOnCurrentHost() {
  const browserWindow = safeWindow();
  if (!browserWindow?.location) return false;
  if (browserWindow.__HMADV_ENABLE_LOCAL_RUNTIME_AUTOPROBE__ === true) return true;
  const hostname = String(browserWindow.location.hostname || "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
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

function safeRemoveStorage(key) {
  const browserWindow = safeWindow();
  if (!browserWindow?.localStorage) return;
  try {
    browserWindow.localStorage.removeItem(key);
  } catch {
    // Silent fallback: runtime local is optional.
  }
}

function safeReadJsonStorage(key) {
  const raw = safeReadStorage(key, "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function safeWriteJsonStorage(key, value) {
  if (value == null) return;
  try {
    safeWriteStorage(key, JSON.stringify(value));
  } catch {
    // Silent fallback.
  }
}

export function getBrowserLocalRuntimeConfig() {
  return {
    runtimeBaseUrl: safeReadStorage(LOCAL_RUNTIME_BASE_KEY, DEFAULT_LOCAL_RUNTIME_BASE_URL),
    extensionBaseUrl: safeReadStorage(LOCAL_EXTENSION_BASE_KEY, DEFAULT_LOCAL_EXTENSION_BASE_URL),
    localModel: safeReadStorage(LOCAL_MODEL_KEY, DEFAULT_LOCAL_MODEL),
  };
}

export function hasPersistedBrowserLocalRuntimeConfig() {
  const browserWindow = safeWindow();
  if (!browserWindow?.localStorage) return false;
  try {
    return [LOCAL_RUNTIME_BASE_KEY, LOCAL_EXTENSION_BASE_KEY, LOCAL_MODEL_KEY].some((key) => {
      const value = browserWindow.localStorage.getItem(key);
      return typeof value === "string" && value.trim().length > 0;
    });
  } catch {
    return false;
  }
}

export function shouldAutoProbeBrowserLocalRuntime() {
  if (!hasPersistedBrowserLocalRuntimeConfig()) return false;
  return canAutoProbeOnCurrentHost();
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

function humanizePersistenceMode(mode) {
  if (mode === "local_structured_configured") return "Supabase local pronto";
  if (mode === "local_structured_partial") return "Supabase local parcial";
  if (mode === "remote_structured_configured") return "Supabase remoto ativo";
  if (mode === "remote_structured_partial") return "Supabase remoto parcial";
  if (mode === "remote_blocked_offline") return "Supabase remoto bloqueado";
  return "Obsidian only";
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
  if (runtimeBaseUrl || extensionBaseUrl || localModel) {
    safeRemoveStorage(LOCAL_INFERENCE_FAILURE_KEY);
  }
}

export function clearBrowserLocalInferenceFailure() {
  safeRemoveStorage(LOCAL_INFERENCE_FAILURE_KEY);
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

function isLocalRuntimeModelMemoryError(error) {
  const message = String(error?.message || error?.payload?.detail || "").toLowerCase();
  return message.includes("requires more system memory") || message.includes("memoria") || message.includes("memory");
}

function buildLocalModelCandidates(preferredModel) {
  return [...new Set([preferredModel, getBrowserLocalRuntimeConfig().localModel, ...LOCAL_MODEL_FALLBACKS].filter(Boolean).map((item) => String(item).trim()))];
}

function buildLocalRuntimeUnavailableError(modelCandidates = [], lastError = null) {
  const detail = lastError?.message ? ` Detalhe: ${lastError.message}` : "";
  const error = new Error(
    `O Copilot local nao conseguiu reservar memoria suficiente para responder. Tente liberar RAM, carregar um modelo menor no Ollama ou trocar o runtime local configurado.${detail}`
  );
  error.code = "LOCAL_RUNTIME_INSUFFICIENT_MEMORY";
  error.candidateModels = modelCandidates;
  error.cause = lastError || null;
  return error;
}

function buildLocalRuntimeInferenceError(lastError = null) {
  const detail = lastError?.message ? ` Detalhe: ${lastError.message}` : "";
  const error = new Error(
    `O Copilot local nao conseguiu concluir a inferencia no runtime configurado.${detail}`
  );
  error.code = "LOCAL_RUNTIME_INFERENCE_FAILED";
  error.cause = lastError || null;
  error.status = lastError?.status || null;
  return error;
}

function readLocalInferenceFailureState() {
  const raw = safeReadStorage(LOCAL_INFERENCE_FAILURE_KEY, "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const expiresAt = Number(parsed.expiresAt || 0);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      safeRemoveStorage(LOCAL_INFERENCE_FAILURE_KEY);
      return null;
    }
    return parsed;
  } catch {
    safeRemoveStorage(LOCAL_INFERENCE_FAILURE_KEY);
    return null;
  }
}

function rememberLocalInferenceFailure({ model, message, status } = {}) {
  safeWriteStorage(
    LOCAL_INFERENCE_FAILURE_KEY,
    JSON.stringify({
      model: model || null,
      message: message || null,
      status: status || null,
      createdAt: Date.now(),
      expiresAt: Date.now() + LOCAL_INFERENCE_FAILURE_COOLDOWN_MS,
    })
  );
}

function shouldFallbackToExecuteRoute(error) {
  const status = Number(error?.status || 0);
  if ([400, 404, 415, 422, 501].includes(status)) return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("/v1/messages") ||
    message.includes("provider") ||
    message.includes("transport") ||
    message.includes("falha ao acessar runtime local")
  );
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
  if (!extensionHealthCache) {
    const persisted = safeReadJsonStorage(LOCAL_EXTENSION_HEALTH_CACHE_KEY);
    if (persisted?.endpoint === endpoint) {
      extensionHealthCache = persisted;
    }
  }
  const cacheTtl = extensionHealthCache?.ok ? EXTENSION_HEALTH_SUCCESS_CACHE_MS : EXTENSION_HEALTH_FAILURE_CACHE_MS;
  if (
    extensionHealthCache &&
    extensionHealthCache.endpoint === endpoint &&
    Date.now() - extensionHealthCache.checkedAt < cacheTtl
  ) {
    return extensionHealthCache.value;
  }
  try {
    const response = await fetch(endpoint, {
      method: "GET",
    });
    const json = await readJsonResponse(response);
    const result = {
      ok: response.ok,
      status: response.status,
      endpoint,
      payload: json,
    };
    extensionHealthCache = {
      endpoint,
      ok: result.ok,
      checkedAt: Date.now(),
      value: result,
    };
    safeWriteJsonStorage(LOCAL_EXTENSION_HEALTH_CACHE_KEY, extensionHealthCache);
    return result;
  } catch (error) {
    const result = {
      ok: false,
      status: null,
      endpoint,
      payload: null,
      error: error?.message || "Falha ao consultar health local.",
    };
    extensionHealthCache = {
      endpoint,
      ok: false,
      checkedAt: Date.now(),
      value: result,
    };
    safeWriteJsonStorage(LOCAL_EXTENSION_HEALTH_CACHE_KEY, extensionHealthCache);
    return result;
  }
}

async function requestCachedRuntimeHealth(baseUrl) {
  const endpoint = joinRuntimeUrl(baseUrl, "/health");
  if (!runtimeHealthCache) {
    const persisted = safeReadJsonStorage(LOCAL_RUNTIME_HEALTH_CACHE_KEY);
    if (persisted?.endpoint === endpoint) {
      runtimeHealthCache = persisted;
    }
  }
  const cacheTtl = runtimeHealthCache?.ok ? RUNTIME_HEALTH_SUCCESS_CACHE_MS : RUNTIME_HEALTH_FAILURE_CACHE_MS;
  if (
    runtimeHealthCache &&
    runtimeHealthCache.endpoint === endpoint &&
    Date.now() - runtimeHealthCache.checkedAt < cacheTtl
  ) {
    if (runtimeHealthCache.ok) {
      return runtimeHealthCache.value;
    }
    const cachedError = new Error(runtimeHealthCache.error?.message || "Falha ao acessar runtime local.");
    cachedError.status = runtimeHealthCache.error?.status || null;
    cachedError.endpoint = endpoint;
    cachedError.payload = runtimeHealthCache.error?.payload || null;
    throw cachedError;
  }

  try {
    const value = await requestBrowserLocalJson(baseUrl, "/health", undefined, { method: "GET" });
    runtimeHealthCache = {
      endpoint,
      ok: true,
      checkedAt: Date.now(),
      value,
      error: null,
    };
    safeWriteJsonStorage(LOCAL_RUNTIME_HEALTH_CACHE_KEY, runtimeHealthCache);
    return value;
  } catch (error) {
    runtimeHealthCache = {
      endpoint,
      ok: false,
      checkedAt: Date.now(),
      value: null,
      error: {
        message: error?.message || "Falha ao acessar runtime local.",
        status: error?.status || null,
        payload: error?.payload || null,
      },
    };
    safeWriteJsonStorage(LOCAL_RUNTIME_HEALTH_CACHE_KEY, runtimeHealthCache);
    throw error;
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
  return requestCachedRuntimeHealth(runtimeBaseUrl);
}

export async function probeBrowserLocalCapabilities(preloadedHealth = null) {
  const health = preloadedHealth || (await probeBrowserLocalRuntime().catch(() => null));
  if (health?.capabilities && typeof health.capabilities === "object") {
    return health.capabilities;
  }
  return {};
}

export async function hydrateBrowserLocalProviderOptions(providerOptions = []) {
  const normalizedOptions = Array.isArray(providerOptions) ? providerOptions : [];
  const localIndex = normalizedOptions.findIndex((item) => String(item?.value || item?.id || "").toLowerCase() === "local");
  if (localIndex < 0) return normalizedOptions;
  const localOption = normalizedOptions[localIndex] || {};
  if (localOption.configured === false && localOption.disabled) {
    return normalizedOptions;
  }

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
  const health = await probeBrowserLocalRuntime();
  const capabilities = await probeBrowserLocalCapabilities(health).catch(() => null);
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
  const persistence = capabilities?.persistence || health?.capabilities?.persistence || health?.persistence || null;
  const inferenceFailure = readLocalInferenceFailureState();

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
  if (inferenceFailure?.message) {
    recommendations.push("A última tentativa de inferência local falhou recentemente. O Copilot deve operar em contingência até o runtime estabilizar.");
    actions.push({ id: "open_llm_test", label: "Testar LLM local" });
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
  if (persistence?.mode === "remote_blocked_offline") {
    recommendations.push("Persistencia remota foi bloqueada no modo offline. Use Obsidian ou suba Supabase local.");
    actions.push({ id: "copiar_envs_supabase_local", label: "Copiar envs local" });
  }
  if (persistence?.mode === "local_structured_partial") {
    recommendations.push("Supabase local foi detectado, mas ainda faltam chaves ou contrato completo para persistencia estruturada.");
    actions.push({ id: "copiar_envs_supabase_local", label: "Copiar envs local" });
  }
  if (persistence?.mode === "local_structured_configured") {
    recommendations.push("Persistencia estruturada local pronta para sessoes, runs e memoria vetorial local.");
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
      inferenceFailure: inferenceFailure
        ? {
            model: inferenceFailure.model || null,
            message: inferenceFailure.message || null,
            status: inferenceFailure.status || null,
            expiresAt: inferenceFailure.expiresAt || null,
          }
        : null,
    },
    cloudProvider: {
      configured: Boolean(cloudProvider?.configured),
      available: Boolean(cloudProvider?.available),
      model: cloudProvider?.model || null,
      offlineBlocked: Boolean(cloudProvider?.offline_blocked),
    },
    persistence: persistence
      ? {
          mode: persistence.mode,
          label: humanizePersistenceMode(persistence.mode),
          detail: persistence.detail || null,
          baseUrl: persistence.base_url || null,
          baseUrlKind: persistence.base_url_kind || "unconfigured",
          structuredConfigured: Boolean(persistence.structured_configured),
          browserConfigured: Boolean(persistence.browser_configured),
          localReady: Boolean(persistence.local_ready),
          remoteBlocked: Boolean(persistence.remote_blocked),
        }
      : null,
    capabilities: {
      skills: skillsSummary,
      skillList: Array.isArray(capabilities?.skills) ? capabilities.skills : [],
      commands: commandSummary,
      browserExtensionProfiles: extensionProfiles,
      persistence,
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
  const modelCandidates = buildLocalModelCandidates(model);
  let lastError = null;
  let sawMemoryError = false;
  const runtimeContext = {
    ...(context || {}),
    browserLocalRuntime: {
      surface: "copilot",
      mode: String(mode || "chat"),
      routePath: routePath || "/interno/copilot",
      contextEnabled: Boolean(contextEnabled),
    },
  };
  const recentInferenceFailure = readLocalInferenceFailureState();
  if (recentInferenceFailure) {
    const cachedError = buildLocalRuntimeInferenceError({
      message: recentInferenceFailure.message || "Falha recente de inferência local.",
      status: recentInferenceFailure.status || null,
    });
    cachedError.cooldownUntil = recentInferenceFailure.expiresAt || null;
    throw cachedError;
  }

  for (let index = 0; index < modelCandidates.length; index += 1) {
    const candidateModel = modelCandidates[index];
    try {
      const payload = await requestBrowserLocalJson(runtimeBaseUrl, "/v1/messages", {
        provider: "local",
        model: candidateModel,
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
        context: runtimeContext,
      });

      const text = extractAssistantTextFromContent(payload?.content);
      const resolvedModel = payload?.metadata?.resolved_model || payload?.model || candidateModel;
      persistBrowserLocalRuntimeConfig({ localModel: resolvedModel || candidateModel });
      safeRemoveStorage(LOCAL_INFERENCE_FAILURE_KEY);

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
            model: candidateModel,
            requestedModel: candidateModel,
            resolvedModel,
            provider: "local",
            route: "/v1/messages",
          },
        },
      };
    } catch (error) {
      lastError = error;
      const memoryError = isLocalRuntimeModelMemoryError(error);
      sawMemoryError = sawMemoryError || memoryError;
      if (!memoryError && shouldFallbackToExecuteRoute(error)) {
        try {
          const executePayload = await invokeBrowserLocalExecute({
            query: typeof query === "string" ? query : "",
            context: runtimeContext,
          });
          const text =
            executePayload?.result?.message ||
            executePayload?.resultText ||
            (typeof executePayload?.result === "string" ? executePayload.result : "") ||
            "Sem resposta textual.";
          return {
            ok: true,
            data: {
              ...executePayload,
              resultText: text,
              _metadata: {
                source: "local_ai_core_execute",
                model: candidateModel,
                requestedModel: candidateModel,
                resolvedModel: candidateModel,
                provider: "local",
                route: "/execute",
                fallbackFrom: "/v1/messages",
              },
            },
          };
        } catch (executeError) {
          lastError = executeError;
          if (isLocalRuntimeModelMemoryError(executeError)) {
            sawMemoryError = true;
          } else {
            throw executeError;
          }
        }
      }
      const shouldRetryWithLighterModel = memoryError && index < modelCandidates.length - 1;
      if (!shouldRetryWithLighterModel && !memoryError) throw error;
    }
  }

  if (sawMemoryError) {
    try {
      const executePayload = await invokeBrowserLocalExecute({
        query: typeof query === "string" ? query : "",
        context: {
          ...runtimeContext,
          browserLocalRuntime: {
            ...runtimeContext.browserLocalRuntime,
            fallback: "execute_after_memory_pressure",
          },
        },
      });
      const text =
        executePayload?.result?.message ||
        executePayload?.resultText ||
        (typeof executePayload?.result === "string" ? executePayload.result : "") ||
        "Sem resposta textual.";
      return {
        ok: true,
        data: {
          ...executePayload,
          resultText: text,
          _metadata: {
            source: "local_ai_core_execute",
            model: modelCandidates[0] || model,
            requestedModel: modelCandidates[0] || model,
            resolvedModel: modelCandidates[0] || model,
            provider: "local",
            route: "/execute",
            fallbackFrom: "/v1/messages",
            fallbackReason: "memory_pressure",
          },
        },
      };
    } catch (executeError) {
      lastError = executeError;
    }
    throw buildLocalRuntimeUnavailableError(modelCandidates, lastError);
  }
  if (lastError?.status >= 500 || String(lastError?.message || "").toLowerCase().includes("internal server error")) {
    rememberLocalInferenceFailure({
      model,
      message: lastError?.message || "Falha de inferência no runtime local.",
      status: lastError?.status || null,
    });
    throw buildLocalRuntimeInferenceError(lastError);
  }
  throw lastError || new Error("Falha ao consultar o runtime local.");
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
  const orchestration = payload?.orchestration && typeof payload.orchestration === "object" ? payload.orchestration : null;
  const orchestrationTasks = Array.isArray(orchestration?.tasks) ? orchestration.tasks : [];
  const normalizedSteps = Array.isArray(payload?.steps) && payload.steps.length
    ? payload.steps.map((step) => ({
        ...step,
        dependencies: Array.isArray(step?.dependencies)
          ? step.dependencies
          : Array.isArray(step?.depends_on)
            ? step.depends_on
            : [],
      }))
    : orchestrationTasks.map((task, index) => ({
        step_id: index + 1,
        action: task?.title || `Etapa ${index + 1}`,
        title: task?.title || `Etapa ${index + 1}`,
        tool: task?.tool || null,
        status: "pending",
        agent_role: task?.agent_role || "Executor",
        stage: task?.stage || "execution",
        dependencies: Array.isArray(task?.depends_on) ? task.depends_on : [],
        module_keys: Array.isArray(task?.module_keys) ? task.module_keys : [],
      }));

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
        orchestration,
      },
      error:
        payload?.status && payload.status !== "ok"
          ? payload?.errors?.[0]?.message || "Execucao local finalizada com falha."
          : null,
    },
    events: summarizeLocalTelemetryEvents(telemetry),
    steps: normalizedSteps,
    orchestration,
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
