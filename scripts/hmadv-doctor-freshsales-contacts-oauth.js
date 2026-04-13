#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { loadRuntimeEnv } = require("../lib/integration-kit/runtime");

const ENV_PATH = path.join(process.cwd(), ".dev.vars");

loadRuntimeEnv(process.cwd(), process.env);

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}

function main() {
  const orgDomain = resolveOrgDomain();
  const clientId = first(
    process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_ID,
    process.env.FRESHSALES_CONTACT_OAUTH_CLIENT_ID,
    process.env.FRESHSALES_OAUTH_CLIENT_ID
  );
  const clientSecret = first(
    process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET,
    process.env.FRESHSALES_CONTACT_OAUTH_CLIENT_SECRET,
    process.env.FRESHSALES_OAUTH_CLIENT_SECRET
  );
  const refreshToken = first(process.env.FRESHSALES_CONTACTS_REFRESH_TOKEN);
  const accessToken = first(process.env.FRESHSALES_CONTACTS_ACCESS_TOKEN);
  const scopes =
    first(
      process.env.FRESHSALES_CONTACTS_SCOPES,
      process.env.FRESHSALES_CONTACT_SCOPES,
      process.env.FRESHSALES_SCOPES
    ) || "";
  const redirectUri = resolveRedirectUri();
  const authUrl = buildAuthorizeUrl({ orgDomain, clientId, redirectUri, scopes });

  const result = {
    ok: true,
    kind: "contacts",
    env: {
      has_org_domain: Boolean(orgDomain),
      has_client_id: Boolean(clientId),
      has_client_secret: Boolean(clientSecret),
      has_contacts_scopes: Boolean(scopes),
      has_contacts_refresh_token: Boolean(refreshToken),
      has_contacts_access_token: Boolean(accessToken),
      has_redirect_uri: Boolean(redirectUri),
      env_file_found: fs.existsSync(ENV_PATH),
    },
    status: refreshToken ? "ready_for_refresh" : "authorization_required",
    authorization_url: authUrl || null,
    next_steps: refreshToken
      ? [
          "node scripts/refresh-freshsales-token.js contacts",
          "node scripts/diagnose-freshsales-auth.js",
          "node scripts/hmadv-validate-contact-pilot.js",
        ]
      : [
          "Abra a authorization_url no navegador e autorize o app de contacts.",
          "Copie o code retornado no redirect.",
          "Rode: node scripts/exchange-freshsales-auth-code.js contacts <CODE>",
          "Depois rode: node scripts/refresh-freshsales-token.js contacts",
          "Depois rode: node scripts/hmadv-validate-contact-pilot.js",
        ],
    missing: collectMissing({
      orgDomain,
      clientId,
      clientSecret,
      scopes,
      redirectUri,
      refreshToken,
    }),
  };

  console.log(JSON.stringify(result, null, 2));
}

function first(...values) {
  for (const value of values) {
    const clean = String(value || "").trim();
    if (clean) return clean;
  }
  return null;
}

function resolveOrgDomain() {
  const explicit = first(process.env.FRESHSALES_ORG_DOMAIN, process.env.FRESHSALES_DOMAIN);
  if (explicit) return explicit;
  const rawBase = first(
    process.env.FRESHSALES_API_BASE,
    process.env.FRESHSALES_BASE_URL,
    process.env.FRESHSALES_ALIAS_DOMAIN,
    process.env.FRESHSALES_DOMAIN
  );
  if (!rawBase) return null;
  const host = rawBase
    .replace(/^https?:\/\//i, "")
    .replace(/\/(crm\/sales\/api|api)\/?$/i, "")
    .trim();
  if (!host) return null;
  if (host.includes("myfreshworks.com")) return host;
  if (host.endsWith(".freshsales.io")) return host.replace(/\.freshsales\.io$/i, ".myfreshworks.com");
  return host;
}

function resolveRedirectUri() {
  const supabaseUrl = first(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL);
  return first(
    process.env.FRESHSALES_REDIRECT_URI,
    process.env.REDIRECT_URI,
    process.env.FRESHSALES_OAUTH_CALLBACK_URL,
    process.env.OAUTH_CALLBACK_URL,
    supabaseUrl ? `${supabaseUrl}/functions/v1/oauth` : null
  );
}

function buildAuthorizeUrl({ orgDomain, clientId, redirectUri, scopes }) {
  if (!orgDomain || !clientId || !redirectUri || !scopes) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    state: `contacts:${first(process.env.FRESHSALES_OAUTH_STATE, "hmadv-billing")}`,
    scope: scopes,
  });
  return `https://${orgDomain}/org/oauth/v2/authorize?${params.toString()}`;
}

function collectMissing({ orgDomain, clientId, clientSecret, scopes, redirectUri, refreshToken }) {
  const missing = [];
  if (!orgDomain) missing.push("FRESHSALES_ORG_DOMAIN/FRESHSALES_DOMAIN");
  if (!clientId) missing.push("FRESHSALES_OAUTH_CONTACTS_CLIENT_ID");
  if (!clientSecret) missing.push("FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET");
  if (!scopes) missing.push("FRESHSALES_CONTACTS_SCOPES");
  if (!redirectUri) missing.push("FRESHSALES_REDIRECT_URI ou SUPABASE_URL");
  if (!refreshToken) missing.push("FRESHSALES_CONTACTS_REFRESH_TOKEN");
  return missing;
}
