import { requireClientAccess } from "./client-auth.js";

const DEFAULT_SCRIPT_URL = "//eu.fw-cdn.com/10713913/375987.js";

function clean(value) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || null;
  }

  return trimmed;
}

function toBoolean(value, fallback = false) {
  const normalized = clean(value);
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(normalized.toLowerCase())) return false;
  return fallback;
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function splitFullName(fullName) {
  const normalized = String(fullName || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { firstName: "", lastName: "" };
  }

  const [firstName, ...rest] = normalized.split(" ");
  return {
    firstName,
    lastName: rest.join(" ").trim(),
  };
}

function buildReferenceId(prefix, rawId) {
  const cleaned = String(rawId || "").trim().replace(/[^a-zA-Z0-9:_-]/g, "-");
  return `${prefix}:${cleaned || "anon"}`;
}

function toBase64Url(value) {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signHs256(message, secret) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Runtime sem suporte a crypto.subtle para assinar JWT do Freshchat.");
  }

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await globalThis.crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return toBase64Url(String.fromCharCode(...new Uint8Array(signature)));
}

export function getFreshchatWebConfig(envLike = {}) {
  const scriptUrl =
    clean(envLike.FRESHCHAT_WIDGET_SCRIPT_URL) ||
    clean(envLike.NEXT_PUBLIC_FRESHWORKS_WIDGET_SCRIPT_URL) ||
    DEFAULT_SCRIPT_URL;
  const widgetHost =
    clean(envLike.FRESHCHAT_WEB_MESSENGER_HOST) ||
    clean(envLike.FRESHCHAT_WEB_MESSENGER_URL) ||
    null;
  const messengerToken =
    clean(envLike.FRESHCHAT_WEB_MESSENGER_TOKEN) ||
    clean(envLike.FRESHCHAT_WEB_MESSENGER_WIDGET_TOKEN) ||
    clean(envLike.FRESHCHAT_WEB_TOKEN) ||
    clean(envLike.FRESHCHAT_MESSENGER_TOKEN) ||
    null;
  const jwtSecret =
    clean(envLike.FRESHCHAT_JWT_SECRET) ||
    clean(envLike.FRESHCHAT_JWT_ENCRYPTION_KEY) ||
    clean(envLike.FRESHCHAT_ENCRYPTED_KEY) ||
    clean(envLike.FRESHCHAT_SHARED_SECRET) ||
    null;
  const enabled = toBoolean(envLike.FRESHCHAT_ENABLE_WEB_MESSENGER, true) && Boolean(scriptUrl);

  const issues = [];
  if (widgetHost && /(?:^https?:\/\/)?msdk\./i.test(widgetHost)) {
    issues.push("sdk_domain");
  }
  if (widgetHost && /webpush\.myfreshworks\.com/i.test(widgetHost)) {
    issues.push("web_messenger_domain");
  }
  if (!jwtSecret) {
    issues.push("missing_jwt_secret");
  }
  if (!messengerToken) {
    issues.push("missing_web_messenger_token");
  } else if (looksLikeUuid(messengerToken)) {
    issues.push("uuid_like_web_messenger_token");
  }

  return {
    enabled,
    scriptUrl,
    widgetHost,
    messengerToken,
    jwtEnabled: Boolean(jwtSecret),
    jwtSecret,
    mode: "freshsales_suite_embed",
    issues,
  };
}

export function buildFreshchatPublicConfig(envLike = {}) {
  const config = getFreshchatWebConfig(envLike);
  return {
    ok: true,
    enabled: config.enabled,
    scriptUrl: config.scriptUrl,
    widgetHost: config.widgetHost,
    messengerToken: config.messengerToken,
    jwtEnabled: config.jwtEnabled,
    mode: config.mode,
    authEndpoint: "/api/freshchat-jwt",
    issues: config.issues,
  };
}

function normalizeVisitorIdentity(body = {}) {
  const visitorId = String(body.visitorId || body.visitor_id || "").trim();
  const providedReferenceId = String(body.referenceId || body.reference_id || "").trim();
  const freshchatUuid = String(body.freshchatUuid || body.freshchat_uuid || "").trim();
  const firstName = String(body.firstName || body.first_name || "Visitante").trim();
  const lastName = String(body.lastName || body.last_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const phoneNumber = String(body.phoneNumber || body.phone_number || "").trim();

  if (!freshchatUuid) {
    return { error: "freshchat_uuid ausente para autenticacao do widget." };
  }

  const referenceId = providedReferenceId || buildReferenceId("visitor", visitorId || "anon");

  return {
    freshchatUuid,
    referenceId,
    firstName,
    lastName,
    email: email || null,
    phoneNumber: phoneNumber || null,
    identityMode: "visitor",
  };
}

async function resolvePortalIdentity(request, env) {
  const auth = await requireClientAccess(request, env, { allowMissingProfile: true });
  if (!auth.ok) {
    return null;
  }

  const profile = auth.profile;
  const name = profile?.full_name || auth.user?.user_metadata?.full_name || auth.user?.user_metadata?.name || "";
  const { firstName, lastName } = splitFullName(name);

  return {
    referenceId: buildReferenceId("portal", profile?.id || auth.user?.id),
    firstName: firstName || "Cliente",
    lastName,
    email: profile?.email || auth.user?.email || null,
    phoneNumber: profile?.whatsapp || null,
    identityMode: "portal_client",
  };
}

export async function resolveFreshchatIdentity(request, env, body = {}) {
  const portalIdentity = await resolvePortalIdentity(request, env);
  const visitorIdentity = normalizeVisitorIdentity(body);

  if (visitorIdentity.error) {
    return visitorIdentity;
  }

  if (!portalIdentity) {
    return {
      ...visitorIdentity,
    };
  }

  return {
    ...visitorIdentity,
    ...portalIdentity,
  };
}

export async function createFreshchatJwt(envLike = {}, identity = {}) {
  const config = getFreshchatWebConfig(envLike);
  if (!config.jwtSecret) {
    throw new Error("FRESHCHAT_JWT_SECRET ausente no ambiente.");
  }

  if (!identity.freshchatUuid) {
    throw new Error("freshchat_uuid ausente para gerar JWT do Freshchat.");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    freshchat_uuid: identity.freshchatUuid,
    reference_id: identity.referenceId,
    exp: now + 60 * 15,
    iat: now,
  };

  if (identity.firstName) payload.first_name = identity.firstName;
  if (identity.lastName) payload.last_name = identity.lastName;
  if (identity.email) payload.email = identity.email;
  if (identity.phoneNumber) payload.phone_number = identity.phoneNumber;

  const encodedHeader = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = await signHs256(unsignedToken, config.jwtSecret);

  return {
    token: `${unsignedToken}.${signature}`,
    payload,
    mode: identity.identityMode || "visitor",
  };
}
