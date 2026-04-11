#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(process.cwd(), '.dev.vars');

loadLocalEnv();

function main() {
  const kind = resolveKind(process.argv.slice(2));
  const orgDomain = resolveOrgDomain();
  const clientId = resolveOauthClientId(kind);
  const supabaseUrl = cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const redirectUri =
    cleanValue(process.env.FRESHSALES_REDIRECT_URI) ||
    cleanValue(process.env.REDIRECT_URI) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CALLBACK_URL) ||
    cleanValue(process.env.OAUTH_CALLBACK_URL) ||
    (supabaseUrl ? `${supabaseUrl}/functions/v1/oauth` : null);
  const state = `${kind}:${cleanValue(process.env.FRESHSALES_OAUTH_STATE) || 'hmadv-billing'}`;
  const scopes = resolveScopes(kind) || [
    'freshsales.deals.create',
    'freshsales.deals.edit',
    'freshsales.deals.view',
    'freshsales.deals.upsert',
    'freshsales.deals.delete',
    'freshsales.deals.fields.view',
    'freshsales.deals.filters.view',
    'freshsales.settings.fields.view',
  ].join(' ');

  if (!orgDomain || !clientId || !redirectUri) {
    throw new Error('Credenciais OAuth de Deals (ou genéricas), org domain e redirect_uri sao obrigatorios');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    scope: scopes,
  });

  const authorizationUrl = `https://${orgDomain}/org/oauth/v2/authorize?${params.toString()}`;

  console.log(JSON.stringify({
    ok: true,
    kind,
    org_domain: orgDomain,
    redirect_uri: redirectUri,
    scopes: scopes.split(/\s+/).filter(Boolean),
    authorization_url: authorizationUrl,
  }, null, 2));
}

function loadLocalEnv() {
  if (!fs.existsSync(ENV_PATH)) return;
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function resolveKind(args) {
  const joined = args.join(' ').toLowerCase();
  return joined.includes('contacts') ? 'contacts' : 'deals';
}

function resolveOauthClientId(kind) {
  if (kind === 'contacts') {
    return (
      cleanValue(process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_ID) ||
      cleanValue(process.env.FRESHSALES_CONTACT_OAUTH_CLIENT_ID) ||
      cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID)
    );
  }
  return (
    cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) ||
    cleanValue(process.env.FRESHSALES_DEAL_OAUTH_CLIENT_ID) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID)
  );
}

function resolveScopes(kind) {
  if (kind === 'contacts') {
    return cleanValue(process.env.FRESHSALES_CONTACTS_SCOPES) || cleanValue(process.env.FRESHSALES_CONTACT_SCOPES) || cleanValue(process.env.FRESHSALES_SCOPES) || cleanValue(process.env.FRESHSALES_OAUTH_SCOPES);
  }
  return cleanValue(process.env.FRESHSALES_DEALS_SCOPES) || cleanValue(process.env.FRESHSALES_DEAL_SCOPES) || cleanValue(process.env.FRESHSALES_SCOPES) || cleanValue(process.env.FRESHSALES_OAUTH_SCOPES);
}

function resolveOrgDomain() {
  const explicit = cleanValue(process.env.FRESHSALES_ORG_DOMAIN) || cleanValue(process.env.FRESHSALES_DOMAIN);
  if (explicit) return explicit;
  const rawBase = cleanValue(process.env.FRESHSALES_API_BASE || process.env.FRESHSALES_BASE_URL || process.env.FRESHSALES_ALIAS_DOMAIN || process.env.FRESHSALES_DOMAIN);
  if (!rawBase) return null;
  const host = rawBase
    .replace(/^https?:\/\//i, '')
    .replace(/\/(crm\/sales\/api|api)\/?$/i, '')
    .trim();
  if (!host) return null;
  if (host.includes('myfreshworks.com')) return host;
  if (host.endsWith('.freshsales.io')) return host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
  return host;
}

main();
