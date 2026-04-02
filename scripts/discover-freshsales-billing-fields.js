#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const base = resolveFreshsalesBase();
  const headers = freshsalesHeaders();

  const [dealsFields, accountsFields, productsFields] = await Promise.all([
    fetchFreshsalesJson(`${base}/settings/deals/fields`, headers).catch(() => ({ fields: [] })),
    fetchFreshsalesJson(`${base}/settings/sales_accounts/fields`, headers).catch(() => ({ fields: [] })),
    fetchFreshsalesJson(`${base}/settings/products/fields`, headers).catch(() => ({ fields: [] })),
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
    base,
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

function resolveFreshsalesBase() {
  const raw = cleanValue(process.env.FRESHSALES_API_BASE || process.env.FRESHSALES_BASE_URL || process.env.FRESHSALES_DOMAIN);
  if (!raw) throw new Error('FRESHSALES_API_BASE/FRESHSALES_BASE_URL/FRESHSALES_DOMAIN nao configurado');
  const base = raw.startsWith('http') ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
  if (base.includes('/crm/sales/api')) return base;
  if (base.includes('/api')) return base;
  return `${base}/crm/sales/api`;
}

function freshsalesHeaders() {
  const apiKey = cleanValue(process.env.FRESHSALES_API_KEY);
  const accessToken = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  if (apiKey) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Token token=${apiKey}`,
    };
  }
  if (accessToken) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };
  }
  throw new Error('Credenciais Freshsales ausentes');
}

async function fetchFreshsalesJson(url, headers) {
  const response = await fetch(url, { headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Freshsales request failed: ${response.status}`);
  }
  return payload;
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
