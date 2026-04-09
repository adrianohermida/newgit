#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const limit = Number(process.argv[2] || '50');
  const specificReceivableId = process.argv[3] || null;
  const base = resolveFreshsalesBase();
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
      const result = await publishDeal(row, base);
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

function resolveFreshsalesBase() {
  const raw = process.env.FRESHSALES_API_BASE || process.env.FRESHSALES_BASE_URL || process.env.FRESHSALES_DOMAIN;
  if (!raw) throw new Error('FRESHSALES_API_BASE/FRESHSALES_BASE_URL/FRESHSALES_DOMAIN nao configurado');
  const base = raw.startsWith('http') ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
  if (base.includes('/crm/sales/api')) return base;
  if (base.includes('/api')) return base;
  return `${base}/crm/sales/api`;
}

function freshsalesHeaders() {
  const apiKey = process.env.FRESHSALES_API_KEY;
  const accessToken = process.env.FRESHSALES_ACCESS_TOKEN;
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
  throw new Error('Credenciais do Freshsales ausentes');
}

async function loadReceivables(limit, specificReceivableId = null) {
  const query = [
    'billing_receivables?select=id,contract_id,contact_id,product_id,freshsales_deal_id,invoice_number,description,issue_date,due_date,status,currency,amount_original,payment_amount,amount_principal,correction_index_name,correction_amount,amount_corrected,late_fee_amount,interest_mora_amount,interest_compensatory_amount,balance_due,balance_due_corrected,raw_payload,contracts:billing_contracts(id,workspace_id,title,external_reference,freshsales_contact_id,contact_id,process_reference,product_id),products:freshsales_products(id,name,billing_type,freshsales_product_id),registry:freshsales_deals_registry(id,freshsales_deal_id,last_sync_status)',
    specificReceivableId ? `id=eq.${encodeURIComponent(String(specificReceivableId))}` : 'order=created_at.asc',
    specificReceivableId ? null : `limit=${limit}`,
  ].join('&');

  const rows = await supabaseRequest(query);
  return rows.filter((row) => {
    const contract = firstRelation(row.contracts);
    return Boolean(contract && contract.freshsales_contact_id);
  });
}

async function publishDeal(row, base) {
  const contract = firstRelation(row.contracts);
  const product = firstRelation(row.products);
  const registry = firstRelation(row.registry);
  const dealPayload = buildDealPayload(row, contract, product);
  const externalReference = buildExternalReference(row);

  let responsePayload;
  let dealId = registry?.freshsales_deal_id || row.freshsales_deal_id || null;
  let mode = 'created';

  if (dealId) {
    responsePayload = await freshsalesRequest(`${base}/deals/${encodeURIComponent(String(dealId))}`, {
      method: 'PUT',
      body: JSON.stringify(dealPayload),
    });
    mode = 'updated';
  } else {
    responsePayload = await freshsalesRequest(`${base}/deals`, {
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
      deal_stage_id: billingConfig.defaultDealStageId,
      ...coreFields,
      contact_ids: contract.freshsales_contact_id ? [Number(contract.freshsales_contact_id)] : undefined,
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

function mapDealStatus(status) {
  const text = String(status || '').toLowerCase();
  if (text.includes('pago')) return 'won';
  if (text.includes('encerr')) return 'closed';
  return 'open';
}

async function upsertDealRegistry(row, dealId, extra) {
  const contract = firstRelation(row.contracts);
  const payload = {
    workspace_id: contract?.workspace_id || null,
    billing_receivable_id: row.id,
    freshsales_deal_id: dealId || row.freshsales_deal_id || `pending-${row.id}`,
    ...extra,
  };

  await supabaseRequest('freshsales_deals_registry?on_conflict=billing_receivable_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(payload),
  });

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

async function freshsalesRequest(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...freshsalesHeaders(),
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Freshsales request failed: ${response.status}`);
  }
  return payload;
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item != null && item !== ''));
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
    defaultDealStageId: cleanValue(process.env.FRESHSALES_DEFAULT_DEAL_STAGE_ID),
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
  return ['deal_type_id', 'deal_stage_id', 'owner_id', 'amount', 'expected_close'].includes(fieldName);
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
