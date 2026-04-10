import { runLawdeskChat } from "../../lib/lawdesk/chat.js";
import {
  handleFreddyGetContact360,
  handleFreddySaveMemory,
} from "./freddy-memory-gateway.js";
import { getCleanEnvValue } from "./env.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const SLACK_API_BASE = "https://slack.com/api";

function clean(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
}

function getSlackBotToken(env) {
  return (
    getCleanEnvValue(env.SLACK_BOT_TOKEN) ||
    getCleanEnvValue(env.SLACK_ACCESS_TOKEN) ||
    null
  );
}

function getSlackUserToken(env) {
  return (
    getCleanEnvValue(env.SLACK_USER_TOKEN) ||
    getCleanEnvValue(env.SLACK_ACCESS_TOKEN) ||
    getSlackBotToken(env)
  );
}

function getSlackSigningSecret(env) {
  return getCleanEnvValue(env.SLACK_SIGNING_SECRET) || null;
}

function getFreddySharedSecret(env) {
  return (
    getCleanEnvValue(env.FREDDY_ACTION_SHARED_SECRET) ||
    getCleanEnvValue(env.HMDAV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.LAWDESK_AI_SHARED_SECRET) ||
    null
  );
}

function hexToArrayBuffer(hex) {
  const cleanHex = String(hex || "").replace(/[^a-fA-F0-9]/g, "");
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}

function arrayBufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return arrayBufferToHex(signature);
}

async function timingSafeEqualHex(left, right) {
  const leftBytes = new Uint8Array(hexToArrayBuffer(left));
  const rightBytes = new Uint8Array(hexToArrayBuffer(right));
  if (leftBytes.length !== rightBytes.length) return false;
  let result = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    result |= leftBytes[index] ^ rightBytes[index];
  }
  return result === 0;
}

export async function verifySlackSignature(request, rawBody, env) {
  const signingSecret = getSlackSigningSecret(env);
  if (!signingSecret) {
    return { ok: false, status: 500, error: "SLACK_SIGNING_SECRET ausente no ambiente." };
  }

  const timestamp = clean(request.headers.get("x-slack-request-timestamp"));
  const signature = clean(request.headers.get("x-slack-signature"));
  if (!timestamp || !signature) {
    return { ok: false, status: 401, error: "Assinatura do Slack ausente." };
  }

  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 60 * 5) {
    return { ok: false, status: 401, error: "Timestamp do Slack invalido ou expirado." };
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = await hmacSha256(signingSecret, base);
  const expected = `v0=${digest}`;
  const ok = await timingSafeEqualHex(
    expected.replace(/^v0=/, ""),
    signature.replace(/^v0=/, "")
  );

  return ok
    ? { ok: true }
    : { ok: false, status: 401, error: "Assinatura do Slack invalida." };
}

function normalizeSlackText(text) {
  return String(text || "")
    .replace(/<@[A-Z0-9]+>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCnj(text) {
  const match = String(text || "").match(/\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/);
  return match ? match[0] : null;
}

function buildSlackSessionId(channelId, threadTs, userId) {
  return ["slack", channelId || "channel", threadTs || "root", userId || "user"].join(":");
}

function buildSlackThreadTs(event) {
  return clean(event?.thread_ts) || clean(event?.ts) || null;
}

function buildSlackContextEnhancement(contact360) {
  if (!contact360?.data) return null;

  const parts = [];
  if (contact360.data.summary) {
    parts.push(`Contexto 360: ${contact360.data.summary}`);
  }

  if (contact360.data.judicial?.safe_process_status?.label) {
    parts.push(`Status processual seguro: ${contact360.data.judicial.safe_process_status.label}.`);
  }

  if (contact360.data.judicial?.safe_process_status?.caution) {
    parts.push(contact360.data.judicial.safe_process_status.caution);
  }

  const recentPublications = Array.isArray(contact360.data.judicial?.recent_publications)
    ? contact360.data.judicial.recent_publications.slice(0, 2)
    : [];
  if (recentPublications.length) {
    parts.push(
      `Publicacoes recentes: ${recentPublications
        .map((item) => item?.title || item?.summary || item?.source)
        .filter(Boolean)
        .join(" | ")}.`
    );
  }

  const memoryMatches = Array.isArray(contact360.data.memory_matches)
    ? contact360.data.memory_matches.slice(0, 3)
    : [];
  if (memoryMatches.length) {
    parts.push(
      `Memoria relevante: ${memoryMatches.map((item) => item?.text).filter(Boolean).join(" | ")}.`
    );
  }

  parts.push(
    "Canal: Slack interno. Responda em PT-BR, de forma operacional, clara e segura. Use o contexto CRM/judicial quando houver, sem inventar fatos nem conclusoes juridicas individualizadas."
  );

  return parts.join(" ");
}

async function parseHandlerResponse(response) {
  const raw = await response.text().catch(() => "");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function callFreddyGetContact360(env, payload) {
  const secret = getFreddySharedSecret(env);
  if (!secret) return null;

  const request = new Request("https://internal/freddy-get-contact-360", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-freddy-secret": secret,
    },
    body: JSON.stringify(payload),
  });

  const response = await handleFreddyGetContact360(request, env);
  const data = await parseHandlerResponse(response);
  return response.ok ? data : null;
}

async function callFreddySaveMemory(env, payload) {
  const secret = getFreddySharedSecret(env);
  if (!secret) return null;

  const request = new Request("https://internal/freddy-save-memory", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-freddy-secret": secret,
    },
    body: JSON.stringify(payload),
  });

  const response = await handleFreddySaveMemory(request, env);
  return parseHandlerResponse(response);
}

async function callSlackApi(env, method, payload, token = null) {
  const effectiveToken = token || getSlackBotToken(env);
  if (!effectiveToken) {
    throw new Error("SLACK_BOT_TOKEN ausente no ambiente.");
  }

  const response = await fetch(`${SLACK_API_BASE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${effectiveToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text().catch(() => "");
  let data = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = { raw };
    }
  }

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `Slack API ${method} falhou (${response.status}).`);
  }

  return data;
}

async function resolveSlackUserProfile(env, userId) {
  const token = getSlackUserToken(env);
  if (!token || !userId) {
    return { id: userId || null, email: null, full_name: null, display_name: null };
  }

  try {
    const data = await callSlackApi(env, "users.info", { user: userId }, token);
    const profile = data?.user?.profile || {};
    return {
      id: data?.user?.id || userId || null,
      email: clean(profile.email),
      full_name: clean(profile.real_name_normalized) || clean(profile.real_name) || clean(data?.user?.real_name),
      display_name: clean(profile.display_name_normalized) || clean(profile.display_name),
    };
  } catch {
    return { id: userId || null, email: null, full_name: null, display_name: null };
  }
}

async function postSlackReply(env, channel, threadTs, text) {
  return callSlackApi(env, "chat.postMessage", {
    channel,
    text,
    thread_ts: threadTs || undefined,
    unfurl_links: false,
    unfurl_media: false,
  });
}

async function postSlackResponseUrl(responseUrl, text) {
  if (!responseUrl) return null;
  const response = await fetch(responseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      response_type: "ephemeral",
      text,
    }),
  });
  return response.ok;
}

function shouldIgnoreSlackEvent(event = {}) {
  if (!event) return true;
  if (event.bot_id || event.app_id) return true;
  if (event.subtype && !["file_share"].includes(event.subtype)) return true;
  if (!["message", "app_mention"].includes(event.type)) return true;
  return false;
}

async function runSlackAssistant(env, { text, channelId, threadTs, userProfile, slackUserId }) {
  const cnj = extractCnj(text);
  const contact360 = await callFreddyGetContact360(env, {
    email: userProfile?.email || undefined,
    query: text,
    numero_cnj: cnj || undefined,
  });

  const enhancement = buildSlackContextEnhancement(contact360);
  const chatResult = await runLawdeskChat(env, {
    query: text,
    context: {
      route: "/slack/events",
      locale: "pt-BR",
      channel: "slack",
      assistant: {
        role: "assistente_juridico_slack",
        persona: "Assistente interno do escritorio via Slack.",
      },
      profile: {
        role: "internal_slack_user",
        email: userProfile?.email || null,
        full_name: userProfile?.full_name || userProfile?.display_name || null,
        slack_user_id: slackUserId || null,
      },
      crm: {
        summary: contact360?.data?.summary || null,
        contact_id: contact360?.data?.identifiers?.contact_id || null,
        account_id: Array.isArray(contact360?.data?.judicial?.identifiers?.account_ids)
          ? contact360.data.judicial.identifiers.account_ids[0] || null
          : null,
      },
      system_prompt_enhancement: enhancement,
    },
  });

  const resultText =
    clean(chatResult?.resultText) ||
    clean(chatResult?.result?.message) ||
    "Nao consegui produzir uma resposta util nesta tentativa.";

  await callFreddySaveMemory(env, {
    session_id: buildSlackSessionId(channelId, threadTs, slackUserId),
    agent_ref: "dotobot-slack",
    email: userProfile?.email || null,
    query: text,
    response_text: resultText,
    status: chatResult?.status || "ok",
    route: "/slack/events",
  }).catch(() => null);

  return {
    text: resultText,
    contact360,
    chatResult,
  };
}

export async function processSlackEvent(env, payload) {
  const event = payload?.event || {};
  if (shouldIgnoreSlackEvent(event)) {
    return { ok: true, ignored: true };
  }

  const channelId = clean(event.channel);
  const threadTs = buildSlackThreadTs(event);
  const text = normalizeSlackText(event.text);
  const slackUserId = clean(event.user);

  if (!channelId || !text) {
    return { ok: true, ignored: true };
  }

  const userProfile = await resolveSlackUserProfile(env, slackUserId);
  const result = await runSlackAssistant(env, { text, channelId, threadTs, userProfile, slackUserId });
  await postSlackReply(env, channelId, threadTs, result.text);
  return { ok: true, delivered: true };
}

export async function processSlackSlashCommand(env, commandBody) {
  const text = normalizeSlackText(commandBody?.text);
  const channelId = clean(commandBody?.channel_id);
  const threadTs = clean(commandBody?.thread_ts) || null;
  const slackUserId = clean(commandBody?.user_id);
  const responseUrl = clean(commandBody?.response_url);
  const userProfile = await resolveSlackUserProfile(env, slackUserId);

  const result = await runSlackAssistant(env, {
    text: text || "Resuma o contexto operacional deste cliente.",
    channelId,
    threadTs,
    userProfile,
    slackUserId,
  });

  await postSlackResponseUrl(responseUrl, result.text);
  return { ok: true, delivered: true };
}

export function parseSlackFormEncoded(rawBody) {
  const params = new URLSearchParams(rawBody);
  return Object.fromEntries(params.entries());
}

export function jsonOk(data, status = 200) {
  return new Response(JSON.stringify({ ok: true, ...data }), {
    status,
    headers: JSON_HEADERS,
  });
}

export function jsonError(message, status = 500, code = null) {
  return new Response(JSON.stringify({ ok: false, error: message, ...(code ? { code } : {}) }), {
    status,
    headers: JSON_HEADERS,
  });
}
