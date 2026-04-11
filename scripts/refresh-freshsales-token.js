#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('../lib/integration-kit/runtime');

const ENV_PATH = path.join(process.cwd(), '.dev.vars');

loadRuntimeEnv(process.cwd(), process.env);

async function main() {
  const kind = resolveKind(process.argv.slice(2));
  const orgDomain = resolveOrgDomain();
  const clientId = resolveFreshsalesOauthClientId(kind);
  const clientSecret = resolveFreshsalesOauthClientSecret(kind);
  const refreshToken = cleanValue(process.env[resolveRefreshTokenEnvKey(kind)]);
  const supabaseUrl = cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const redirectUri =
    cleanValue(process.env.FRESHSALES_REDIRECT_URI) ||
    cleanValue(process.env.REDIRECT_URI) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CALLBACK_URL) ||
    cleanValue(process.env.OAUTH_CALLBACK_URL) ||
    (supabaseUrl ? `${supabaseUrl}/functions/v1/oauth` : null);

  if (!orgDomain || !clientId || !clientSecret || !refreshToken || !redirectUri) {
    throw new Error('Credenciais OAuth de Deals (ou genéricas), FRESHSALES_REFRESH_TOKEN, redirect_uri e org domain sao obrigatorios');
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
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
    throw new Error(`Refresh Freshsales falhou (${response.status}): ${JSON.stringify(payload).slice(0, 500)}`);
  }

  const nextRefreshToken = cleanValue(payload.refresh_token) || refreshToken;
  const expiresIn = Number(payload.expires_in || 1799);
  const expiryEpochMs = Date.now() + expiresIn * 1000;
  persistEnvUpdates({
    [resolveAccessTokenEnvKey(kind)]: payload.access_token,
    [resolveRefreshTokenEnvKey(kind)]: nextRefreshToken,
    [resolveExpiresInEnvKey(kind)]: String(expiresIn),
    [resolveTokenExpiryEnvKey(kind)]: String(expiryEpochMs),
    [resolveTokenTypeEnvKey(kind)]: cleanValue(payload.token_type) || 'Bearer',
    FRESHSALES_ORG_DOMAIN: orgDomain,
  });

  console.log(JSON.stringify({
    ok: true,
    kind,
    org_domain: orgDomain,
    expires_in: expiresIn,
    token_type: cleanValue(payload.token_type) || 'Bearer',
    persisted: fs.existsSync(ENV_PATH),
  }, null, 2));
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function resolveKind(args) {
  const joined = args.join(' ').toLowerCase();
  if (joined.includes('products')) return 'products';
  if (joined.includes('contacts')) return 'contacts';
  return 'deals';
}

function resolveFreshsalesOauthClientId(kind) {
  if (kind === 'products') {
    return (
      cleanValue(process.env.FRESHSALES_OAUTH_PRODUCTS_CLIENT_ID) ||
      cleanValue(process.env.FRESHSALES_PRODUCT_OAUTH_CLIENT_ID) ||
      cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) ||
      cleanValue(process.env.FRESHSALES_DEAL_OAUTH_CLIENT_ID) ||
      cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID)
    );
  }
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

function resolveFreshsalesOauthClientSecret(kind) {
  if (kind === 'products') {
    return (
      cleanValue(process.env.FRESHSALES_OAUTH_PRODUCTS_CLIENT_SECRET) ||
      cleanValue(process.env.FRESHSALES_PRODUCT_OAUTH_CLIENT_SECRET) ||
      cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) ||
      cleanValue(process.env.FRESHSALES_DEAL_OAUTH_CLIENT_SECRET) ||
      cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET)
    );
  }
  if (kind === 'contacts') {
    return (
      cleanValue(process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET) ||
      cleanValue(process.env.FRESHSALES_CONTACT_OAUTH_CLIENT_SECRET) ||
      cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET)
    );
  }
  return (
    cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) ||
    cleanValue(process.env.FRESHSALES_DEAL_OAUTH_CLIENT_SECRET) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET)
  );
}

function resolveAccessTokenEnvKey(kind) {
  if (kind === 'products') return 'FRESHSALES_PRODUCTS_ACCESS_TOKEN';
  if (kind === 'contacts') return 'FRESHSALES_CONTACTS_ACCESS_TOKEN';
  return 'FRESHSALES_ACCESS_TOKEN';
}

function resolveRefreshTokenEnvKey(kind) {
  if (kind === 'products') return 'FRESHSALES_PRODUCTS_REFRESH_TOKEN';
  if (kind === 'contacts') return 'FRESHSALES_CONTACTS_REFRESH_TOKEN';
  return 'FRESHSALES_REFRESH_TOKEN';
}

function resolveExpiresInEnvKey(kind) {
  if (kind === 'products') return 'FRESHSALES_PRODUCTS_EXPIRES_IN';
  if (kind === 'contacts') return 'FRESHSALES_CONTACTS_EXPIRES_IN';
  return 'FRESHSALES_EXPIRES_IN';
}

function resolveTokenExpiryEnvKey(kind) {
  if (kind === 'products') return 'FRESHSALES_PRODUCTS_TOKEN_EXPIRY';
  if (kind === 'contacts') return 'FRESHSALES_CONTACTS_TOKEN_EXPIRY';
  return 'FRESHSALES_TOKEN_EXPIRY';
}

function resolveTokenTypeEnvKey(kind) {
  if (kind === 'products') return 'FRESHSALES_PRODUCTS_TOKEN_TYPE';
  if (kind === 'contacts') return 'FRESHSALES_CONTACTS_TOKEN_TYPE';
  return 'FRESHSALES_TOKEN_TYPE';
}

function resolveOrgDomain() {
  return (
    cleanValue(process.env.FRESHSALES_ORG_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_DOMAIN) ||
    readOrgDomainFromAccessToken(process.env.FRESHSALES_ACCESS_TOKEN) ||
    readOrgDomainFromApiBase(process.env.FRESHSALES_API_BASE || process.env.FRESHSALES_BASE_URL || process.env.FRESHSALES_ALIAS_DOMAIN || process.env.FRESHSALES_DOMAIN) ||
    null
  );
}

function readOrgDomainFromApiBase(raw) {
  const value = cleanValue(raw);
  if (!value) return null;
  const host = value
    .replace(/^https?:\/\//i, '')
    .replace(/\/(crm\/sales\/api|api)\/?$/i, '')
    .trim();
  if (!host) return null;
  if (host.includes('myfreshworks.com')) return host;
  if (host.endsWith('.freshsales.io')) return host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
  return null;
}

function readOrgDomainFromAccessToken(token) {
  const raw = cleanValue(token);
  if (!raw || !raw.includes('.')) return null;
  try {
    const parts = raw.split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(Buffer.from(base64UrlDecode(parts[1]), 'base64').toString('utf8'));
    const fromClaim = cleanValue(payload.organisation_domain || payload.org_domain);
    if (fromClaim) return fromClaim;
    const issuer = cleanValue(payload.iss);
    if (issuer) return issuer.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return null;
  } catch {
    return null;
  }
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4;
  if (pad === 2) return `${normalized}==`;
  if (pad === 3) return `${normalized}=`;
  if (pad === 1) return `${normalized}===`;
  return normalized;
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
