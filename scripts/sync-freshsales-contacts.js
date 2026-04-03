#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const workspaceId = process.argv[2] || process.env.HMADV_WORKSPACE_ID || null;
  let snapshots = await safeLoadSnapshots(
    "freshsales_sync_snapshots?entity=eq.contacts&select=source_id,display_name,emails,phones,custom_attributes,raw_payload,synced_at"
  );
  let rows = [];

  if (snapshots.length) {
    rows = snapshots.map((snapshot) => mapSnapshotToContactRow(snapshot, workspaceId));
  } else {
    const liveContacts = await fetchFreshsalesContactsLive();
    rows = liveContacts.map((contact) => mapLiveContactToRow(contact, workspaceId));
  }

  if (!rows.length) {
    console.log('Nenhum contact encontrado em snapshots nem na API do Freshsales.');
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

function mapSnapshotToContactRow(snapshot, workspaceId) {
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
}

function mapLiveContactToRow(contact, workspaceId) {
  const emails = asArray(contact.emails || contact.email);
  const phones = asArray([
    contact.mobile_number,
    contact.work_number,
    contact.phone,
  ]);
  const custom = contact.custom_field || contact.custom_fields || {};
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || contact.name || null;
  const primaryEmail = firstTruthy(emails);
  const primaryPhone = firstTruthy(phones);

  return {
    workspace_id: workspaceId,
    freshsales_contact_id: String(contact.id),
    name,
    email: primaryEmail,
    email_normalized: normalizeEmail(primaryEmail),
    phone: primaryPhone,
    phone_normalized: normalizePhone(primaryPhone),
    lifecycle_stage: cleanValue(custom.cf_fase_ciclo_vida),
    meeting_stage: cleanValue(custom.cf_reuniao_status),
    negotiation_stage: cleanValue(custom.cf_negociacao_status),
    closing_stage: cleanValue(custom.cf_fechamento_status),
    client_stage: cleanValue(custom.cf_cliente_status),
    raw_payload: contact,
    last_synced_at: new Date().toISOString(),
  };
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
  throw new Error('Credenciais do Freshsales ausentes');
}

async function fetchFreshsalesContactsLive() {
  const base = resolveFreshsalesBase();
  const headers = freshsalesHeaders();
  const items = [];
  let page = 1;

  while (page <= 10) {
    const response = await fetch(`${base}/contacts/view/1?page=${page}&per_page=100`, { headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || payload.error || `Freshsales contacts request failed: ${response.status}`);
    }
    const batch = Array.isArray(payload.contacts) ? payload.contacts : [];
    if (!batch.length) break;
    items.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }

  return items;
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

async function safeLoadSnapshots(pathname) {
  try {
    return await supabaseRequest(pathname);
  } catch (error) {
    const message = String(error?.message || error);
    if (
      message.includes('PGRST205') ||
      message.includes("Could not find the table 'public.freshsales_sync_snapshots'") ||
      message.includes('schema cache')
    ) {
      return [];
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
