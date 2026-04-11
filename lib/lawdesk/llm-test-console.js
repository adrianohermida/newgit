function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function stringifyDiagnostic(value, limit = 12000) {
  if (value == null || value === "") return "";
  let text = "";
  try {
    text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function classifyLlmTestError(message = "") {
  const text = safeText(message).toLowerCase();
  if (!text) return "unknown";
  if (text.includes("nao esta configurado") || text.includes("not configured") || text.includes("ausente")) return "configuration";
  if (text.includes("auth") || text.includes("unauthorized") || text.includes("forbidden") || text.includes("secret")) return "authentication";
  if (text.includes("timeout") || text.includes("aborterror")) return "timeout";
  if (text.includes("429") || text.includes("rate limit")) return "rate_limit";
  if (text.includes("resource limits")) return "resource_limits";
  if (text.includes("requested function was not found") || text.includes("function was not found")) return "missing_function";
  if (text.includes("schema") || text.includes("pgrst") || text.includes("postgrest")) return "schema";
  return "execution";
}

export function inferLlmTestRecommendations(errorMessage = "", context = {}) {
  const errorType = classifyLlmTestError(errorMessage);
  const recommendations = [];
  const providersHealth = context?.providersHealth || null;
  const ragHealth = context?.ragHealth || null;
  const selectedProvider = safeText(context?.provider);
  const providerCatalog = Array.isArray(context?.providerCatalog) ? context.providerCatalog : [];

  if (errorType === "missing_function") {
    recommendations.push("Verifique se a function ou rota administrativa esperada existe no backend selecionado e se o deploy publicado esta atualizado.");
    recommendations.push("Revise o endpoint chamado por `/api/admin-lawdesk-chat` e o provider `gpt` para confirmar se a execucao existe em `/execute` ou `/v1/execute`.");
  }
  if (errorType === "configuration") {
    recommendations.push("Confirme se o provider selecionado esta configurado com `baseUrl`, secrets e model no servidor.");
    if (selectedProvider === "custom") {
      recommendations.push("Para `custom`, valide `CUSTOM_LLM_BASE_URL` ou `DOTOBOT_CUSTOM_LLM_BASE_URL`, alem de `CUSTOM_LLM_MODEL`, `CUSTOM_LLM_API_KEY` e `CUSTOM_LLM_AUTH_TOKEN`.");
    }
    if (selectedProvider === "local") {
      recommendations.push("Para `local`, valide `LOCAL_LLM_BASE_URL` ou `LLM_BASE_URL`, e revise `LOCAL_LLM_MODEL`, `LOCAL_LLM_API_KEY` e `LOCAL_LLM_AUTH_TOKEN`.");
    }
    if (selectedProvider === "cloudflare") {
      recommendations.push("Para `cloudflare`, confirme `CLOUDFLARE_WORKERS_AI_ENABLED` e o binding `AI` no runtime do worker.");
    }
    if (selectedProvider === "gpt") {
      recommendations.push("Para `gpt`, confirme `PROCESS_AI_BASE` ou `LAWDESK_AI_BASE_URL` e verifique se o backend remoto expoe `/execute` ou `/v1/execute`.");
    }
  }
  if (errorType === "authentication") {
    recommendations.push("Revise secrets compartilhadas, tokens Bearer e service role keys entre app, functions e providers.");
  }
  if (errorType === "schema") {
    recommendations.push("Audite schema cache, RPCs e contratos Supabase e PostgREST antes de repetir o teste.");
  }
  if (errorType === "timeout") {
    recommendations.push("Meca a latencia do provider e reduza carga e contexto para diferenciar timeout de indisponibilidade.");
  }

  const providerEntry = Array.isArray(providersHealth?.providers)
    ? providersHealth.providers.find((item) => item?.id === selectedProvider)
    : null;
  if (!providerCatalog.length) {
    recommendations.push("O catalogo de providers nao foi carregado no dashboard. Revise `/api/admin-lawdesk-providers`, autenticacao admin e falhas de carregamento da tela.");
  }
  if (providerEntry?.status && providerEntry.status !== "operational") {
    recommendations.push(`O provider ${selectedProvider} ja aparece como ${providerEntry.status} no healthcheck. Corrija essa camada antes de insistir no smoke test.`);
  }
  if (ragHealth?.status === "failed") {
    recommendations.push("O RAG esta falhando no healthcheck; revise embedding, consulta vetorial, persistencia e fallback Obsidian.");
  }

  return Array.from(new Set(recommendations)).slice(0, 8);
}

export function buildTechnicalDebugger({
  errorMessage = "",
  provider = "",
  providerLabel = "",
  durationMs = null,
  request = null,
  providersHealth = null,
  ragHealth = null,
  providerCatalog = [],
  route = "/llm-test",
}) {
  const errorType = classifyLlmTestError(errorMessage);
  const providerEntry = (Array.isArray(providerCatalog) ? providerCatalog : []).find((item) => item?.id === provider) || null;
  const providerHealth = Array.isArray(providersHealth?.providers)
    ? providersHealth.providers.find((item) => item?.id === provider) || null
    : null;
  const expectedEnvByProvider = {
    gpt: ["PROCESS_AI_BASE", "LAWDESK_AI_BASE_URL", "HMDAV_AI_SHARED_SECRET"],
    local: ["LOCAL_LLM_BASE_URL", "LLM_BASE_URL", "LOCAL_LLM_MODEL", "LOCAL_LLM_API_KEY", "LOCAL_LLM_AUTH_TOKEN"],
    cloudflare: ["CLOUDFLARE_WORKERS_AI_ENABLED", "CLOUDFLARE_WORKERS_AI_MODEL", "AI runtime binding"],
    custom: ["CUSTOM_LLM_BASE_URL", "DOTOBOT_CUSTOM_LLM_BASE_URL", "CUSTOM_LLM_MODEL", "CUSTOM_LLM_API_KEY", "CUSTOM_LLM_AUTH_TOKEN"],
  };

  return buildDiagnosticReport({
    title: "Debugger técnico completo",
    summary: `Falha classificada como ${errorType}.`,
    sections: [
      {
        label: "diagnostico",
        value: {
          provider,
          providerLabel,
          errorType,
          durationMs,
          route,
        },
      },
      {
        label: "request_contract",
        value: {
          endpoint: "/api/admin-lawdesk-chat",
          route,
          payload: request,
        },
      },
      {
        label: "provider_catalog",
        value: providerEntry || {
          loaded: Array.isArray(providerCatalog) && providerCatalog.length > 0,
          providerFound: false,
        },
      },
      {
        label: "provider_health",
        value: providerHealth || providersHealth || {
          loaded: false,
          reason: "Health de providers indisponivel no momento.",
        },
      },
      {
        label: "expected_env",
        value: expectedEnvByProvider[provider] || [],
      },
      {
        label: "rag_health",
        value: ragHealth,
      },
      {
        label: "security_and_persistence",
        value: {
          authHints: ragHealth?.signals || null,
          persistence: ragHealth?.report?.supabaseMemoryPersist || ragHealth?.report?.obsidian || null,
          supabaseEmbedding: ragHealth?.report?.supabaseEmbedding || null,
          vectorQuery: ragHealth?.report?.supabaseQuery || null,
        },
      },
      {
        label: "schema_and_function_hints",
        value: {
          errorMessage,
          likelyMissingFunction: errorType === "missing_function",
          likelySchemaIssue: errorType === "schema",
          likelyConfigurationIssue: errorType === "configuration",
        },
      },
      {
        label: "recommendations",
        value: inferLlmTestRecommendations(errorMessage, {
          provider,
          providersHealth,
          ragHealth,
          providerCatalog,
        }),
      },
    ],
  });
}

export function buildProviderDebugMatrix({
  providerCatalog = [],
  providersHealth = null,
  results = [],
}) {
  const healthProviders = Array.isArray(providersHealth?.providers) ? providersHealth.providers : [];
  const expectedEnvByProvider = {
    gpt: ["PROCESS_AI_BASE", "LAWDESK_AI_BASE_URL", "HMDAV_AI_SHARED_SECRET"],
    local: ["LOCAL_LLM_BASE_URL", "LLM_BASE_URL", "LOCAL_LLM_MODEL", "LOCAL_LLM_API_KEY", "LOCAL_LLM_AUTH_TOKEN"],
    cloudflare: ["CLOUDFLARE_WORKERS_AI_ENABLED", "CLOUDFLARE_WORKERS_AI_MODEL", "AI runtime binding"],
    custom: ["CUSTOM_LLM_BASE_URL", "DOTOBOT_CUSTOM_LLM_BASE_URL", "CUSTOM_LLM_MODEL", "CUSTOM_LLM_API_KEY", "CUSTOM_LLM_AUTH_TOKEN"],
  };

  return (Array.isArray(providerCatalog) ? providerCatalog : []).map((provider) => {
    const health = healthProviders.find((item) => item?.id === provider?.id) || null;
    const latestResult = (Array.isArray(results) ? results : []).find((item) => item?.provider === provider?.id) || null;
    const failureReason = latestResult?.error || health?.reason || "";
    const errorType = latestResult?.errorType || classifyLlmTestError(failureReason);
    const recommendations = inferLlmTestRecommendations(failureReason, {
      provider: provider?.id,
      providersHealth,
      ragHealth: null,
      providerCatalog,
    });

    return {
      id: provider?.id || "unknown",
      label: provider?.label || provider?.id || "Provider",
      model: provider?.model || health?.model || latestResult?.model || null,
      configured: Boolean(provider?.configured ?? provider?.available),
      available: Boolean(provider?.available),
      healthStatus: health?.status || (provider?.available ? "operational" : "failed"),
      transport: provider?.transport || health?.transport || null,
      latestResultStatus: latestResult?.status || null,
      latestSource: latestResult?.source || null,
      latestDurationMs: latestResult?.durationMs || null,
      errorType,
      failureReason,
      recommendations,
      diagnostics: health?.diagnostics || provider?.diagnostics || null,
      expectedEnv: expectedEnvByProvider[provider?.id] || [],
      catalogLoaded: Array.isArray(providerCatalog) && providerCatalog.length > 0,
      executeProbeOk: health?.details?.executeProbe?.ok ?? null,
      executeProbeRoute: health?.details?.executeProbe?.route || null,
      executeProbeErrors: Array.isArray(health?.details?.executeProbe?.errors) ? health.details.executeProbe.errors : [],
    };
  });
}

export function buildDiagnosticReport({ title, summary = "", sections = [] }) {
  return [
    title ? `# ${title}` : "",
    summary ? safeText(summary) : "",
    ...sections
      .filter((section) => section?.value !== undefined && section?.value !== null && section?.value !== "")
      .map((section) => `${section.label}:\n${stringifyDiagnostic(section.value)}`),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export function filterLlmTestActivityEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) =>
      entry?.module === "llm-test" ||
      entry?.component === "LLMTestChat" ||
      entry?.page === "/llm-test" ||
      entry?.path === "/api/admin-lawdesk-chat"
    )
    .sort((left, right) => Date.parse(right?.createdAt || 0) - Date.parse(left?.createdAt || 0));
}

export function applyLlmTestConsoleFilters(entries = [], filters = {}) {
  const provider = safeText(filters?.provider).toLowerCase();
  const status = safeText(filters?.status).toLowerCase();
  const source = safeText(filters?.source).toLowerCase();

  return (Array.isArray(entries) ? entries : []).filter((entry) => {
    const entryProvider = safeText(entry?.provider).toLowerCase();
    const entryStatus = safeText(entry?.status).toLowerCase();
    const entrySource = safeText(entry?.source).toLowerCase();

    if (provider && entryProvider !== provider) return false;
    if (status && entryStatus !== status) return false;
    if (source && entrySource !== source) return false;
    return true;
  });
}

export function buildLlmTestResultRecord({
  provider,
  providerLabel,
  responseData = {},
  createdAt,
  error = "",
  durationMs = null,
}) {
  const telemetry = Array.isArray(responseData?.telemetry) ? responseData.telemetry : [];
  const logs = Array.isArray(responseData?.logs) ? responseData.logs : [];
  const steps = Array.isArray(responseData?.steps) ? responseData.steps : [];
  const errors = Array.isArray(responseData?.errors) ? responseData.errors : [];

  return {
    id: `${Date.now()}_${provider}`,
    provider,
    providerLabel,
    status: error ? "error" : responseData?.status || "ok",
    source: responseData?._metadata?.source || responseData?._metadata?.provider || null,
    model: responseData?._metadata?.model || null,
    text: responseData?.resultText || responseData?.result?.message || "Sem resposta textual.",
    error: safeText(error),
    createdAt: createdAt || new Date().toISOString(),
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
    telemetry,
    logs,
    steps,
    errors,
    rag: responseData?.rag || null,
    errorType: error ? classifyLlmTestError(error) : "",
  };
}

export function buildLlmTestTimeline(result = {}) {
  const timeline = [];
  if (result.providerLabel || result.provider) {
    timeline.push({
      tone: "info",
      label: "Provider selecionado",
      value: `${result.providerLabel || result.provider}${result.source ? ` -> ${result.source}` : ""}`,
    });
  }
  if (result.model) {
    timeline.push({ tone: "info", label: "Modelo", value: result.model });
  }
  if (Number.isFinite(Number(result.durationMs))) {
    timeline.push({ tone: "info", label: "Duracao", value: `${Math.round(Number(result.durationMs))} ms` });
  }

  (Array.isArray(result.telemetry) ? result.telemetry : []).forEach((item) => {
    const event = safeText(item?.event, "telemetry");
    const payload = Object.fromEntries(
      Object.entries(item || {}).filter(([key]) => key !== "event" && key !== "timestamp")
    );
    timeline.push({
      tone: item?.status === "error" ? "error" : event.includes("rag") ? "warn" : "info",
      label: event,
      value: stringifyDiagnostic(payload, 1200) || "Sem detalhes.",
    });
  });

  (Array.isArray(result.logs) ? result.logs : []).forEach((item, index) => {
    timeline.push({
      tone: "info",
      label: `backend_log_${index + 1}`,
      value: stringifyDiagnostic(item, 1200),
    });
  });

  (Array.isArray(result.errors) ? result.errors : []).forEach((item, index) => {
    timeline.push({
      tone: "error",
      label: `backend_error_${index + 1}`,
      value: safeText(item),
    });
  });

  if (result.error) {
    timeline.push({
      tone: "error",
      label: `Falha da execucao (${result.errorType || classifyLlmTestError(result.error)})`,
      value: safeText(result.error),
    });
  }

  return timeline;
}
