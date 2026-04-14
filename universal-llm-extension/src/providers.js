const { getConfigs } = require("./storage");
const { jsonPost, probeJsonEndpoint } = require("./http-client");
const { joinUrl, extractContent, buildProviderError } = require("./utils");
const { describeAttempt } = require("./provider-diagnostics");
const { buildProxyTargets, callProxyProvider } = require("./provider-proxy");

async function callLocal(messages, model) {
  const configs = getConfigs();
  let lastError = null;
  for (const baseUrl of configs.local.candidates) {
    const target = joinUrl(baseUrl, "/v1/messages");
    try {
      const response = await jsonPost(target, { model, messages, max_tokens: 1400 });
      const content = extractContent(response.body);
      if (response.status >= 200 && response.status < 300 && content) return { ok: true, provider: "local", model, content, target };
      lastError = buildProviderError("ai-core", target, response);
    } catch (error) {
      lastError = error;
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
    if (response.status >= 200 && response.status < 300 && content) return { ok: true, provider: "cloud", model, content, target };
    throw buildProviderError("Cloud", target, response);
  }
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
    if (response.status >= 200 && response.status < 300 && content) return { ok: true, provider: "cloudflare", model, content, target };
    throw buildProviderError("Cloudflare API", target, response);
  }
  const query = messages.map((item) => `[${item.role}] ${item.content}`).join("\n");
  const headers = configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {};
  const result = await callProxyProvider(configs.cloudflare.appUrl, { query, provider: "cloudflare", model }, headers, "Cloudflare proxy");
  return { ok: true, provider: "cloudflare", model, content: result.content, target: result.target };
}

async function diagnose(provider) {
  const configs = getConfigs();
  const attempts = [];
  const tests = {
    local: configs.local.candidates.map((baseUrl) => ({
      url: joinUrl(baseUrl, "/v1/messages"),
      body: { model: configs.local.model, max_tokens: 8, messages: [{ role: "user", content: "OK" }] },
      model: configs.local.model,
      hint: "Confirme se o ai-core esta rodando e se a URL aponta para uma API JSON /v1/messages.",
    })),
    cloud: [
      ...(configs.cloud.baseUrl ? [{
        url: joinUrl(configs.cloud.baseUrl, "/v1/messages"),
        body: { model: configs.cloud.model, max_tokens: 8, messages: [{ role: "user", content: "OK" }] },
        headers: configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {},
      }] : []),
      ...buildProxyTargets(
        configs.cloud.appUrl,
        "/api/admin-lawdesk-chat",
        "Essa rota exige token administrativo Bearer de uma sessao admin valida."
      ).map((target) => ({
        url: target.url,
        body: { query: "Responda com OK", provider: "cloud", model: configs.cloud.model },
        headers: configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {},
        hint: target.hint,
        isConfigured: target.isConfigured,
      })),
    ],
    cloudflare: [
      ...((configs.cloudflare.accountId && configs.cloudflare.apiToken) ? [{
        url: `https://api.cloudflare.com/client/v4/accounts/${configs.cloudflare.accountId}/ai/run/${encodeURIComponent(configs.cloudflare.model)}`,
        body: { messages: [{ role: "user", content: "OK" }] },
        headers: { Authorization: `Bearer ${configs.cloudflare.apiToken}` },
      }] : []),
      ...buildProxyTargets(
        configs.cloudflare.appUrl,
        "/api/admin-lawdesk-chat",
        "Sem Account ID/API Token, o fallback usa o proxy admin e exige token Bearer."
      ).map((target) => ({
        url: target.url,
        body: { query: "Responda com OK", provider: "cloudflare", model: configs.cloudflare.model },
        headers: configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {},
        hint: target.hint,
        isConfigured: target.isConfigured,
      })),
    ],
  }[provider] || [];

  for (const test of tests) {
    try {
      attempts.push(describeAttempt(await probeJsonEndpoint(test.url, test.body, test.headers || {}, { timeoutMs: 8000 }), test.hint));
    } catch (error) {
      attempts.push(describeAttempt({ ok: false, url: test.url, error: error?.message || "Falha de conexao." }, test.hint));
    }
  }

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
      model: configs[provider].model,
      attempts,
    };
  }
  if (configuredAttempt?.issue === "service_offline" && reachableAlternative) {
    return {
      ok: false,
      provider,
      issue: "port_mismatch",
      message: `O provider ${provider} nao respondeu na URL configurada, mas existe um proxy semelhante em outra porta.`,
      configuredUrl: configuredAttempt.url,
      recommendedUrl: reachableAlternative.url,
      model: configs[provider]?.model,
      attempts,
    };
  }
  return { ok: false, provider, message: `Nao foi possivel conectar ao provider ${provider}.`, configuredUrl: tests[0]?.url || null, model: configs[provider]?.model, attempts };
}

module.exports = {
  callLocal,
  callCloud,
  callCloudflare,
  diagnose,
};
