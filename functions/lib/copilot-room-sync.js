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
        id: message.id || crypto.randomUUID(),
        created_at: message.createdAt || message.created_at || new Date().toISOString(),
        metadata: message.metadata || {},
        role: message.role || "user",
        text: message.text,
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`Falha ao sincronizar sala do Copilot no worker HMADV (${response.status}).`);
  }
  return response.json().catch(() => null);
}

export async function listCopilotRoomMessages(env, conversationId, limit = 100, since = "") {
  const baseUrl = getProcessAiBaseUrl(env);
  if (!baseUrl || !conversationId) return null;
  const sinceQuery = String(since || "").trim()
    ? `&since=${encodeURIComponent(String(since).trim())}`
    : "";
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/copilot/rooms/${encodeURIComponent(conversationId)}/messages?limit=${Math.max(1, Math.min(Number(limit || 100), 200))}${sinceQuery}`,
    {
      method: "GET",
      headers: buildHeaders(env),
    }
  );
  if (!response.ok) {
    throw new Error(`Falha ao listar mensagens live da sala do Copilot no worker HMADV (${response.status}).`);
  }
  return response.json().catch(() => null);
}
