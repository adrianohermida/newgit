#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const limit = sanitizePositiveInt(process.argv[2], 50);
  const specificReceivableId = sanitizeReceivableId(process.argv[3]);
  const receivables = await loadReceivables(limit, specificReceivableId);

  if (!receivables.length) {
    console.log('Nenhum receivable apto para publicar em deals.');
    return;
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const row of receivables) {
    try {
      const result = await publishDeal(row);
      if (result.mode === 'created') created += 1;
      if (result.mode === 'updated') updated += 1;
    } catch (error) {
      failed += 1;
      await upsertDealRegistry(row, null, {
        last_sync_status: 'error',
        last_sync_error: String(error.message || error).slice(0, 1000),
        payload_last_sent: { external_reference: buildExternalReference(row) },
      });
    }
  }

  console.log(JSON.stringify({ total: receivables.length, created, updated, failed }, null, 2));
}

function sanitizePositiveInt(value, fallback) {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeReceivableId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    return text;
  }
  return null;
}

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), '.dev.vars');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function resolveFreshsalesBases() {
  const raw = process.env.FRESHSALES_API_BASE || expandEnvTemplate(process.env.FRESHSALES_BASE_URL) || process.env.FRESHSALES_ALIAS_DOMAIN || process.env.FRESHSALES_DOMAIN;
  const orgDomain = resolveOrgDomain();
  const bases = [];
  const push = (value) => {
    if (!value) return;
    if (!bases.includes(value)) bases.push(value);
  };
  if (!raw && !orgDomain) throw new Error('FRESHSALES_API_BASE/FRESHSALES_BASE_URL/FRESHSALES_DOMAIN nao configurado');
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
  return bases;
}

function expandEnvTemplate(value) {
  const text = cleanValue(value);
  if (!text) return null;
  return text.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, key) => cleanValue(process.env[key]) || '');
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
    scope: cleanValue(process.env.FRESHSALES_DEALS_SCOPES) || cleanValue(process.env.FRESHSALES_DEAL_SCOPES) || cleanValue(process.env.FRESHSALES_SCOPES) || null,
    updated_at: new Date().toISOString(),
  });
}

function resolveOrgDomain() {
  const direct =
    cleanValue(process.env.FRESHSALES_ORG_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_ALIAS_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_API_BASE) ||
    expandEnvTemplate(process.env.FRESHSALES_BASE_URL) ||
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
    cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_ID) ||
    cleanValue(process.env.FRESHSALES_DEAL_OAUTH_CLIENT_ID) ||
    cleanValue(process.env.FRESHSALES_OAUTH_CLIENT_ID);
  const clientSecret =
    cleanValue(process.env.FRESHSALES_OAUTH_DEALS_CLIENT_SECRET) ||
    cleanValue(process.env.FRESHSALES_DEAL_OAUTH_CLIENT_SECRET) ||
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
    scope: payload.scope || cleanValue(process.env.FRESHSALES_DEALS_SCOPES) || cleanValue(process.env.FRESHSALES_DEAL_SCOPES) || cleanValue(process.env.FRESHSALES_SCOPES) || null,
    updated_at: new Date().toISOString(),
  });

  return payload.access_token;
}

async function ensureSupabaseOauthSeed() {
  const baseSeedUrl = resolveSupabaseOauthUrl('seed');
  const seedUrl = baseSeedUrl ? `${baseSeedUrl}&kind=deals` : null;
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
  const tokenUrl = baseTokenUrl ? `${baseTokenUrl}&kind=deals` : null;
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
    const refreshed = await refreshOauthRow(row.refresh_token);
    if (refreshed) return refreshed;
  }

  return row.access_token;
}

async function freshsalesHeaderCandidates() {
  const apiKey = process.env.FRESHSALES_API_KEY;
  const basicAuth = process.env.FRESHSALES_BASIC_AUTH;
  const accessToken = process.env.FRESHSALES_ACCESS_TOKEN;
  const explicitMode = process.env.FRESHSALES_AUTH_MODE;
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
      const leftRank = left.__mode === 'supabase_oauth' ? 0 : left.__mode === 'access_token' ? 1 : 2;
      const rightRank = right.__mode === 'supabase_oauth' ? 0 : right.__mode === 'access_token' ? 1 : 2;
      return leftRank - rightRank;
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
  } else if (explicitMode) {
    candidates.sort((left, right) => (left.__mode === explicitMode ? -1 : right.__mode === explicitMode ? 1 : 0));
  }
  return candidates;
}

async function loadReceivables(limit, specificReceivableId = null) {
  const query = [
    'billing_receivables?select=id,contract_id,contact_id,product_id,process_id,freshsales_account_id,freshsales_deal_id,invoice_number,description,issue_date,due_date,status,currency,amount_original,payment_amount,amount_principal,correction_index_name,correction_amount,amount_corrected,late_fee_amount,interest_mora_amount,interest_compensatory_amount,balance_due,balance_due_corrected,raw_payload,contracts:billing_contracts(id,workspace_id,title,external_reference,freshsales_contact_id,contact_id,process_id,freshsales_account_id,process_reference,product_id),products:freshsales_products(id,name,billing_type,freshsales_product_id),registry:freshsales_deals_registry(id,freshsales_deal_id,last_sync_status)',
    specificReceivableId ? `id=eq.${encodeURIComponent(String(specificReceivableId))}` : 'order=created_at.asc',
    specificReceivableId ? null : `limit=${limit}`,
  ].join('&');

  const rows = await supabaseRequest(query);
  const enrichedRows = await enrichReceivableLinks(rows);
  return enrichedRows.filter((row) => {
    const contract = firstRelation(row.contracts);
    return Boolean(contract && contract.freshsales_contact_id);
  });
}

async function enrichReceivableLinks(rows) {
  if (!Array.isArray(rows) || !rows.length) return [];

  const contractIds = new Set();
  const contactIds = new Set();
  const processIds = new Set();

  for (const row of rows) {
    const contract = firstRelation(row.contracts);
    if (contract?.id) contractIds.add(String(contract.id));
    if (contract?.contact_id) contactIds.add(String(contract.contact_id));
    if (row?.contact_id) contactIds.add(String(row.contact_id));
    if (row?.process_id) processIds.add(String(row.process_id));
    if (contract?.process_id) processIds.add(String(contract.process_id));
  }

  const [contacts, processes] = await Promise.all([
    contactIds.size
      ? supabaseRequest(`freshsales_contacts?select=id,freshsales_contact_id&id=in.(${Array.from(contactIds).map((item) => `"${item}"`).join(',')})`)
      : [],
    processIds.size
      ? supabaseRequest(
          `processos?select=id,account_id_freshsales&id=in.(${Array.from(processIds).map((item) => `"${item}"`).join(',')})`,
          { headers: { 'Accept-Profile': 'judiciario', 'Content-Profile': 'judiciario' } }
        )
      : [],
  ]);

  const contactById = new Map((contacts || []).map((item) => [String(item.id), item]));
  const processById = new Map((processes || []).map((item) => [String(item.id), item]));

  for (const row of rows) {
    const contract = firstRelation(row.contracts);
    const derivedFreshsalesContactId =
      contract?.freshsales_contact_id ||
      contactById.get(String(contract?.contact_id || row.contact_id || ''))?.freshsales_contact_id ||
      null;
    const derivedFreshsalesAccountId =
      row.freshsales_account_id ||
      contract?.freshsales_account_id ||
      processById.get(String(row.process_id || contract?.process_id || ''))?.account_id_freshsales ||
      null;

    if (contract && ((!contract.freshsales_contact_id && derivedFreshsalesContactId) || (!contract.freshsales_account_id && derivedFreshsalesAccountId))) {
      await supabaseRequest(`billing_contracts?id=eq.${encodeURIComponent(contract.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          freshsales_contact_id: contract.freshsales_contact_id || derivedFreshsalesContactId || null,
          freshsales_account_id: contract.freshsales_account_id || derivedFreshsalesAccountId || null,
        }),
      });
      contract.freshsales_contact_id = contract.freshsales_contact_id || derivedFreshsalesContactId || null;
      contract.freshsales_account_id = contract.freshsales_account_id || derivedFreshsalesAccountId || null;
    }

    if (!row.freshsales_account_id && derivedFreshsalesAccountId) {
      await supabaseRequest(`billing_receivables?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          freshsales_account_id: derivedFreshsalesAccountId,
        }),
      });
      row.freshsales_account_id = derivedFreshsalesAccountId;
    }
  }

  return rows;
}

async function publishDeal(row) {
  const contract = firstRelation(row.contracts);
  const product = firstRelation(row.products);
  const registry = firstRelation(row.registry);
  if (!toFreshsalesNumericId(product?.freshsales_product_id)) {
    throw new Error(`Produto Freshsales nao sincronizado para o receivable (${product?.name || row.product_id || 'sem_produto'}).`);
  }
  const dealPayload = buildDealPayload(row, contract, product);
  const externalReference = buildExternalReference(row);

  let responsePayload;
  let dealId = normalizeFreshsalesDealId(registry?.freshsales_deal_id || row.freshsales_deal_id || null);
  let mode = 'created';

  if (dealId) {
    responsePayload = await freshsalesRequest(`/deals/${encodeURIComponent(String(dealId))}`, {
      method: 'PUT',
      body: JSON.stringify(dealPayload),
    });
    mode = 'updated';
  } else {
    responsePayload = await freshsalesRequest('/deals', {
      method: 'POST',
      body: JSON.stringify(dealPayload),
    });
    dealId = String(responsePayload.deal?.id || responsePayload.id || '');
  }

  if (!dealId) {
    throw new Error('Freshsales nao retornou deal id');
  }

  await supabaseRequest(`billing_receivables?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ freshsales_deal_id: dealId }),
  });

  await upsertDealRegistry(row, dealId, {
    freshsales_contact_id: contract.freshsales_contact_id || null,
    freshsales_account_id: row.freshsales_account_id || contract.freshsales_account_id || null,
    freshsales_product_id: product?.freshsales_product_id || null,
    deal_name: dealPayload.deal.name,
    deal_stage: String(dealPayload.deal.deal_stage_id || ''),
    deal_status: mapDealStatus(row.status),
    amount_last_sent: row.balance_due_corrected || row.balance_due || row.amount_original,
    payload_last_sent: {
      ...dealPayload,
      external_reference: externalReference,
    },
    last_sync_status: 'ok',
    last_sync_error: null,
    last_synced_at: new Date().toISOString(),
  });

  return { mode, dealId };
}

function buildDealPayload(row, contract, product) {
  const billingConfig = getBillingConfig();
  const rawValues = {
    external_reference: buildExternalReference(row),
    invoice_number: row.invoice_number || null,
    receivable_status: row.status || null,
    billing_type: product?.billing_type || null,
    balance_due: row.balance_due_corrected || row.balance_due || null,
    amount_original: row.amount_original || null,
    correction_amount: row.correction_amount || null,
    late_fee_amount: row.late_fee_amount || null,
    interest_mora_amount: row.interest_mora_amount || null,
    interest_compensatory_amount: row.interest_compensatory_amount || null,
    process_reference: contract.process_reference || null,
  };
  const { coreFields, customFields } = splitMappedFields(billingConfig.dealFieldMap, rawValues, billingConfig);

  return {
    deal: {
      name: buildDealName(row, contract, product),
      amount: row.balance_due_corrected || row.balance_due || row.amount_original || 0,
      currency: row.currency || 'BRL',
      expected_close: row.due_date || currentDateIso(),
      owner_id: billingConfig.ownerId,
      deal_pipeline_id: billingConfig.defaultDealPipelineId,
      deal_stage_id: resolveDealStageId(row.status, billingConfig),
      probability: resolveDealProbability(row.status),
      deal_product_id: toFreshsalesNumericId(product?.freshsales_product_id),
      sales_account_id: toFreshsalesNumericId(row.freshsales_account_id || contract.freshsales_account_id),
      ...coreFields,
      contacts_added_list: contract.freshsales_contact_id ? [Number(contract.freshsales_contact_id)] : undefined,
      custom_field: cleanObject(customFields),
    },
  };
}

function buildDealName(row, contract, product) {
  const parts = [
    product?.name || 'Financeiro',
    row.invoice_number ? `#${row.invoice_number}` : null,
    contract.process_reference || contract.title || null,
  ].filter(Boolean);
  return parts.join(' - ').slice(0, 240);
}

function buildExternalReference(row) {
  return `hmadv-receivable-${row.id}`;
}

function normalizeFreshsalesDealId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/^pending-/i.test(text)) return null;
  return text;
}

function mapDealStatus(status) {
  const text = String(status || '').toLowerCase();
  if (text.includes('pago')) return 'won';
  if (text.includes('encerr')) return 'closed';
  return 'open';
}

function normalizeStatusKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveDealStageId(status, billingConfig) {
  const normalized = normalizeStatusKey(status);
  const mapped = billingConfig.dealStageIdMap[normalized];
  if (/^\d+$/.test(String(mapped || ''))) return Number(mapped);
  if (/^\d+$/.test(String(billingConfig.defaultDealStageId || ''))) return Number(billingConfig.defaultDealStageId);
  return undefined;
}

function resolveDealProbability(status) {
  const normalized = normalizeStatusKey(status);
  if (normalized.includes('pago')) return 100;
  if (normalized.includes('venc')) return 40;
  if (normalized.includes('cancel') || normalized.includes('nao pago') || normalized.includes('não pago')) return 0;
  if (normalized.includes('aberto')) return 75;
  return 50;
}

async function upsertDealRegistry(row, dealId, extra) {
  const contract = firstRelation(row.contracts);
  const payload = {
    workspace_id: contract?.workspace_id || null,
    billing_receivable_id: row.id,
    freshsales_deal_id: normalizeFreshsalesDealId(dealId || row.freshsales_deal_id || null) || `pending-${row.id}`,
    ...extra,
  };

  await upsertByConflictFallback('freshsales_deals_registry', 'billing_receivable_id', row.id, payload);

  await enqueueCrmEvent({
    workspace_id: contract?.workspace_id || null,
    entity_type: 'billing_receivable',
    entity_id: row.id,
    event_type: extra.last_sync_status === 'ok' ? 'deal_published' : 'deal_publish_failed',
    payload: {
      billing_receivable_id: row.id,
      freshsales_deal_id: dealId,
      contract_id: row.contract_id,
      receivable_status: row.status,
      amount: row.balance_due_corrected || row.balance_due || row.amount_original,
      due_date: row.due_date,
      is_overdue: ['vencido', 'em_aberto'].includes(String(row.status || '').toLowerCase()) && Boolean(row.due_date),
      has_partial_payment: Number(row.payment_amount || 0) > 0 && String(row.status || '').toLowerCase() !== 'pago',
    },
    status: 'pending',
  });
}

async function freshsalesRequest(pathname, init = {}) {
  const attemptErrors = [];
  for (const base of resolveFreshsalesBases()) {
    for (const headers of await freshsalesHeaderCandidates()) {
      const response = await fetch(`${base}${pathname}`, {
        ...init,
        headers: {
          ...headers,
          ...(init.headers || {}),
        },
      }).catch((error) => {
        attemptErrors.push(`${base}${pathname}: ${String(error.message || error)}`);
        return null;
      });

      if (!response) continue;

      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      attemptErrors.push(`${base}${pathname} -> ${response.status}: ${payload.message || payload.error || JSON.stringify(payload).slice(0, 300)}`);
    }
  }
  throw new Error(attemptErrors.join(' | ') || `Freshsales request failed: ${pathname}`);
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item != null && item !== ''));
}

function toFreshsalesNumericId(value) {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) return undefined;
  return Number(text);
}

function firstRelation(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function currentDateIso() {
  return new Date().toISOString().slice(0, 10);
}

function getBillingConfig() {
  return {
    ownerId: cleanValue(process.env.FRESHSALES_OWNER_ID),
    defaultDealPipelineId: cleanValue(process.env.FRESHSALES_DEFAULT_DEAL_PIPELINE_ID) || '31000060365',
    defaultDealStageId: cleanValue(process.env.FRESHSALES_DEFAULT_DEAL_STAGE_ID),
    dealStageIdMap: parseJsonEnv(process.env.FRESHSALES_BILLING_DEAL_STAGE_ID_MAP, {
      faturar: '31000423211',
      aberto: '31000423213',
      em_aberto: '31000423213',
      vencido: '31001026893',
      pago: '31000423216',
      nao_pago: '31000423217',
      cancelado: '31000423217',
    }),
    dealTypeIdMap: parseJsonEnv(process.env.FRESHSALES_BILLING_DEAL_TYPE_ID_MAP, {}),
    dealFieldMap: parseJsonEnv(process.env.FRESHSALES_BILLING_DEAL_FIELD_MAP, {
      external_reference: 'cf_hmadv_external_reference',
      invoice_number: 'cf_hmadv_invoice_number',
      receivable_status: 'cf_hmadv_receivable_status',
      billing_type: 'cf_hmadv_billing_type',
      balance_due: 'cf_hmadv_balance_due',
      amount_original: 'cf_hmadv_amount_original',
      correction_amount: 'cf_hmadv_correction_amount',
      late_fee_amount: 'cf_hmadv_late_fee_amount',
      interest_mora_amount: 'cf_hmadv_interest_mora_amount',
      interest_compensatory_amount: 'cf_hmadv_interest_compensatory_amount',
      process_reference: 'cf_hmadv_process_reference',
    }),
  };
}

function splitMappedFields(fieldMap, values, billingConfig) {
  const coreFields = {};
  const customFields = {};

  for (const [key, fieldName] of Object.entries(fieldMap || {})) {
    if (!fieldName) continue;
    const mappedValue = resolveMappedFieldValue(fieldName, values[key], billingConfig);
    if (mappedValue == null || mappedValue === '') continue;

    if (isCoreDealField(fieldName)) {
      coreFields[fieldName] = mappedValue;
      continue;
    }

    customFields[fieldName] = mappedValue;
  }

  return { coreFields, customFields };
}

function resolveMappedFieldValue(fieldName, value, billingConfig) {
  if (value == null || value === '') return null;

  if (fieldName === 'deal_type_id') {
    if (/^\d+$/.test(String(value))) return Number(value);
    const mapped = billingConfig.dealTypeIdMap[String(value).toLowerCase()];
    return mapped != null && /^\d+$/.test(String(mapped)) ? Number(mapped) : null;
  }

  return value;
}

function isCoreDealField(fieldName) {
  return ['deal_type_id', 'deal_stage_id', 'owner_id', 'amount', 'expected_close', 'sales_account_id'].includes(fieldName);
}

function parseJsonEnv(value, fallback = {}) {
  const text = cleanValue(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function buildBillingCustomFields(fieldMap, values) {
  const output = {};
  for (const [key, fieldName] of Object.entries(fieldMap || {})) {
    if (!fieldName) continue;
    const value = values[key];
    if (value == null || value === '') continue;
    output[fieldName] = value;
  }
  return output;
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

async function enqueueCrmEvent(payload) {
  await supabaseRequest('crm_event_queue', {
    method: 'POST',
    headers: {
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
  });
}

async function upsertByConflictFallback(table, conflictColumn, conflictValue, payload) {
  try {
    await supabaseRequest(`${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    });
    return;
  } catch (error) {
    const message = String(error.message || error);
    if (!message.includes('42P10')) throw error;
  }

  const existing = await supabaseRequest(`${table}?${conflictColumn}=eq.${encodeURIComponent(String(conflictValue))}&select=id&limit=1`);
  if (existing[0]) {
    await supabaseRequest(`${table}?${conflictColumn}=eq.${encodeURIComponent(String(conflictValue))}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
    return;
  }

  try {
    await supabaseRequest(table, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = String(error.message || error);
    if (!message.includes('23505')) throw error;
    await supabaseRequest(`${table}?${conflictColumn}=eq.${encodeURIComponent(String(conflictValue))}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
  }
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
