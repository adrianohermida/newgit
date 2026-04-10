#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceId = sanitizeUuidArg(args.workspaceId || process.env.HMADV_WORKSPACE_ID || null);

  const rows = await loadReprocessableRows(args.limit);
  if (!rows.length) {
    console.log(JSON.stringify({ ok: true, reprocessable_rows: 0, materialized: 0, queued_for_publish: 0 }, null, 2));
    return;
  }

  const indices = await loadIndicesByName();
  const products = await loadProducts();
  const contacts = await loadContacts();
  const processes = await loadProcesses();
  const productById = new Map(products.map((item) => [item.id, item]));
  const productByName = new Map(products.map((item) => [String(item.name || '').toLowerCase(), item]));
  const contactById = new Map(contacts.map((item) => [item.id, item]));
  const processById = new Map(processes.map((item) => [String(item.id), item]));

  let materialized = 0;
  let queuedForPublish = 0;

  for (const row of rows) {
    const existingReceivable = await findReceivableByImportRow(row.id);
    if (existingReceivable) {
      const derivedAccountId = deriveFreshsalesAccountId(row, existingReceivable, null, processById);
      if (!existingReceivable.freshsales_deal_id && derivedAccountId) queuedForPublish += 1;
      continue;
    }

    const product = resolveProduct(row, productById, productByName);
    const contract = await resolveOrCreateContract(row, workspaceId, product, contactById, processById);
    await createReceivable(row, contract, product, indices);
    materialized += 1;
    if (deriveFreshsalesAccountId(row, null, contract, processById)) queuedForPublish += 1;
  }

  console.log(JSON.stringify({
    ok: true,
    workspace_id: workspaceId,
    reprocessable_rows: rows.length,
    materialized,
    queued_for_publish: queuedForPublish,
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

function parseArgs(argv) {
  const result = { workspaceId: null, limit: 1000 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace-id') {
      result.workspaceId = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (arg === '--limit') {
      result.limit = Number(argv[i + 1] || '1000');
      i += 1;
    }
  }
  return result;
}

function sanitizeUuidArg(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/[<>]/.test(text) || /^SEU_/i.test(text) || /^ID_/i.test(text)) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

async function loadReprocessableRows(limit) {
  const query = [
    'billing_import_rows?select=id,import_run_id,person_name,invoice_number,invoice_date,due_date,category_raw,comment_raw,deal_reference_raw,amount_original_raw,payment_raw,canonical_status,billing_type_inferred,product_family_inferred,matching_status,resolved_contact_id,resolved_product_id,resolved_process_id,resolved_account_id_freshsales,resolved_process_reference,validation_errors,matching_notes',
    'order=created_at.desc',
    `limit=${limit}`,
  ].join('&');
  const rows = await supabaseRequest(query);
  return rows.filter((row) => {
    const valid = Array.isArray(row.validation_errors) ? row.validation_errors.length === 0 : true;
    return valid
      && Boolean(row.resolved_contact_id)
      && ['pareado', 'pendente_account'].includes(String(row.matching_status || ''))
      && Boolean(row.resolved_account_id_freshsales || row.resolved_process_reference || row.deal_reference_raw || row.person_name);
  });
}

async function loadIndicesByName() {
  const rows = await supabaseRequest('billing_indices?select=index_name,month_ref,index_value&order=month_ref.asc');
  const bucket = new Map();
  for (const row of rows) {
    const key = String(row.index_name || 'IGP-M');
    const current = bucket.get(key) || [];
    current.push({ month_ref: row.month_ref, index_value: Number(row.index_value) });
    bucket.set(key, current);
  }
  return bucket;
}

async function loadProducts() {
  return supabaseRequest('freshsales_products?select=id,name,billing_type,late_fee_percent_default,interest_percent_month_default,monetary_index_default');
}

async function loadContacts() {
  return supabaseRequest('freshsales_contacts?select=id,freshsales_contact_id');
}

async function loadProcesses() {
  return supabaseRequest('processos?select=id,account_id_freshsales', {
    headers: {
      'Accept-Profile': 'judiciario',
      'Content-Profile': 'judiciario',
    },
  });
}

function resolveProduct(row, productById, productByName) {
  return productById.get(row.resolved_product_id) || productByName.get(String(row.product_family_inferred || '').toLowerCase()) || null;
}

async function resolveOrCreateContract(row, workspaceId, product, contactById, processById) {
  const externalReference = buildContractKey(row);
  const existing = await supabaseRequest(`billing_contracts?external_reference=eq.${encodeURIComponent(externalReference)}&select=id,workspace_id,contact_id,product_id,freshsales_contact_id,process_id,freshsales_account_id,process_reference,title&limit=1`);
  const derivedAccountId = deriveFreshsalesAccountId(row, null, existing[0] || null, processById);
  if (existing[0]) {
    const patchedPayload = {
      freshsales_contact_id: contactById.get(row.resolved_contact_id)?.freshsales_contact_id || existing[0].freshsales_contact_id || null,
      process_id: row.resolved_process_id || existing[0].process_id || null,
      freshsales_account_id: derivedAccountId || existing[0].freshsales_account_id || null,
      process_reference: row.resolved_process_reference || row.deal_reference_raw || existing[0].process_reference || null,
    };
    await supabaseRequest(`billing_contracts?id=eq.${encodeURIComponent(existing[0].id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(patchedPayload),
    });
    const refreshed = await supabaseRequest(`billing_contracts?id=eq.${encodeURIComponent(existing[0].id)}&select=id,workspace_id,contact_id,product_id,freshsales_contact_id,process_id,freshsales_account_id,process_reference,title&limit=1`);
    return refreshed[0] || existing[0];
  }

  const payload = {
    workspace_id: workspaceId,
    contact_id: row.resolved_contact_id,
    freshsales_contact_id: contactById.get(row.resolved_contact_id)?.freshsales_contact_id || null,
    product_id: product?.id || row.resolved_product_id || null,
    contract_kind: row.billing_type_inferred || 'unitario',
    title: buildContractTitle(row),
    process_id: row.resolved_process_id || null,
    freshsales_account_id: derivedAccountId || null,
    process_reference: row.resolved_process_reference || row.deal_reference_raw || null,
    external_reference: externalReference,
    start_date: row.invoice_date || row.due_date || null,
    status: inferContractStatus(row.canonical_status),
    currency: 'BRL',
    metadata: {
      source_import_run_id: row.import_run_id,
      source_row_id: row.id,
      reprocessed: true,
      account_resolution_status: row.resolved_account_id_freshsales ? 'resolved' : 'textual_only',
    },
  };

  const created = await tryInsertWithUpsertFallback('billing_contracts', 'external_reference', externalReference, payload);
  return created;
}

async function createReceivable(row, contract, product, indices) {
  const existing = await findReceivableByImportRow(row.id);
  const amountOriginal = parseMoneyBRL(row.amount_original_raw) || 0;
  const paymentAmount = parseMoneyBRL(row.payment_raw) || 0;
  const correctionIndexName = product?.monetary_index_default || 'IGP-M';
  const dueIndex = resolveIndexForMonth(indices, correctionIndexName, row.due_date);
  const currentIndex = resolveIndexForMonth(indices, correctionIndexName, currentDateIso());
  const snapshot = computeFinancialSnapshot({
    amount_original: amountOriginal,
    payment_amount: paymentAmount,
    due_date: row.due_date,
    correction_index_due: dueIndex,
    correction_index_current: currentIndex,
    late_fee_percent: product?.late_fee_percent_default ?? 10,
    interest_mora_percent_month: product?.interest_percent_month_default ?? 1,
    interest_compensatory_percent_month: product?.interest_percent_month_default ?? 1,
  });

  const payload = {
    workspace_id: contract.workspace_id,
    contract_id: contract.id,
    contact_id: contract.contact_id,
    process_id: contract.process_id || row.resolved_process_id || null,
    freshsales_account_id: contract.freshsales_account_id || row.resolved_account_id_freshsales || null,
    product_id: product?.id || contract.product_id || null,
    source_import_row_id: row.id,
    receivable_type: mapReceivableType(row),
    invoice_number: row.invoice_number,
    description: row.comment_raw || row.category_raw || row.product_family_inferred,
    issue_date: row.invoice_date,
    due_date: row.due_date,
    status: mapReceivableStatus(row.canonical_status),
    currency: 'BRL',
    amount_original: amountOriginal,
    payment_amount: paymentAmount,
    amount_principal: snapshot.amount_principal,
    correction_index_name: correctionIndexName,
    correction_index_due: dueIndex,
    correction_index_current: currentIndex,
    correction_factor: snapshot.correction_factor,
    correction_percent: snapshot.correction_percent,
    correction_amount: snapshot.correction_amount,
    amount_corrected: snapshot.amount_corrected,
    late_fee_percent: product?.late_fee_percent_default ?? 10,
    late_fee_amount: snapshot.late_fee_amount,
    interest_mora_percent_month: product?.interest_percent_month_default ?? 1,
    interest_mora_amount: snapshot.interest_mora_amount,
    interest_compensatory_percent_month: product?.interest_percent_month_default ?? 1,
    interest_compensatory_amount: snapshot.interest_compensatory_amount,
    interest_start_date: snapshot.interest_start_date,
    days_overdue: snapshot.days_overdue,
    balance_due: snapshot.balance_due,
    balance_due_corrected: snapshot.balance_due_corrected,
    calculated_at: new Date().toISOString(),
    raw_payload: { reprocessed: true },
  };

  if (existing) {
    await supabaseRequest(`billing_receivables?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
    const refreshed = await supabaseRequest(`billing_receivables?id=eq.${encodeURIComponent(existing.id)}&select=*&limit=1`);
    return refreshed[0] || existing;
  }

  const receivable = await tryInsertWithUpsertFallback('billing_receivables', 'source_import_row_id', row.id, payload);

  await supabaseRequest(`billing_import_rows?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      resolved_contract_id: contract.id,
      matching_notes: `${row.matching_notes || ''}; reprocessado`.trim(),
    }),
  });

  return receivable;
}

function deriveFreshsalesAccountId(row, receivable, contract, processById) {
  return (
    row?.resolved_account_id_freshsales ||
    receivable?.freshsales_account_id ||
    contract?.freshsales_account_id ||
    processById.get(String(row?.resolved_process_id || receivable?.process_id || contract?.process_id || ''))?.account_id_freshsales ||
    null
  );
}

async function findReceivableByImportRow(importRowId) {
  const rows = await supabaseRequest(`billing_receivables?source_import_row_id=eq.${encodeURIComponent(importRowId)}&select=id,freshsales_deal_id&limit=1`);
  return rows[0] || null;
}

async function tryInsertWithUpsertFallback(table, conflictColumn, conflictValue, payload) {
  try {
    const rows = await supabaseRequest(`${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(payload),
    });
    return rows[0];
  } catch (error) {
    const message = String(error.message || error);
    if (!message.includes('42P10')) throw error;
  }

  const existing = await supabaseRequest(`${table}?${conflictColumn}=eq.${encodeURIComponent(String(conflictValue))}&select=*&limit=1`);
  if (existing[0]) return existing[0];

  try {
    const inserted = await supabaseRequest(table, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
    return inserted[0];
  } catch (error) {
    const message = String(error.message || error);
    if (!message.includes('23505')) throw error;
    const duplicate = await supabaseRequest(`${table}?${conflictColumn}=eq.${encodeURIComponent(String(conflictValue))}&select=*&limit=1`);
    if (duplicate[0]) return duplicate[0];
    throw error;
  }
}

function buildContractKey(row) {
  return [
    row.resolved_contact_id || '',
    row.resolved_account_id_freshsales || '',
    row.product_family_inferred || '',
    row.resolved_process_reference || row.deal_reference_raw || '',
    row.person_name || '',
  ].join('|');
}

function buildContractTitle(row) {
  const reference = row.deal_reference_raw || row.invoice_number || row.person_name || 'Contrato Financeiro';
  return `${row.product_family_inferred || 'Financeiro'} - ${reference}`.slice(0, 240);
}

function inferContractStatus(status) {
  if (status === 'pago') return 'closed';
  return 'active';
}

function mapReceivableType(row) {
  if (row.billing_type_inferred === 'recorrente') return 'mensalidade';
  if (row.billing_type_inferred === 'parcelado') return 'parcela';
  if (row.billing_type_inferred === 'reembolso') return 'reembolso';
  return 'fatura';
}

function mapReceivableStatus(status) {
  if (status === 'pago') return 'pago';
  if (status === 'parcial') return 'parcial';
  return 'em_aberto';
}

function currentDateIso() {
  return new Date().toISOString().slice(0, 10);
}

function resolveIndexForMonth(indicesByName, indexName, targetDateIso) {
  const values = indicesByName.get(indexName) || [];
  if (!values.length || !targetDateIso) return null;
  const targetMonth = String(targetDateIso).slice(0, 7);
  let exact = values.find((item) => item.month_ref === targetMonth);
  if (exact) return exact.index_value;
  let previous = null;
  for (const item of values) {
    if (item.month_ref <= targetMonth) previous = item;
    if (item.month_ref > targetMonth) break;
  }
  return previous ? previous.index_value : values[0].index_value;
}

function parseMoneyBRL(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text || /^#(REF|VALUE)!$/i.test(text)) return null;
  const normalized = text.replace(/[R$\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function computeFinancialSnapshot(receivable) {
  const asOfDate = new Date();
  const dueDateIso = receivable.due_date;
  const dueDate = dueDateIso ? new Date(`${dueDateIso}T00:00:00-03:00`) : null;
  const amountOriginal = Number(receivable.amount_original || 0);
  const paymentAmount = Number(receivable.payment_amount || 0);
  const lateFeePercent = Number(receivable.late_fee_percent || 10);
  const interestMoraPercentMonth = Number(receivable.interest_mora_percent_month || 1);
  const interestCompensatoryPercentMonth = Number(receivable.interest_compensatory_percent_month || 1);
  const dueIndex = Number(receivable.correction_index_due);
  const currentIndex = Number(receivable.correction_index_current);
  const amountPrincipal = Number((amountOriginal - paymentAmount).toFixed(2));
  const daysOverdue = dueDate && asOfDate > dueDate ? Math.floor((asOfDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const monthsOverdue = daysOverdue / 30;
  const correctionFactor = dueIndex > 0 && currentIndex > 0 ? Number((currentIndex / dueIndex).toFixed(8)) : null;
  const amountCorrected = correctionFactor != null ? Number((amountPrincipal * correctionFactor).toFixed(2)) : amountPrincipal;
  const correctionPercent = correctionFactor != null ? Number((((correctionFactor - 1) * 100)).toFixed(8)) : null;
  const correctionAmount = Number((amountCorrected - amountPrincipal).toFixed(2));
  const lateFeeAmount = Number((amountOriginal * (lateFeePercent / 100)).toFixed(2));
  const interestMoraAmount = Number((amountOriginal * (interestMoraPercentMonth / 100) * monthsOverdue).toFixed(2));
  const interestCompensatoryAmount = Number((amountOriginal * (interestCompensatoryPercentMonth / 100) * monthsOverdue).toFixed(2));
  const balanceDue = Number((amountOriginal + lateFeeAmount + interestMoraAmount + interestCompensatoryAmount).toFixed(2));
  const balanceDueCorrected = Number((amountCorrected + lateFeeAmount + interestMoraAmount + interestCompensatoryAmount).toFixed(2));

  return {
    amount_principal: amountPrincipal,
    correction_factor: correctionFactor,
    correction_percent: correctionPercent,
    correction_amount: correctionAmount,
    amount_corrected: amountCorrected,
    late_fee_amount: lateFeeAmount,
    interest_mora_amount: interestMoraAmount,
    interest_compensatory_amount: interestCompensatoryAmount,
    interest_start_date: dueDateIso ? new Date(new Date(`${dueDateIso}T00:00:00-03:00`).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : null,
    days_overdue: daysOverdue,
    balance_due: balanceDue,
    balance_due_corrected: balanceDueCorrected,
  };
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
