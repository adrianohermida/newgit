const { getConfigs } = require("./storage");
const { jsonPost, probeJsonEndpoint } = require("./http-client");
const { joinUrl, extractContent, buildProviderError, htmlSnippet } = require("./utils");

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
  const headers = configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {};
  const response = await jsonPost(target, { query, provider: "cloud", model }, headers);
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
  const headers = configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {};
  const response = await jsonPost(target, { query, provider: "cloudflare", model }, headers);
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
      { url: joinUrl(configs.cloud.appUrl, "/api/admin-lawdesk-chat"), body: { query: "Responda com OK", provider: "cloud", model: configs.cloud.model }, headers: configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {}, hint: "Essa rota exige token administrativo Bearer de uma sessao admin valida." },
    ],
    cloudflare: [
      ...((configs.cloudflare.accountId && configs.cloudflare.apiToken) ? [{
        url: `https://api.cloudflare.com/client/v4/accounts/${configs.cloudflare.accountId}/ai/run/${encodeURIComponent(configs.cloudflare.model)}`,
        body: { messages: [{ role: "user", content: "OK" }] },
        headers: { Authorization: `Bearer ${configs.cloudflare.apiToken}` },
      }] : []),
      { url: joinUrl(configs.cloudflare.appUrl, "/api/admin-lawdesk-chat"), body: { query: "Responda com OK", provider: "cloudflare", model: configs.cloudflare.model }, headers: configs.cloud.authToken ? { Authorization: `Bearer ${configs.cloud.authToken}` } : {}, hint: "Sem Account ID/API Token, o fallback usa o proxy admin e exige token Bearer." },
    ],
  }[provider] || [];

  for (const test of tests) {
    try {
      attempts.push(describeAttempt(await probeJsonEndpoint(test.url, test.body, test.headers || {}), test.hint));
    } catch (error) {
      attempts.push(describeAttempt({ ok: false, url: test.url, error: error?.message || "Falha de conexao." }, test.hint));
    }
  }

  const success = attempts.find((item) => item.ok);
  if (success) return { ok: true, provider, message: `Conexao ${provider} confirmada.`, activeUrl: success.url, model: configs[provider].model, attempts };
  return { ok: false, provider, message: `Nao foi possivel conectar ao provider ${provider}.`, configuredUrl: tests[0]?.url || null, model: configs[provider]?.model, attempts };
}

function describeAttempt(attempt, hint) {
  const details = classifyAttempt(attempt, hint);
  return { ...attempt, hint: hint || null, ...details, ...extractWarnings(attempt) };
}

function classifyAttempt(attempt, hint) {
  const raw = String(attempt?.rawSnippet || attempt?.error || "").toLowerCase();
  const errorType = String(attempt?.body?.errorType || "").toLowerCase();
  if (raw.includes("<!doctype") || raw.includes("<html")) {
    return {
      issue: "html_response",
      summary: "A URL respondeu HTML, provavelmente uma pagina web e nao uma API JSON.",
      recommendation: "Ajuste para um endpoint de API real. Ex.: ai-core em /v1/messages ou proxy que responda JSON.",
    };
  }
  if (raw.includes("econnrefused") || raw.includes("connect econnrefused") || raw.includes("socket hang up")) {
    return {
      issue: "service_offline",
      summary: "Nao foi possivel abrir conexao com o servico configurado.",
      recommendation: "Confirme se o processo esta rodando na porta informada e se a URL esta correta.",
    };
  }
  if (attempt?.status === 404) {
    return {
      issue: "route_not_found",
      summary: "O servidor respondeu, mas a rota esperada nao existe.",
      recommendation: "Revise a base URL. Ela deve apontar para a API correta, nao apenas para a home da aplicacao.",
    };
  }
  if (attempt?.status >= 500) {
    return {
      issue: "proxy_runtime_error",
      summary: "A aplicacao respondeu com erro interno ao processar o proxy do provider.",
      recommendation: "Verifique os logs do Next/app local. Se estiver usando dev server, confirme se a rota compilou sem erro.",
    };
  }
  if (attempt?.status === 401 || attempt?.status === 403 || errorType === "missing_token" || errorType === "invalid_session" || errorType === "inactive_profile") {
    return {
      issue: "auth_failed",
      summary: "O endpoint respondeu, mas exige autenticacao administrativa valida.",
      recommendation: "Preencha o token Bearer admin no painel ou use uma API direta que aceite o secret configurado.",
    };
  }
  if (raw.includes("401") || raw.includes("403") || raw.includes("unauthorized") || raw.includes("forbidden")) {
    return {
      issue: "auth_failed",
      summary: "A autenticacao falhou para o endpoint configurado.",
      recommendation: "Revise token, secret ou permissoes do provider.",
    };
  }
  return {
    issue: "unknown",
    summary: attempt?.ok ? "Conexao valida." : `Falha: ${htmlSnippet(attempt?.error || attempt?.rawSnippet || "Sem detalhes")}`,
    recommendation: hint || "Revise a URL, o modelo e a autenticacao deste provider.",
  };
}

function extractWarnings(attempt) {
  const metadata = attempt?.body?.metadata || {};
  if (metadata.degraded) {
    return {
      warning: "degraded_local_runtime",
      warningSummary: "O runtime local respondeu em modo degradado.",
      warningDetail: String(metadata.fallback_reason || "O modelo local nao conseguiu executar normalmente."),
    };
  }
  return {};
}

module.exports = {
  callLocal,
  callCloud,
  callCloudflare,
  diagnose,
};
