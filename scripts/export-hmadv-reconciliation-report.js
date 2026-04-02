#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const outputPath = process.argv[2] || path.join(process.cwd(), 'out', `hmadv-reconciliation-${Date.now()}.csv`);
  ensureParentDir(outputPath);

  const rows = await supabaseRequest(
    'billing_import_rows?select=id,import_run_id,source_row_number,person_name,email,email_normalized,invoice_number,due_date,category_raw,comment_raw,status_raw,entry_type_raw,matching_status,matching_notes,validation_errors,is_duplicate,resolved_contact_id,resolved_product_id&order=created_at.desc&limit=5000'
  );

  const pending = rows.filter((row) =>
    row.matching_status !== 'pareado' ||
    row.is_duplicate === true ||
    (Array.isArray(row.validation_errors) && row.validation_errors.length > 0)
  );

  const csv = toCsv(pending.map((row) => ({
    import_run_id: row.import_run_id,
    source_row_number: row.source_row_number,
    person_name: row.person_name,
    email: row.email,
    email_normalized: row.email_normalized,
    invoice_number: row.invoice_number,
    due_date: row.due_date,
    category_raw: row.category_raw,
    comment_raw: row.comment_raw,
    status_raw: row.status_raw,
    entry_type_raw: row.entry_type_raw,
    matching_status: row.matching_status,
    matching_notes: row.matching_notes,
    validation_errors: Array.isArray(row.validation_errors) ? row.validation_errors.join('|') : '',
    is_duplicate: row.is_duplicate,
    resolved_contact_id: row.resolved_contact_id,
    resolved_product_id: row.resolved_product_id,
  })));

  fs.writeFileSync(outputPath, csv, 'utf8');
  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    total_rows: rows.length,
    pending_rows: pending.length,
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

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  if (!rows.length) return 'import_run_id,source_row_number,person_name,email,matching_status,matching_notes\n';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsv(row[header])).join(','));
  }
  return `${lines.join('\n')}\n`;
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
