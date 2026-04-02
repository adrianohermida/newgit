#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

loadLocalEnv();

async function main() {
  const limit = Number(process.argv[2] || '20');
  const failed = await supabaseRequest(
    `freshsales_deals_registry?select=billing_receivable_id,last_sync_status,last_sync_error,last_synced_at&last_sync_status=eq.error&order=updated_at.desc&limit=${limit}`
  );

  if (!failed.length) {
    console.log(JSON.stringify({ ok: true, retried: 0, message: 'Nenhum deal com erro pendente.' }, null, 2));
    return;
  }

  const receivableIds = failed
    .map((item) => item.billing_receivable_id)
    .filter(Boolean);

  const rows = await supabaseRequest(
    `billing_receivables?select=id,freshsales_deal_id&in=id.(${receivableIds.map((id) => `"${id}"`).join(',')})`
  );

  let retried = 0;
  for (const row of rows) {
    const result = spawnSync('node', ['scripts/publish-hmadv-deals.js', '1', row.id], {
      cwd: process.cwd(),
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });
    if (result.status === 0) retried += 1;
  }

  console.log(JSON.stringify({ ok: true, candidates: failed.length, retried }, null, 2));
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
