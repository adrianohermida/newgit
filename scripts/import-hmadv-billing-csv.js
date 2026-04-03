#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_FILES = [
  'D:/Downloads/HMADV - Faturas (6).csv',
  'D:/Downloads/HMADV - Assinaturas (1).csv',
];

loadLocalEnv();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = args.files.length ? args.files : DEFAULT_FILES;
  const dryRun = args.dryRun;
  const workspaceId = args.workspaceId || process.env.HMADV_WORKSPACE_ID || null;

  const contacts = dryRun ? [] : await loadFreshsalesContacts();
  const products = dryRun ? [] : await loadFreshsalesProducts();
  const contactByEmail = new Map(contacts.filter((item) => item.email_normalized).map((item) => [item.email_normalized, item]));
  const productByName = new Map(products.map((item) => [String(item.name || '').toLowerCase(), item]));

  for (const file of files) {
    const parsed = parseCsvFile(file);
    const normalizedRows = parsed.rows.map((row, index) =>
      normalizeImportRow(row, index + 2, contactByEmail, productByName)
    );
    markDuplicates(normalizedRows);

    const summary = summarizeRows(normalizedRows);
    console.log(`Arquivo: ${file}`);
    console.log(JSON.stringify(summary, null, 2));

    if (dryRun) continue;

    const run = await createImportRun({
      workspace_id: workspaceId,
      source_name: 'hmadv_csv',
      source_file: file,
      status: 'processing',
      total_rows: summary.total_rows,
      valid_rows: summary.valid_rows,
      error_rows: summary.error_rows,
      duplicate_rows: summary.duplicate_rows,
      summary,
    });

    await insertImportRows(run.id, normalizedRows);
    await updateImportRun(run.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      summary,
    });
  }
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
  const result = { files: [], dryRun: false, workspaceId: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }
    if (arg === '--workspace-id') {
      result.workspaceId = argv[i + 1] || null;
      i += 1;
      continue;
    }
    result.files.push(arg);
  }
  return result;
}

function parseCsvFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const text = decodeBuffer(buffer);
  const rows = parseCsv(text);
  const header = rows.shift() || [];
  return {
    header,
    rows: rows.map((row) => {
      const payload = {};
      header.forEach((column, index) => {
        payload[column] = row[index] ?? '';
      });
      return payload;
    }),
  };
}

function decodeBuffer(buffer) {
  const utf8 = buffer.toString('utf8');
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(buffer);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      row.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length || row.length) {
    row.push(current);
    rows.push(row);
  }

  return rows.filter((item) => item.some((value) => String(value || '').trim() !== ''));
}

function normalizeImportRow(row, sourceRowNumber, contactByEmail, productByName) {
  const email = normalizeEmail(row['E-mail']);
  const productFamily = inferProductFamily(row);
  const matchedContact = email ? contactByEmail.get(email) || null : null;
  const matchedProduct = productByName.get(productFamily.toLowerCase()) || null;
  const validationErrors = [];

  if (!row['Pago para / Recebido de']) validationErrors.push('missing_person_name');
  if (!parseBrazilDate(row['Data de vencimento'])) validationErrors.push('invalid_due_date');
  if (parseMoneyBRL(row['Valor Original']) == null) validationErrors.push('invalid_amount_original');
  if (!email) validationErrors.push('missing_email');

  return {
    id: randomUuid(),
    source_row_number: sourceRowNumber,
    raw_payload: row,
    person_name: row['Pago para / Recebido de'] || null,
    email: row['E-mail'] || null,
    email_normalized: email,
    invoice_number: cleanValue(row.Fatura),
    invoice_date: parseBrazilDate(row['Data da fatura']),
    due_date: parseBrazilDate(row['Data de vencimento']),
    category_raw: cleanValue(row.Categoria),
    comment_raw: cleanValue(row['Comentário']),
    deal_reference_raw: cleanValue(row.Negócio),
    amount_original_raw: cleanValue(row['Valor Original']),
    payment_raw: cleanValue(row['Pagamento (-)'] || row.Pagamento),
    status_raw: cleanValue(row.Status),
    entry_type_raw: cleanValue(row.Tipo),
    entry_direction: inferEntryDirection(row.Tipo),
    canonical_status: canonicalFinanceStatus(row.Status),
    billing_type_inferred: inferBillingType(row),
    product_family_inferred: productFamily,
    dedupe_key: buildDedupeKey(row),
    is_duplicate: false,
    matching_status: matchedContact ? 'pareado' : email ? 'pendente_contato' : 'pendente_revisao',
    matching_notes: matchedContact ? `Contato resolvido por e-mail (${email})` : email ? `E-mail sem match no Freshsales (${email})` : 'Linha sem e-mail válido',
    resolved_contact_id: matchedContact ? matchedContact.id : null,
    resolved_product_id: matchedProduct ? matchedProduct.id : null,
    validation_errors: validationErrors,
  };
}

function summarizeRows(rows) {
  return rows.reduce((acc, row) => {
    acc.total_rows += 1;
    if (row.validation_errors.length) acc.error_rows += 1;
    else acc.valid_rows += 1;
    if (row.is_duplicate) acc.duplicate_rows += 1;
    acc.by_matching_status[row.matching_status] = (acc.by_matching_status[row.matching_status] || 0) + 1;
    acc.by_product_family[row.product_family_inferred] = (acc.by_product_family[row.product_family_inferred] || 0) + 1;
    acc.by_billing_type[row.billing_type_inferred] = (acc.by_billing_type[row.billing_type_inferred] || 0) + 1;
    return acc;
  }, {
    total_rows: 0,
    valid_rows: 0,
    error_rows: 0,
    duplicate_rows: 0,
    by_matching_status: {},
    by_product_family: {},
    by_billing_type: {},
  });
}

function markDuplicates(rows) {
  const seen = new Set();
  for (const row of rows) {
    if (!row.dedupe_key) continue;
    if (seen.has(row.dedupe_key)) {
      row.is_duplicate = true;
      row.matching_notes = `${row.matching_notes}; duplicata detectada`;
      row.validation_errors = [...row.validation_errors, 'duplicate_row'];
      continue;
    }
    seen.add(row.dedupe_key);
  }
}

function inferEntryDirection(typeValue) {
  const text = String(typeValue || '').toLowerCase();
  if (text.includes('saída') || text.includes('saida')) return 'saida';
  if (text.includes('entrada')) return 'entrada';
  return 'entrada';
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeEmail(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text || text === 'não localizado' || text === 'nao localizado') return null;
  return text;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseMoneyBRL(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  if (!text || /^#(REF|VALUE)!$/i.test(text)) return null;
  const normalized = text
    .replace(/[R$\s]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBrazilDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00-03:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const sameYear = parsed.getUTCFullYear() === Number(year);
  const sameMonth = parsed.getUTCMonth() + 1 === Number(month);
  const sameDay = parsed.getUTCDate() === Number(day);
  return sameYear && sameMonth && sameDay ? iso : null;
}

function canonicalFinanceStatus(status) {
  const normalized = normalizeText(status);
  if (!normalized) return 'em_aberto';
  if (normalized.includes('pago') || normalized.includes('quitado')) return 'pago';
  if (normalized.includes('parcial')) return 'parcial';
  if (normalized.includes('aberto')) return 'em_aberto';
  if (normalized.includes('venc')) return 'vencido';
  return 'em_aberto';
}

function inferBillingType(row) {
  const joined = [
    row.Categoria,
    row.Tipo,
    row['Comentário'],
    row['Pago para / Recebido de'],
    row.Negócio,
  ].filter(Boolean).join(' | ');
  const normalized = normalizeText(joined);
  if (normalized.includes('assinatura') || normalized.includes('recorrent') || normalized.includes('mensal')) return 'recorrente';
  if (normalized.includes('parcela') || normalized.includes('parcelad')) return 'parcelado';
  if (normalized.includes('despesa')) return 'reembolso';
  return 'unitario';
}

function inferProductFamily(row) {
  const category = normalizeText(row.Categoria);
  const comment = normalizeText(row['Comentário']);
  const type = inferBillingType(row);
  if (category.includes('honorario')) return type === 'recorrente' ? 'Honorarios Recorrentes' : 'Honorarios Unitarios';
  if (category.includes('despesa')) return 'Despesa do Cliente';
  if (type === 'parcelado') return 'Parcela Contratual';
  if (type === 'recorrente') return 'Honorarios Recorrentes';
  if (comment.includes('encargo') || comment.includes('multa') || comment.includes('juros')) return 'Encargos de Atraso';
  return 'Fatura Avulsa';
}

function buildDedupeKey(row) {
  return [
    normalizeText(row['Pago para / Recebido de']),
    normalizeEmail(row['E-mail']) || '',
    String(row.Fatura || '').trim(),
    parseBrazilDate(row['Data de vencimento']) || '',
    parseMoneyBRL(row['Valor Original']) ?? '',
    normalizeText(row.Tipo),
  ].join('|');
}

async function loadFreshsalesContacts() {
  return supabaseRequest('freshsales_contacts?select=id,email_normalized');
}

async function loadFreshsalesProducts() {
  return supabaseRequest('freshsales_products?select=id,name');
}

async function createImportRun(payload) {
  const rows = await supabaseRequest('billing_import_runs', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(payload),
  });
  return rows[0];
}

async function updateImportRun(id, payload) {
  await supabaseRequest(`billing_import_runs?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  });
}

async function insertImportRows(importRunId, rows) {
  const chunkSize = 200;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const batch = rows.slice(index, index + chunkSize).map((row) => ({
      ...row,
      import_run_id: importRunId,
    }));
    await supabaseRequest('billing_import_rows', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(batch),
    });
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

function randomUuid() {
  return crypto.randomUUID();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
