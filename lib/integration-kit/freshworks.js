"use strict";

const { cleanValue, ensureHttps, firstEnv, hostOnly } = require("./env");

function resolveFreshworksConfig(env = process.env) {
  const orgBaseUrl = ensureHttps(
    firstEnv(
      [
        "FRESHWORKS_ORG_BASE_URL",
        "FRESHWORKS_BASE_URL",
        "FRESHSALES_ALIAS_DOMAIN",
        "FRESHSALES_BASE_DOMAIN",
        "FRESHSALES_DOMAIN",
        "FRESHWORKS_DOMAIN",
        "FRESHSALES_ORG_DOMAIN",
      ],
      env,
    ),
    null,
  );

  const orgHost = hostOnly(orgBaseUrl);
  const freshsalesApiBaseRaw = firstEnv(
    ["FRESHSALES_API_BASE", "FRESHSALES_BASE_URL", "FRESHSALES_DOMAIN", "FRESHSALES_ALIAS_DOMAIN"],
    env,
  );
  const freshsalesApiBase = resolveFreshsalesApiBase(freshsalesApiBaseRaw, orgHost);
  const freshdeskDomain = ensureHttps(firstEnv(["FRESHDESK_DOMAIN"], env), null);
  const freshchatBaseUrl = ensureHttps(
    firstEnv(["FRESHCHAT_API_BASE", "FRESHCHAT_BASE_URL", "FRESHCHAT_DOMAIN", "FRESHCHAT_SERVER"], env),
    "https://msdk.eu.freshchat.com",
  );
  const authorizeUrl = firstEnv(
    ["FRESHWORKS_OAUTH_AUTHORIZE_URL", "FRESHSALES_OAUTH_AUTHORIZE_URL", "FRESHSALES_AUTHORIZE_URL"],
    env,
  ) || (orgBaseUrl ? `${orgBaseUrl}/org/oauth/v2/authorize` : null);
  const tokenUrl = firstEnv(
    ["FRESHWORKS_OAUTH_TOKEN_URL", "FRESHSALES_OAUTH_TOKEN_URL", "ACCESS_TOKEN_URL"],
    env,
  ) || (orgBaseUrl ? `${orgBaseUrl}/org/oauth/v2/token` : null);

  return {
    orgBaseUrl,
    orgHost,
    freshsalesApiBase,
    freshdeskDomain,
    freshchatBaseUrl,
    authorizeUrl,
    tokenUrl,
    clientId: firstEnv(
      [
        "FRESHWORKS_OAUTH_CLIENT_ID",
        "FRESHSALES_OAUTH_CLIENT_ID",
        "FRESHSALES_OAUTH_DEALS_CLIENT_ID",
        "FRESHSALES_OAUTH_CONTACTS_CLIENT_ID",
      ],
      env,
    ),
    clientSecret: firstEnv(
      [
        "FRESHWORKS_OAUTH_CLIENT_SECRET",
        "FRESHSALES_OAUTH_CLIENT_SECRET",
        "FRESHSALES_OAUTH_DEALS_CLIENT_SECRET",
        "FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET",
      ],
      env,
    ),
    accessToken: firstEnv(["FRESHWORKS_ACCESS_TOKEN", "FRESHSALES_ACCESS_TOKEN", "FRESHCHAT_ACCESS_TOKEN"], env),
    refreshToken: firstEnv(["FRESHWORKS_REFRESH_TOKEN", "FRESHSALES_REFRESH_TOKEN", "FRESHCHAT_REFRESH_TOKEN"], env),
  };
}

function resolveFreshsalesApiBase(rawValue, orgHost = null) {
  const raw = cleanValue(rawValue);
  if (raw) {
    const ensured = ensureHttps(raw, null);
    if (ensured.includes("/crm/sales/api")) {
      return ensured.replace(/\/+$/, "");
    }
    if (ensured.includes("/api")) {
      return ensured.replace(/\/api\/?$/i, "/crm/sales/api");
    }
    return `${ensured}/crm/sales/api`;
  }

  if (!orgHost) return null;
  return `https://${orgHost}/crm/sales/api`;
}

function resolveFreshworksRedirectUri(env = process.env) {
  const explicit = firstEnv(
    ["FRESHWORKS_REDIRECT_URI", "FRESHSALES_REDIRECT_URI", "FRESHCHAT_REDIRECT_URI", "REDIRECT_URI", "OAUTH_CALLBACK_URL"],
    env,
  );
  if (explicit) return explicit;

  const supabaseUrl = firstEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], env);
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/oauth`;
}

function resolveFreshworksScopes(env = process.env, target = "freshsales") {
  if (target === "freshchat") {
    return firstEnv(["FRESHCHAT_SCOPES", "FRESHWORKS_SCOPES"], env);
  }

  if (target === "freshdesk") {
    return firstEnv(["FRESHDESK_SCOPES", "FRESHWORKS_SCOPES"], env);
  }

  return (
    firstEnv(
      [
        "FRESHSALES_SCOPES",
        "FRESHSALES_DEALS_SCOPES",
        "FRESHSALES_CONTACTS_SCOPES",
        "FRESHWORKS_SCOPES",
      ],
      env,
    ) ||
    [
      "freshsales.deals.view",
      "freshsales.deals.create",
      "freshsales.deals.edit",
      "freshsales.deals.upsert",
      "freshsales.contacts.view",
      "freshsales.contacts.create",
      "freshsales.contacts.edit",
      "freshsales.contacts.upsert",
      "freshsales.settings.fields.view",
    ].join(" ")
  );
}

function buildAuthorizeUrl(env = process.env, target = "freshsales") {
  const config = resolveFreshworksConfig(env);
  const clientId = config.clientId;
  const authorizeUrl = config.authorizeUrl;
  const redirectUri = resolveFreshworksRedirectUri(env);
  const scopes = resolveFreshworksScopes(env, target);
  const state = firstEnv(["FRESHWORKS_OAUTH_STATE", "FRESHSALES_OAUTH_STATE"], env) || "integration-kit";

  if (!clientId || !authorizeUrl || !redirectUri || !scopes) {
    return {
      ok: false,
      error: "Configuracao OAuth incompleta para gerar a URL de autorizacao.",
      clientIdPresent: Boolean(clientId),
      authorizeUrlPresent: Boolean(authorizeUrl),
      redirectUriPresent: Boolean(redirectUri),
      scopesPresent: Boolean(scopes),
    };
  }

  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", `${target}:${state}`);

  return {
    ok: true,
    authorizeUrl: url.toString(),
    redirectUri,
    scopes: scopes.split(/\s+/).filter(Boolean),
    state: `${target}:${state}`,
    orgBaseUrl: config.orgBaseUrl,
  };
}

function buildFreshworksDiagnostics(env = process.env) {
  const config = resolveFreshworksConfig(env);
  return {
    org_base_url: config.orgBaseUrl,
    freshsales_api_base: config.freshsalesApiBase,
    freshdesk_domain: config.freshdeskDomain,
    freshchat_base_url: config.freshchatBaseUrl,
    authorize_url: config.authorizeUrl,
    token_url: config.tokenUrl,
    redirect_uri: resolveFreshworksRedirectUri(env),
    scopes: resolveFreshworksScopes(env, "freshsales"),
    has_client_id: Boolean(config.clientId),
    has_client_secret: Boolean(config.clientSecret),
    has_access_token: Boolean(config.accessToken),
    has_refresh_token: Boolean(config.refreshToken),
    has_freshdesk_api_key: Boolean(cleanValue(env.FRESHDESK_API_KEY)),
    has_freshsales_api_key: Boolean(cleanValue(env.FRESHSALES_API_KEY)),
    has_supabase_service_role: Boolean(cleanValue(env.SUPABASE_SERVICE_ROLE_KEY)),
  };
}

module.exports = {
  buildAuthorizeUrl,
  buildFreshworksDiagnostics,
  resolveFreshworksConfig,
  resolveFreshworksRedirectUri,
  resolveFreshworksScopes,
  resolveFreshsalesApiBase,
};
