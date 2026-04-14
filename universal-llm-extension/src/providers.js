const { getConfigs } = require("./storage");
const { jsonPost, probeJsonEndpoint } = require("./http-client");
const { joinUrl, extractContent, buildProviderError } = require("./utils");

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
  const target = joinUrl(configs.cloud.appUrl, "/api/admin-lawdesk-chat");
  const query = messages.map((item) => `[${item.role}] ${item.content}`).join("\n");
  const response = await jsonPost(target, { query, provider: "cloud", model });
  const content = extractContent(response.body);
  if (response.status >= 200 && response.status < 300 && content) return { ok: true, provider: "cloud", model, content, target };
  throw buildProviderError("Cloud proxy", target, response);
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
  const target = joinUrl(configs.cloudflare.appUrl, "/api/admin-lawdesk-chat");
  const query = messages.map((item) => `[${item.role}] ${item.content}`).join("\n");
  const response = await jsonPost(target, { query, provider: "cloudflare", model });
  const content = extractContent(response.body);
  if (response.status >= 200 && response.status < 300 && content) return { ok: true, provider: "cloudflare", model, content, target };
  throw buildProviderError("Cloudflare proxy", target, response);
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
      { url: joinUrl(configs.cloud.appUrl, "/api/admin-lawdesk-chat"), body: { query: "Responda com OK", provider: "cloud", model: configs.cloud.model } },
    ],
    cloudflare: [
      ...((configs.cloudflare.accountId && configs.cloudflare.apiToken) ? [{
        url: `https://api.cloudflare.com/client/v4/accounts/${configs.cloudflare.accountId}/ai/run/${encodeURIComponent(configs.cloudflare.model)}`,
        body: { messages: [{ role: "user", content: "OK" }] },
        headers: { Authorization: `Bearer ${configs.cloudflare.apiToken}` },
      }] : []),
      { url: joinUrl(configs.cloudflare.appUrl, "/api/admin-lawdesk-chat"), body: { query: "Responda com OK", provider: "cloudflare", model: configs.cloudflare.model } },
    ],
  }[provider] || [];

  for (const test of tests) {
    try { attempts.push(await probeJsonEndpoint(test.url, test.body, test.headers || {})); } catch (error) { attempts.push({ ok: false, url: test.url, error: error?.message || "Falha de conexao." }); }
  }

  const success = attempts.find((item) => item.ok);
  if (success) return { ok: true, provider, message: `Conexao ${provider} confirmada.`, activeUrl: success.url, model: configs[provider].model, attempts };
  return { ok: false, provider, message: `Nao foi possivel conectar ao provider ${provider}.`, configuredUrl: tests[0]?.url || null, model: configs[provider]?.model, attempts };
}

module.exports = {
  callLocal,
  callCloud,
  callCloudflare,
  diagnose,
};
