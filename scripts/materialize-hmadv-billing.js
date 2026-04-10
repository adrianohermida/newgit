#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const importRunId = sanitizeRunIdArg(process.argv[2] || null);
  const workspaceId = sanitizeUuidArg(process.argv[3] || process.env.HMADV_WORKSPACE_ID || null);

  const runsQuery = importRunId
    ? `billing_import_runs?id=eq.${encodeURIComponent(importRunId)}&select=id,workspace_id,source_file,status`
    : 'billing_import_runs?select=id,workspace_id,source_file,status&status=eq.completed&order=started_at.desc&limit=1';

  const runs = await supabaseRequest(runsQuery);
  if (!runs.length) {
    throw new Error('Nenhum billing_import_run encontrado para materializacao.');
  }

  const run = runs[0];
  const effectiveWorkspaceId = workspaceId || run.workspace_id || null;

  const rows = await supabaseRequestAll(
    `billing_import_rows?import_run_id=eq.${encodeURIComponent(run.id)}&select=*&order=source_row_number.asc`
  );

  if (!rows.length) {
    console.log('Nenhuma linha de staging encontrada.');
    return;
  }

  const indices = await loadIndicesByName();
  const products = await supabaseRequest('freshsales_products?select=id,name,billing_type,late_fee_percent_default,interest_percent_month_default,monetary_index_default');
  const contacts = await supabaseRequest('freshsales_contacts?select=id,freshsales_contact_id');
  const productByName = new Map(products.map((item) => [String(item.name || '').toLowerCase(), item]));
  const contactById = new Map(contacts.map((item) => [item.id, item]));
  const contractsByKey = new Map();

  const materializableRows = rows.filter((row) =>
    row.matching_status === 'pareado' &&
    row.resolved_account_id_freshsales &&
    (!Array.isArray(row.validation_errors) || row.validation_errors.length === 0)
  );

  let createdContracts = 0;
  let createdReceivables = 0;

  for (const row of materializableRows) {
    const product = productByName.get(String(row.product_family_inferred || '').toLowerCase()) || null;
    const contractKey = buildContractKey(row);
    let contract = contractsByKey.get(contractKey);

    if (!contract) {
      const contractPayload = {
        workspace_id: effectiveWorkspaceId,
        contact_id: row.resolved_contact_id,
        freshsales_contact_id: contactById.get(row.resolved_contact_id)?.freshsales_contact_id || null,
        product_id: product ? product.id : row.resolved_product_id,
        contract_kind: row.billing_type_inferred || 'unitario',
        title: buildContractTitle(row),
        process_id: row.resolved_process_id || null,
        freshsales_account_id: row.resolved_account_id_freshsales || null,
        process_reference: row.resolved_process_reference || row.deal_reference_raw || null,
        external_reference: contractKey,
        start_date: row.invoice_date || row.due_date || null,
        status: inferContractStatus(row.canonical_status),
        currency: 'BRL',
        metadata: {
          source_import_run_id: row.import_run_id,
          source_row_id: row.id,
          source_file_category: row.category_raw,
        },
      };

      const insertedContract = await upsertByConflictFallback('billing_contracts', 'external_reference', contractKey, contractPayload);

      contract = insertedContract;
      contractsByKey.set(contractKey, contract);
      createdContracts += 1;
    }

    const receivablePayload = buildReceivablePayload(row, contract, product, indices);

    const insertedReceivable = await upsertByConflictFallback('billing_receivables', 'source_import_row_id', row.id, receivablePayload);

    await supabaseRequest(`billing_import_rows?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        resolved_contract_id: contract.id,
        matching_notes: `${row.matching_notes || ''}; materializado em ${insertedReceivable.id}`.trim(),
      }),
    });

    createdReceivables += 1;
  }

  console.log(JSON.stringify({
    import_run_id: run.id,
    workspace_id: effectiveWorkspaceId,
    total_rows: rows.length,
    materialized_rows: materializableRows.length,
    created_contracts: createdContracts,
    created_receivables: createdReceivables,
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

function sanitizeRunIdArg(value) {
  const text = String(value || '').trim();
  if (!text || text.toLowerCase() === 'latest') return null;
  if (/[<>]/.test(text) || /^ID_/i.test(text) || /^SEU_/i.test(text)) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function sanitizeUuidArg(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (/[<>]/.test(text) || /^SEU_/i.test(text) || /^ID_/i.test(text)) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

async function loadIndicesByName() {
  const rows = await supabaseRequest('billing_indices?select=index_name,month_ref,index_value&order=month_ref.asc');
  const bucket = new Map();
  for (const row of rows) {
    const key = String(row.index_name || 'IGP-M');
    const current = bucket.get(key) || [];
    current.push({
      month_ref: row.month_ref,
      index_value: Number(row.index_value),
    });
    bucket.set(key, current);
  }
  return bucket;
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

function inferContractStatus(canonicalStatus) {
  if (canonicalStatus === 'pago') return 'closed';
  if (canonicalStatus === 'parcial') return 'active';
  return 'active';
}

function buildReceivablePayload(row, contract, product, indicesByName) {
  const amountOriginal = parseMoneyBRL(row.amount_original_raw) || 0;
  const paymentAmount = parseMoneyBRL(row.payment_raw) || 0;
  const correctionIndexName = (product && product.monetary_index_default) || 'IGP-M';
  const dueIndex = resolveIndexForMonth(indicesByName, correctionIndexName, row.due_date);
  const currentIndex = resolveIndexForMonth(indicesByName, correctionIndexName, currentDateIso());
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

  return {
    workspace_id: contract.workspace_id,
    contract_id: contract.id,
    contact_id: contract.contact_id,
    process_id: contract.process_id || row.resolved_process_id || null,
    freshsales_account_id: contract.freshsales_account_id || row.resolved_account_id_freshsales || null,
    product_id: product ? product.id : contract.product_id,
    source_import_row_id: row.id,
    receivable_type: mapReceivableType(row),
    invoice_number: row.invoice_number,
    description: row.comment_raw || row.category_raw || row.product_family_inferred,
    issue_date: row.invoice_date,
    due_date: row.due_date,
    status: mapReceivableStatus(row.canonical_status, row.entry_direction),
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
    raw_payload: row.raw_payload || {},
  };
}

function mapReceivableType(row) {
  if (row.entry_direction === 'saida') return 'reembolso';
  if (row.billing_type_inferred === 'recorrente') return 'mensalidade';
  if (row.billing_type_inferred === 'parcelado') return 'parcela';
  return 'fatura';
}

function mapReceivableStatus(status, direction) {
  if (direction === 'saida') return 'lancado';
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
  if (previous) return previous.index_value;
  return values[0].index_value;
}

function parseMoneyBRL(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text || /^#(REF|VALUE)!$/i.test(text)) return null;
  const normalized = text
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBrazilDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (!match) return value || null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function computeFinancialSnapshot(receivable) {
  const asOfDate = new Date();
  const dueDateIso = parseBrazilDate(receivable.due_date);
  const dueDate = dueDateIso ? new Date(`${dueDateIso}T00:00:00-03:00`) : null;
  const amountOriginal = Number(receivable.amount_original || 0);
  const paymentAmount = Number(receivable.payment_amount || 0);
  const lateFeePercent = Number(receivable.late_fee_percent || 10);
  const interestMoraPercentMonth = Number(receivable.interest_mora_percent_month || 1);
  const interestCompensatoryPercentMonth = Number(receivable.interest_compensatory_percent_month || 1);
  const dueIndex = Number(receivable.correction_index_due);
  const currentIndex = Number(receivable.correction_index_current);

  const amountPrincipal = Number((amountOriginal - paymentAmount).toFixed(2));
  const daysOverdue = dueDate && asOfDate > dueDate
    ? Math.floor((asOfDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;
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

async function supabaseRequestAll(pathname, pageSize = 1000) {
  const rows = [];
  let offset = 0;
  while (true) {
    const separator = pathname.includes('?') ? '&' : '?';
    const batch = await supabaseRequest(`${pathname}${separator}limit=${pageSize}&offset=${offset}`);
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

async function upsertByConflictFallback(table, conflictColumn, conflictValue, payload) {
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
  if (existing[0]) {
    await supabaseRequest(`${table}?${conflictColumn}=eq.${encodeURIComponent(String(conflictValue))}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(payload),
    });
    const patched = await supabaseRequest(`${table}?${conflictColumn}=eq.${encodeURIComponent(String(conflictValue))}&select=*&limit=1`);
    return patched[0];
  }

  const inserted = await supabaseRequest(table, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  return inserted[0];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
