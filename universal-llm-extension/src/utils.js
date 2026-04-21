const crypto = require("crypto");

function uid() {
  return crypto.randomBytes(8).toString("hex");
}

function ts() {
  return new Date().toISOString();
}

function joinUrl(base, suffix) {
  return `${String(base || "").replace(/\/+$/, "")}/${String(suffix || "").replace(/^\/+/, "")}`;
}

function htmlSnippet(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function extractContent(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (typeof payload.response === "string") return payload.response;
  if (typeof payload.content === "string") return payload.content;
  if (Array.isArray(payload.content)) {
    const joined = payload.content.map((item) => {
      if (typeof item === "string") return item;
      if (typeof item?.text === "string") return item.text;
      return "";
    }).filter(Boolean).join("\n");
    if (joined) return joined;
  }
  if (typeof payload.result === "string") return payload.result;
  if (typeof payload.data?.response === "string") return payload.data.response;
  if (typeof payload.data?.result === "string") return payload.data.result;
  if (typeof payload.message?.content === "string") return payload.message.content;
  if (Array.isArray(payload.choices) && typeof payload.choices[0]?.message?.content === "string") return payload.choices[0].message.content;
  if (typeof payload.result?.response === "string") return payload.result.response;
  return "";
}

function buildProviderError(prefix, targetUrl, response) {
  if (response?.body?.raw) {
    return new Error(`${prefix} retornou HTML/texto em ${targetUrl}. Trecho: ${htmlSnippet(response.body.raw)}`);
  }
  return new Error(`${prefix} ${response?.status || "erro"}: ${JSON.stringify(response?.body || {}).slice(0, 220)}`);
}

module.exports = {
  uid,
  ts,
  joinUrl,
  htmlSnippet,
  extractContent,
  buildProviderError,
};
