export const EXTENSION_SOURCE = "universal-llm-assistant-extension";
export const FRONTEND_SOURCE = "dotobot-frontend";

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

export function isExtensionSource(source) {
  const normalized = normalizeValue(source);
  return normalized === EXTENSION_SOURCE || normalized === "universal-llm-extension" || normalized === "universal_llm_assistant_extension" || normalized.includes("universal-llm") || normalized.includes("llm-assistant-extension");
}

export function normalizeEventType(type, command = "") {
  const normalizedType = normalizeValue(type);
  const normalizedCommand = normalizeValue(command);
  if (normalizedType === "extension_ready" || normalizedType === "ready" || normalizedType === "pong") return "EXTENSION_READY";
  if (normalizedType === "extension_response" || normalizedType === "command_response" || normalizedType === "response") return "EXTENSION_RESPONSE";
  if (normalizedType === "health_check_response" || (normalizedType === "health_check" && normalizedCommand === "health_check")) return "EXTENSION_RESPONSE";
  return String(type || "");
}

export function extractBridgePayload(rawPayload) {
  if (!rawPayload) return null;
  if (rawPayload.detail && typeof rawPayload.detail === "object") return rawPayload.detail;
  if (typeof rawPayload === "object") return rawPayload;
  return null;
}

export function createDebugEvent(event) {
  return {
    id: `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...event,
  };
}

export function buildHandshakeMessages() {
  return [
    { source: FRONTEND_SOURCE, type: "DOTOBOT_EXTENSION_PING", timestamp: Date.now() },
    { source: FRONTEND_SOURCE, type: "DOTOBOT_COMMAND", command: "health_check", payload: { origin: "dotobot" }, requestId: `health_${Date.now()}` },
  ];
}

export function buildCommandMessage(command, payload, requestId) {
  return { source: FRONTEND_SOURCE, type: "DOTOBOT_COMMAND", command, payload, requestId };
}
