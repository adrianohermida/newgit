#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

const DEFAULT_PRODUCTS = [
  {
    name: 'Honorarios Unitarios',
    category: 'honorarios',
    billing_type: 'unitario',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 10,
    interest_percent_month_default: 1,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
  {
    name: 'Honorarios Recorrentes',
    category: 'honorarios',
    billing_type: 'recorrente',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 10,
    interest_percent_month_default: 1,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
  {
    name: 'Parcela Contratual',
    category: 'parcelamento',
    billing_type: 'parcelado',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 10,
    interest_percent_month_default: 1,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
  {
    name: 'Fatura Avulsa',
    category: 'fatura',
    billing_type: 'unitario',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 10,
    interest_percent_month_default: 1,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
  {
    name: 'Despesa do Cliente',
    category: 'despesa',
    billing_type: 'reembolso',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 0,
    interest_percent_month_default: 0,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
  {
    name: 'Encargos de Atraso',
    category: 'encargos',
    billing_type: 'encargo',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 10,
    interest_percent_month_default: 1,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
];

async function main() {
  const workspaceId = process.argv[2] || process.env.HMADV_WORKSPACE_ID || null;
  const seededRows = DEFAULT_PRODUCTS.map((item) => ({ ...item, workspace_id: workspaceId }));
  await upsertProductsByName(seededRows);

  const manualMap = parseJsonEnv(process.env.HMADV_FRESHSALES_PRODUCT_ID_MAP || process.env.FRESHSALES_PRODUCT_ID_MAP, {});
  const manualRows = Object.entries(manualMap)
    .map(([name, freshsalesProductId]) => ({
      workspace_id: workspaceId,
      name: String(name || '').trim(),
      freshsales_product_id: cleanValue(freshsalesProductId),
      status: 'active',
      last_synced_at: new Date().toISOString(),
      metadata: { source: 'manual_env_map' },
    }))
    .filter((item) => item.name && item.freshsales_product_id);

  if (manualRows.length) {
    await upsertProductsByName(manualRows);
  }

  const snapshots = await safeLoadSnapshots(
    'freshsales_sync_snapshots?entity=eq.products&select=source_id,display_name,status,summary,attributes,custom_attributes,raw_payload,synced_at'
  );

  let syncedRows = [];
  let source = 'seed_only';
  if (snapshots.length) {
    syncedRows = snapshots.map((snapshot) => mapSnapshotToProductRow(snapshot, workspaceId)).filter(Boolean);
    source = 'snapshot';
  } else {
    const liveProducts = await fetchFreshsalesProductsLive();
    if (liveProducts.length) {
      syncedRows = liveProducts.map((product) => mapLiveProductToRow(product, workspaceId)).filter(Boolean);
      source = 'live_api';
    }
  }

  if (syncedRows.length) {
    await upsertProductsByName(syncedRows);
  }

  console.log(JSON.stringify({
    ok: true,
    seeded: seededRows.length,
    manual_mapped: manualRows.length,
    synced: syncedRows.length,
    source,
  }, null, 2));
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

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
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

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function readValue(value) {
  if (value == null) return null;
  if (typeof value !== 'object') return String(value).trim() || null;
  if (value.display_value != null && String(value.display_value).trim()) return String(value.display_value).trim();
  if (value.value != null && String(value.value).trim()) return String(value.value).trim();
  return null;
}

function firstText(values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function inferCategoryFromName(name) {
  const normalized = normalizeText(name);
  if (normalized.includes('honor')) return 'honorarios';
  if (normalized.includes('parcela')) return 'parcelamento';
  if (normalized.includes('despesa')) return 'despesa';
  if (normalized.includes('encargo') || normalized.includes('juros') || normalized.includes('multa')) return 'encargos';
  if (normalized.includes('assinatura') || normalized.includes('mensal')) return 'assinatura';
  return 'fatura';
}

function inferBillingType(name, category) {
  const normalized = `${normalizeText(name)} ${normalizeText(category)}`;
  if (normalized.includes('recorr') || normalized.includes('mensal') || normalized.includes('assinatura')) return 'recorrente';
  if (normalized.includes('parcela') || normalized.includes('parcel')) return 'parcelado';
  if (normalized.includes('despesa') || normalized.includes('reembolso')) return 'reembolso';
  if (normalized.includes('encargo') || normalized.includes('juros') || normalized.includes('multa')) return 'encargo';
  return 'unitario';
}

function parseMoney(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = text
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value) {
  const normalized = normalizeText(value);
  if (normalized.includes('inativ') || normalized.includes('archiv')) return 'inactive';
  return 'active';
}

function mapSnapshotToProductRow(snapshot, workspaceId) {
  const attributes = asObject(snapshot.attributes);
  const custom = asObject(snapshot.custom_attributes);
  const summary = asObject(snapshot.summary);
  const payload = asObject(snapshot.raw_payload);

  const name = snapshot.display_name || readValue(attributes.name) || readValue(payload.name) || null;
  const category = firstText([
    readValue(custom.category),
    readValue(custom.cf_categoria),
    readValue(attributes.category),
    readValue(summary.category),
    inferCategoryFromName(name),
  ]);
  const billingType = firstText([
    readValue(custom.billing_type),
    readValue(custom.cf_billing_type),
    readValue(custom.cf_modalidade),
    inferBillingType(name, category),
  ]);
  const priceDefault = parseMoney(readValue(attributes.price) || readValue(summary.price) || readValue(payload.price));

  return {
    workspace_id: workspaceId,
    freshsales_product_id: String(snapshot.source_id),
    name: name || `Produto ${snapshot.source_id}`,
    category,
    billing_type: billingType,
    price_default: priceDefault,
    currency: firstText([readValue(attributes.currency), readValue(summary.currency), 'BRL']),
    status: normalizeStatus(snapshot.status),
    metadata: {
      source: 'freshsales_snapshot',
      summary,
      attributes,
      custom_attributes: custom,
    },
    last_synced_at: snapshot.synced_at,
  };
}

function mapLiveProductToRow(product, workspaceId) {
  const name = firstText([product?.name, product?.display_name, product?.product_name, product?.title]);
  const category = inferCategoryFromName(name);
  return {
    workspace_id: workspaceId,
    freshsales_product_id: cleanValue(product?.id || product?.product_id),
    name: name || `Produto ${product?.id || product?.product_id || 'desconhecido'}`,
    category,
    billing_type: inferBillingType(name, category),
    price_default: parseMoney(product?.price || product?.unit_price),
    currency: cleanValue(product?.currency) || 'BRL',
    status: normalizeStatus(product?.status || product?.lifecycle_status || 'active'),
    metadata: {
      source: 'freshsales_live_api',
      raw_payload: product,
    },
    last_synced_at: new Date().toISOString(),
  };
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

  return bases;
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

async function getStoredOauthRow() {
  const result = await supabaseRestRequest('freshsales_oauth_tokens?provider=eq.freshsales&select=access_token&limit=1');
  if (!result?.response?.ok) return null;
  return Array.isArray(result.payload) ? result.payload[0] || null : result.payload || null;
}

async function freshsalesHeaderCandidates() {
  const apiKey = cleanValue(process.env.FRESHSALES_API_KEY);
  const basicAuth = cleanValue(process.env.FRESHSALES_BASIC_AUTH);
  const accessToken = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  const storedToken = cleanValue((await getStoredOauthRow())?.access_token);
  const candidates = [];

  if (apiKey) {
    candidates.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Token token=${apiKey}`,
    });
  }
  if (basicAuth) {
    candidates.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: /^Basic\s+/i.test(basicAuth) ? basicAuth : `Basic ${basicAuth}`,
    });
  }
  if (storedToken) {
    candidates.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Authtoken=${storedToken}`,
    });
  }
  if (accessToken) {
    candidates.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Authtoken=${accessToken}`,
    });
  }
  return candidates;
}

async function fetchFreshsalesProductsLive() {
  const attemptErrors = [];
  for (const base of resolveFreshsalesBases()) {
    for (const headers of await freshsalesHeaderCandidates()) {
      for (const endpoint of ['/products/view/1?page=1&per_page=100', '/products']) {
        const url = `${base}${endpoint}`;
        const response = await fetch(url, { headers }).catch((error) => {
          attemptErrors.push(`${url}: ${String(error.message || error)}`);
          return null;
        });
        if (!response) continue;
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          attemptErrors.push(`${url} -> ${response.status}: ${payload.message || payload.error || JSON.stringify(payload).slice(0, 300)}`);
          continue;
        }
        const products =
          (Array.isArray(payload?.products) && payload.products) ||
          (Array.isArray(payload) && payload) ||
          [];
        if (products.length) return products;
      }
    }
  }

  const scopeFailures = attemptErrors.length > 0 && attemptErrors.every((item) => /401:.*invalid scopes/i.test(item) || /401:.*invalid signature/i.test(item));
  if (scopeFailures) {
    console.warn('Freshsales products API indisponivel com o token atual. Mantendo apenas seed local e mapeamento manual.');
    return [];
  }
  return [];
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

async function supabaseRestRequest(pathname, init = {}) {
  try {
    const payload = await supabaseRequest(pathname, init);
    return { response: { ok: true }, payload };
  } catch {
    return null;
  }
}

async function upsertProductsByName(rows) {
  if (!rows.length) return;
  const chunkSize = 100;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const batch = rows.slice(index, index + chunkSize);
    await supabaseRequest('freshsales_products?on_conflict=name', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
  }
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
