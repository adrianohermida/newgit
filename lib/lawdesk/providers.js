function getClean(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function resolveEnvValue(env, keys, fallback = null) {
  for (const key of keys) {
    const value = getClean(env?.[key]);
    if (value) {
      return { key, value };
    }
  }
  return { key: null, value: fallback };
}

function summarizeConfigState(primaryKey, requiredKeys = []) {
  return {
    configuredFrom: primaryKey || null,
    missing: requiredKeys.filter((key) => key !== primaryKey),
  };
}

function parseBooleanFlag(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function buildResolvedUrlMeta(value) {
  const raw = getClean(value);
  if (!raw) {
    return {
      value: null,
      origin: null,
      host: null,
      pathname: null,
    };
  }
  try {
    const parsed = new URL(raw);
    return {
      value: parsed.toString().replace(/\/+$/, ""),
      origin: parsed.origin,
      host: parsed.host,
      pathname: parsed.pathname || "/",
    };
  } catch {
    return {
      value: raw,
      origin: null,
      host: null,
      pathname: null,
    };
  }
}

export function normalizeLawdeskProviderId(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized || normalized === "gpt" || normalized === "openai" || normalized === "primary_api") {
    return "gpt";
  }
  if (["local", "local_llm", "llm_local", "own_llm"].includes(normalized)) {
    return "local";
  }
  if (["cloudflare", "workers_ai", "workers_ai_direct", "cloudflare_workers_ai"].includes(normalized)) {
    return "cloudflare";
  }
  if (["custom", "custom_api", "custom_llm"].includes(normalized)) {
    return "custom";
  }
  return normalized;
}

export function getDefaultLawdeskProvider(env = {}) {
  if (isLawdeskOfflineMode(env)) {
    return "local";
  }
  const requested =
    getClean(env.LAWDESK_DEFAULT_PROVIDER) ||
    getClean(env.DOTOBOT_DEFAULT_PROVIDER) ||
    getClean(env.NEXT_PUBLIC_LAWDESK_DEFAULT_PROVIDER);
  if (requested) {
    return normalizeLawdeskProviderId(requested);
  }

  const primary = getPrimaryBackendConfig(env);
  const edge = getSupabaseEdgeConfig(env);
  const custom = getCustomLlmConfig(env);
  const cloudflare = getCloudflareWorkersConfig(env);
  const local = getLocalLlmConfig(env);

  if (primary.baseUrl || edge.baseUrl) return "gpt";
  if (custom.baseUrl) return "custom";
  if (cloudflare.hasRuntimeBinding || cloudflare.enabledByFlag) return "cloudflare";
  if (local.baseUrl) return "local";
  return "gpt";
}

export function isLawdeskOfflineMode(env = {}) {
  return parseBooleanFlag(
    env.LAWDESK_OFFLINE_MODE ??
    env.AICORE_OFFLINE_MODE ??
    env.NEXT_PUBLIC_LAWDESK_OFFLINE_MODE
  );
}

export function formatLawdeskProviderLabel(value) {
  const normalized = normalizeLawdeskProviderId(value);
  const labels = {
    gpt: "Nuvem principal",
    local: "LLM local",
    cloudflare: "Cloudflare Workers AI",
    custom: "Endpoint custom",
    primary_api: "Backend principal",
    supabase_edge: "Supabase Edge",
    workers_ai_direct: "Cloudflare Workers AI",
    local_llm_api: "LLM local",
    custom_llm_api: "Endpoint custom",
  };
  return labels[normalized] || labels[value] || String(value || "n/a");
}

export function resolvePreferredLawdeskProvider({
  currentProvider,
  defaultProvider,
  providers = [],
} = {}) {
  const normalizedCurrent = normalizeLawdeskProviderId(currentProvider || "");
  const normalizedDefault = normalizeLawdeskProviderId(defaultProvider || "gpt");
  const normalizedProviders = Array.isArray(providers) ? providers : [];

  const findEntry = (providerId) =>
    normalizedProviders.find((item) => normalizeLawdeskProviderId(item?.id || item?.value) === providerId) || null;
  const isAvailable = (entry) => Boolean(entry) && entry.available !== false && entry.disabled !== true;

  const currentEntry = findEntry(normalizedCurrent);
  if (isAvailable(currentEntry)) return normalizedCurrent;

  const defaultEntry = findEntry(normalizedDefault);
  if (isAvailable(defaultEntry)) return normalizedDefault;

  const firstAvailable = normalizedProviders.find((item) => isAvailable(item));
  if (firstAvailable) {
    return normalizeLawdeskProviderId(firstAvailable.id || firstAvailable.value);
  }

  if (currentEntry) return normalizeLawdeskProviderId(currentEntry.id || currentEntry.value);
  if (defaultEntry) return normalizeLawdeskProviderId(defaultEntry.id || defaultEntry.value);

  const firstKnown = normalizedProviders[0];
  if (firstKnown) {
    return normalizeLawdeskProviderId(firstKnown.id || firstKnown.value);
  }

  return normalizedCurrent || normalizedDefault || "gpt";
}

export function getPrimaryBackendConfig(env = {}) {
  const baseUrl = resolveEnvValue(env, ["PROCESS_AI_BASE", "LAWDESK_AI_BASE_URL", "HMADV_RUNNER_URL"]);
  const sharedSecret = resolveEnvValue(env, ["HMDAV_AI_SHARED_SECRET", "HMADV_AI_SHARED_SECRET", "LAWDESK_AI_SHARED_SECRET"]);
  const model = resolveEnvValue(env, ["GPT_MODEL", "OPENAI_MODEL"]);
  const baseMeta = buildResolvedUrlMeta(baseUrl.value);
  return {
    baseUrl: baseMeta.value,
    baseUrlSource: baseUrl.key,
    baseUrlMeta: baseMeta,
    sharedSecret: sharedSecret.value,
    sharedSecretSource: sharedSecret.key,
    model: model.value,
    modelSource: model.key,
    diagnostics: {
      baseUrl: summarizeConfigState(baseUrl.key, ["PROCESS_AI_BASE", "LAWDESK_AI_BASE_URL", "HMADV_RUNNER_URL"]),
      sharedSecret: summarizeConfigState(sharedSecret.key, ["HMDAV_AI_SHARED_SECRET", "HMADV_AI_SHARED_SECRET", "LAWDESK_AI_SHARED_SECRET"]),
      model: summarizeConfigState(model.key, ["GPT_MODEL", "OPENAI_MODEL"]),
    },
  };
}

export function getSupabaseEdgeConfig(env = {}) {
  const explicit = resolveEnvValue(env, ["DOTOBOT_SUPABASE_EDGE_URL", "LAWDESK_SUPABASE_EDGE_URL"]);
  const supabaseUrl = resolveEnvValue(env, ["SUPABASE_URL"]);
  const functionName = resolveEnvValue(env, ["DOTOBOT_SUPABASE_EDGE_FUNCTION", "LAWDESK_SUPABASE_EDGE_FUNCTION"], "dotobot-execute");
  const apiKey = resolveEnvValue(env, ["DOTOBOT_SUPABASE_EDGE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]);
  const sharedSecret = resolveEnvValue(env, ["HMDAV_AI_SHARED_SECRET", "HMADV_AI_SHARED_SECRET", "LAWDESK_AI_SHARED_SECRET"]);
  const resolvedBaseUrl = explicit.value || (supabaseUrl.value ? `${supabaseUrl.value.replace(/\/+$/, "")}/functions/v1/${functionName.value}` : null);
  const baseMeta = buildResolvedUrlMeta(resolvedBaseUrl);
  return {
    baseUrl: baseMeta.value,
    baseUrlSource: explicit.key || (supabaseUrl.key && functionName.key ? `${supabaseUrl.key} + ${functionName.key}` : supabaseUrl.key),
    baseUrlMeta: baseMeta,
    apiKey: apiKey.value,
    apiKeySource: apiKey.key,
    sharedSecret: sharedSecret.value,
    sharedSecretSource: sharedSecret.key,
    diagnostics: {
      baseUrl: summarizeConfigState(explicit.key || supabaseUrl.key, ["DOTOBOT_SUPABASE_EDGE_URL", "LAWDESK_SUPABASE_EDGE_URL", "SUPABASE_URL"]),
      apiKey: summarizeConfigState(apiKey.key, ["DOTOBOT_SUPABASE_EDGE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]),
      functionName: summarizeConfigState(functionName.key, ["DOTOBOT_SUPABASE_EDGE_FUNCTION", "LAWDESK_SUPABASE_EDGE_FUNCTION"]),
      sharedSecret: summarizeConfigState(sharedSecret.key, ["HMDAV_AI_SHARED_SECRET", "HMADV_AI_SHARED_SECRET", "LAWDESK_AI_SHARED_SECRET"]),
    },
  };
}

export function getLocalLlmConfig(env = {}) {
  const baseUrl = resolveEnvValue(env, [
    "LOCAL_LLM_BASE_URL",
    "LLM_BASE_URL",
    "LAWDESK_CODE_API_BASE_URL",
    "AICORE_API_BASE_URL",
    "DOTOBOT_PYTHON_API_BASE",
  ]);
  const apiKey = resolveEnvValue(env, ["LOCAL_LLM_API_KEY", "LLM_API_KEY"]);
  const authToken = resolveEnvValue(env, ["LOCAL_LLM_AUTH_TOKEN", "LLM_AUTH_TOKEN"]);
  const model = resolveEnvValue(env, ["LOCAL_LLM_MODEL", "LLM_MODEL"], "default-model");
  const maxTokens = resolveEnvValue(env, ["LOCAL_LLM_MAX_TOKENS", "LLM_MAX_TOKENS"], "1400");
  const baseMeta = buildResolvedUrlMeta(baseUrl.value);
  return {
    baseUrl: baseMeta.value,
    baseUrlSource: baseUrl.key,
    baseUrlMeta: baseMeta,
    apiKey: apiKey.value,
    apiKeySource: apiKey.key,
    authToken: authToken.value,
    authTokenSource: authToken.key,
    model: model.value,
    modelSource: model.key,
    maxTokens: Number.parseInt(maxTokens.value || "1400", 10) || 1400,
    maxTokensSource: maxTokens.key,
    diagnostics: {
      baseUrl: summarizeConfigState(baseUrl.key, [
        "LOCAL_LLM_BASE_URL",
        "LLM_BASE_URL",
        "LAWDESK_CODE_API_BASE_URL",
        "AICORE_API_BASE_URL",
        "DOTOBOT_PYTHON_API_BASE",
      ]),
      apiKey: summarizeConfigState(apiKey.key, ["LOCAL_LLM_API_KEY", "LLM_API_KEY"]),
      authToken: summarizeConfigState(authToken.key, ["LOCAL_LLM_AUTH_TOKEN", "LLM_AUTH_TOKEN"]),
      model: summarizeConfigState(model.key, ["LOCAL_LLM_MODEL", "LLM_MODEL"]),
    },
  };
}

export function getCustomLlmConfig(env = {}) {
  const baseUrl = resolveEnvValue(
    env,
    ["CUSTOM_LLM_BASE_URL", "DOTOBOT_CUSTOM_LLM_BASE_URL", "PROCESS_AI_BASE", "LAWDESK_AI_BASE_URL", "HMADV_RUNNER_URL"]
  );
  const apiKey = resolveEnvValue(env, ["CUSTOM_LLM_API_KEY", "DOTOBOT_CUSTOM_LLM_API_KEY"]);
  const authToken = resolveEnvValue(
    env,
    [
      "CUSTOM_LLM_AUTH_TOKEN",
      "DOTOBOT_CUSTOM_LLM_AUTH_TOKEN",
      "HMDAV_AI_SHARED_SECRET",
      "HMADV_AI_SHARED_SECRET",
      "LAWDESK_AI_SHARED_SECRET",
    ]
  );
  const model = resolveEnvValue(
    env,
    ["CUSTOM_LLM_MODEL", "DOTOBOT_CUSTOM_LLM_MODEL", "CLOUDFLARE_WORKERS_AI_MODEL", "CF_WORKERS_AI_MODEL"],
    "custom-model"
  );
  const maxTokens = resolveEnvValue(env, ["CUSTOM_LLM_MAX_TOKENS"], "1400");
  const baseMeta = buildResolvedUrlMeta(baseUrl.value);
  return {
    baseUrl: baseMeta.value,
    baseUrlSource: baseUrl.key,
    baseUrlMeta: baseMeta,
    apiKey: apiKey.value,
    apiKeySource: apiKey.key,
    authToken: authToken.value,
    authTokenSource: authToken.key,
    model: model.value,
    modelSource: model.key,
    maxTokens: Number.parseInt(maxTokens.value || "1400", 10) || 1400,
    maxTokensSource: maxTokens.key,
    diagnostics: {
      baseUrl: summarizeConfigState(baseUrl.key, [
        "CUSTOM_LLM_BASE_URL",
        "DOTOBOT_CUSTOM_LLM_BASE_URL",
        "PROCESS_AI_BASE",
        "LAWDESK_AI_BASE_URL",
        "HMADV_RUNNER_URL",
      ]),
      apiKey: summarizeConfigState(apiKey.key, ["CUSTOM_LLM_API_KEY", "DOTOBOT_CUSTOM_LLM_API_KEY"]),
      authToken: summarizeConfigState(authToken.key, [
        "CUSTOM_LLM_AUTH_TOKEN",
        "DOTOBOT_CUSTOM_LLM_AUTH_TOKEN",
        "HMDAV_AI_SHARED_SECRET",
        "HMADV_AI_SHARED_SECRET",
        "LAWDESK_AI_SHARED_SECRET",
      ]),
      model: summarizeConfigState(model.key, [
        "CUSTOM_LLM_MODEL",
        "DOTOBOT_CUSTOM_LLM_MODEL",
        "CLOUDFLARE_WORKERS_AI_MODEL",
        "CF_WORKERS_AI_MODEL",
      ]),
    },
  };
}

export function getCloudflareWorkersConfig(env = {}) {
  const model = resolveEnvValue(env, ["CLOUDFLARE_WORKERS_AI_MODEL", "CF_WORKERS_AI_MODEL"], "@cf/meta/llama-3.1-8b-instruct");
  const enabledByFlag = ["1", "true", "yes", "on"].includes(String(env.CLOUDFLARE_WORKERS_AI_ENABLED || "").trim().toLowerCase());
  const hasRuntimeBinding = Boolean(env?.AI && typeof env.AI.run === "function");
  return {
    model: model.value,
    modelSource: model.key,
    enabledByFlag,
    hasRuntimeBinding,
    diagnostics: {
      model: summarizeConfigState(model.key, ["CLOUDFLARE_WORKERS_AI_MODEL", "CF_WORKERS_AI_MODEL"]),
      enabledFlag: summarizeConfigState(enabledByFlag ? "CLOUDFLARE_WORKERS_AI_ENABLED" : null, ["CLOUDFLARE_WORKERS_AI_ENABLED"]),
      runtimeBinding: {
        configuredFrom: hasRuntimeBinding ? "AI runtime binding" : null,
        missing: hasRuntimeBinding ? [] : ["AI runtime binding"],
      },
    },
  };
}

export function listLawdeskProviders(env = {}) {
  const offlineMode = isLawdeskOfflineMode(env);
  const primary = getPrimaryBackendConfig(env);
  const edge = getSupabaseEdgeConfig(env);
  const local = getLocalLlmConfig(env);
  const custom = getCustomLlmConfig(env);
  const cloudflare = getCloudflareWorkersConfig(env);

  return [
    {
      id: "gpt",
      label: "Nuvem principal",
      description: "Backend principal atual com fallback Supabase Edge.",
      available: offlineMode ? false : Boolean(primary.baseUrl || edge.baseUrl),
      configured: Boolean(primary.baseUrl || edge.baseUrl),
      model: primary.model || null,
      transport: "http_execute",
      diagnostics: {
        primary: primary.diagnostics,
        edge: edge.diagnostics,
      },
      offlineBlocked: offlineMode,
    },
    {
      id: "local",
      label: "LLM local",
      description: "Endpoint compatível com o runtime do ai-core via /v1/messages.",
      available: Boolean(local.baseUrl),
      configured: Boolean(local.baseUrl),
      model: local.model,
      transport: "local_llm_api",
      diagnostics: local.diagnostics,
      offlineBlocked: false,
    },
    {
      id: "cloudflare",
      label: "Cloudflare Workers AI",
      description: "Execução direta pelo binding AI do Cloudflare Workers.",
      available: offlineMode ? false : Boolean(cloudflare.hasRuntimeBinding || cloudflare.enabledByFlag),
      configured: Boolean(cloudflare.hasRuntimeBinding || cloudflare.enabledByFlag),
      model: cloudflare.model,
      transport: "workers_ai_direct",
      diagnostics: cloudflare.diagnostics,
      offlineBlocked: offlineMode,
    },
    {
      id: "custom",
      label: "Endpoint custom",
      description: "Endpoint LLM adicional compatível com /v1/messages.",
      available: offlineMode ? false : Boolean(custom.baseUrl),
      configured: Boolean(custom.baseUrl),
      model: custom.model,
      transport: "custom_llm_api",
      diagnostics: custom.diagnostics,
      offlineBlocked: offlineMode,
    },
  ];
}

export function buildLawdeskExecutionPlan(env = {}, requestedProvider, options = {}) {
  const explicitSelection = typeof requestedProvider === "string" && requestedProvider.trim().length > 0;
  const provider = normalizeLawdeskProviderId(requestedProvider || "gpt");
  const offlineMode = isLawdeskOfflineMode(env);
  const primary = getPrimaryBackendConfig(env);
  const edge = getSupabaseEdgeConfig(env);
  const local = getLocalLlmConfig(env);
  const custom = getCustomLlmConfig(env);
  const cloudflare = getCloudflareWorkersConfig(env);
  const allowLegacyCloudflareFallback = options?.allowLegacyCloudflareFallback !== false;
  const plan = [];

  if (offlineMode) {
    if (provider !== "local") {
      return {
        requestedProvider: provider,
        explicitSelection,
        plan,
        providers: listLawdeskProviders(env),
        offlineMode,
        blockedReason: "Modo offline ativo: apenas o provider local pode executar.",
      };
    }
    if (local.baseUrl) {
      plan.push({ kind: "local_llm_api", provider: "local", config: local });
    }
  } else if (provider === "local") {
    if (local.baseUrl) {
      plan.push({ kind: "local_llm_api", provider, config: local });
    }
  } else if (provider === "cloudflare") {
    if (cloudflare.hasRuntimeBinding) {
      plan.push({ kind: "workers_ai_direct", provider, config: cloudflare });
    }
  } else if (provider === "custom") {
    if (custom.baseUrl) {
      plan.push({ kind: "custom_llm_api", provider, config: custom });
    }
  } else {
    if (primary.baseUrl) {
      plan.push({ kind: "primary_api", provider: "gpt", config: primary });
    }
    if (edge.baseUrl) {
      plan.push({ kind: "supabase_edge", provider: "gpt", config: edge });
    }
    if (!plan.length && custom.baseUrl) {
      plan.push({ kind: "custom_llm_api", provider: "custom", config: custom, fallback: true });
    }
    if (!explicitSelection && allowLegacyCloudflareFallback && cloudflare.hasRuntimeBinding) {
      plan.push({ kind: "workers_ai_direct", provider: "cloudflare", config: cloudflare, fallback: true });
    }
  }

  return {
    requestedProvider: provider,
    explicitSelection,
    plan,
    providers: listLawdeskProviders(env),
    offlineMode,
  };
}

async function safeJson(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function probeCompatibleEndpoint(baseUrl, options = {}) {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
  const authHeaders = {
    ...(options?.apiKey ? { "x-api-key": options.apiKey, Authorization: `Bearer ${options.apiKey}` } : {}),
    ...(options?.authToken ? { Authorization: `Bearer ${options.authToken}` } : {}),
  };

  const anthropicUrl = `${normalizedBaseUrl}/v1/messages`;
  try {
    const response = await fetch(anthropicUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-llm-version": "2023-06-01",
        ...authHeaders,
      },
      body: JSON.stringify({
        model: options?.model || "ping-model",
        max_tokens: 16,
        stream: false,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "ping" }],
          },
        ],
      }),
    });
    const payload = await safeJson(response);
    if (response.ok) {
      return {
        ok: true,
        mode: "anthropic_messages",
        endpoint: anthropicUrl,
        status: response.status,
        payload,
        model: payload?.model || options?.model || null,
        reason: "Endpoint respondeu via /v1/messages.",
      };
    }
  } catch {}

  const openAiUrl = `${normalizedBaseUrl}/v1/models`;
  try {
    const response = await fetch(openAiUrl, {
      method: "GET",
      headers: authHeaders,
    });
    const payload = await safeJson(response);
    if (response.ok) {
      const detectedModel = Array.isArray(payload?.data) && payload.data[0]?.id ? payload.data[0].id : options?.model || null;
      return {
        ok: true,
        mode: "openai_compatible",
        endpoint: openAiUrl,
        status: response.status,
        payload,
        model: detectedModel,
        reason: "Endpoint respondeu via /v1/models.",
      };
    }
  } catch {}

  const ollamaUrl = `${normalizedBaseUrl}/api/tags`;
  try {
    const response = await fetch(ollamaUrl, {
      method: "GET",
    });
    const payload = await safeJson(response);
    if (response.ok) {
      const detectedModel = Array.isArray(payload?.models) && payload.models[0]?.name ? payload.models[0].name : options?.model || null;
      return {
        ok: true,
        mode: "ollama",
        endpoint: ollamaUrl,
        status: response.status,
        payload,
        model: detectedModel,
        reason: "Endpoint respondeu via /api/tags do Ollama.",
      };
    }
  } catch {}

  return {
    ok: false,
    mode: null,
    endpoint: anthropicUrl,
    status: null,
    payload: null,
    model: options?.model || null,
    reason: "Nenhum endpoint compativel respondeu em /v1/messages, /v1/models ou /api/tags.",
  };
}

async function probePrimaryExecute(baseUrl, sharedSecret = null) {
  const normalizedBaseUrl = String(baseUrl || "").replace(/\/+$/, "");
  const candidates = [`${normalizedBaseUrl}/execute`, `${normalizedBaseUrl}/v1/execute`];
  const results = [];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sharedSecret ? { "x-shared-secret": sharedSecret } : {}),
        },
        body: JSON.stringify({
          query: "healthcheck execution probe",
          context: {
            route: "/providers-health",
            assistant: { role: "healthcheck" },
          },
        }),
      });
      const payload = await safeJson(response);
      const message = response.ok
        ? payload?.status || payload?.message || "Execution probe OK."
        : payload?.error || payload?.message || `Execution HTTP ${response.status}.`;
      results.push({
        route: candidate,
        ok: response.ok,
        status: response.status,
        message,
        payload,
      });
    } catch (error) {
      results.push({
        route: candidate,
        ok: false,
        status: null,
        message: error?.message || "Execution probe failed.",
        payload: null,
      });
    }
  }

  const successful = results.filter((entry) => entry.ok);
  const failed = results.filter((entry) => !entry.ok);

  return {
    ok: failed.length === 0 && successful.length > 0,
    partiallyOk: successful.length > 0 && failed.length > 0,
    successfulRoutes: successful.map((entry) => entry.route),
    failedRoutes: failed.map((entry) => entry.route),
    results,
    errors: failed.map((entry) => `[${entry.route}] ${entry.message}`),
  };
}

async function probePrimaryBackend(env = {}) {
  const config = getPrimaryBackendConfig(env);
  if (isLawdeskOfflineMode(env)) {
    return {
      id: "gpt",
      status: "disabled",
      available: false,
      configured: Boolean(config.baseUrl || config.sharedSecret),
      transport: "http_execute",
      reason: "Modo offline ativo: provider de nuvem principal desabilitado.",
      model: config.model || null,
      diagnostics: config.diagnostics,
    };
  }
  if (!config.baseUrl) {
    return {
      id: "gpt",
      status: "failed",
      available: false,
      configured: false,
      transport: "http_execute",
      reason: "PROCESS_AI_BASE/LAWDESK_AI_BASE_URL ausente.",
      model: config.model || null,
      diagnostics: config.diagnostics,
    };
  }

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/health`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(config.sharedSecret ? { Authorization: `Bearer ${config.sharedSecret}` } : {}),
      },
    });
    const payload = await safeJson(response);
    const executeProbe = response.ok ? await probePrimaryExecute(config.baseUrl, config.sharedSecret) : null;
    const executeFailed = executeProbe && !executeProbe.ok;
    const executePartial = Boolean(executeProbe?.partiallyOk);
    const status = response.ok && !executeFailed
      ? executePartial
        ? "degraded"
        : "operational"
      : "degraded";
    return {
      id: "gpt",
      status,
      available: response.ok,
      configured: true,
      transport: "http_execute",
      reason: response.ok
        ? executePartial
          ? `Health OK, mas ha divergencia entre rotas de execucao. ${executeProbe.errors.join(" | ")}`
          : executeFailed
            ? executeProbe.errors.join(" | ")
            : "Backend principal respondeu ao healthcheck e as sondas de execucao."
        : payload?.error || `Healthcheck HTTP ${response.status}.`,
      model: payload?.model || config.model || null,
      details: {
        config: {
          baseUrl: config.baseUrlMeta?.value || config.baseUrl || null,
          host: config.baseUrlMeta?.host || null,
          origin: config.baseUrlMeta?.origin || null,
          path: config.baseUrlMeta?.pathname || null,
          baseUrlSource: config.baseUrlSource || null,
          sharedSecretSource: config.sharedSecretSource || null,
        },
        health: payload,
        executeProbe,
      },
      diagnostics: config.diagnostics,
    };
  } catch (error) {
    return {
      id: "gpt",
      status: "degraded",
      available: false,
      configured: true,
      transport: "http_execute",
      reason: error?.message || "Falha ao consultar /health do backend principal.",
      model: config.model || null,
      details: {
        config: {
          baseUrl: config.baseUrlMeta?.value || config.baseUrl || null,
          host: config.baseUrlMeta?.host || null,
          origin: config.baseUrlMeta?.origin || null,
          path: config.baseUrlMeta?.pathname || null,
          baseUrlSource: config.baseUrlSource || null,
          sharedSecretSource: config.sharedSecretSource || null,
        },
      },
      diagnostics: config.diagnostics,
    };
  }
}

async function probeCompatibleLlmProvider(id, config, transport) {
  if (!config.baseUrl) {
    return {
      id,
      status: "failed",
      available: false,
      configured: false,
      transport,
      reason: `Base URL ausente. Configure ${id === "local" ? "LOCAL_LLM_BASE_URL/LLM_BASE_URL/LAWDESK_CODE_API_BASE_URL/AICORE_API_BASE_URL/DOTOBOT_PYTHON_API_BASE" : "CUSTOM_LLM_BASE_URL/DOTOBOT_CUSTOM_LLM_BASE_URL"}.`,
      model: config.model || null,
      details: {
        config: {
          baseUrl: config.baseUrlMeta?.value || null,
          host: config.baseUrlMeta?.host || null,
          origin: config.baseUrlMeta?.origin || null,
          path: config.baseUrlMeta?.pathname || null,
          baseUrlSource: config.baseUrlSource || null,
        },
      },
      diagnostics: config.diagnostics,
    };
  }

  try {
    const probe = await probeCompatibleEndpoint(config.baseUrl, {
      apiKey: config.apiKey,
      authToken: config.authToken,
      model: config.model,
    });
    return {
      id,
      status: probe.ok ? "operational" : "degraded",
      available: probe.ok,
      configured: true,
      transport,
      reason: probe.ok ? probe.reason : probe.reason,
      model: probe.model || config.model || null,
      details: {
        config: {
          baseUrl: config.baseUrlMeta?.value || config.baseUrl || null,
          host: config.baseUrlMeta?.host || null,
          origin: config.baseUrlMeta?.origin || null,
          path: config.baseUrlMeta?.pathname || null,
          baseUrlSource: config.baseUrlSource || null,
        },
        probe: {
          mode: probe.mode,
          endpoint: probe.endpoint,
          status: probe.status,
          payload: probe.payload,
        },
      },
      diagnostics: config.diagnostics,
    };
  } catch (error) {
    return {
      id,
      status: "degraded",
      available: false,
      configured: true,
      transport,
      reason: error?.message || "Falha ao consultar /v1/messages.",
      model: config.model || null,
      details: {
        config: {
          baseUrl: config.baseUrlMeta?.value || config.baseUrl || null,
          host: config.baseUrlMeta?.host || null,
          origin: config.baseUrlMeta?.origin || null,
          path: config.baseUrlMeta?.pathname || null,
          baseUrlSource: config.baseUrlSource || null,
        },
      },
      diagnostics: config.diagnostics,
    };
  }
}

function probeCloudflareProvider(env = {}) {
  const config = getCloudflareWorkersConfig(env);
  if (isLawdeskOfflineMode(env)) {
    return {
      id: "cloudflare",
      status: "disabled",
      available: false,
      configured: Boolean(config.hasRuntimeBinding || config.enabledByFlag),
      transport: "workers_ai_direct",
      reason: "Modo offline ativo: Cloudflare Workers AI desabilitado.",
      model: config.model,
      diagnostics: config.diagnostics,
    };
  }
  const available = Boolean(config.hasRuntimeBinding || config.enabledByFlag);
  return {
    id: "cloudflare",
    status: available ? "operational" : "failed",
    available,
    configured: available,
    transport: "workers_ai_direct",
    reason: config.hasRuntimeBinding
      ? "Binding AI do Cloudflare disponível no runtime."
      : config.enabledByFlag
        ? "Flag do provider habilitada, aguardando binding AI no runtime."
        : "Binding AI do Cloudflare ausente.",
    model: config.model,
    diagnostics: config.diagnostics,
  };
}

export async function runLawdeskProvidersHealth(env = {}) {
  const offlineMode = isLawdeskOfflineMode(env);
  const catalog = listLawdeskProviders(env);
  const customConfig = getCustomLlmConfig(env);
  const [gpt, local, custom] = await Promise.all([
    probePrimaryBackend(env),
    probeCompatibleLlmProvider("local", getLocalLlmConfig(env), "local_llm_api"),
    offlineMode
      ? Promise.resolve({
          id: "custom",
          status: "disabled",
          available: false,
          configured: Boolean(customConfig.baseUrl),
          transport: "custom_llm_api",
          reason: "Modo offline ativo: endpoint custom desabilitado.",
          model: customConfig.model || null,
          diagnostics: customConfig.diagnostics,
        })
      : probeCompatibleLlmProvider("custom", customConfig, "custom_llm_api"),
  ]);
  const cloudflare = probeCloudflareProvider(env);
  const providers = [gpt, local, cloudflare, custom].map((item) => {
    const catalogEntry = catalog.find((entry) => entry.id === item.id) || {};
    return {
      ...catalogEntry,
      ...item,
    };
  });
  const operational = providers.filter((item) => item.status === "operational").length;
  const configured = providers.filter((item) => item.configured).length;
  const failed = providers.filter((item) => item.status === "failed").length;

  return {
    ok: operational > 0,
    status: operational > 0 ? "operational" : configured > 0 && failed < providers.length ? "degraded" : "failed",
    providers,
    offlineMode,
    summary: {
      total: providers.length,
      operational,
      configured,
      failed,
      defaultProvider: offlineMode ? "local" : providers.find((item) => item.id === "gpt")?.id || "gpt",
    },
  };
}
