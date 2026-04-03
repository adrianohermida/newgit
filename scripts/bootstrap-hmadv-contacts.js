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

  const rowsByEmail = new Map();
  for (const row of pendingRows) {
    if (!row.email_normalized) continue;
    if (!rowsByEmail.has(row.email_normalized)) rowsByEmail.set(row.email_normalized, []);
    rowsByEmail.get(row.email_normalized).push(row);
  }

  let createdOrUpdated = 0;
  let failed = 0;
  const failures = [];

  for (const [email, rows] of rowsByEmail.entries()) {
    const row = rows[0];
    if (!row.person_name) continue;

    try {
      let localContact = await resolveLocalContactByEmail(email);

      if (!localContact) {
        const response = await upsertContact(row);
        const contact = unwrapContact(response);

        if (!contact?.id) {
          failed += rows.length;
          failures.push({
            row_id: row.id,
            email,
            error: 'Freshsales upsert sem contact.id',
          });
          continue;
        }

        await supabaseRequest('freshsales_contacts?on_conflict=freshsales_contact_id', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify([{
            freshsales_contact_id: String(contact.id),
            name: buildFullName(contact),
            email,
            email_normalized: email,
            phone: contact.mobile_number || null,
            phone_normalized: normalizePhone(contact.mobile_number),
            raw_payload: contact,
            last_synced_at: new Date().toISOString(),
          }]),
        });

        localContact = await resolveLocalContactByFreshsalesId(String(contact.id));
      }

      if (!localContact?.id) {
        failed += rows.length;
        failures.push({
          row_id: row.id,
          email,
          error: 'Contato nao localizado em freshsales_contacts apos bootstrap',
        });
        continue;
      }

      await markRowsAsMatched(rows, localContact.id, email);
      createdOrUpdated += rows.length;
    } catch (error) {
      failed += rows.length;
      failures.push({
        row_id: row.id,
        email,
        error: String(error.message || error).slice(0, 1000),
      });
    }
  }

  console.log(JSON.stringify({
    ok: true,
    candidates: pendingRows.length,
    unique_emails: rowsByEmail.size,
    bootstrapped: createdOrUpdated,
    failed,
    failures: failures.slice(0, 20),
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

function buildContactPayloadVariants(row) {
  const { first_name, last_name } = splitName(row.person_name);
  return [
    {
      pathname: '/contacts/upsert',
      body: {
        unique_identifier: {
          emails: row.email_normalized,
        },
        contact: {
          first_name,
          last_name,
          emails: [row.email_normalized],
        },
      },
    },
    {
      pathname: '/contacts/upsert',
      body: {
        unique_identifier: row.email_normalized,
        contact: {
          first_name,
          last_name,
          email: row.email_normalized,
        },
      },
    },
    {
      pathname: '/contacts/upsert',
      body: {
        contact: {
          first_name,
          last_name,
          email: row.email_normalized,
          emails: [row.email_normalized],
        },
      },
    },
    {
      pathname: '/contacts',
      body: {
        contact: {
          first_name,
          last_name,
          email: row.email_normalized,
          emails: [row.email_normalized],
        },
      },
    },
    {
      pathname: '/contacts',
      body: {
        first_name,
        last_name,
        email: row.email_normalized,
      },
    },
  ];
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

function resolveFreshsalesBases() {
  const raw = cleanValue(process.env.FRESHSALES_API_BASE || process.env.FRESHSALES_BASE_URL || process.env.FRESHSALES_DOMAIN);
  if (!raw) throw new Error('FRESHSALES_API_BASE/FRESHSALES_BASE_URL/FRESHSALES_DOMAIN nao configurado');
  const base = raw.startsWith('http') ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
  if (base.includes('/crm/sales/api') || base.includes('/api')) return [base];
  const host = base.replace(/^https?:\/\//i, '');
  const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
  return Array.from(new Set([
    `${base}/crm/sales/api`,
    `${base}/api`,
    `https://${myfreshworksHost}/crm/sales/api`,
    `https://${myfreshworksHost}/api`,
  ]));
}

function freshsalesHeaderCandidates() {
  const apiKey = cleanValue(process.env.FRESHSALES_API_KEY);
  const accessToken = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  const candidates = [];
  if (apiKey) {
    candidates.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Token token=${apiKey}`,
    });
  }
  if (accessToken) {
    candidates.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    });
  }
  if (!candidates.length) throw new Error('Credenciais do Freshsales ausentes');
  return candidates;
}

async function freshsalesRequest(pathname, init = {}) {
  const attemptErrors = [];

  for (const base of resolveFreshsalesBases()) {
    for (const authHeaders of freshsalesHeaderCandidates()) {
      const response = await fetch(`${base}${pathname}`, {
        ...init,
        headers: {
          ...authHeaders,
          ...(init.headers || {}),
        },
      }).catch((error) => {
        attemptErrors.push(`${base}${pathname}: ${String(error.message || error)}`);
        return null;
      });

      if (!response) continue;

      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      attemptErrors.push(`${base}${pathname} -> ${response.status}: ${payload.message || payload.error || JSON.stringify(payload).slice(0, 300)}`);
    }
  }

  throw new Error(attemptErrors.join(' | ') || `Freshsales request failed: ${pathname}`);
}

async function resolveLocalContactByFreshsalesId(freshsalesContactId) {
  const rows = await supabaseRequest(`freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(freshsalesContactId)}&select=id,freshsales_contact_id,email_normalized&limit=1`);
  return rows[0] || null;
}

async function resolveLocalContactByEmail(email) {
  const rows = await supabaseRequest(`freshsales_contacts?email_normalized=eq.${encodeURIComponent(email)}&select=id,freshsales_contact_id,email_normalized&limit=1`);
  return rows[0] || null;
}

async function markRowsAsMatched(rows, contactId, email) {
  for (const row of rows) {
    await supabaseRequest(`billing_import_rows?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        matching_status: 'pareado',
        resolved_contact_id: contactId,
        matching_notes: `Contato pareado por bootstrap (${email})`,
        validation_errors: [],
      }),
    });
  }
}

async function upsertContact(row) {
  const attemptErrors = [];
  for (const variant of buildContactPayloadVariants(row)) {
    try {
      return await freshsalesRequest(variant.pathname, {
        method: 'POST',
        body: JSON.stringify(variant.body),
      });
    } catch (error) {
      attemptErrors.push(`${variant.pathname}: ${String(error.message || error)}`);
    }
  }
  throw new Error(attemptErrors.join(' | '));
}

function unwrapContact(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.contact || payload.contacts?.[0] || payload.data || payload;
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
