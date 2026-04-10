#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const report = {
    generated_at: new Date().toISOString(),
    env: inspectEnv(),
    supabase: null,
    freshsales: null,
    readiness: {
      ok: false,
      blockers: [],
      warnings: [],
    },
  };

  try {
    report.supabase = await inspectSupabase();
  } catch (error) {
    report.readiness.blockers.push(`supabase_check_failed: ${String(error.message || error)}`);
  }

  try {
    report.freshsales = await inspectFreshsales();
  } catch (error) {
    report.readiness.blockers.push(`freshsales_check_failed: ${String(error.message || error)}`);
  }

  if (!report.env.supabase_url) report.readiness.blockers.push('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL ausente');
  if (!report.env.supabase_service_role_key) report.readiness.blockers.push('SUPABASE_SERVICE_ROLE_KEY ausente');
  if (!report.env.freshsales_auth) report.readiness.blockers.push('FRESHSALES_API_KEY ou FRESHSALES_ACCESS_TOKEN ausente');
  if (!report.env.freshsales_base) report.readiness.blockers.push('FRESHSALES_API_BASE/FRESHSALES_BASE_URL/FRESHSALES_DOMAIN ausente');
  if (!report.env.default_deal_stage_id) report.readiness.warnings.push('FRESHSALES_DEFAULT_DEAL_STAGE_ID nao configurado');

  if (report.supabase) {
    if ((report.supabase.counts.freshsales_contacts || 0) === 0) report.readiness.blockers.push('freshsales_contacts vazio');
    if ((report.supabase.counts.freshsales_products || 0) === 0) report.readiness.blockers.push('freshsales_products vazio');
    if ((report.supabase.counts.billing_indices || 0) === 0) {
      if (report.env.allow_missing_billing_indices) report.readiness.warnings.push('billing_indices vazio; modo nominal habilitado');
      else report.readiness.blockers.push('billing_indices vazio');
    }
    if ((report.supabase.counts.billing_import_rows || 0) === 0) report.readiness.warnings.push('billing_import_rows vazio');
  }

  if (report.freshsales) {
    if (!report.freshsales.ok) report.readiness.blockers.push('Freshsales indisponivel ou sem permissao de leitura');
    if ((report.freshsales.contacts_total || 0) === 0) report.readiness.warnings.push('Freshsales retornou zero contacts no probe');
    if ((report.freshsales.deal_fields_total || 0) === 0) report.readiness.warnings.push('Nao foi possivel inspecionar campos de deals');
    if (Array.isArray(report.freshsales.missing_billing_map_fields) && report.freshsales.missing_billing_map_fields.length) {
      report.readiness.warnings.push(`Campos do mapa financeiro nao encontrados no tenant: ${report.freshsales.missing_billing_map_fields.join(', ')}`);
    }
    if (report.freshsales.uses_placeholder_billing_fields) {
      report.readiness.warnings.push('FRESHSALES_BILLING_DEAL_FIELD_MAP ainda usa placeholders cf_hmadv_*');
    }
    if (report.freshsales.requires_deal_type_id_map && !report.freshsales.has_deal_type_id_map) {
      report.readiness.warnings.push('Mapa financeiro usa deal_type_id sem FRESHSALES_BILLING_DEAL_TYPE_ID_MAP configurado');
    }
  }

  report.readiness.ok = report.readiness.blockers.length === 0;
  console.log(JSON.stringify(report, null, 2));
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

function inspectEnv() {
  return {
    supabase_url: Boolean(cleanValue(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)),
    supabase_service_role_key: Boolean(cleanValue(process.env.SUPABASE_SERVICE_ROLE_KEY)),
    freshsales_base: Boolean(resolveFreshsalesBase()),
    freshsales_auth: Boolean(cleanValue(process.env.FRESHSALES_API_KEY || process.env.FRESHSALES_ACCESS_TOKEN || process.env.FRESHSALES_BASIC_AUTH)),
    freshsales_api_key: Boolean(cleanValue(process.env.FRESHSALES_API_KEY)),
    freshsales_basic_auth: Boolean(cleanValue(process.env.FRESHSALES_BASIC_AUTH)),
    freshsales_auth_mode: cleanValue(process.env.FRESHSALES_AUTH_MODE),
    default_deal_stage_id: cleanValue(process.env.FRESHSALES_DEFAULT_DEAL_STAGE_ID),
    billing_deal_field_map: Boolean(cleanValue(process.env.FRESHSALES_BILLING_DEAL_FIELD_MAP)),
    billing_deal_type_id_map: Boolean(cleanValue(process.env.FRESHSALES_BILLING_DEAL_TYPE_ID_MAP)),
    financial_event_stage_map: Boolean(cleanValue(process.env.FRESHSALES_FINANCIAL_EVENT_STAGE_MAP)),
    allow_missing_billing_indices: cleanValue(process.env.HMADV_ALLOW_MISSING_BILLING_INDICES) === 'true',
    workspace_id: cleanValue(process.env.HMADV_WORKSPACE_ID),
  };
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

async function inspectSupabase() {
  const counts = {};
  const tables = [
    'freshsales_contacts',
    'freshsales_products',
    'billing_indices',
    'billing_import_runs',
    'billing_import_rows',
    'billing_contracts',
    'billing_receivables',
    'freshsales_deals_registry',
    'crm_event_queue',
  ];

  for (const table of tables) {
    const rows = await supabaseRequest(`${table}?select=id&limit=1`);
    const count = await supabaseCount(table);
    counts[table] = count;
    if (!Array.isArray(rows)) throw new Error(`invalid_table_probe_${table}`);
  }

  return { ok: true, counts };
}

async function supabaseCount(table) {
  const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const response = await fetch(`${baseUrl}/rest/v1/${table}?select=id`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      Prefer: 'count=exact',
    },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const countHeader = response.headers.get('content-range') || '';
  const match = countHeader.match(/\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

async function inspectFreshsales() {
  const contacts = await freshsalesRequestByPath('/contacts/view/1?page=1&per_page=1').catch(() => null);
  const dealsFields = await freshsalesRequestByPath('/settings/deals/fields').catch(() => null);
  const products = await freshsalesRequestByPath('/products?page=1&per_page=1').catch(() => null);
  const configuredFieldMap = parseJsonEnv(process.env.FRESHSALES_BILLING_DEAL_FIELD_MAP, {});
  const configuredDealTypeIdMap = parseJsonEnv(process.env.FRESHSALES_BILLING_DEAL_TYPE_ID_MAP, {});
  const tenantFieldNames = new Set(Array.isArray(dealsFields?.fields) ? dealsFields.fields.map((item) => item.name).filter(Boolean) : []);
  const missingBillingMapFields = Object.values(configuredFieldMap).filter((fieldName) => fieldName && !tenantFieldNames.has(fieldName));
  const usesPlaceholderBillingFields = Object.values(configuredFieldMap).some((fieldName) => String(fieldName || '').startsWith('cf_hmadv_'));
  const requiresDealTypeIdMap = Object.values(configuredFieldMap).includes('deal_type_id');

  return {
    ok: Boolean(contacts || dealsFields || products),
    contacts_total: readTotal(contacts, ['meta.total', 'meta.total_count', 'total']),
    products_total: readTotal(products, ['meta.total', 'meta.total_count', 'total']),
    deal_fields_total: Array.isArray(dealsFields?.fields) ? dealsFields.fields.length : 0,
    missing_billing_map_fields: missingBillingMapFields,
    uses_placeholder_billing_fields: usesPlaceholderBillingFields,
    requires_deal_type_id_map: requiresDealTypeIdMap,
    has_deal_type_id_map: Object.keys(configuredDealTypeIdMap).length > 0,
  };
}

function readTotal(payload, paths) {
  if (!payload || typeof payload !== 'object') return 0;
  for (const pathKey of paths) {
    const value = pathKey.split('.').reduce((acc, key) => (acc && acc[key] != null ? acc[key] : null), payload);
    if (value != null && !Number.isNaN(Number(value))) return Number(value);
  }
  return 0;
}

function resolveFreshsalesBases() {
  const raw = resolveFreshsalesBase();
  if (!raw) throw new Error('Freshsales base ausente');
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

function freshsalesHeaderCandidates() {
  const apiKey = cleanValue(process.env.FRESHSALES_API_KEY);
  const basicAuth = cleanValue(process.env.FRESHSALES_BASIC_AUTH);
  const accessToken = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  const explicitMode = cleanValue(process.env.FRESHSALES_AUTH_MODE);
  const headers = [];
  if (apiKey) {
    headers.push({
      __mode: 'api_key',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Token token=${apiKey}`,
    });
  }
  if (basicAuth) {
    headers.push({
      __mode: 'basic_auth',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: /^Basic\s+/i.test(basicAuth) ? basicAuth : `Basic ${basicAuth}`,
    });
  }
  if (accessToken) {
    headers.push({
      __mode: 'access_token',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    });
  }
  if (!headers.length) throw new Error('Credenciais Freshsales ausentes');
  if (explicitMode && explicitMode !== 'oauth') {
    headers.sort((left, right) => (left.__mode === explicitMode ? -1 : right.__mode === explicitMode ? 1 : 0));
  } else if (apiKey) {
    headers.sort((left, right) => (left.__mode === 'api_key' ? -1 : right.__mode === 'api_key' ? 1 : 0));
  }
  return headers;
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

async function freshsalesRequestByPath(pathname) {
  const errors = [];
  for (const base of resolveFreshsalesBases()) {
    for (const headers of freshsalesHeaderCandidates()) {
      const response = await fetch(`${base}${pathname}`, { headers }).catch((error) => {
        errors.push(`${base}${pathname}: ${String(error.message || error)}`);
        return null;
      });
      if (!response) continue;
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      errors.push(`${base}${pathname} -> ${response.status}: ${payload.message || payload.error || JSON.stringify(payload).slice(0, 200)}`);
    }
  }
  throw new Error(errors.join(' | '));
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
