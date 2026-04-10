#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(process.cwd(), '.dev.vars');

loadLocalEnv();

function main() {
  const orgDomain = resolveOrgDomain();
  const clientId = cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID);
  const supabaseUrl = cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const redirectUri =
    cleanValue(process.env.FRESHSALES_REDIRECT_URI) ||
    cleanValue(process.env.REDIRECT_URI) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CALLBACK_URL) ||
    cleanValue(process.env.OAUTH_CALLBACK_URL) ||
    (supabaseUrl ? `${supabaseUrl}/functions/v1/oauth` : null);
  const state = cleanValue(process.env.FRESHSALES_OAUTH_STATE) || 'hmadv-billing';
  const scopes = cleanValue(process.env.FRESHSALES_SCOPES) || cleanValue(process.env.FRESHSALES_OAUTH_SCOPES) || [
    'freshsales.contacts.create',
    'freshsales.contacts.edit',
    'freshsales.contacts.view',
    'freshsales.sales_accounts.create',
    'freshsales.sales_accounts.edit',
    'freshsales.sales_accounts.view',
    'freshsales.deals.create',
    'freshsales.deals.edit',
    'freshsales.deals.view',
    'freshsales.settings.fields.view',
  ].join(' ');

  if (!orgDomain || !clientId || !redirectUri) {
    throw new Error('FRESHSALES_OAUTH_CLIENT_ID, org domain e redirect_uri sao obrigatorios');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
    scope: scopes,
  });

  const authorizationUrl = `https://${orgDomain}/crm/sales/oauth/authorize?${params.toString()}`;

  console.log(JSON.stringify({
    ok: true,
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
