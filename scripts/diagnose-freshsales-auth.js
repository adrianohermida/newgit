#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(process.cwd(), '.dev.vars');

loadLocalEnv();

async function main() {
  const bases = resolveFreshsalesBases();
  const authModes = await resolveAuthModes();
  const report = {
    generated_at: new Date().toISOString(),
    bases,
    auth_modes: authModes.map((item) => item.name),
    oauth_env: {
      has_api_key: Boolean(cleanValue(process.env.FRESHSALES_API_KEY)),
      has_basic_auth: Boolean(cleanValue(process.env.FRESHSALES_BASIC_AUTH)),
      has_client_id: Boolean(cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID)),
      has_client_secret: Boolean(cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET)),
      has_refresh_token: Boolean(cleanValue(process.env.FRESHSALES_REFRESH_TOKEN)),
      has_org_domain: Boolean(resolveOrgDomain()),
      has_redirect_uri: Boolean(cleanValue(process.env.FRESHSALES_REDIRECT_URI) || cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)),
      has_supabase_oauth_endpoint: Boolean(resolveSupabaseOauthUrl('status')),
    },
    probes: [],
    supabase_oauth: await inspectSupabaseOauth(),
    refresh: null,
  };

  for (const base of bases) {
    for (const auth of authModes) {
      const probe = await runProbe(base, auth);
      report.probes.push(probe);
    }
  }

  if (hasRefreshEnv()) {
    report.refresh = await tryRefresh();
  } else {
    report.refresh = {
      attempted: false,
      reason: 'missing_refresh_env',
    };
  }

  console.log(JSON.stringify(report, null, 2));
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

function resolveFreshsalesBases() {
  const raw = resolveFreshsalesBase();
  if (!raw) return [];
  const base = raw.startsWith('http') ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
  if (base.includes('/crm/sales/api') || base.includes('/api')) {
    const host = base.replace(/^https?:\/\//i, '').replace(/\/(crm\/sales\/api|api)\/?$/i, '');
    const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
    return Array.from(new Set([
      base,
      `https://${host}/api`,
      `https://${host}/crm/sales/api`,
      `https://${myfreshworksHost}/api`,
      `https://${myfreshworksHost}/crm/sales/api`,
    ]));
  }
  const host = base.replace(/^https?:\/\//i, '');
  const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
  return Array.from(new Set([
    `${base}/api`,
    `${base}/crm/sales/api`,
    `https://${myfreshworksHost}/api`,
    `https://${myfreshworksHost}/crm/sales/api`,
  ]));
}

function resolveFreshsalesBase() {
  const direct =
    cleanValue(process.env.FRESHSALES_API_BASE) ||
    expandEnvTemplate(cleanValue(process.env.FRESHSALES_BASE_URL)) ||
    cleanValue(process.env.FRESHSALES_ALIAS_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_DOMAIN);
  if (!direct) return null;
  return direct.startsWith('http') ? direct : `https://${direct}`;
}

function expandEnvTemplate(value) {
  const text = cleanValue(value);
  if (!text) return null;
  return text.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, key) => cleanValue(process.env[key]) || '');
}

async function resolveAuthModes() {
  const modes = [];
  const apiKey = cleanValue(process.env.FRESHSALES_API_KEY);
  const basicAuth = cleanValue(process.env.FRESHSALES_BASIC_AUTH);
  const accessToken = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  const explicitMode = cleanValue(process.env.FRESHSALES_AUTH_MODE);
  if (apiKey) {
    modes.push({
      name: 'api_key',
      headers: { Authorization: `Token token=${apiKey}` },
    });
  }
  if (basicAuth) {
    modes.push({
      name: 'basic_auth',
      headers: { Authorization: /^Basic\s+/i.test(basicAuth) ? basicAuth : `Basic ${basicAuth}` },
    });
  }
  const supabaseOauthToken = await getSupabaseOauthAccessToken();
  if (supabaseOauthToken) {
    modes.push({
      name: 'supabase_oauth',
      headers: { Authorization: `Bearer ${supabaseOauthToken}` },
    });
  }
  if (accessToken) {
    modes.push({
      name: 'access_token',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
  if (explicitMode === 'oauth') {
    return modes.sort((left, right) => {
      const leftRank = left.name === 'supabase_oauth' ? 0 : left.name === 'access_token' ? 1 : 2;
      const rightRank = right.name === 'supabase_oauth' ? 0 : right.name === 'access_token' ? 1 : 2;
      return leftRank - rightRank;
    });
  }
  if (explicitMode) {
    return modes.sort((left, right) => (left.name === explicitMode ? -1 : right.name === explicitMode ? 1 : 0));
  }
  if (apiKey) {
    return modes.sort((left, right) => (left.name === 'api_key' ? -1 : right.name === 'api_key' ? 1 : 0));
  }
  return modes;
}

function resolveSupabaseOauthUrl(action = 'token') {
  const supabaseUrl = cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/oauth?action=${encodeURIComponent(action)}`;
}

function supabaseOauthHeaders() {
  const serviceRoleKey = cleanValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (!serviceRoleKey) return headers;
  return {
    ...headers,
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

async function ensureSupabaseOauthSeed() {
  const seedUrl = resolveSupabaseOauthUrl('seed');
  if (!seedUrl) return false;
  if (!cleanValue(process.env.FRESHSALES_ACCESS_TOKEN) || !cleanValue(process.env.FRESHSALES_REFRESH_TOKEN)) {
    return false;
  }

  const response = await fetch(seedUrl, {
    method: 'POST',
    headers: supabaseOauthHeaders(),
  }).catch(() => null);

  return Boolean(response?.ok);
}

async function getSupabaseOauthAccessToken() {
  const tokenUrl = resolveSupabaseOauthUrl('token');
  if (!tokenUrl) return null;

  const requestToken = async () => {
    const response = await fetch(tokenUrl, {
      method: 'GET',
      headers: supabaseOauthHeaders(),
    }).catch(() => null);

    if (!response) return null;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404 || response.status === 400) return { missing: true };
      return null;
    }

    return payload?.access_token || null;
  };

  const initial = await requestToken();
  if (typeof initial === 'string') return initial;
  if (!initial?.missing) return null;

  const seeded = await ensureSupabaseOauthSeed();
  if (!seeded) return null;

  const retried = await requestToken();
  return typeof retried === 'string' ? retried : null;
}

async function inspectSupabaseOauth() {
  const statusUrl = resolveSupabaseOauthUrl('status');
  if (!statusUrl) {
    return {
      attempted: false,
      reason: 'missing_supabase_url',
    };
  }

  const response = await fetch(statusUrl, {
    method: 'GET',
    headers: supabaseOauthHeaders(),
  }).catch((error) => ({ ok: false, status: 0, __error: error }));

  if (!response || response.__error) {
    return {
      attempted: true,
      ok: false,
      status: 0,
      message: String(response?.__error?.message || response?.__error || 'unknown_error'),
    };
  }

  const payload = await response.json().catch(() => ({}));
  return {
    attempted: true,
    ok: response.ok && Boolean(payload?.authorized),
    status: response.status,
    authorized: Boolean(payload?.authorized),
    valid: Boolean(payload?.valid),
    expires_at: payload?.expires_at || null,
    has_refresh_token: Boolean(payload?.has_refresh_token),
    message: summarizePayload(payload),
  };
}

async function runProbe(base, auth) {
  const endpoints = [
    '/settings/deals/fields',
    '/sales_accounts/filters',
    '/deals/filters',
  ];
  const results = [];

  for (const endpoint of endpoints) {
    const startedAt = Date.now();
    try {
      const response = await fetch(`${base}${endpoint}`, {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          ...auth.headers,
        },
      });
      const payloadText = await response.text();
      let payload = null;
      try {
        payload = payloadText ? JSON.parse(payloadText) : null;
      } catch {
        payload = payloadText ? payloadText.slice(0, 300) : null;
      }

      results.push({
        endpoint,
        ok: response.ok,
        status: response.status,
        duration_ms: Date.now() - startedAt,
        message: summarizePayload(payload),
      });
    } catch (error) {
      results.push({
        endpoint,
        ok: false,
        status: 0,
        duration_ms: Date.now() - startedAt,
        message: String(error.message || error),
      });
    }
  }

  return {
    base,
    auth_mode: auth.name,
    ok: results.some((item) => item.ok),
    results,
  };
}

function summarizePayload(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload.slice(0, 180);
  return (
    payload.message ||
    payload.error ||
    payload.description ||
    payload.errors?.[0]?.message ||
    payload.errors?.[0] ||
    null
  );
}

function hasRefreshEnv() {
  return Boolean(
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID) &&
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET) &&
    cleanValue(process.env.FRESHSALES_REFRESH_TOKEN) &&
    resolveOrgDomain() &&
    cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)
  );
}

function resolveOrgDomain() {
  return (
    cleanValue(process.env.FRESHSALES_ORG_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_DOMAIN) ||
    hostOnly(cleanValue(process.env.FRESHSALES_ALIAS_DOMAIN)) ||
    readOrgDomainFromApiBase(resolveFreshsalesBase()) ||
    null
  );
}

function hostOnly(value) {
  const text = cleanValue(value);
  if (!text) return null;
  return text.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
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

async function tryRefresh() {
  const orgDomain = resolveOrgDomain();
  const clientId = cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID);
  const clientSecret = cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET);
  const refreshToken = cleanValue(process.env.FRESHSALES_REFRESH_TOKEN);
  const supabaseUrl = cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const redirectUri = cleanValue(process.env.FRESHSALES_REDIRECT_URI || process.env.REDIRECT_URI || process.env.FRESHSALES_OAUTH_CALLBACK_URL || process.env.OAUTH_CALLBACK_URL) || (supabaseUrl ? `${supabaseUrl}/functions/v1/oauth` : null);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  try {
    const response = await fetch(`https://${orgDomain}/crm/sales/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
    });
    const payload = await response.json().catch(() => ({}));
    return {
      attempted: true,
      ok: response.ok && Boolean(payload.access_token),
      status: response.status,
      message: summarizePayload(payload),
      raw_payload_keys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
      has_access_token: Boolean(payload.access_token),
      has_refresh_token: Boolean(payload.refresh_token),
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      status: 0,
      message: String(error.message || error),
      raw_payload_keys: [],
      has_access_token: false,
      has_refresh_token: false,
    };
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
