import { getCleanEnvValue } from "./env.js";

function getProcessAiBaseUrl(env) {
  return (
    getCleanEnvValue(env.HMADV_PROCESS_AI_URL) ||
    getCleanEnvValue(env.HMADV_PROCESS_AI_BASE_URL) ||
    getCleanEnvValue(env.HMADV_PROCESS_AI_WORKER_URL) ||
    null
  );
}

function getSharedSecret(env) {
  return (
    getCleanEnvValue(env.HMDAV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.HMADV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.LAWDESK_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.CUSTOM_LLM_AUTH_TOKEN) ||
    null
  );
}

function buildHeaders(env) {
  const sharedSecret = getSharedSecret(env);
  return {
    "Content-Type": "application/json",
    ...(sharedSecret
      ? {
          Authorization: `Bearer ${sharedSecret}`,
          "x-hmadv-secret": sharedSecret,
          "x-shared-secret": sharedSecret,
        }
      : {}),
  };
}

export async function appendCopilotRoomMessage(env, conversationId, message) {
  const baseUrl = getProcessAiBaseUrl(env);
  if (!baseUrl || !conversationId || !String(message?.text || "").trim()) return null;
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/copilot/rooms/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: buildHeaders(env),
      body: JSON.stringify({
        message: {
          createdAt: message.createdAt || new Date().toISOString(),
          metadata: message.metadata || {},
          role: message.role || "user",
          text: message.text,
        },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Falha ao sincronizar sala do Copilot no worker HMADV (${response.status}).`);
  }
  return response.json().catch(() => null);
}
