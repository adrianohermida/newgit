#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const outputPath = process.argv[2] || path.join(process.cwd(), 'out', `freshsales-deals-import-${Date.now()}.csv`);
  ensureParentDir(outputPath);

  const fieldMap = parseJsonEnv(process.env.FRESHSALES_BILLING_DEAL_FIELD_MAP, {});
  const dealTypeMap = parseJsonEnv(process.env.FRESHSALES_BILLING_DEAL_TYPE_ID_MAP, {});
  const defaultDealStageId = cleanValue(process.env.FRESHSALES_DEFAULT_DEAL_STAGE_ID) || '';

  const receivables = await supabaseRequestAll(
    'billing_receivables?select=id,contract_id,contact_id,freshsales_account_id,freshsales_deal_id,invoice_number,description,due_date,status,currency,amount_original,correction_amount,late_fee_amount,interest_mora_amount,interest_compensatory_amount,balance_due,balance_due_corrected,contracts:billing_contracts(id,title,process_reference,freshsales_contact_id,freshsales_account_id,metadata),contacts:freshsales_contacts!billing_receivables_contact_id_fkey(id,name,email)&order=created_at.asc'
  );

  const pending = receivables.filter((item) => !String(item.freshsales_deal_id || '').trim());

  const rows = pending.map((row) => {
    const contract = firstRelation(row.contracts);
    const contact = firstRelation(row.contacts);
    const billingType = inferBillingType(contract);
    const base = {
      name: buildDealName(row, contract),
      amount: row.balance_due_corrected || row.balance_due || row.amount_original || 0,
      currency: row.currency || 'BRL',
      expected_close: row.due_date || '',
      deal_stage_id: defaultDealStageId,
      sales_account_id: row.freshsales_account_id || contract?.freshsales_account_id || '',
      sales_account_name: contract?.process_reference || '',
      contact_id: contract?.freshsales_contact_id || '',
      contact_email: contact?.email || '',
    };

    const mapped = {};
    assignMappedField(mapped, fieldMap.invoice_number, row.invoice_number || '');
    assignMappedField(mapped, fieldMap.receivable_status, row.status || '');
    assignMappedField(mapped, fieldMap.balance_due, row.balance_due_corrected || row.balance_due || '');
    assignMappedField(mapped, fieldMap.amount_original, row.amount_original || '');
    assignMappedField(mapped, fieldMap.correction_amount, row.correction_amount || '');
    assignMappedField(mapped, fieldMap.late_fee_amount, row.late_fee_amount || '');
    assignMappedField(mapped, fieldMap.interest_mora_amount, row.interest_mora_amount || '');
    assignMappedField(mapped, fieldMap.interest_compensatory_amount, row.interest_compensatory_amount || '');
    assignMappedField(mapped, fieldMap.process_reference, contract?.process_reference || '');

    if (fieldMap.billing_type === 'deal_type_id') {
      mapped.deal_type_id = dealTypeMap[billingType] || '';
    } else {
      assignMappedField(mapped, fieldMap.billing_type, billingType);
    }

    return {
      ...base,
      ...mapped,
      external_reference: `hmadv-receivable-${row.id}`,
      receivable_id: row.id,
      contract_id: contract?.id || '',
    };
  });

  fs.writeFileSync(outputPath, toCsv(rows), 'utf8');
  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    total_rows: rows.length,
    with_sales_account_id: rows.filter((item) => item.sales_account_id).length,
    without_sales_account_id: rows.filter((item) => !item.sales_account_id).length,
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

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function parseJsonEnv(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function firstRelation(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function inferBillingType(contract) {
  const metadata = contract?.metadata && typeof contract.metadata === 'object' ? contract.metadata : {};
  return metadata.billing_type || metadata.contract_kind || 'unitario';
}

function buildDealName(row, contract) {
  return [
    contract?.title || row.description || 'Financeiro HMADV',
    row.invoice_number ? `#${row.invoice_number}` : null,
    contract?.process_reference || null,
  ].filter(Boolean).join(' - ').slice(0, 240);
}

function assignMappedField(target, fieldName, value) {
  if (!fieldName) return;
  target[fieldName] = value ?? '';
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  if (!rows.length) return 'name,amount,currency,expected_close,sales_account_id,sales_account_name,contact_id,contact_email,external_reference,receivable_id,contract_id\n';
  const headerSet = new Set();
  for (const row of rows) {
    Object.keys(row).forEach((key) => headerSet.add(key));
  }
  const headers = Array.from(headerSet);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function supabaseRequest(pathname, init = {}) {
  const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !apiKey) throw new Error('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sao obrigatorios');

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

  if (!response.ok) throw new Error(await response.text());
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
