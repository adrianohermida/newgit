type FreshworksOauthConfig = {
  orgBaseUrl: string;
  authorizeUrl: string | null;
  freshchatBaseUrl: string;
  tokenUrl: string | null;
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  accessToken: string | null;
  sourceSummary: Record<string, string | null>;
};

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function ensureHttps(value: string | null, fallback: string) {
  if (!value) return fallback;
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
  return `https://${value.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function sanitizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveFreshworksOauthConfig(): FreshworksOauthConfig {
  const orgBaseUrl = ensureHttps(
    firstEnv([
      "FRESHWORKS_ORG_BASE_URL",
      "FRESHWORKS_BASE_URL",
      "FRESHSALES_ALIAS_DOMAIN",
      "FRESHSALES_BASE_DOMAIN",
      "FRESHSALES_DOMAIN",
      "FRESHWORKS_DOMAIN",
    ]),
    "https://hmadv-org.myfreshworks.com",
  );

  const freshchatBaseUrl = sanitizeBaseUrl(
    ensureHttps(
      firstEnv([
        "FRESHCHAT_SERVER",
        "FRESHCHAT_API_BASE",
        "FRESHCHAT_BASE_URL",
        "FRESHCHAT_DOMAIN",
        "FRESHCHAT_MS_DOMAIN",
      ]),
      "https://msdk.eu.freshchat.com",
    ),
  );

  const tokenUrl = firstEnv([
    "FRESHWORKS_OAUTH_TOKEN_URL",
    "FRESHSALES_OAUTH_TOKEN_URL",
    "FRESHCHAT_OAUTH_TOKEN_URL",
    "ACCESS_TOKEN_URL",
  ]) || `${orgBaseUrl}/org/oauth/v2/token`;

  const authorizeUrl = firstEnv([
    "FRESHWORKS_OAUTH_AUTHORIZE_URL",
    "FRESHSALES_OAUTH_AUTHORIZE_URL",
    "FRESHCHAT_OAUTH_AUTHORIZE_URL",
    "FRESHSALES_AUTHORIZE_URL",
  ]) || `${orgBaseUrl}/org/oauth/v2/authorize`;

  const clientId = firstEnv([
    "FRESHWORKS_OAUTH_CLIENT_ID",
    "FRESHSALES_OAUTH_CLIENT_ID",
    "FRESHCHAT_OAUTH_CLIENT_ID",
    "FRESHWORKS_CLIENT_ID",
    "FRESHSALES_CLIENT_ID",
    "FRESHCHAT_CLIENT_ID",
  ]);

  const clientSecret = firstEnv([
    "FRESHWORKS_OAUTH_CLIENT_SECRET",
    "FRESHSALES_OAUTH_CLIENT_SECRET",
    "FRESHCHAT_OAUTH_CLIENT_SECRET",
    "FRESHWORKS_CLIENT_SECRET",
    "FRESHSALES_CLIENT_SECRET",
    "FRESHCHAT_CLIENT_SECRET",
  ]);

  const refreshToken = firstEnv([
    "FRESHWORKS_REFRESH_TOKEN",
    "FRESHSALES_REFRESH_TOKEN",
    "FRESHCHAT_REFRESH_TOKEN",
  ]);

  const accessToken = firstEnv([
    "FRESHWORKS_ACCESS_TOKEN",
    "FRESHSALES_ACCESS_TOKEN",
    "FRESHCHAT_ACCESS_TOKEN",
  ]);

  return {
    orgBaseUrl,
    authorizeUrl,
    freshchatBaseUrl,
    tokenUrl,
    clientId,
    clientSecret,
    refreshToken,
    accessToken,
    sourceSummary: {
      org_base_url: orgBaseUrl,
      authorize_url: authorizeUrl,
      freshchat_base: freshchatBaseUrl,
      token_url: tokenUrl,
      has_client_id: clientId ? "true" : "false",
      has_client_secret: clientSecret ? "true" : "false",
      has_refresh_token: refreshToken ? "true" : "false",
      has_access_token: accessToken ? "true" : "false",
    },
  };
}

export function buildFreshworksConfigDiagnostics() {
  const checks = [
    "FRESHWORKS_ORG_BASE_URL",
    "FRESHWORKS_BASE_URL",
    "FRESHSALES_ALIAS_DOMAIN",
    "FRESHSALES_BASE_DOMAIN",
    "FRESHSALES_DOMAIN",
    "FRESHWORKS_DOMAIN",
    "FRESHCHAT_SERVER",
    "FRESHCHAT_API_BASE",
    "FRESHCHAT_BASE_URL",
    "FRESHCHAT_DOMAIN",
    "FRESHCHAT_MS_DOMAIN",
    "FRESHWORKS_OAUTH_TOKEN_URL",
    "FRESHSALES_OAUTH_TOKEN_URL",
    "FRESHCHAT_OAUTH_TOKEN_URL",
    "ACCESS_TOKEN_URL",
    "FRESHWORKS_OAUTH_AUTHORIZE_URL",
    "FRESHSALES_OAUTH_AUTHORIZE_URL",
    "FRESHCHAT_OAUTH_AUTHORIZE_URL",
    "FRESHSALES_AUTHORIZE_URL",
    "FRESHWORKS_OAUTH_CLIENT_ID",
    "FRESHSALES_OAUTH_CLIENT_ID",
    "FRESHCHAT_OAUTH_CLIENT_ID",
    "FRESHWORKS_CLIENT_ID",
    "FRESHSALES_CLIENT_ID",
    "FRESHCHAT_CLIENT_ID",
    "FRESHWORKS_OAUTH_CLIENT_SECRET",
    "FRESHSALES_OAUTH_CLIENT_SECRET",
    "FRESHCHAT_OAUTH_CLIENT_SECRET",
    "FRESHWORKS_CLIENT_SECRET",
    "FRESHSALES_CLIENT_SECRET",
    "FRESHCHAT_CLIENT_SECRET",
    "FRESHWORKS_REFRESH_TOKEN",
    "FRESHSALES_REFRESH_TOKEN",
    "FRESHCHAT_REFRESH_TOKEN",
    "FRESHWORKS_ACCESS_TOKEN",
    "FRESHSALES_ACCESS_TOKEN",
    "FRESHCHAT_ACCESS_TOKEN",
  ];

  return Object.fromEntries(
    checks.map((name) => [name, Deno.env.get(name)?.trim() ? "present" : "missing"]),
  );
}

export function firstNonEmpty(values: Array<string | null | undefined>, fallback = "") {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return fallback;
}

export function generateOauthState() {
  return crypto.randomUUID();
}

export function buildFreshworksAuthorizeUrl(options?: {
  clientId?: string | null;
  authorizeUrl?: string | null;
  redirectUri?: string | null;
  scopes?: string | null;
  state?: string | null;
  responseType?: string | null;
}) {
  const config = resolveFreshworksOauthConfig();
  const clientId = firstNonEmpty([options?.clientId, config.clientId]);
  const authorizeUrl = firstNonEmpty([options?.authorizeUrl, config.authorizeUrl]);
  const redirectUri = firstNonEmpty([
    options?.redirectUri,
    Deno.env.get("FRESHWORKS_REDIRECT_URI"),
    Deno.env.get("FRESHSALES_REDIRECT_URI"),
    Deno.env.get("FRESHCHAT_REDIRECT_URI"),
    Deno.env.get("REDIRECT_URI"),
    Deno.env.get("OAUTH_CALLBACK_URL"),
  ]);
  const scopes = firstNonEmpty([
    options?.scopes,
    Deno.env.get("FRESHWORKS_SCOPES"),
    Deno.env.get("FRESHSALES_SCOPES"),
    Deno.env.get("FRESHCHAT_SCOPES"),
  ]);
  const state = firstNonEmpty([options?.state], generateOauthState());
  const responseType = firstNonEmpty([options?.responseType], "code");

  if (!authorizeUrl || !clientId || !redirectUri || !scopes) {
    throw new Error("Freshworks OAuth config incompleto para gerar authorize URL");
  }

  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", responseType);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", state);

  return {
    config,
    state,
    redirectUri,
    scopes,
      responseType,
      authorizeUrl: url.toString(),
      clientId,
      authorizeBaseUrl: authorizeUrl,
  };
}

export async function resolveFreshworksAccessToken() {
  const config = resolveFreshworksOauthConfig();

  if (config.accessToken) {
    return {
      accessToken: config.accessToken,
      authMode: "access_token",
      config,
    };
  }

  if (!config.clientId || !config.clientSecret || !config.refreshToken || !config.tokenUrl) {
    throw new Error("Freshworks OAuth config incompleto para obter access token");
  }

  const basic = btoa(`${config.clientId}:${config.clientSecret}`);
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Falha ao renovar token Freshworks: ${response.status} ${detail}`);
  }

  const payload = await response.json();
  const token = String(payload.access_token || "").trim();
  if (!token) {
    throw new Error("Resposta OAuth Freshworks sem access_token");
  }

  return {
    accessToken: token,
    authMode: "refresh_token",
    config,
  };
}

export async function freshchatGet(
  path: string,
  accessToken: string,
  baseUrl: string,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`Freshchat ${path} falhou com ${response.status}: ${text}`);
  }

  return json;
}

export function safeAgentSnapshot(agent: any) {
  if (!agent || typeof agent !== "object") return agent;

  return {
    id: agent.id ?? agent.agent_id ?? null,
    name: agent.name ?? agent.display_name ?? null,
    email: agent.email ?? null,
    role_id: agent.role_id ?? agent.roleId ?? null,
    role_ids: agent.role_ids ?? null,
    groups: agent.groups ?? agent.group_ids ?? null,
    availability: agent.availability_status ?? agent.availability ?? null,
    status: agent.status ?? null,
    type: agent.type ?? null,
  };
}
