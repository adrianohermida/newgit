#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const [dealsFields, accountsFields, productsFields] = await Promise.all([
    fetchFreshsalesPath('/settings/deals/fields').catch(() => ({ fields: [] })),
    fetchFreshsalesPath('/settings/sales_accounts/fields').catch(() => ({ fields: [] })),
    fetchFreshsalesPath('/settings/products/fields').catch(() => ({ fields: [] })),
  ]);

  const dealFields = Array.isArray(dealsFields.fields) ? dealsFields.fields : [];
  const accountFields = Array.isArray(accountsFields.fields) ? accountsFields.fields : [];
  const productFields = Array.isArray(productsFields.fields) ? productsFields.fields : [];

  const suggestion = {
    external_reference: suggestField(dealFields, ['external', 'referencia externa', 'reference']),
    invoice_number: suggestField(dealFields, ['invoice', 'fatura', 'numero da fatura', 'invoice number']),
    receivable_status: suggestField(dealFields, ['receivable', 'status financeiro', 'status da fatura', 'payment status']),
    billing_type: suggestField(dealFields, ['billing type', 'modalidade', 'tipo', 'categoria']),
    balance_due: suggestField(dealFields, ['balance due', 'saldo', 'saldo a pagar', 'valor em aberto']),
    amount_original: suggestField(dealFields, ['valor original', 'original amount', 'gross amount']),
    correction_amount: suggestField(dealFields, ['correcao', 'acrescimo de correcao', 'correction amount']),
    late_fee_amount: suggestField(dealFields, ['multa', 'late fee']),
    interest_mora_amount: suggestField(dealFields, ['juros de mora', 'mora']),
    interest_compensatory_amount: suggestField(dealFields, ['juros compensatorios', 'compensatory']),
    process_reference: suggestField(dealFields, ['processo', 'cnj', 'case reference']),
  };

  const report = {
    base: resolveFreshsalesBases()[0],
    counts: {
      deal_fields: dealFields.length,
      account_fields: accountFields.length,
      product_fields: productFields.length,
    },
    suggestion,
    env_snippet: `FRESHSALES_BILLING_DEAL_FIELD_MAP=${JSON.stringify(suggestion)}`,
    matching_samples: {
      deals: compactFields(dealFields),
      accounts: compactFields(accountFields),
      products: compactFields(productFields),
    },
  };

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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveFreshsalesBases() {
  const raw = cleanValue(process.env.FRESHSALES_API_BASE || process.env.FRESHSALES_BASE_URL || process.env.FRESHSALES_DOMAIN);
  if (!raw) throw new Error('FRESHSALES_API_BASE/FRESHSALES_BASE_URL/FRESHSALES_DOMAIN nao configurado');
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
  const accessToken = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  const headers = [];
  if (apiKey) {
    headers.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Token token=${apiKey}`,
    });
  }
  if (accessToken) {
    headers.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    });
  }
  if (!headers.length) throw new Error('Credenciais Freshsales ausentes');
  return headers;
}

async function fetchFreshsalesPath(pathname) {
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

function suggestField(fields, aliases) {
  const normalizedAliases = aliases.map((item) => normalizeText(item));
  const candidates = fields
    .map((field) => {
      const haystack = normalizeText(`${field.name || ''} ${field.label || ''}`);
      const hits = normalizedAliases.filter((alias) => haystack.includes(alias)).length;
      return {
        name: field.name || null,
        label: field.label || null,
        score: hits,
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.name || null;
}

function compactFields(fields) {
  return fields.slice(0, 50).map((field) => ({
    name: field.name || null,
    label: field.label || null,
    type: field.type || null,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
