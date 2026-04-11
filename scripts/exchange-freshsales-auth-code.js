#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(process.cwd(), '.dev.vars');

loadLocalEnv();

async function main() {
  const args = process.argv.slice(2);
  const kind = resolveKind(args);
  const code = cleanValue(args.find((arg) => !String(arg).startsWith('--') && arg !== 'deals' && arg !== 'contacts'));
  const orgDomain = resolveOrgDomain();
  const clientId = resolveOauthClientId(kind);
  const clientSecret = resolveOauthClientSecret(kind);
  const supabaseUrl = cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const redirectUri =
    cleanValue(process.env.FRESHSALES_REDIRECT_URI) ||
    cleanValue(process.env.REDIRECT_URI) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CALLBACK_URL) ||
    cleanValue(process.env.OAUTH_CALLBACK_URL) ||
    (supabaseUrl ? `${supabaseUrl}/functions/v1/oauth` : null);

  if (!code || !orgDomain || !clientId || !clientSecret || !redirectUri) {
    throw new Error('code, credenciais OAuth de Deals (ou genéricas), org domain e redirect_uri sao obrigatorios');
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const basicAuth = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

  const response = await fetch(`https://${orgDomain}/org/oauth/v2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: basicAuth,
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(`Exchange Freshsales falhou (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
  }

  const expiresIn = Number(payload.expires_in || 1799);
  const expiryEpochMs = Date.now() + expiresIn * 1000;
  persistEnvUpdates({
    FRESHSALES_ACCESS_TOKEN: payload.access_token,
    FRESHSALES_REFRESH_TOKEN: cleanValue(payload.refresh_token) || '',
    FRESHSALES_EXPIRES_IN: String(expiresIn),
    FRESHSALES_TOKEN_EXPIRY: String(expiryEpochMs),
    FRESHSALES_TOKEN_TYPE: cleanValue(payload.token_type) || 'Bearer',
    FRESHSALES_ORG_DOMAIN: orgDomain,
  });

  console.log(JSON.stringify({
    ok: true,
    kind,
    org_domain: orgDomain,
    token_type: cleanValue(payload.token_type) || 'Bearer',
    expires_in: expiresIn,
    persisted: fs.existsSync(ENV_PATH),
    has_refresh_token: Boolean(cleanValue(payload.refresh_token)),
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
      cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) ||
      cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID)
    );
  }
  return (
    cleanValue(process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_ID) ||
    cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID)
  );
}

function resolveOauthClientSecret(kind) {
  if (kind === 'contacts') {
    return (
      cleanValue(process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET) ||
      cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) ||
      cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET)
    );
  }
  return (
    cleanValue(process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET) ||
    cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET)
  );
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

function persistEnvUpdates(pairs) {
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : [];
  const keys = new Set(Object.keys(pairs));
  const output = [];
  const seen = new Set();

  for (const line of existing) {
    if (!line || line.trim().startsWith('#') || !line.includes('=')) {
      output.push(line);
      continue;
    }

    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    if (!keys.has(key)) {
      output.push(line);
      continue;
    }

    output.push(`${key}=${pairs[key]}`);
    seen.add(key);
  }

  for (const [key, value] of Object.entries(pairs)) {
    if (seen.has(key)) continue;
    output.push(`${key}=${value}`);
  }

  fs.writeFileSync(ENV_PATH, output.join('\r\n'), 'utf8');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
