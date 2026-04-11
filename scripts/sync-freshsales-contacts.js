#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv, resolveWorkspaceId } = require('../lib/integration-kit/runtime');

const runtime = loadRuntimeEnv(process.cwd(), process.env);

async function main() {
  const workspaceId = process.argv[2] || resolveWorkspaceId(runtime) || null;
  let snapshots = await safeLoadSnapshots(
    "freshsales_sync_snapshots?entity=eq.contacts&select=source_id,display_name,emails,phones,custom_attributes,raw_payload,synced_at"
  );
  let rows = [];

  if (snapshots.length) {
    rows = snapshots.map((snapshot) => mapSnapshotToContactRow(snapshot, workspaceId));
  } else {
    const liveContacts = await fetchFreshsalesContactsLive();
    rows = liveContacts.map((contact) => mapLiveContactToRow(contact, workspaceId));
  }

  if (!rows.length) {
    console.log('Nenhum contact encontrado em snapshots nem na API do Freshsales.');
    return;
  }

  const chunkSize = 200;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const batch = rows.slice(index, index + chunkSize);
    await supabaseRequest('freshsales_contacts?on_conflict=freshsales_contact_id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
  }

  console.log(`freshsales_contacts atualizado com ${rows.length} registro(s).`);
}

function mapSnapshotToContactRow(snapshot, workspaceId) {
  const payload = snapshot.raw_payload || {};
  const emails = asArray(snapshot.emails);
  const phones = asArray(snapshot.phones);
  const custom = snapshot.custom_attributes || {};
  const primaryEmail = firstTruthy(emails) || payload.email || payload.primary_email || null;
  const primaryPhone = firstTruthy(phones) || payload.mobile_number || payload.work_number || payload.phone || null;

  return {
    workspace_id: workspaceId,
    freshsales_contact_id: String(snapshot.source_id),
    name: snapshot.display_name || payload.display_name || payload.name || null,
    email: primaryEmail,
    email_normalized: normalizeEmail(primaryEmail),
    phone: primaryPhone,
    phone_normalized: normalizePhone(primaryPhone),
    lifecycle_stage: cleanValue(custom.cf_fase_ciclo_vida || payload.cf_fase_ciclo_vida),
    meeting_stage: cleanValue(custom.cf_reuniao_status || payload.cf_reuniao_status),
    negotiation_stage: cleanValue(custom.cf_negociacao_status || payload.cf_negociacao_status),
    closing_stage: cleanValue(custom.cf_fechamento_status || payload.cf_fechamento_status),
    client_stage: cleanValue(custom.cf_cliente_status || payload.cf_cliente_status),
    raw_payload: payload,
    last_synced_at: snapshot.synced_at,
  };
}

function mapLiveContactToRow(contact, workspaceId) {
  const emails = asArray(contact.emails || contact.email);
  const phones = asArray([
    contact.mobile_number,
    contact.work_number,
    contact.phone,
  ]);
  const custom = contact.custom_field || contact.custom_fields || {};
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || contact.name || null;
  const primaryEmail = firstTruthy(emails);
  const primaryPhone = firstTruthy(phones);

  return {
    workspace_id: workspaceId,
    freshsales_contact_id: String(contact.id),
    name,
    email: primaryEmail,
    email_normalized: normalizeEmail(primaryEmail),
    phone: primaryPhone,
    phone_normalized: normalizePhone(primaryPhone),
    lifecycle_stage: cleanValue(custom.cf_fase_ciclo_vida),
    meeting_stage: cleanValue(custom.cf_reuniao_status),
    negotiation_stage: cleanValue(custom.cf_negociacao_status),
    closing_stage: cleanValue(custom.cf_fechamento_status),
    client_stage: cleanValue(custom.cf_cliente_status),
    raw_payload: contact,
    last_synced_at: new Date().toISOString(),
  };
}

function resolveFreshsalesBase() {
  const raw = cleanValue(process.env.FRESHSALES_API_BASE || process.env.FRESHSALES_BASE_URL || process.env.FRESHSALES_DOMAIN);
  if (!raw) throw new Error('FRESHSALES_API_BASE/FRESHSALES_BASE_URL/FRESHSALES_DOMAIN nao configurado');
  const base = raw.startsWith('http') ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
  if (base.includes('/crm/sales/api')) return base;
  if (base.includes('/api')) return base;
  return `${base}/crm/sales/api`;
}

function resolveFreshsalesBases() {
  const raw =
    cleanValue(process.env.FRESHSALES_API_BASE) ||
    cleanValue(process.env.FRESHSALES_BASE_URL) ||
    cleanValue(process.env.FRESHSALES_ALIAS_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_DOMAIN);
  const orgDomain = resolveOrgDomain();
  const bases = [];
  const push = (value) => {
    if (!value) return;
    if (!bases.includes(value)) bases.push(value);
  };

  if (orgDomain) {
    push(`https://${orgDomain}/crm/sales/api`);
    push(`https://${orgDomain}/api`);
  }

  if (raw) {
    const base = raw.startsWith('http') ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
    if (base.includes('/crm/sales/api') || base.includes('/api')) {
      const host = base.replace(/^https?:\/\//i, '').replace(/\/(crm\/sales\/api|api)\/?$/i, '');
      const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
      push(`https://${host}/crm/sales/api`);
      push(`https://${host}/api`);
      push(`https://${myfreshworksHost}/crm/sales/api`);
      push(`https://${myfreshworksHost}/api`);
      push(base);
    } else {
      const host = base.replace(/^https?:\/\//i, '');
      const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
      push(`${base}/crm/sales/api`);
      push(`${base}/api`);
      push(`https://${myfreshworksHost}/crm/sales/api`);
      push(`https://${myfreshworksHost}/api`);
    }
  }

  if (!bases.length) {
    const fallback = resolveFreshsalesBase();
    if (fallback) push(fallback);
  }

  return bases;
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
    scope: cleanValue(process.env.FRESHSALES_CONTACTS_SCOPES) || cleanValue(process.env.FRESHSALES_SCOPES) || null,
    updated_at: new Date().toISOString(),
  });
}

function resolveOrgDomain() {
  const direct =
    cleanValue(process.env.FRESHSALES_ORG_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_ALIAS_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_API_BASE) ||
    cleanValue(process.env.FRESHSALES_BASE_URL) ||
    null;
  if (!direct) return null;

  const host = String(direct)
    .replace(/^https?:\/\//i, '')
    .replace(/\/(crm\/sales\/api|api|crm\/sales)\/?$/i, '')
    .replace(/\/+$/, '');

  if (host.includes('myfreshworks.com')) return host;
  if (host.endsWith('.freshsales.io')) return host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
  return host || null;
}

function resolveRedirectUri() {
  return (
    cleanValue(process.env.FRESHSALES_REDIRECT_URI) ||
    cleanValue(process.env.REDIRECT_URI) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CALLBACK_URL) ||
    cleanValue(process.env.OAUTH_CALLBACK_URL) ||
    resolveSupabaseOauthUrl('callback')?.replace(/\?action=callback$/, '') ||
    null
  );
}

async function refreshOauthRow(refreshToken) {
  const clientId =
    cleanValue(process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_ID) ||
    cleanValue(process.env.FRESHSALES_CONTACT_OAUTH_CLIENT_ID) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID);
  const clientSecret =
    cleanValue(process.env.FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET) ||
    cleanValue(process.env.FRESHSALES_CONTACT_OAUTH_CLIENT_SECRET) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_SECRET);
  const orgDomain = resolveOrgDomain();
  const redirectUri = resolveRedirectUri();
  if (!clientId || !clientSecret || !orgDomain || !redirectUri || !refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: redirectUri,
  });
  const basicAuth = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

  const response = await fetch(`https://${orgDomain}/org/oauth/v2/token`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuth,
    },
    body,
  }).catch(() => null);

  if (!response?.ok) return null;
  const payload = await response.json().catch(() => ({}));
  if (!payload?.access_token) return null;

  await upsertStoredOauthRow({
    provider: 'freshsales',
    access_token: payload.access_token,
    refresh_token: payload.refresh_token || refreshToken,
    expires_at: new Date(Date.now() + Number(payload.expires_in || 1799) * 1000).toISOString(),
    token_type: payload.token_type || 'Bearer',
    scope: payload.scope || cleanValue(process.env.FRESHSALES_CONTACTS_SCOPES) || cleanValue(process.env.FRESHSALES_SCOPES) || null,
    updated_at: new Date().toISOString(),
  });

  return payload.access_token;
}

async function ensureSupabaseOauthSeed() {
  const baseSeedUrl = resolveSupabaseOauthUrl('seed');
  const seedUrl = baseSeedUrl ? `${baseSeedUrl}&kind=contacts` : null;
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
  const baseTokenUrl = resolveSupabaseOauthUrl('token');
  const tokenUrl = baseTokenUrl ? `${baseTokenUrl}&kind=contacts` : null;
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
    if (seeded) row = await getStoredOauthRow();
  }
  if (!row?.access_token) return null;

  const expiresAt = new Date(row.expires_at || 0).getTime();
  const shouldRefresh = row.refresh_token && (!expiresAt || Date.now() >= expiresAt - 60_000);
  if (shouldRefresh) {
    const refreshed = await refreshOauthRow(row.refresh_token);
    if (refreshed) return refreshed;
  }
  return row.access_token;
}

async function freshsalesHeaderCandidates() {
  const apiKey = cleanValue(process.env.FRESHSALES_API_KEY);
  const basicAuth = cleanValue(process.env.FRESHSALES_BASIC_AUTH);
  const accessToken = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  const explicitMode = cleanValue(process.env.FRESHSALES_AUTH_MODE);
  const supabaseOauthToken = await getSupabaseOauthAccessToken();
  const candidates = [];

  if (apiKey) {
    candidates.push({
      __mode: 'api_key',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Token token=${apiKey}`,
    });
  }
  if (basicAuth) {
    candidates.push({
      __mode: 'basic_auth',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: /^Basic\s+/i.test(basicAuth) ? basicAuth : `Basic ${basicAuth}`,
    });
  }
  if (supabaseOauthToken) {
    candidates.push({
      __mode: 'supabase_oauth',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Authtoken=${supabaseOauthToken}`,
    });
  }
  if (accessToken) {
    candidates.push({
      __mode: 'access_token',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Authtoken=${accessToken}`,
    });
  }
  if (!candidates.length) throw new Error('Credenciais do Freshsales ausentes');

  if (explicitMode === 'oauth') {
    candidates.sort((left, right) => {
      const rank = (mode) => mode === 'supabase_oauth' ? 0 : mode === 'access_token' ? 1 : 2;
      return rank(left.__mode) - rank(right.__mode);
    });
  } else if (!explicitMode && (supabaseOauthToken || accessToken)) {
    candidates.sort((left, right) => {
      const rank = (mode) => {
        if (mode === 'supabase_oauth') return 0;
        if (mode === 'access_token') return 1;
        if (mode === 'api_key') return 2;
        if (mode === 'basic_auth') return 3;
        return 4;
      };
      return rank(left.__mode) - rank(right.__mode);
    });
  }

  return candidates;
}

async function fetchFreshsalesContactsLive() {
  const items = [];
  const attemptErrors = [];

  for (const base of resolveFreshsalesBases()) {
    for (const headers of await freshsalesHeaderCandidates()) {
      let page = 1;
      let baseItems = [];
      let baseFailed = false;

      while (page <= 10) {
        const response = await fetch(`${base}/contacts/view/1?page=${page}&per_page=100`, { headers }).catch((error) => {
          attemptErrors.push(`${base}/contacts/view/1?page=${page}&per_page=100: ${String(error.message || error)}`);
          return null;
        });

        if (!response) {
          baseFailed = true;
          break;
        }

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          attemptErrors.push(`${base}/contacts/view/1?page=${page}&per_page=100 -> ${response.status}: ${payload.message || payload.error || JSON.stringify(payload).slice(0, 300)}`);
          baseFailed = true;
          break;
        }

        const batch = Array.isArray(payload.contacts) ? payload.contacts : [];
        if (!batch.length) break;
        baseItems.push(...batch);
        if (batch.length < 100) break;
        page += 1;
      }

      if (!baseFailed && baseItems.length) {
        items.push(...baseItems);
        return items;
      }
    }
  }

  const authOnlyFailures = attemptErrors.length > 0 && attemptErrors.every((item) => item.includes('-> 401:') || item.includes('-> 403:'));
  if (authOnlyFailures) {
    console.warn('Freshsales contacts request retornou apenas 401/403. Seguindo sem sync direto de contacts e deixando o import de deals preencher contatos possiveis.');
    return [];
  }

  throw new Error(attemptErrors.join(' | ') || 'Freshsales contacts request failed');
}

function asArray(value) {
  if (Array.isArray(value)) return value.flatMap((item) => asArray(item));
  if (!value) return [];
  if (typeof value === 'object') return Object.values(value).flatMap((item) => asArray(item));
  return [String(value).trim()].filter(Boolean);
}

function firstTruthy(values) {
  return values.find(Boolean) || null;
}

function normalizeEmail(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || null;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits || null;
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

async function supabaseRequest(pathname, init = {}) {
  const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios');
  }

  const response = await fetch(`${baseUrl}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function safeLoadSnapshots(pathname) {
  try {
    return await supabaseRequest(pathname);
  } catch (error) {
    const message = String(error?.message || error);
    if (
      message.includes('PGRST205') ||
      message.includes("Could not find the table 'public.freshsales_sync_snapshots'") ||
      message.includes('schema cache')
    ) {
      return [];
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
