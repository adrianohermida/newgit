#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await loadPendingRows(args.limit);
  const contacts = await loadFreshsalesContacts();
  const output = [];

  for (const row of rows) {
    const suggestions = rankCandidates(row, contacts).slice(0, args.topn);
    if (!suggestions.length) continue;
    output.push({
      row,
      suggestions,
    });
  }

  if (args.apply) {
    let applied = 0;
    for (const item of output) {
      const best = item.suggestions[0];
      if (!best || best.score < args.minScore) continue;
      await applySuggestion(item.row, best);
      applied += 1;
    }
    console.log(JSON.stringify({ ok: true, reviewed: output.length, applied }, null, 2));
    return;
  }

  const reportPath = args.output || path.join(process.cwd(), 'out', `hmadv-contact-suggestions-${Date.now()}.csv`);
  ensureParentDir(reportPath);
  fs.writeFileSync(reportPath, toCsv(flattenSuggestions(output, args.topn)), 'utf8');
  console.log(JSON.stringify({ ok: true, reviewed: output.length, output: reportPath }, null, 2));
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

function parseArgs(argv) {
  const result = {
    limit: 1000,
    topn: 3,
    minScore: 0.72,
    apply: false,
    output: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') {
      result.limit = Number(argv[i + 1] || '1000');
      i += 1;
      continue;
    }
    if (arg === '--topn') {
      result.topn = Number(argv[i + 1] || '3');
      i += 1;
      continue;
    }
    if (arg === '--min-score') {
      result.minScore = Number(argv[i + 1] || '0.72');
      i += 1;
      continue;
    }
    if (arg === '--apply') {
      result.apply = true;
      continue;
    }
    if (arg === '--output') {
      result.output = argv[i + 1] || null;
      i += 1;
      continue;
    }
  }

  return result;
}

async function loadPendingRows(limit) {
  const query = [
    'billing_import_rows?select=id,source_row_number,person_name,email,email_normalized,invoice_number,due_date,category_raw,comment_raw,matching_status,matching_notes,validation_errors,resolved_contact_id,raw_payload',
    'or=(matching_status.eq.pendente_contato,matching_status.eq.pendente_revisao)',
    'order=created_at.desc',
    `limit=${limit}`,
  ].join('&');
  return supabaseRequest(query);
}

async function loadFreshsalesContacts() {
  return supabaseRequest('freshsales_contacts?select=id,freshsales_contact_id,name,email,email_normalized,phone,phone_normalized,lifecycle_stage,client_stage');
}

function rankCandidates(row, contacts) {
  const rowName = normalizeText(row.person_name);
  const rowPhone = normalizePhone(extractPossiblePhone(row.raw_payload));

  return contacts
    .map((contact) => {
      const contactName = normalizeText(contact.name);
      const contactPhone = normalizePhone(contact.phone || contact.phone_normalized);
      const emailExact = row.email_normalized && contact.email_normalized && row.email_normalized === contact.email_normalized ? 1 : 0;
      const phoneExact = rowPhone && contactPhone && rowPhone === contactPhone ? 1 : 0;
      const nameScore = similarity(rowName, contactName);
      const prefixBoost = rowName && contactName && (contactName.includes(rowName) || rowName.includes(contactName)) ? 0.1 : 0;
      const score = Math.min(1, emailExact * 1 + phoneExact * 0.9 + nameScore * 0.8 + prefixBoost);
      return {
        id: contact.id,
        freshsales_contact_id: contact.freshsales_contact_id,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        score: Number(score.toFixed(4)),
        email_exact: emailExact === 1,
        phone_exact: phoneExact === 1,
        name_score: Number(nameScore.toFixed(4)),
      };
    })
    .filter((item) => item.score >= 0.45)
    .sort((left, right) => right.score - left.score);
}

async function applySuggestion(row, suggestion) {
  const notes = `${row.matching_notes || ''}; sugestao aplicada automaticamente (${suggestion.name} / score=${suggestion.score})`.trim();
  await supabaseRequest(`billing_import_rows?id=eq.${encodeURIComponent(row.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      resolved_contact_id: suggestion.id,
      matching_status: 'pareado',
      matching_notes: notes,
      validation_errors: filterValidationErrors(row.validation_errors, ['missing_email']),
    }),
  });
}

function filterValidationErrors(errors, removable) {
  const values = Array.isArray(errors) ? errors : [];
  return values.filter((item) => !removable.includes(item));
}

function extractPossiblePhone(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  const candidates = [
    rawPayload.Telefone,
    rawPayload.telefone,
    rawPayload.Celular,
    rawPayload.celular,
    rawPayload.Phone,
    rawPayload.phone,
  ];
  return candidates.find(Boolean) || null;
}

function flattenSuggestions(items, topn) {
  const rows = [];
  for (const item of items) {
    const base = {
      import_row_id: item.row.id,
      source_row_number: item.row.source_row_number,
      person_name: item.row.person_name,
      email: item.row.email,
      matching_status: item.row.matching_status,
      matching_notes: item.row.matching_notes,
    };
    for (let index = 0; index < topn; index += 1) {
      const suggestion = item.suggestions[index];
      rows.push({
        ...base,
        suggestion_rank: index + 1,
        suggested_contact_id: suggestion?.id || '',
        suggested_freshsales_contact_id: suggestion?.freshsales_contact_id || '',
        suggested_name: suggestion?.name || '',
        suggested_email: suggestion?.email || '',
        suggested_phone: suggestion?.phone || '',
        score: suggestion?.score ?? '',
        email_exact: suggestion?.email_exact ?? '',
        phone_exact: suggestion?.phone_exact ?? '',
        name_score: suggestion?.name_score ?? '',
      });
    }
  }
  return rows;
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeCsv(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(rows) {
  if (!rows.length) return 'import_row_id,source_row_number,person_name,email,suggestion_rank,suggested_contact_id,score\n';
  const headers = Object.keys(rows[0]);
  return `${[headers.join(','), ...rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(','))].join('\n')}\n`;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  return digits || null;
}

function similarity(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshtein(left, right);
  const base = Math.max(left.length, right.length);
  return base ? 1 - distance / base : 0;
}

function levenshtein(left, right) {
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) matrix[0][j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[left.length][right.length];
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
