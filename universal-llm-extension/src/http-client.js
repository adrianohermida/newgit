const http = require("http");
const https = require("https");
const { htmlSnippet } = require("./utils");

async function jsonPost(url, body, headers = {}, options = {}) {
  const lib = url.startsWith("https") ? https : http;
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 60000;
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const request = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (url.startsWith("https") ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
      },
    }, (response) => {
      let raw = "";
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, headers: response.headers || {}, body: raw ? JSON.parse(raw) : {} });
        } catch {
          resolve({ status: response.statusCode, headers: response.headers || {}, body: { raw } });
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Timeout ao chamar endpoint remoto.")));
    request.write(payload);
    request.end();
  });
}

async function jsonGet(url, headers = {}, options = {}) {
  const lib = url.startsWith("https") ? https : http;
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : 15000;
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const request = lib.request({
      hostname: parsed.hostname,
      port: parsed.port || (url.startsWith("https") ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: "GET",
      headers,
    }, (response) => {
      let raw = "";
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          resolve({ status: response.statusCode, headers: response.headers || {}, body: raw ? JSON.parse(raw) : {} });
        } catch {
          resolve({ status: response.statusCode, headers: response.headers || {}, body: { raw } });
        }
      });
    });
    request.on("error", reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error("Timeout ao chamar endpoint remoto.")));
    request.end();
  });
}

async function probeJsonEndpoint(url, body, headers = {}, options = {}) {
  const result = await jsonPost(url, body, headers, options);
  if (result.body && typeof result.body === "object" && result.body.raw) {
    return {
      ok: false,
      status: result.status,
      url,
      contentType: String(result.headers?.["content-type"] || ""),
      error: "Resposta nao-JSON recebida.",
      rawSnippet: htmlSnippet(result.body.raw),
    };
  }
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    url,
    contentType: String(result.headers?.["content-type"] || ""),
    body: result.body,
  };
}

async function probeJsonGetEndpoint(url, headers = {}, options = {}) {
  const result = await jsonGet(url, headers, options);
  if (result.body && typeof result.body === "object" && result.body.raw) {
    return {
      ok: false,
      status: result.status,
      url,
      contentType: String(result.headers?.["content-type"] || ""),
      error: "Resposta nao-JSON recebida.",
      rawSnippet: htmlSnippet(result.body.raw),
    };
  }
  return {
    ok: result.status >= 200 && result.status < 300,
    status: result.status,
    url,
    contentType: String(result.headers?.["content-type"] || ""),
    body: result.body,
  };
}

module.exports = {
  jsonPost,
  jsonGet,
  probeJsonEndpoint,
  probeJsonGetEndpoint,
};
