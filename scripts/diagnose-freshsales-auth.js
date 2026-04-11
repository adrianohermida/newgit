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
      has_client_id: Boolean(resolveFreshsalesOauthClientId()),
      has_client_secret: Boolean(resolveFreshsalesOauthClientSecret()),
      has_deals_client_id: Boolean(cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) || cleanValue(process.env.FRESHSALES_DEAL_OAUTH_CLIENT_ID)),
      has_deals_client_secret: Boolean(cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) || cleanValue(process.env.FRESHSALES_DEAL_OAUTH_CLIENT_SECRET)),
      has_contacts_client_id: Boolean(cleanValue(process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_ID) || cleanValue(process.env.FRESHSALES_CONTACT_OAUTH_CLIENT_ID)),
      has_contacts_client_secret: Boolean(cleanValue(process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET) || cleanValue(process.env.FRESHSALES_CONTACT_OAUTH_CLIENT_SECRET)),
      has_refresh_token: Boolean(cleanValue(process.env.FRESHSALES_REFRESH_TOKEN)),
      has_org_domain: Boolean(resolveOrgDomain()),
      has_redirect_uri: Boolean(cleanValue(process.env.FRESHSALES_REDIRECT_URI) || cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)),
      has_supabase_oauth_endpoint: Boolean(resolveSupabaseOauthUrl('status')),
    },
    probes: [],
    supabase_oauth: await inspectSupabaseOauth(),
    refresh: null,
    token_claims: inspectAccessTokenClaims(),
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

function inspectAccessTokenClaims() {
  const token = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  if (!token || !token.includes('.')) return null;
  try {
    const parts = token.split('.');
    const payload = JSON.parse(Buffer.from(base64UrlDecode(parts[1]), 'base64').toString('utf8'));
    return {
      iss: cleanValue(payload.iss),
      aud: cleanValue(payload.aud),
      organisation_domain: cleanValue(payload.organisation_domain || payload.org_domain),
      scope_count: Array.isArray(payload.scope) ? payload.scope.length : typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean).length : 0,
      scope_sample: Array.isArray(payload.scope) ? payload.scope.slice(0, 8) : typeof payload.scope === 'string' ? payload.scope.split(/\s+/).filter(Boolean).slice(0, 8) : [],
      exp: payload.exp || null,
      iat: payload.iat || null,
    };
  } catch (error) {
    return { decode_error: String(error.message || error) };
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

function resolveFreshsalesOauthClientId() {
  return (
    cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) ||
    cleanValue(process.env.FRESHSALES_DEAL_OAUTH_CLIENT_ID) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID)
  );
}

function resolveFreshsalesOauthClientSecret() {
  return (
    cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) ||
    cleanValue(process.env.FRESHSALES_DEAL_OAUTH_CLIENT_SECRET) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET)
  );
}

function resolveFreshsalesOauthScope() {
  return (
    cleanValue(process.env.FRESHSALES_DEALS_SCOPES) ||
    cleanValue(process.env.FRESHSALES_DEAL_SCOPES) ||
    cleanValue(process.env.FRESHSALES_SCOPES)
  );
}

function resolveFreshsalesBases() {
  const raw = resolveFreshsalesBase();
  const orgDomain = resolveOrgDomain();
  const bases = [];
  if (raw) {
    const base = raw.startsWith('http') ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
    if (base.includes('/crm/sales/api')) {
      const host = base.replace(/^https?:\/\//i, '').replace(/\/(crm\/sales\/api|api)\/?$/i, '');
      const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
      bases.push(
        base,
        `https://${host}/crm/sales/api`,
        `https://${myfreshworksHost}/crm/sales/api`,
      );
    } else if (base.includes('/api')) {
      const host = base.replace(/^https?:\/\//i, '').replace(/\/api\/?$/i, '');
      const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
      bases.push(
        `https://${host}/crm/sales/api`,
        `https://${myfreshworksHost}/crm/sales/api`,
      );
    } else {
      const host = base.replace(/^https?:\/\//i, '');
      const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
      bases.push(
        `${base}/crm/sales/api`,
        `https://${myfreshworksHost}/crm/sales/api`,
      );
    }
  }
  if (orgDomain) {
    bases.push(`https://${orgDomain}/crm/sales/api`);
  }
  return Array.from(new Set(bases));
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
      headers: { Authorization: `Authtoken=${supabaseOauthToken}` },
    });
  }
  if (accessToken) {
    modes.push({
      name: 'access_token',
      headers: { Authorization: `Authtoken=${accessToken}` },
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

function resolveSupabaseRestBase() {
  const supabaseUrl = cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
}

async function supabaseRestRequest(pathname, init = {}) {
  const base = resolveSupabaseRestBase();
  const serviceRoleKey = cleanValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!base || !serviceRoleKey) return null;

  const response = await fetch(`${base}/${pathname}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  }).catch(() => null);

  if (!response) return null;
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function getStoredOauthRow() {
  const result = await supabaseRestRequest('freshsales_oauth_tokens?provider=eq.freshsales&select=provider,access_token,refresh_token,expires_at,token_type,scope,updated_at&limit=1');
  if (!result?.response?.ok) return null;
  return Array.isArray(result.payload) ? result.payload[0] || null : result.payload || null;
}

async function upsertStoredOauthRow(row) {
  const result = await supabaseRestRequest('freshsales_oauth_tokens?on_conflict=provider', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  });
  return Boolean(result?.response?.ok);
}

async function seedOauthRowFromEnv() {
  const accessToken = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  const refreshToken = cleanValue(process.env.FRESHSALES_REFRESH_TOKEN);
  if (!accessToken || !refreshToken) return false;

  const expiryTs = Number(cleanValue(process.env.FRESHSALES_TOKEN_EXPIRY) || '0');
  const fallbackExpiresIn = Number(cleanValue(process.env.FRESHSALES_EXPIRES_IN) || '1799');
  const expiresInSeconds = expiryTs > Date.now()
    ? Math.max(30, Math.round((expiryTs - Date.now()) / 1000))
    : fallbackExpiresIn;

  return upsertStoredOauthRow({
    provider: 'freshsales',
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    token_type: cleanValue(process.env.FRESHSALES_TOKEN_TYPE) || 'Bearer',
    scope: resolveFreshsalesOauthScope() || null,
    updated_at: new Date().toISOString(),
  });
}

async function ensureSupabaseOauthSeed() {
  const seedUrl = resolveSupabaseOauthUrl('seed');
  if (seedUrl && cleanValue(process.env.FRESHSALES_ACCESS_TOKEN) && cleanValue(process.env.FRESHSALES_REFRESH_TOKEN)) {
    const response = await fetch(seedUrl, {
      method: 'POST',
      headers: supabaseOauthHeaders(),
    }).catch(() => null);

    if (response?.ok) return true;
  }

  return seedOauthRowFromEnv();
}

async function getSupabaseOauthAccessToken() {
  const tokenUrl = resolveSupabaseOauthUrl('token');
  if (tokenUrl) {
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
    if (initial?.missing) {
      const seeded = await ensureSupabaseOauthSeed();
      if (seeded) {
        const retried = await requestToken();
        if (typeof retried === 'string') return retried;
      }
    }
  }

  let row = await getStoredOauthRow();
  if (!row) {
    const seeded = await seedOauthRowFromEnv();
    if (seeded) {
      row = await getStoredOauthRow();
    }
  }
  if (!row?.access_token) return null;

  const expiresAt = new Date(row.expires_at || 0).getTime();
  const shouldRefresh = row.refresh_token && (!expiresAt || Date.now() >= expiresAt - 60_000);
  if (shouldRefresh) {
    const refreshed = await tryRefresh(true);
    if (refreshed?.ok && refreshed.access_token) return refreshed.access_token;
    row = await getStoredOauthRow();
  }

  return row?.access_token || null;
}

async function inspectSupabaseOauth() {
  const statusUrl = resolveSupabaseOauthUrl('status');
  if (statusUrl) {
    const response = await fetch(statusUrl, {
      method: 'GET',
      headers: supabaseOauthHeaders(),
    }).catch((error) => ({ ok: false, status: 0, __error: error }));

    if (response && !response.__error) {
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
        source: 'edge_function',
      };
    }
  }

  const row = await getStoredOauthRow();
  if (!row) {
    return {
      attempted: true,
      ok: false,
      status: 404,
      authorized: false,
      valid: false,
      expires_at: null,
      has_refresh_token: false,
      message: statusUrl ? 'Requested function was not found' : 'missing_supabase_url',
      source: 'rest_table',
    };
  }

  const expiresAt = new Date(row.expires_at || 0).getTime();
  return {
    attempted: true,
    ok: Boolean(row.access_token),
    status: 200,
    authorized: Boolean(row.access_token),
    valid: Boolean(expiresAt && Date.now() < expiresAt - 60_000),
    expires_at: row.expires_at || null,
    has_refresh_token: Boolean(row.refresh_token),
    message: null,
    source: 'rest_table',
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
    resolveFreshsalesOauthClientId() &&
    resolveFreshsalesOauthClientSecret() &&
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

async function tryRefresh(returnToken = false) {
  const orgDomain = resolveOrgDomain();
  const clientId = resolveFreshsalesOauthClientId();
  const clientSecret = resolveFreshsalesOauthClientSecret();
  const refreshToken = cleanValue(process.env.FRESHSALES_REFRESH_TOKEN);
  const supabaseUrl = cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const redirectUri = cleanValue(process.env.FRESHSALES_REDIRECT_URI || process.env.REDIRECT_URI || process.env.FRESHSALES_OAUTH_CALLBACK_URL || process.env.OAUTH_CALLBACK_URL) || (supabaseUrl ? `${supabaseUrl}/functions/v1/oauth` : null);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
  });
  const basicAuth = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

  try {
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
    if (response.ok && payload?.access_token) {
      await upsertStoredOauthRow({
        provider: 'freshsales',
        access_token: payload.access_token,
        refresh_token: payload.refresh_token || refreshToken,
        expires_at: new Date(Date.now() + Number(payload.expires_in || 1799) * 1000).toISOString(),
        token_type: payload.token_type || 'Bearer',
        scope: payload.scope || resolveFreshsalesOauthScope() || null,
        updated_at: new Date().toISOString(),
      });
    }
    return {
      attempted: true,
      ok: response.ok && Boolean(payload.access_token),
      status: response.status,
      message: summarizePayload(payload),
      raw_payload_keys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
      has_access_token: Boolean(payload.access_token),
      has_refresh_token: Boolean(payload.refresh_token),
      access_token: returnToken ? payload.access_token || null : undefined,
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
