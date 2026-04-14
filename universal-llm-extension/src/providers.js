const { getConfigs } = require("./storage");
const { jsonPost, probeJsonEndpoint, probeJsonGetEndpoint } = require("./http-client");
const { joinUrl, extractContent, buildProviderError } = require("./utils");
const { describeAttempt } = require("./provider-diagnostics");
const { buildProxyTargets, callProxyProvider } = require("./provider-proxy");

function isConnectionError(error) {
  const raw = String(error?.message || "").toLowerCase();
  return raw.includes("econnrefused") || raw.includes("socket hang up") || raw.includes("timeout");
}

// ─── Chamadas LLM ─────────────────────────────────────────────────────────────

async function callLocal(messages, model) {
  const configs = getConfigs();
  let lastError = null;
  for (const baseUrl of configs.local.candidates) {
    const target = joinUrl(baseUrl, "/v1/messages");
    try {
      const response = await jsonPost(target, { model, messages, max_tokens: 1400 });
      const content = extractContent(response.body);
      if (response.status >= 200 && response.status < 300 && content) {
        return { ok: true, provider: "local", model, content, target };
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
  throw lastError || new Error("Runtime local indisponivel.");
}

async function callCloud(messages, model) {
  const configs = getConfigs();
  if (configs.cloud.baseUrl) {
    const target = joinUrl(configs.cloud.baseUrl, "/v1/messages");
    const headers = configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {};
    const response = await jsonPost(target, { model, messages, max_tokens: 1400 }, headers);
    const content = extractContent(response.body);
    if (response.status >= 200 && response.status < 300 && content) {
      return { ok: true, provider: "cloud", model, content, target };
    }
    throw buildProviderError("Cloud", target, response);
  }
  if (!configs.cloud.appUrl) throw new Error("Provider cloud nao configurado. Defina a URL da API ou do proxy em Configuracoes.");
  const query = messages.map((item) => `[${item.role}] ${item.content}`).join("\n");
  const headers = configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {};
  const result = await callProxyProvider(configs.cloud.appUrl, { query, provider: "cloud", model }, headers, "Cloud proxy");
  return { ok: true, provider: "cloud", model, content: result.content, target: result.target };
}

async function callCloudflare(messages, model) {
  const configs = getConfigs();
  if (configs.cloudflare.accountId && configs.cloudflare.apiToken) {
    const target = `https://api.cloudflare.com/client/v4/accounts/${configs.cloudflare.accountId}/ai/run/${encodeURIComponent(model)}`;
    const response = await jsonPost(target, { messages }, { Authorization: `Bearer ${configs.cloudflare.apiToken}` });
    const content = extractContent(response.body?.result || response.body);
    if (response.status >= 200 && response.status < 300 && content) {
      return { ok: true, provider: "cloudflare", model, content, target };
    }
    throw buildProviderError("Cloudflare API", target, response);
  }
  if (!configs.cloudflare.appUrl) throw new Error("Provider cloudflare nao configurado. Defina Account ID + API Token ou URL do proxy em Configuracoes.");
  const query = messages.map((item) => `[${item.role}] ${item.content}`).join("\n");
  const headers = configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {};
  const result = await callProxyProvider(configs.cloudflare.appUrl, { query, provider: "cloudflare", model }, headers, "Cloudflare proxy");
  return { ok: true, provider: "cloudflare", model, content: result.content, target: result.target };
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
      url: `https://api.cloudflare.com/client/v4/accounts/${configs.cloudflare.accountId}/ai/run/${encodeURIComponent(configs.cloudflare.model)}`,
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
      attempts.push(describeAttempt(
        await probeJsonEndpoint(test.url, test.body, test.headers || {}, { timeoutMs: 8000 }),
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
  for (const baseUrl of configs.local.runtimeCatalogCandidates || []) {
    const tagsUrl = joinUrl(baseUrl, "/api/tags");
    try {
      const probe = await probeJsonGetEndpoint(tagsUrl, {}, { timeoutMs: 5000 });
      const models = Array.isArray(probe?.body?.models) ? probe.body.models : [];
      if (probe.ok && models.length === 0) {
        modelNotFoundAttempt.issue = "runtime_catalog_empty";
        modelNotFoundAttempt.summary = "O ai-core respondeu, mas o catalogo do runtime local esta vazio.";
        modelNotFoundAttempt.recommendation = "Suba ou carregue um modelo no runtime local (porta 11434) antes de usar o alias aetherlab-legal-local-v1.";
        modelNotFoundAttempt.runtimeCatalog = { url: tagsUrl, count: 0, models: [] };
        return;
      }
      if (probe.ok && models.length > 0) {
        modelNotFoundAttempt.runtimeCatalog = {
          url: tagsUrl,
          count: models.length,
          models: models.map((item) => item?.name || item?.model || item?.id || String(item)).filter(Boolean),
        };
        return;
      }
    } catch { /* ignora falha de catalogo */ }
  }
}

module.exports = {
  callLocal,
  callCloud,
  callCloudflare,
  diagnose,
};
