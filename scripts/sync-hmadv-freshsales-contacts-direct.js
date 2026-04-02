#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workspaceId = args.workspaceId || process.env.HMADV_WORKSPACE_ID || null;
  const contacts = await loadFreshsalesContacts(args.limit);

  if (!contacts.length) {
    console.log(JSON.stringify({ ok: true, total: 0, imported: 0, dryRun: args.dryRun }, null, 2));
    return;
  }

  const rows = contacts.map((contact) => mapContact(contact, workspaceId));

  if (args.dryRun) {
    console.log(JSON.stringify({ ok: true, total: rows.length, imported: 0, dryRun: true, sample: rows.slice(0, 5) }, null, 2));
    return;
  }

  let imported = 0;
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize);
    await supabaseRequest('freshsales_contacts?on_conflict=freshsales_contact_id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    imported += batch.length;
  }

  console.log(JSON.stringify({ ok: true, total: rows.length, imported, dryRun: false }, null, 2));
}

function parseArgs(argv) {
  const result = {
    limit: 1000,
    workspaceId: null,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') {
      result.limit = Number(argv[i + 1] || '1000');
      i += 1;
      continue;
    }
    if (arg === '--workspace-id') {
      result.workspaceId = argv[i + 1] || null;
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }
  }

  return result;
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

async function loadFreshsalesContacts(limit) {
  const perPage = 100;
  const maxPages = Math.max(1, Math.ceil(limit / perPage));
  const rows = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const remaining = limit - rows.length;
    if (remaining <= 0) break;
    const currentPerPage = Math.min(perPage, remaining);
    const payload = await freshsalesRequest(`/contacts/view/1?page=${page}&per_page=${currentPerPage}`);
    const contacts = Array.isArray(payload?.contacts) ? payload.contacts : [];
    if (!contacts.length) break;
    rows.push(...contacts);
    if (contacts.length < currentPerPage) break;
  }

  return rows.slice(0, limit);
}

function mapContact(contact, workspaceId) {
  const email = firstTruthy(flattenValues(contact.emails)) || contact.email || contact.primary_email || null;
  const phone = firstTruthy([
    contact.mobile_number,
    contact.work_number,
    contact.phone,
    ...flattenValues(contact.phones),
  ]);

  return {
    workspace_id: workspaceId,
    freshsales_contact_id: String(contact.id),
    name: buildDisplayName(contact),
    email,
    email_normalized: normalizeEmail(email),
    phone,
    phone_normalized: normalizePhone(phone),
    lifecycle_stage: cleanValue(contact.custom_field?.cf_fase_ciclo_vida || contact.cf_fase_ciclo_vida),
    meeting_stage: cleanValue(contact.custom_field?.cf_reuniao_status || contact.cf_reuniao_status),
    negotiation_stage: cleanValue(contact.custom_field?.cf_negociacao_status || contact.cf_negociacao_status),
    closing_stage: cleanValue(contact.custom_field?.cf_fechamento_status || contact.cf_fechamento_status),
    client_stage: cleanValue(contact.custom_field?.cf_cliente_status || contact.cf_cliente_status),
    raw_payload: contact,
    last_synced_at: new Date().toISOString(),
  };
}

function buildDisplayName(contact) {
  return cleanValue(contact.display_name)
    || cleanValue([contact.first_name, contact.last_name].filter(Boolean).join(' '))
    || cleanValue(contact.name);
}

function flattenValues(value) {
  if (Array.isArray(value)) return value.flatMap((item) => flattenValues(item));
  if (!value) return [];
  if (typeof value === 'object') return Object.values(value).flatMap((item) => flattenValues(item));
  const text = cleanValue(value);
  return text ? [text] : [];
}

function firstTruthy(values) {
  return values.find(Boolean) || null;
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeEmail(value) {
  const text = cleanValue(value);
  return text ? text.toLowerCase() : null;
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits || null;
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
  throw new Error('Credenciais Freshsales ausentes');
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
