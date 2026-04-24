function clean(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
}

function ensureHttps(value, fallback) {
  const raw = clean(value) || fallback;
  if (/^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, "");
  }
  return `https://${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function resolveFreshchatBaseUrl(env) {
  return ensureHttps(
    env.FRESHCHAT_API_BASE ||
      env.FRESHCHAT_BASE_URL ||
      env.FRESHCHAT_DOMAIN ||
      env.FRESHCHAT_SERVER ||
      env.FRESHCHAT_MS_DOMAIN,
    "https://msdk.eu.freshchat.com"
  );
}

function resolveFreshworksTokenUrl(env) {
  return clean(
    env.FRESHWORKS_OAUTH_TOKEN_URL ||
      env.FRESHSALES_OAUTH_TOKEN_URL ||
      env.FRESHCHAT_OAUTH_TOKEN_URL ||
      env.ACCESS_TOKEN_URL
  );
}

function getFreshworksClientId(env) {
  return clean(
    env.FRESHWORKS_OAUTH_CLIENT_ID ||
      env.FRESHSALES_OAUTH_CLIENT_ID ||
      env.FRESHCHAT_OAUTH_CLIENT_ID ||
      env.FRESHWORKS_CLIENT_ID ||
      env.FRESHSALES_CLIENT_ID ||
      env.FRESHCHAT_CLIENT_ID
  );
}

function getFreshworksClientSecret(env) {
  return clean(
    env.FRESHWORKS_OAUTH_CLIENT_SECRET ||
      env.FRESHSALES_OAUTH_CLIENT_SECRET ||
      env.FRESHCHAT_OAUTH_CLIENT_SECRET ||
      env.FRESHWORKS_CLIENT_SECRET ||
      env.FRESHSALES_CLIENT_SECRET ||
      env.FRESHCHAT_CLIENT_SECRET
  );
}

function getFreshworksRefreshToken(env) {
  return clean(env.FRESHWORKS_REFRESH_TOKEN || env.FRESHSALES_REFRESH_TOKEN || env.FRESHCHAT_REFRESH_TOKEN);
}

async function resolveFreshworksAccessToken(env) {
  const directToken = clean(env.FRESHWORKS_ACCESS_TOKEN || env.FRESHSALES_ACCESS_TOKEN || env.FRESHCHAT_ACCESS_TOKEN);
  if (directToken) return directToken;

  const clientId = getFreshworksClientId(env);
  const clientSecret = getFreshworksClientSecret(env);
  const refreshToken = getFreshworksRefreshToken(env);
  const tokenUrl = resolveFreshworksTokenUrl(env);

  if (!clientId || !clientSecret || !refreshToken || !tokenUrl) {
    throw new Error("Configuracao OAuth Freshworks incompleta para acessar o Freshchat.");
  }

  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const raw = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw ? { raw } : null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.description ||
        raw ||
        `Falha ao renovar token Freshworks (${response.status}).`
    );
  }

  const token = clean(payload?.access_token);
  if (!token) {
    throw new Error("Resposta OAuth Freshworks sem access_token.");
  }
  return token;
}

export async function freshchatRequest(env, path, init = {}) {
  const baseUrl = resolveFreshchatBaseUrl(env);
  const accessToken = await resolveFreshworksAccessToken(env);
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  const raw = await response.text().catch(() => "");
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw ? { raw } : null;
  }

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.description ||
        raw ||
        `Freshchat request failed with status ${response.status}`
    );
  }

  return { response, payload };
}

export async function listFreshchatConversations(env, filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", String(filters.status));
  if (filters.agentId) params.set("agent_id", String(filters.agentId));
  if (filters.userId) params.set("user_id", String(filters.userId));
  if (filters.groupId) params.set("group_id", String(filters.groupId));
  if (filters.page) params.set("page", String(filters.page));
  if (filters.itemsPerPage || filters.limit) params.set("items_per_page", String(filters.itemsPerPage || filters.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const { payload } = await freshchatRequest(env, `/v2/conversations${suffix}`);
  return Array.isArray(payload?.conversations) ? payload.conversations : Array.isArray(payload) ? payload : [];
}

export async function viewFreshchatConversation(env, conversationId) {
  const { payload } = await freshchatRequest(
    env,
    `/v2/conversations/${encodeURIComponent(String(conversationId))}`
  );
  return payload?.conversation || payload || null;
}

export async function updateFreshchatConversation(env, conversationId, patch = {}) {
  const { payload } = await freshchatRequest(
    env,
    `/v2/conversations/${encodeURIComponent(String(conversationId))}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    }
  );
  return payload?.conversation || payload || null;
}

export async function listFreshchatAgents(env, filters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.itemsPerPage || filters.limit) params.set("items_per_page", String(filters.itemsPerPage || filters.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const { payload } = await freshchatRequest(env, `/v2/agents${suffix}`);
  return Array.isArray(payload?.agents) ? payload.agents : Array.isArray(payload) ? payload : [];
}

export async function listFreshchatGroups(env, filters = {}) {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.itemsPerPage || filters.limit) params.set("items_per_page", String(filters.itemsPerPage || filters.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const { payload } = await freshchatRequest(env, `/v2/groups${suffix}`);
  return Array.isArray(payload?.groups) ? payload.groups : Array.isArray(payload) ? payload : [];
}

export async function listFreshchatUsers(env, filters = {}) {
  const params = new URLSearchParams();
  if (filters.email) params.set("email", String(filters.email).trim());
  if (filters.externalId) params.set("external_id", String(filters.externalId).trim());
  if (filters.phone) params.set("phone", String(filters.phone).trim());
  if (filters.page) params.set("page", String(filters.page));
  if (filters.itemsPerPage || filters.limit) params.set("items_per_page", String(filters.itemsPerPage || filters.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const { payload } = await freshchatRequest(env, `/v2/users${suffix}`);
  return Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : [];
}

export async function sendFreshchatConversationMessage(env, conversationId, message) {
  const body =
    typeof message === "string"
      ? {
          message_parts: [{ text: { content: message } }],
          actor_type: "agent",
        }
      : message;
  const { payload } = await freshchatRequest(
    env,
    `/v2/conversations/${encodeURIComponent(String(conversationId))}/messages`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
  return payload || null;
}
