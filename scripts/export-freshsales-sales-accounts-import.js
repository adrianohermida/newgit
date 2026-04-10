#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const outputPath = process.argv[2] || path.join(process.cwd(), 'out', `freshsales-sales-accounts-import-${Date.now()}.csv`);
  ensureParentDir(outputPath);

  const contracts = await supabaseRequestAll(
    'billing_contracts?select=id,title,process_reference,freshsales_account_id,metadata&process_reference=not.is.null&order=created_at.asc'
  );

  const unresolved = uniqueBy(
    contracts.filter((item) => !String(item.freshsales_account_id || '').trim() && String(item.process_reference || '').trim()),
    (item) => normalizeText(item.process_reference)
  );

  const rows = unresolved.map((item) => ({
    name: String(item.process_reference || '').trim().slice(0, 255),
    cf_processo: String(item.process_reference || '').trim(),
    description: item.title || 'Conta gerada a partir da base financeira HMADV',
    source: 'hmadv_billing_migration',
    contract_id: item.id,
  }));

  fs.writeFileSync(outputPath, toCsv(rows), 'utf8');
  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    total_rows: rows.length,
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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = String(getKey(item) || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  if (!rows.length) return 'name,cf_processo,description,source,contract_id\n';
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
