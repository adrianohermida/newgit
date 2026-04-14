"use strict";

const { cleanValue, firstEnv } = require("./env");
const { resolveFreshworksConfig } = require("./freshworks-config");

function resolveFreshworksRedirectUri(env = process.env) {
  const explicit = firstEnv(["FRESHWORKS_REDIRECT_URI", "FRESHSALES_REDIRECT_URI", "FRESHCHAT_REDIRECT_URI", "REDIRECT_URI", "OAUTH_CALLBACK_URL"], env);
  if (explicit) return explicit;
  const supabaseUrl = firstEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], env);
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/oauth`;
}

function resolveFreshworksScopes(env = process.env, target = "freshsales") {
  if (target === "freshchat") return firstEnv(["FRESHCHAT_SCOPES", "FRESHWORKS_SCOPES"], env);
  if (target === "freshdesk") return firstEnv(["FRESHDESK_SCOPES", "FRESHWORKS_SCOPES"], env);
  return firstEnv(["FRESHSALES_SCOPES", "FRESHSALES_DEALS_SCOPES", "FRESHSALES_CONTACTS_SCOPES", "FRESHWORKS_SCOPES"], env) || [
    "freshsales.deals.view",
    "freshsales.deals.create",
    "freshsales.deals.edit",
    "freshsales.deals.upsert",
    "freshsales.contacts.view",
    "freshsales.contacts.create",
    "freshsales.contacts.edit",
    "freshsales.contacts.upsert",
    "freshsales.settings.fields.view",
  ].join(" ");
}

function buildAuthorizeUrl(env = process.env, target = "freshsales") {
  const config = resolveFreshworksConfig(env);
  const redirectUri = resolveFreshworksRedirectUri(env);
  const scopes = resolveFreshworksScopes(env, target);
  const state = firstEnv(["FRESHWORKS_OAUTH_STATE", "FRESHSALES_OAUTH_STATE"], env) || "integration-kit";

  if (!config.clientId || !config.authorizeUrl || !redirectUri || !scopes) {
    return {
      ok: false,
      error: "Configuracao OAuth incompleta para gerar a URL de autorizacao.",
      clientIdPresent: Boolean(config.clientId),
      authorizeUrlPresent: Boolean(config.authorizeUrl),
      redirectUriPresent: Boolean(redirectUri),
      scopesPresent: Boolean(scopes),
    };
  }

  const url = new URL(config.authorizeUrl);
  url.searchParams.set("client_id", config.clientId);
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
  resolveFreshworksRedirectUri,
  resolveFreshworksScopes,
};
