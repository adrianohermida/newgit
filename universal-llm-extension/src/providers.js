const { getConfigs } = require("./storage");
const { jsonPost, probeJsonEndpoint, probeJsonGetEndpoint } = require("./http-client");
const { joinUrl, extractContent, buildProviderError } = require("./utils");
const { describeAttempt } = require("./provider-diagnostics");
const { buildProxyTargets, callProxyProvider } = require("./provider-proxy");

function isConnectionError(error) {
  const raw = String(error?.message || "").toLowerCase();
  return raw.includes("econnrefused") || raw.includes("socket hang up") || raw.includes("timeout");
}

function buildCloudflareRunUrl(accountId, model) {
  const normalizedAccountId = String(accountId || "").trim();
  const normalizedModel = String(model || "").trim().replace(/^\/+/, "");
  return `https://api.cloudflare.com/client/v4/accounts/${normalizedAccountId}/ai/run/${normalizedModel}`;
}

function getRuntimeCatalogUrls(runtimeEndpoint) {
  const endpoint = String(runtimeEndpoint || "").trim();
  if (!endpoint) return [];
  const base = endpoint.replace(/\/v1\/chat\/completions$/i, "");
  return [
    { url: joinUrl(base, "/v1/models"), parser: "openai" },
    { url: joinUrl(base, "/api/tags"), parser: "ollama" },
  ];
}

function parseCatalogProbe(probe, parser) {
  if (!probe?.ok) return null;
  if (parser === "openai") {
    const models = Array.isArray(probe?.body?.data) ? probe.body.data : null;
    return Array.isArray(models)
      ? models.map((item) => item?.id || item?.model || item?.name || null).filter(Boolean)
      : [];
  }
  const models = Array.isArray(probe?.body?.models) ? probe.body.models : null;
  return Array.isArray(models)
    ? models.map((item) => item?.name || item?.model || item?.id || null).filter(Boolean)
    : [];
}

// ─── Chamadas LLM ─────────────────────────────────────────────────────────────

async function callLocal(messages, model, options = {}) {
  const configs = getConfigs();
  let lastError = null;
  for (const baseUrl of configs.local.candidates) {
    const target = joinUrl(baseUrl, "/v1/messages");
    const attempts = buildLocalAttempts(messages, options);
    for (let index = 0; index < attempts.length; index += 1) {
      const attempt = attempts[index];
      try {
        const response = await jsonPost(
          target,
          {
            model,
            messages: attempt.messages,
            max_tokens: attempt.maxTokens,
            sessionId: options.sessionId || null,
            session_id: options.sessionId || null,
            context: attempt.context,
          },
          {},
          { timeoutMs: attempt.timeoutMs },
        );
        const degraded = Boolean(response.body?.metadata?.degraded);
        const content = degraded
          ? sanitizeLocalFallbackContent(extractContent(response.body))
          : extractContent(response.body);
        if (response.status >= 200 && response.status < 300 && content) {
          return {
            ok: true,
            provider: "local",
            model,
            content,
            target,
            metadata: {
              ...(response.body?.metadata || {}),
              retryCount: index,
              retryProfile: attempt.profile,
            },
            degraded,
          };
        }
        lastError = buildProviderError("ai-core", target, response);
        lastError.provider = "local";
        lastError.target = target;
        lastError.responseStatus = response.status;
        lastError.responseBody = response.body;
        if (!isConnectionError(lastError)) break;
      } catch (error) {
        lastError = error;
        if (!isConnectionError(error)) break;
      }
    }
    if (!isConnectionError(lastError)) break;
  }
  throw lastError || new Error("Runtime local indisponivel.");
}

function buildLocalAttempts(messages, options = {}) {
  const primaryContext = options.context || null;
  return [
    {
      profile: "fast_primary",
      messages: trimLocalMessages(messages),
      maxTokens: 80,
      timeoutMs: 50000,
      context: { ...(primaryContext || {}), retry_profile: "fast_primary", compact_context: true },
    },
  ];
}

function trimLocalMessages(messages) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const tail = safeMessages.slice(-4);
  const lastUser = [...safeMessages].reverse().find((item) => item?.role === "user");
  if (lastUser && !tail.includes(lastUser)) return [...tail.slice(-3), lastUser];
  return tail.length ? tail : safeMessages.slice(-1);
}

function sanitizeLocalFallbackContent(content) {
  const text = String(content || "").trim();
  if (!text) return text;
  const [head] = text.split(/\n\s*Contexto local recuperado:/i);
  const cleaned = head.trim();
  return `${cleaned}\n\nResumo: usei memoria local de apoio, mas nao vou despejar trechos crus aqui. Posso seguir com uma resposta curta, perguntas objetivas ou um proximo passo operacional.`.trim();
}

async function callCloud(messages, model) {
  const configs = getConfigs();
  let directError = null;
  if (configs.cloud.baseUrl) {
    const target = joinUrl(configs.cloud.baseUrl, "/v1/messages");
    const headers = configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {};
    const response = await jsonPost(target, { model, messages, max_tokens: 1400 }, headers);
    const content = extractContent(response.body);
    if (response.status >= 200 && response.status < 300 && content) {
      return { ok: true, provider: "cloud", model, content, target };
    }
    directError = buildProviderError("Cloud", target, response);
  }
  if (!configs.cloud.appUrl) throw directError || new Error("Provider cloud nao configurado. Defina a URL da API ou do proxy em Configuracoes.");
  const query = messages.map((item) => `[${item.role}] ${item.content}`).join("\n");
  const headers = configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {};
  try {
    const result = await callProxyProvider(configs.cloud.appUrl, { query, provider: "cloud", model }, headers, "Cloud proxy");
    return { ok: true, provider: "cloud", model, content: result.content, target: result.target };
  } catch (proxyError) {
    throw directError || proxyError;
  }
}

async function callCloudflare(messages, model) {
  const configs = getConfigs();
  let directError = null;
  if (configs.cloudflare.accountId && configs.cloudflare.apiToken) {
    const target = buildCloudflareRunUrl(configs.cloudflare.accountId, model);
    const response = await jsonPost(target, { messages }, { Authorization: `Bearer ${configs.cloudflare.apiToken}` });
    const content = extractContent(response.body?.result || response.body);
    if (response.status >= 200 && response.status < 300 && content) {
      return { ok: true, provider: "cloudflare", model, content, target };
    }
    directError = buildProviderError("Cloudflare API", target, response);
  }
  if (!configs.cloudflare.appUrl) throw directError || new Error("Provider cloudflare nao configurado. Defina Account ID + API Token ou URL do proxy em Configuracoes.");
  const query = messages.map((item) => `[${item.role}] ${item.content}`).join("\n");
  const headers = configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {};
  try {
    const result = await callProxyProvider(configs.cloudflare.appUrl, { query, provider: "cloudflare", model }, headers, "Cloudflare proxy");
    return { ok: true, provider: "cloudflare", model, content: result.content, target: result.target };
  } catch (proxyError) {
    throw directError || proxyError;
  }
}

// ─── Diagnóstico ──────────────────────────────────────────────────────────────

function buildCloudTests(configs) {
  const tests = [];
  if (configs.cloud.baseUrl) {
    tests.push({
      url: joinUrl(configs.cloud.baseUrl, "/v1/messages"),
      body: { model: configs.cloud.model, max_tokens: 8, messages: [{ role: "user", content: "OK" }] },
      headers: configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {},
      isConfigured: true,
      hint: "URL direta da API cloud. Verifique modelo e token.",
    });
  }
  if (configs.cloud.appUrl) {
    buildProxyTargets(configs.cloud.appUrl, "/api/admin-lawdesk-chat",
      "Rota proxy admin. Exige token Bearer de sessao administrativa valida."
    ).forEach((target) => tests.push({
      url: target.url,
      body: { query: "Responda com OK", provider: "cloud", model: configs.cloud.model },
      headers: configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {},
      hint: target.hint,
      isConfigured: target.isConfigured,
    }));
  }
  return tests;
}

function buildCloudflareTests(configs) {
  const tests = [];
  if (configs.cloudflare.accountId && configs.cloudflare.apiToken) {
    tests.push({
      url: buildCloudflareRunUrl(configs.cloudflare.accountId, configs.cloudflare.model),
      body: { messages: [{ role: "user", content: "OK" }] },
      headers: { Authorization: `Bearer ${configs.cloudflare.apiToken}` },
      isConfigured: true,
      hint: "API direta Cloudflare Workers AI.",
    });
  }
  if (configs.cloudflare.appUrl) {
    buildProxyTargets(configs.cloudflare.appUrl, "/api/admin-lawdesk-chat",
      "Sem Account ID/API Token, usa proxy admin. Exige token Bearer."
    ).forEach((target) => tests.push({
      url: target.url,
      body: { query: "Responda com OK", provider: "cloudflare", model: configs.cloudflare.model },
      headers: configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {},
      hint: target.hint,
      isConfigured: target.isConfigured,
    }));
  }
  return tests;
}

function notConfiguredResult(provider, configs, reason) {
  return {
    ok: false,
    provider,
    issue: "not_configured",
    message: reason,
    configuredUrl: null,
    model: configs[provider]?.model || null,
    attempts: [],
    recommendation: provider === "cloudflare"
      ? "Preencha Account ID e API Token do Cloudflare Workers AI em Configuracoes."
      : "Preencha a URL direta da API cloud ou o token Bearer do proxy em Configuracoes.",
  };
}

async function diagnose(provider) {
  const configs = getConfigs();

  const testsMap = {
    local: configs.local.candidates.map((baseUrl) => ({
      url: joinUrl(baseUrl, "/v1/messages"),
      body: { model: configs.local.model, max_tokens: 8, messages: [{ role: "user", content: "OK" }] },
      model: configs.local.model,
      isConfigured: true,
      hint: "Confirme se o ai-core esta rodando e se a URL aponta para /v1/messages.",
    })),
    cloud: buildCloudTests(configs),
    cloudflare: buildCloudflareTests(configs),
  };

  const tests = testsMap[provider] || [];

  if (!tests.length) {
    if (provider === "cloud") return notConfiguredResult("cloud", configs, "Nenhuma URL de API ou proxy cloud configurada.");
    if (provider === "cloudflare") return notConfiguredResult("cloudflare", configs, "Nenhuma credencial Cloudflare ou URL de proxy configurada.");
    return { ok: false, provider, issue: "not_configured", message: `Provider ${provider} desconhecido.`, attempts: [] };
  }

  const attempts = [];
  for (const test of tests) {
    try {
      const timeoutMs = provider === "local" ? 20000 : 8000;
      attempts.push(describeAttempt(
        await probeJsonEndpoint(test.url, test.body, test.headers || {}, { timeoutMs }),
        test.hint,
      ));
    } catch (error) {
      attempts.push(describeAttempt({ ok: false, url: test.url, error: error?.message || "Falha de conexao." }, test.hint));
    }
  }

  if (provider === "local") await enrichLocalCatalogDiagnosis(configs, attempts);

  const success = attempts.find((item) => item.ok);
  const configuredAttempt = attempts.find((item) => tests.find((test) => test.url === item.url)?.isConfigured);
  const reachableAlternative = attempts.find((item) => item.url !== configuredAttempt?.url && (item.ok || item.status));

  if (success) {
    const portMismatch = configuredAttempt && success.url !== configuredAttempt.url;
    return {
      ok: true,
      provider,
      issue: portMismatch ? "port_mismatch" : null,
      message: portMismatch ? `Conexao ${provider} confirmada em porta alternativa.` : `Conexao ${provider} confirmada.`,
      activeUrl: success.url,
      configuredUrl: configuredAttempt?.url || tests[0]?.url || null,
      recommendedUrl: portMismatch ? success.url : null,
      model: configs[provider]?.model,
      attempts,
    };
  }

  if (configuredAttempt?.issue === "service_offline" && reachableAlternative) {
    return {
      ok: false,
      provider,
      issue: "port_mismatch",
      message: `O provider ${provider} nao respondeu na URL configurada, mas existe um proxy em outra porta.`,
      configuredUrl: configuredAttempt.url,
      recommendedUrl: reachableAlternative.url,
      model: configs[provider]?.model,
      attempts,
    };
  }

  return {
    ok: false,
    provider,
    issue: attempts[0]?.issue || "unreachable",
    message: `Nao foi possivel conectar ao provider ${provider}.`,
    configuredUrl: tests[0]?.url || null,
    model: configs[provider]?.model,
    attempts,
  };
}

async function enrichLocalCatalogDiagnosis(configs, attempts) {
  const modelNotFoundAttempt = attempts.find((item) => item.issue === "model_not_found");
  if (!modelNotFoundAttempt) return;
  let runtimeCatalogUrls = [];
  const aiCoreAttempt = attempts.find((item) => item.url === joinUrl(configs.local.candidates[0], "/v1/messages"));
  if (aiCoreAttempt) {
    const healthInsight = await readAiCoreLocalInsight(configs.local.candidates);
    if (healthInsight?.providerDiagnostics) {
      modelNotFoundAttempt.aiCoreDiagnostics = healthInsight.providerDiagnostics;
      const runtimeEndpoint = String(healthInsight.providerDiagnostics.transport_endpoint || "").trim();
      if (runtimeEndpoint) {
        modelNotFoundAttempt.runtimeEndpoint = runtimeEndpoint;
        runtimeCatalogUrls = getRuntimeCatalogUrls(runtimeEndpoint);
      }
      if (healthInsight.issue === "runtime_model_unavailable") {
        modelNotFoundAttempt.issue = "runtime_model_unavailable";
        modelNotFoundAttempt.summary = "O ai-core esta online, mas o runtime local por tras dele nao tem um modelo carregado que responda ao alias configurado.";
        modelNotFoundAttempt.recommendation = `Revise o runtime local apontado pelo ai-core (${runtimeEndpoint || "endpoint nao informado"}) e carregue o modelo/alias esperado, ou ajuste LOCAL_LLM_MODEL para um modelo realmente disponivel.`;
      }
      if (healthInsight.issue === "runtime_catalog_invalid") {
        modelNotFoundAttempt.issue = "runtime_catalog_invalid";
        modelNotFoundAttempt.summary = "O ai-core encontrou o runtime local, mas o catalogo publicado por ele esta invalido ou vazio.";
        modelNotFoundAttempt.recommendation = `Corrija o runtime local apontado pelo ai-core (${runtimeEndpoint || "endpoint nao informado"}) para responder um catalogo valido do modelo antes de usar o chat local.`;
      }
    }
  }
  const fallbackCatalogUrls = (configs.local.runtimeCatalogCandidates || []).flatMap((baseUrl) => ([
    { url: joinUrl(baseUrl, "/v1/models"), parser: "openai" },
    { url: joinUrl(baseUrl, "/api/tags"), parser: "ollama" },
  ]));
  const catalogTargets = [...runtimeCatalogUrls, ...fallbackCatalogUrls]
    .filter((item, index, list) => item?.url && list.findIndex((entry) => entry.url === item.url) === index);
  for (const target of catalogTargets) {
    try {
      const probe = await probeJsonGetEndpoint(target.url, {}, { timeoutMs: 5000 });
      const models = parseCatalogProbe(probe, target.parser);
      if (probe.ok && models && models.length === 0) {
        modelNotFoundAttempt.issue = "runtime_catalog_empty";
        modelNotFoundAttempt.summary = "O ai-core respondeu, mas o catalogo do runtime local esta vazio.";
        modelNotFoundAttempt.recommendation = `Suba ou carregue um modelo no runtime local (${target.url}) antes de usar o alias ${configs.local.model}.`;
        modelNotFoundAttempt.runtimeCatalog = { url: target.url, count: 0, models: [] };
        return;
      }
      if (probe.ok && models && models.length > 0) {
        modelNotFoundAttempt.runtimeCatalog = {
          url: target.url,
          count: models.length,
          models,
        };
        return;
      }
    } catch { /* ignora falha de catalogo */ }
  }
}

async function readAiCoreLocalInsight(candidates) {
  for (const baseUrl of candidates || []) {
    try {
      const probe = await probeJsonGetEndpoint(joinUrl(baseUrl, "/health"), {}, { timeoutMs: 5000 });
      const providerDiagnostics = probe?.body?.providers?.local?.diagnostics;
      if (!providerDiagnostics || !probe.ok) continue;
      const transportEndpoint = String(providerDiagnostics.transport_endpoint || "");
      const resolvedModel = String(providerDiagnostics.resolved_model || providerDiagnostics.model || "").trim();
      const runtimeModelsProbe = transportEndpoint.includes("/v1/chat/completions")
        ? await probeJsonGetEndpoint(joinUrl(transportEndpoint.replace(/\/v1\/chat\/completions$/i, ""), "/v1/models"), {}, { timeoutMs: 5000 }).catch(() => null)
        : null;
      const models = Array.isArray(runtimeModelsProbe?.body?.data) ? runtimeModelsProbe.body.data : null;
      if (runtimeModelsProbe?.ok && (!Array.isArray(models) || models.length === 0)) {
        return {
          issue: "runtime_catalog_invalid",
          providerDiagnostics,
          runtimeModels: {
            url: joinUrl(transportEndpoint.replace(/\/v1\/chat\/completions$/i, ""), "/v1/models"),
            payload: runtimeModelsProbe.body,
          },
        };
      }
      if (runtimeModelsProbe?.ok && Array.isArray(models) && models.length > 0) {
        const availableModels = models
          .map((item) => item?.id || item?.model || item?.name || null)
          .filter(Boolean);
        if (resolvedModel && !availableModels.includes(resolvedModel)) {
          return {
            issue: "runtime_model_unavailable",
            providerDiagnostics,
            runtimeModels: {
              url: joinUrl(transportEndpoint.replace(/\/v1\/chat\/completions$/i, ""), "/v1/models"),
              count: availableModels.length,
              models: availableModels,
            },
          };
        }
      }
      return { issue: null, providerDiagnostics };
    } catch {
      // ignora health auxiliar
    }
  }
  return null;
}

module.exports = {
  callLocal,
  callCloud,
  callCloudflare,
  diagnose,
};
