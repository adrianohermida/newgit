"use strict";

const { cleanValue, ensureHttps, firstEnv, hostOnly } = require("./portable-env");

function resolveFreshsalesApiBase(rawValue, orgHost = null) {
  const raw = cleanValue(rawValue);
  if (raw) {
    const ensured = ensureHttps(raw, null);
    if (ensured.includes("/crm/sales/api")) return ensured.replace(/\/+$/, "");
    if (ensured.includes("/api")) return ensured.replace(/\/api\/?$/i, "/crm/sales/api");
    return `${ensured}/crm/sales/api`;
  }
  if (!orgHost) return null;
  return `https://${orgHost}/crm/sales/api`;
}

function resolveFreshworksConfig(env = {}) {
  const orgBaseUrl = ensureHttps(firstEnv([
    "FRESHWORKS_ORG_BASE_URL",
    "FRESHWORKS_BASE_URL",
    "FRESHSALES_ALIAS_DOMAIN",
    "FRESHSALES_BASE_DOMAIN",
    "FRESHSALES_DOMAIN",
    "FRESHWORKS_DOMAIN",
    "FRESHSALES_ORG_DOMAIN",
  ], env), null);
  const orgHost = hostOnly(orgBaseUrl);
  const freshsalesApiBase = resolveFreshsalesApiBase(
    firstEnv(["FRESHSALES_API_BASE", "FRESHSALES_BASE_URL", "FRESHSALES_DOMAIN", "FRESHSALES_ALIAS_DOMAIN"], env),
    orgHost
  );

  return {
    orgBaseUrl,
    orgHost,
    freshsalesApiBase,
    freshdeskDomain: ensureHttps(firstEnv(["FRESHDESK_DOMAIN"], env), null),
    freshchatBaseUrl: ensureHttps(
      firstEnv(["FRESHCHAT_API_BASE", "FRESHCHAT_BASE_URL", "FRESHCHAT_DOMAIN", "FRESHCHAT_SERVER"], env),
      "https://msdk.eu.freshchat.com"
    ),
    authorizeUrl: firstEnv(
      ["FRESHWORKS_OAUTH_AUTHORIZE_URL", "FRESHSALES_OAUTH_AUTHORIZE_URL", "FRESHSALES_AUTHORIZE_URL"],
      env
    ) || (orgBaseUrl ? `${orgBaseUrl}/org/oauth/v2/authorize` : null),
    tokenUrl: firstEnv(
      ["FRESHWORKS_OAUTH_TOKEN_URL", "FRESHSALES_OAUTH_TOKEN_URL", "ACCESS_TOKEN_URL"],
      env
    ) || (orgBaseUrl ? `${orgBaseUrl}/org/oauth/v2/token` : null),
    clientId: firstEnv(["FRESHWORKS_OAUTH_CLIENT_ID", "FRESHSALES_OAUTH_CLIENT_ID"], env),
    clientSecret: firstEnv(["FRESHWORKS_OAUTH_CLIENT_SECRET", "FRESHSALES_OAUTH_CLIENT_SECRET"], env),
    accessToken: firstEnv(["FRESHWORKS_ACCESS_TOKEN", "FRESHSALES_ACCESS_TOKEN"], env),
    refreshToken: firstEnv(["FRESHWORKS_REFRESH_TOKEN", "FRESHSALES_REFRESH_TOKEN"], env),
  };
}

function resolveFreshworksRedirectUri(env = {}) {
  const explicit = firstEnv(["FRESHWORKS_REDIRECT_URI", "FRESHSALES_REDIRECT_URI", "REDIRECT_URI", "OAUTH_CALLBACK_URL"], env);
  if (explicit) return explicit;
  const supabaseUrl = firstEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], env);
  return supabaseUrl ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/oauth` : null;
}

function resolveFreshworksScopes(env = {}) {
  return firstEnv(["FRESHSALES_SCOPES", "FRESHWORKS_SCOPES"], env) || [
    "freshsales.deals.view",
    "freshsales.deals.create",
    "freshsales.contacts.view",
    "freshsales.contacts.create",
    "freshsales.settings.fields.view",
  ].join(" ");
}

function buildAuthorizeUrl(env = {}) {
  const config = resolveFreshworksConfig(env);
  const clientId = config.clientId;
  const authorizeUrl = config.authorizeUrl;
  const redirectUri = resolveFreshworksRedirectUri(env);
  const scopes = resolveFreshworksScopes(env);
  const state = firstEnv(["FRESHWORKS_OAUTH_STATE", "FRESHSALES_OAUTH_STATE"], env) || "integration-kit";

  if (!clientId || !authorizeUrl || !redirectUri || !scopes) {
    return { ok: false, error: "Configuracao OAuth incompleta para gerar a URL de autorizacao." };
  }

  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", `freshsales:${state}`);

  return {
    ok: true,
    authorizeUrl: url.toString(),
    redirectUri,
    scopes: scopes.split(/\s+/).filter(Boolean),
    state: `freshsales:${state}`,
    orgBaseUrl: config.orgBaseUrl,
  };
}

module.exports = {
  buildAuthorizeUrl,
  resolveFreshworksConfig,
  resolveFreshworksRedirectUri,
  resolveFreshworksScopes,
};
