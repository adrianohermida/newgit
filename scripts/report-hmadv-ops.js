#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const outputPath = process.argv[2] || path.join(process.cwd(), 'out', `hmadv-ops-report-${Date.now()}.json`);
  ensureParentDir(outputPath);

  const [
    importRuns,
    importRows,
    contracts,
    receivables,
    dealRegistry,
    crmQueue,
    contacts,
    products,
  ] = await Promise.all([
    supabaseRequest('billing_import_runs?select=id,status,total_rows,valid_rows,error_rows,duplicate_rows,started_at,completed_at&order=started_at.desc&limit=20'),
    supabaseRequest('billing_import_rows?select=id,matching_status,is_duplicate,validation_errors&limit=5000'),
    supabaseRequest('billing_contracts?select=id,status&limit=5000'),
    supabaseRequest('billing_receivables?select=id,status,freshsales_deal_id,balance_due,balance_due_corrected&limit=5000'),
    supabaseRequest('freshsales_deals_registry?select=id,last_sync_status,last_sync_error,last_synced_at&limit=5000'),
    supabaseRequest('crm_event_queue?select=id,status,event_type,attempts&limit=5000'),
    supabaseRequest('freshsales_contacts?select=id&limit=5000'),
    supabaseRequest('freshsales_products?select=id&limit=5000'),
  ]);

  const report = {
    generated_at: new Date().toISOString(),
    overview: {
      import_runs: importRuns.length,
      import_rows: importRows.length,
      contacts: contacts.length,
      products: products.length,
      contracts: contracts.length,
      receivables: receivables.length,
      deals_registry: dealRegistry.length,
      crm_queue: crmQueue.length,
    },
    staging: {
      pareados: countBy(importRows, (item) => item.matching_status === 'pareado'),
      pendente_contato: countBy(importRows, (item) => item.matching_status === 'pendente_contato'),
      pendente_revisao: countBy(importRows, (item) => item.matching_status === 'pendente_revisao'),
      duplicados: countBy(importRows, (item) => item.is_duplicate === true),
      com_erro_validacao: countBy(importRows, (item) => Array.isArray(item.validation_errors) && item.validation_errors.length > 0),
    },
    receivables: {
      pagos: countBy(receivables, (item) => item.status === 'pago'),
      parciais: countBy(receivables, (item) => item.status === 'parcial'),
      em_aberto: countBy(receivables, (item) => item.status === 'em_aberto'),
      com_deal: countBy(receivables, (item) => Boolean(item.freshsales_deal_id)),
      sem_deal: countBy(receivables, (item) => !item.freshsales_deal_id),
      balance_due_total: sumBy(receivables, 'balance_due'),
      balance_due_corrected_total: sumBy(receivables, 'balance_due_corrected'),
    },
    publishing: {
      ok: countBy(dealRegistry, (item) => item.last_sync_status === 'ok'),
      error: countBy(dealRegistry, (item) => item.last_sync_status === 'error'),
      pending: countBy(dealRegistry, (item) => !item.last_sync_status || item.last_sync_status === 'pending'),
    },
    crm_queue: {
      pending: countBy(crmQueue, (item) => item.status === 'pending'),
      processed: countBy(crmQueue, (item) => item.status === 'processed'),
      skipped: countBy(crmQueue, (item) => item.status === 'skipped'),
      error: countBy(crmQueue, (item) => item.status === 'error'),
    },
    recent_import_runs: importRuns,
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ ok: true, output: outputPath, overview: report.overview }, null, 2));
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

function countBy(rows, predicate) {
  return rows.reduce((acc, item) => acc + (predicate(item) ? 1 : 0), 0);
}

function sumBy(rows, field) {
  return Number(rows.reduce((acc, item) => acc + Number(item[field] || 0), 0).toFixed(2));
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
