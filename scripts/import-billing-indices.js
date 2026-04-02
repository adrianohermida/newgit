#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const filePath = process.argv[2];
  const indexName = process.argv[3] || 'IGP-M';
  const sourceName = process.argv[4] || 'csv';

  if (!filePath) {
    throw new Error('Uso: node scripts/import-billing-indices.js <arquivo.csv> [index_name] [source]');
  }

  const { header, rows } = parseCsvFile(filePath);
  if (!header.length || !rows.length) {
    throw new Error('Arquivo de indices vazio ou sem cabecalho.');
  }

  const monthColumn = resolveColumn(header, ['mes', 'mês', 'data', 'competencia', 'competência']);
  const valueColumn = resolveColumn(header, ['igp-m', 'igpm', 'valor', 'indice', 'índice']);

  if (monthColumn === -1 || valueColumn === -1) {
    throw new Error('Nao foi possivel localizar as colunas de mes/indice no CSV.');
  }

  const payload = rows
    .map((row) => ({
      index_name: indexName,
      month_ref: parseMonthRef(row[monthColumn]),
      index_value: parseIndexNumber(row[valueColumn]),
      source: sourceName,
      metadata: {
        import_file: filePath,
        original_month: row[monthColumn],
        original_value: row[valueColumn],
      },
    }))
    .filter((row) => row.month_ref && row.index_value != null);

  if (!payload.length) {
    throw new Error('Nenhum indice valido foi encontrado para importacao.');
  }

  await supabaseRequest('billing_indices?on_conflict=index_name,month_ref', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });

  console.log(`Indices importados: ${payload.length}`);
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

function parseCsvFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const text = decodeBuffer(buffer);
  const rows = parseCsv(text);
  const header = rows.shift() || [];
  return { header, rows };
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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveColumn(header, aliases) {
  return header.findIndex((item) => {
    const normalized = normalizeText(item);
    return aliases.some((alias) => normalized.includes(normalizeText(alias)));
  });
}

function parseMonthRef(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  let match = text.match(/(\d{4})[-\/\.](\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, '0')}`;
  }
  match = text.match(/(\d{1,2})[-\/\.](\d{4})/);
  if (match) {
    return `${match[2]}-${match[1].padStart(2, '0')}`;
  }
  match = text.match(/(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}`;
  }
  return null;
}

function parseIndexNumber(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = text
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
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
