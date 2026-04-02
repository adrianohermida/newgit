#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const workspaceId = process.argv[2] || process.env.HMADV_WORKSPACE_ID || null;
  const snapshots = await supabaseRequest(
    "freshsales_sync_snapshots?entity=eq.contacts&select=source_id,display_name,emails,phones,custom_attributes,raw_payload,synced_at"
  );

  const rows = snapshots.map((snapshot) => {
    const payload = snapshot.raw_payload || {};
    const emails = asArray(snapshot.emails);
    const phones = asArray(snapshot.phones);
    const custom = snapshot.custom_attributes || {};
    const primaryEmail = firstTruthy(emails) || payload.email || payload.primary_email || null;
    const primaryPhone = firstTruthy(phones) || payload.mobile_number || payload.work_number || payload.phone || null;

    return {
      workspace_id: workspaceId,
      freshsales_contact_id: String(snapshot.source_id),
      name: snapshot.display_name || payload.display_name || payload.name || null,
      email: primaryEmail,
      email_normalized: normalizeEmail(primaryEmail),
      phone: primaryPhone,
      phone_normalized: normalizePhone(primaryPhone),
      lifecycle_stage: cleanValue(custom.cf_fase_ciclo_vida || payload.cf_fase_ciclo_vida),
      meeting_stage: cleanValue(custom.cf_reuniao_status || payload.cf_reuniao_status),
      negotiation_stage: cleanValue(custom.cf_negociacao_status || payload.cf_negociacao_status),
      closing_stage: cleanValue(custom.cf_fechamento_status || payload.cf_fechamento_status),
      client_stage: cleanValue(custom.cf_cliente_status || payload.cf_cliente_status),
      raw_payload: payload,
      last_synced_at: snapshot.synced_at,
    };
  });

  if (!rows.length) {
    console.log('Nenhum snapshot de contact encontrado.');
    return;
  }

  const chunkSize = 200;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const batch = rows.slice(index, index + chunkSize);
    await supabaseRequest('freshsales_contacts?on_conflict=freshsales_contact_id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
  }

  console.log(`freshsales_contacts atualizado com ${rows.length} registro(s).`);
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

function asArray(value) {
  if (Array.isArray(value)) return value.flatMap((item) => asArray(item));
  if (!value) return [];
  if (typeof value === 'object') return Object.values(value).flatMap((item) => asArray(item));
  return [String(value).trim()].filter(Boolean);
}

function firstTruthy(values) {
  return values.find(Boolean) || null;
}

function normalizeEmail(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || null;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits || null;
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
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
