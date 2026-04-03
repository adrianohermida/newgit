#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const limit = Number(process.argv[2] || '100');
  const pendingRows = await supabaseRequest(
    `billing_import_rows?select=id,person_name,email,email_normalized,matching_status,resolved_contact_id&matching_status=eq.pendente_contato&limit=${limit}`
  );

  if (!pendingRows.length) {
    console.log(JSON.stringify({ ok: true, bootstrapped: 0, message: 'Nenhuma linha pendente_contato encontrada.' }, null, 2));
    return;
  }

  let createdOrUpdated = 0;

  for (const row of pendingRows) {
    if (!row.email_normalized || !row.person_name) continue;
    const payload = buildContactUpsertPayload(row);
    const response = await freshsalesRequest('/contacts/upsert', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const contact = response.contact || response;
    if (!contact?.id) continue;

    await supabaseRequest('freshsales_contacts?on_conflict=freshsales_contact_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        freshsales_contact_id: String(contact.id),
        name: buildFullName(contact),
        email: row.email_normalized,
        email_normalized: row.email_normalized,
        phone: contact.mobile_number || null,
        phone_normalized: normalizePhone(contact.mobile_number),
        raw_payload: contact,
        last_synced_at: new Date().toISOString(),
      }]),
    });

    await supabaseRequest(`billing_import_rows?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        matching_status: 'pareado',
        resolved_contact_id: await resolveLocalContactId(String(contact.id)),
        matching_notes: `Contato criado/atualizado no Freshsales por bootstrap (${row.email_normalized})`,
        validation_errors: [],
      }),
    });
    createdOrUpdated += 1;
  }

  console.log(JSON.stringify({ ok: true, candidates: pendingRows.length, bootstrapped: createdOrUpdated }, null, 2));
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

function buildContactUpsertPayload(row) {
  const { first_name, last_name } = splitName(row.person_name);
  return {
    unique_identifier: {
      emails: row.email_normalized,
    },
    contact: {
      first_name,
      last_name,
      emails: [row.email_normalized],
    },
  };
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first_name: 'Cliente', last_name: 'HMADV' };
  if (parts.length === 1) return { first_name: parts[0], last_name: 'HMADV' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

function buildFullName(contact) {
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || null;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits || null;
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
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

async function freshsalesRequest(pathname, init = {}) {
  const base = resolveFreshsalesBase();
  const response = await fetch(`${base}${pathname}`, {
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

async function resolveLocalContactId(freshsalesContactId) {
  const rows = await supabaseRequest(`freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(freshsalesContactId)}&select=id&limit=1`);
  return rows[0]?.id || null;
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
