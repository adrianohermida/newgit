#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ENV_PATH = path.join(process.cwd(), '.dev.vars');

loadLocalEnv();

async function main() {
  const bases = resolveFreshsalesBases();
  const authModes = resolveAuthModes();
  const report = {
    generated_at: new Date().toISOString(),
    bases,
    auth_modes: authModes.map((item) => item.name),
    oauth_env: {
      has_client_id: Boolean(cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID)),
      has_client_secret: Boolean(cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET)),
      has_refresh_token: Boolean(cleanValue(process.env.FRESHSALES_REFRESH_TOKEN)),
      has_org_domain: Boolean(resolveOrgDomain()),
      has_redirect_uri: Boolean(cleanValue(process.env.FRESHSALES_REDIRECT_URI) || cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)),
    },
    probes: [],
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
  const raw = cleanValue(process.env.FRESHSALES_API_BASE || process.env.FRESHSALES_BASE_URL || process.env.FRESHSALES_DOMAIN);
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

function resolveAuthModes() {
  const modes = [];
  const apiKey = cleanValue(process.env.FRESHSALES_API_KEY);
  const accessToken = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  if (apiKey) {
    modes.push({
      name: 'api_key',
      headers: { Authorization: `Token token=${apiKey}` },
    });
  }
  if (accessToken) {
    modes.push({
      name: 'access_token',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
  return modes;
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
    readOrgDomainFromApiBase(process.env.FRESHSALES_API_BASE || process.env.FRESHSALES_BASE_URL || process.env.FRESHSALES_DOMAIN) ||
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

async function tryRefresh() {
  const orgDomain = resolveOrgDomain();
  const clientId = cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID);
  const clientSecret = cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET);
  const refreshToken = cleanValue(process.env.FRESHSALES_REFRESH_TOKEN);
  const supabaseUrl = cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: `${supabaseUrl}/functions/v1/oauth`,
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
