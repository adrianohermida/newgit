const { jsonPost } = require("./http-client");
const { extractContent, buildProviderError, joinUrl } = require("./utils");

function isConnectionError(error) {
  const raw = String(error?.message || "").toLowerCase();
  return raw.includes("econnrefused") || raw.includes("socket hang up") || raw.includes("timeout");
}

function buildProxyTargets(appUrl, path, hint) {
  try {
    const parsed = new URL(joinUrl(appUrl, path));
    const base = { url: parsed.toString(), hint, isConfigured: true };
    const isLoopback = ["localhost", "127.0.0.1"].includes(parsed.hostname);
    const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
    if (!isLoopback || !Number.isFinite(port)) return [base];
    const seen = new Set();
    return [port, 3000, 3001, 3002, 3003]
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => {
        const next = new URL(parsed.toString());
        next.port = String(value);
        return {
          url: next.toString(),
          hint: value === port ? hint : `Porta alternativa detectada para ambiente local: ${value}.`,
          isConfigured: value === port,
        };
      })
      .filter((entry) => {
        if (seen.has(entry.url)) return false;
        seen.add(entry.url);
        return true;
      });
  } catch {
    return [{ url: joinUrl(appUrl, path), hint, isConfigured: true }];
  }
}

async function callProxyProvider(appUrl, body, headers, label) {
  const targets = buildProxyTargets(appUrl, "/api/admin-lawdesk-chat");
  let lastError = null;
  for (const target of targets) {
    try {
      const response = await jsonPost(target.url, body, headers);
      const content = extractContent(response.body);
      if (response.status >= 200 && response.status < 300 && content) {
        return { ok: true, content, target: target.url };
      }
      throw buildProviderError(label, target.url, response);
    } catch (error) {
      lastError = error;
      if (!isConnectionError(error)) break;
    }
  }
  throw lastError || new Error(`${label} indisponivel.`);
}

module.exports = {
  buildProxyTargets,
  callProxyProvider,
};
