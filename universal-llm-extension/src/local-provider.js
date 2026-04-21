const { joinUrl } = require("./utils");

function normalizePath(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.startsWith("/") ? text : `/${text}`;
}

function getLocalProviderLabel(configs) {
  return String(configs?.local?.providerLabel || "Local Agent Runtime").trim() || "Local Agent Runtime";
}

function getLocalChatPath(configs) {
  return normalizePath(configs?.local?.chatPath, "/v1/messages");
}

function getLocalExecutePath(configs) {
  return normalizePath(configs?.local?.executePath, "/execute");
}

function getLocalChatTarget(baseUrl, configs) {
  return joinUrl(baseUrl, getLocalChatPath(configs));
}

function getLocalExecuteTarget(baseUrl, configs) {
  return joinUrl(baseUrl, getLocalExecutePath(configs));
}

module.exports = {
  getLocalProviderLabel,
  getLocalChatPath,
  getLocalExecutePath,
  getLocalChatTarget,
  getLocalExecuteTarget,
};
