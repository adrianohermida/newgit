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
  const requested =
    getClean(env.LAWDESK_DEFAULT_PROVIDER) ||
    getClean(env.DOTOBOT_DEFAULT_PROVIDER) ||
    getClean(env.NEXT_PUBLIC_LAWDESK_DEFAULT_PROVIDER) ||
    "gpt";
  return normalizeLawdeskProviderId(requested);
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

export function getPrimaryBackendConfig(env = {}) {
  return {
    baseUrl: getClean(env.PROCESS_AI_BASE) || getClean(env.LAWDESK_AI_BASE_URL) || null,
    sharedSecret: getClean(env.HMDAV_AI_SHARED_SECRET) || getClean(env.HMADV_AI_SHARED_SECRET) || getClean(env.LAWDESK_AI_SHARED_SECRET) || null,
    model: getClean(env.GPT_MODEL) || getClean(env.OPENAI_MODEL) || null,
  };
}

export function getSupabaseEdgeConfig(env = {}) {
  const explicit = getClean(env.DOTOBOT_SUPABASE_EDGE_URL) || getClean(env.LAWDESK_SUPABASE_EDGE_URL);
  const supabaseUrl = getClean(env.SUPABASE_URL);
  const functionName = getClean(env.DOTOBOT_SUPABASE_EDGE_FUNCTION) || getClean(env.LAWDESK_SUPABASE_EDGE_FUNCTION) || "dotobot-execute";
  return {
    baseUrl: explicit || (supabaseUrl ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/${functionName}` : null),
    apiKey:
      getClean(env.DOTOBOT_SUPABASE_EDGE_KEY) ||
      getClean(env.SUPABASE_SERVICE_ROLE_KEY) ||
      getClean(env.SUPABASE_ANON_KEY) ||
      null,
    sharedSecret: getClean(env.HMDAV_AI_SHARED_SECRET) || getClean(env.HMADV_AI_SHARED_SECRET) || getClean(env.LAWDESK_AI_SHARED_SECRET) || null,
  };
}

export function getLocalLlmConfig(env = {}) {
  return {
    baseUrl:
      getClean(env.LOCAL_LLM_BASE_URL) ||
      getClean(env.LLM_BASE_URL) ||
      getClean(env.LAWDESK_CODE_API_BASE_URL) ||
      null,
    apiKey: getClean(env.LOCAL_LLM_API_KEY) || getClean(env.LLM_API_KEY) || null,
    authToken: getClean(env.LOCAL_LLM_AUTH_TOKEN) || getClean(env.LLM_AUTH_TOKEN) || null,
    model: getClean(env.LOCAL_LLM_MODEL) || getClean(env.LLM_MODEL) || "default-model",
    maxTokens: Number.parseInt(getClean(env.LOCAL_LLM_MAX_TOKENS) || getClean(env.LLM_MAX_TOKENS) || "1400", 10) || 1400,
  };
}

export function getCustomLlmConfig(env = {}) {
  return {
    baseUrl: getClean(env.CUSTOM_LLM_BASE_URL) || getClean(env.DOTOBOT_CUSTOM_LLM_BASE_URL) || null,
    apiKey: getClean(env.CUSTOM_LLM_API_KEY) || getClean(env.DOTOBOT_CUSTOM_LLM_API_KEY) || null,
    authToken: getClean(env.CUSTOM_LLM_AUTH_TOKEN) || getClean(env.DOTOBOT_CUSTOM_LLM_AUTH_TOKEN) || null,
    model: getClean(env.CUSTOM_LLM_MODEL) || getClean(env.DOTOBOT_CUSTOM_LLM_MODEL) || "custom-model",
    maxTokens: Number.parseInt(getClean(env.CUSTOM_LLM_MAX_TOKENS) || "1400", 10) || 1400,
  };
}

export function getCloudflareWorkersConfig(env = {}) {
  return {
    model:
      getClean(env.CLOUDFLARE_WORKERS_AI_MODEL) ||
      getClean(env.CF_WORKERS_AI_MODEL) ||
      "@cf/meta/llama-3.1-8b-instruct",
    enabledByFlag: ["1", "true", "yes", "on"].includes(String(env.CLOUDFLARE_WORKERS_AI_ENABLED || "").trim().toLowerCase()),
    hasRuntimeBinding: Boolean(env?.AI && typeof env.AI.run === "function"),
  };
}

export function listLawdeskProviders(env = {}) {
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
      available: Boolean(primary.baseUrl || edge.baseUrl),
      configured: Boolean(primary.baseUrl || edge.baseUrl),
      model: primary.model || null,
      transport: "http_execute",
    },
    {
      id: "local",
      label: "LLM local",
      description: "Endpoint compatível com o runtime do ai-core via /v1/messages.",
      available: Boolean(local.baseUrl),
      configured: Boolean(local.baseUrl),
      model: local.model,
      transport: "local_llm_api",
    },
    {
      id: "cloudflare",
      label: "Cloudflare Workers AI",
      description: "Execução direta pelo binding AI do Cloudflare Workers.",
      available: Boolean(cloudflare.hasRuntimeBinding || cloudflare.enabledByFlag),
      configured: Boolean(cloudflare.hasRuntimeBinding || cloudflare.enabledByFlag),
      model: cloudflare.model,
      transport: "workers_ai_direct",
    },
    {
      id: "custom",
      label: "Endpoint custom",
      description: "Endpoint LLM adicional compatível com /v1/messages.",
      available: Boolean(custom.baseUrl),
      configured: Boolean(custom.baseUrl),
      model: custom.model,
      transport: "custom_llm_api",
    },
  ];
}

export function buildLawdeskExecutionPlan(env = {}, requestedProvider, options = {}) {
  const explicitSelection = typeof requestedProvider === "string" && requestedProvider.trim().length > 0;
  const provider = normalizeLawdeskProviderId(requestedProvider || "gpt");
  const primary = getPrimaryBackendConfig(env);
  const edge = getSupabaseEdgeConfig(env);
  const local = getLocalLlmConfig(env);
  const custom = getCustomLlmConfig(env);
  const cloudflare = getCloudflareWorkersConfig(env);
  const allowLegacyCloudflareFallback = options?.allowLegacyCloudflareFallback !== false;
  const plan = [];

  if (provider === "local") {
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
    if (!explicitSelection && allowLegacyCloudflareFallback && cloudflare.hasRuntimeBinding) {
      plan.push({ kind: "workers_ai_direct", provider: "cloudflare", config: cloudflare, fallback: true });
    }
  }

  return {
    requestedProvider: provider,
    explicitSelection,
    plan,
    providers: listLawdeskProviders(env),
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

async function probePrimaryBackend(env = {}) {
  const config = getPrimaryBackendConfig(env);
  if (!config.baseUrl) {
    return {
      id: "gpt",
      status: "failed",
      available: false,
      configured: false,
      transport: "http_execute",
      reason: "PROCESS_AI_BASE/LAWDESK_AI_BASE_URL ausente.",
      model: config.model || null,
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
    return {
      id: "gpt",
      status: response.ok ? "operational" : "degraded",
      available: response.ok,
      configured: true,
      transport: "http_execute",
      reason: response.ok ? "Backend principal respondeu ao healthcheck." : payload?.error || `Healthcheck HTTP ${response.status}.`,
      model: payload?.model || config.model || null,
      details: payload,
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
      reason: "Base URL ausente.",
      model: config.model || null,
    };
  }

  try {
    const response = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-llm-version": "2023-06-01",
        ...(config.apiKey ? { "x-api-key": config.apiKey } : {}),
        ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: Math.min(Number(config.maxTokens) || 64, 64),
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
    return {
      id,
      status: response.ok ? "operational" : "degraded",
      available: response.ok,
      configured: true,
      transport,
      reason: response.ok ? "Endpoint LLM respondeu ao probe /v1/messages." : payload?.error?.message || payload?.message || `Probe HTTP ${response.status}.`,
      model: payload?.model || config.model || null,
      details: payload,
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
    };
  }
}

function probeCloudflareProvider(env = {}) {
  const config = getCloudflareWorkersConfig(env);
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
  };
}

export async function runLawdeskProvidersHealth(env = {}) {
  const catalog = listLawdeskProviders(env);
  const [gpt, local, custom] = await Promise.all([
    probePrimaryBackend(env),
    probeCompatibleLlmProvider("local", getLocalLlmConfig(env), "local_llm_api"),
    probeCompatibleLlmProvider("custom", getCustomLlmConfig(env), "custom_llm_api"),
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
    summary: {
      operational,
      configured,
      failed,
      defaultProvider: providers.find((item) => item.id === "gpt")?.id || "gpt",
    },
  };
}
