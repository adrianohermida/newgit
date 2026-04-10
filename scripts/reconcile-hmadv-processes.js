#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = await loadCandidateRows(args);

  if (!rows.length) {
    console.log(JSON.stringify({ ok: true, reviewed: 0, applied: 0, output: null }, null, 2));
    return;
  }

  const contactsById = await loadContactsById(rows);
  const processesByEmail = await loadProcessesByEmail(rows);
  const suggestions = [];
  let applied = 0;

  for (const row of rows) {
    const contact = contactsById.get(row.resolved_contact_id) || null;
    const candidates = await resolveCandidatesForRow(row, contact, processesByEmail);
    const topCandidates = candidates.slice(0, args.topn);

    suggestions.push({
      import_row_id: row.id,
      source_row_number: row.source_row_number,
      email: row.email || '',
      person_name: row.person_name || '',
      process_hint: row.deal_reference_raw || '',
      top_score: topCandidates[0]?.score ?? null,
      top_process_id: topCandidates[0]?.process_id ?? null,
      top_account_id_freshsales: topCandidates[0]?.account_id_freshsales ?? null,
      top_process_reference: topCandidates[0]?.process_reference ?? null,
      candidates: topCandidates,
    });

    if (!args.apply) continue;

    const best = topCandidates[0];
    if (!best || best.score < args.minScore || !best.account_id_freshsales) continue;

    await supabaseRequest(`billing_import_rows?id=eq.${encodeURIComponent(row.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        resolved_process_id: best.process_id,
        resolved_account_id_freshsales: best.account_id_freshsales,
        resolved_process_reference: best.process_reference,
        matching_status: row.resolved_contact_id ? 'pareado' : row.email_normalized ? 'pendente_contato' : 'pendente_revisao',
        matching_notes: `${row.matching_notes || ''}; processo resolvido (${best.process_reference || best.process_id}) score=${best.score.toFixed(2)}`.trim(),
      }),
    });
    applied += 1;
  }

  const outputPath = writeSuggestionsCsv(suggestions);
  console.log(JSON.stringify({
    ok: true,
    reviewed: rows.length,
    applied,
    output: outputPath,
  }, null, 2));
}

function parseArgs(argv) {
  const result = {
    limit: 1000,
    topn: 3,
    minScore: 0.9,
    apply: false,
    importRunId: null,
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
      result.minScore = Number(argv[i + 1] || '0.9');
      i += 1;
      continue;
    }
    if (arg === '--apply') {
      result.apply = true;
      continue;
    }
    if (arg === '--import-run-id') {
      result.importRunId = argv[i + 1] || null;
      i += 1;
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

async function loadCandidateRows(args) {
  const filters = [
    'select=id,import_run_id,source_row_number,email,email_normalized,person_name,deal_reference_raw,matching_status,matching_notes,resolved_contact_id,resolved_process_id,resolved_account_id_freshsales,validation_errors',
    'resolved_contact_id=not.is.null',
    'resolved_account_id_freshsales=is.null',
    'order=created_at.desc',
  ];
  if (args.importRunId) {
    filters.push(`import_run_id=eq.${encodeURIComponent(args.importRunId)}`);
  }

  const rows = await supabaseRequestAll(`billing_import_rows?${filters.join('&')}`, Math.min(args.limit, 1000), args.limit);
  return rows.filter((row) => Array.isArray(row.validation_errors) ? row.validation_errors.length === 0 : true);
}

async function loadContactsById(rows) {
  const ids = uniqueBy(rows.map((row) => row.resolved_contact_id).filter(Boolean), (item) => item);
  if (!ids.length) return new Map();

  const contacts = [];
  for (let index = 0; index < ids.length; index += 50) {
    const chunk = ids.slice(index, index + 50).map((item) => `"${item}"`).join(',');
    const batch = await supabaseRequest(`freshsales_contacts?select=id,name,email,raw_payload&id=in.(${chunk})`);
    contacts.push(...batch);
  }

  return new Map(contacts.map((item) => [item.id, item]));
}

async function loadProcessesByEmail(rows) {
  const emails = Array.from(new Set(rows.map((row) => normalizeEmail(row.email_normalized || row.email)).filter(Boolean)));
  const bucket = new Map();

  for (const email of emails) {
    const items = [];
    items.push(...await queryProcessesAll(`processos?select=id,numero_cnj,numero,titulo,status,updated_at,account_id_freshsales,cliente_email,email_cliente&cliente_email=eq.${encodeURIComponent(email)}`));
    items.push(...await queryProcessesAll(`processos?select=id,numero_cnj,numero,titulo,status,updated_at,account_id_freshsales,cliente_email,email_cliente&email_cliente=eq.${encodeURIComponent(email)}`));
    bucket.set(email, uniqueBy(items, (item) => `${item.id}:${item.account_id_freshsales || ''}`));
  }

  return bucket;
}

async function resolveCandidatesForRow(row, contact, processesByEmail) {
  const email = normalizeEmail(row.email_normalized || row.email);
  const emailProcesses = processesByEmail.get(email) || [];
  const referenceProcesses = row.deal_reference_raw ? await searchProcessesByReference(row.deal_reference_raw) : [];
  const pairProcesses = row.deal_reference_raw ? await searchProcessesByPartesPair(row.deal_reference_raw) : [];
  const nameProcesses = await searchProcessesByNames(extractNameHints(row, contact));
  const processes = uniqueBy([...emailProcesses, ...referenceProcesses, ...pairProcesses, ...nameProcesses], (item) => `${item.id}:${item.account_id_freshsales || ''}`);

  return processes
    .map((process) => scoreProcessCandidate(row, process, processes.length))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
}

async function searchProcessesByReference(reference) {
  const cleanedText = normalizeText(reference);
  const digits = normalizeDigits(reference);
  const candidates = [];

  if (digits) {
    candidates.push(...await queryProcessesAll(`processos?select=id,numero_cnj,numero,titulo,status,updated_at,account_id_freshsales&numero_cnj=eq.${encodeURIComponent(digits)}`, 100, 100));
    candidates.push(...await queryProcessesAll(`processos?select=id,numero_cnj,numero,titulo,status,updated_at,account_id_freshsales&numero=eq.${encodeURIComponent(digits)}`, 100, 100));
  }

  if (cleanedText) {
    const likeTerm = encodeURIComponent(`*${cleanedText.slice(0, 40)}*`);
    candidates.push(...await queryProcessesAll(`processos?select=id,numero_cnj,numero,titulo,status,updated_at,account_id_freshsales&titulo=ilike.${likeTerm}`, 100, 100));
  }

  return uniqueBy(candidates, (item) => `${item.id}:${item.account_id_freshsales || ''}`);
}

function splitProcessSides(reference) {
  const text = String(reference || '').trim();
  if (!text) return [];
  return text
    .split(/\s+[xX]\s+|\s+vs\.?\s+|\s+contra\s+/i)
    .map((item) => item.trim())
    .filter((item) => item && item.length >= 5)
    .slice(0, 2);
}

async function findParteProcessIdsByName(name) {
  const encoded = encodeURIComponent(`*${String(name || '').slice(0, 80)}*`);
  const partes = await queryProcessesAll(
    `partes?select=id,processo_id,nome&nome=ilike.${encoded}`,
    200,
    400
  );

  return uniqueBy(
    partes
      .filter((item) => {
        const parteName = normalizeText(item?.nome);
        const target = normalizeText(name);
        return parteName === target || parteName.includes(target) || target.includes(parteName);
      })
      .map((item) => item.processo_id)
      .filter(Boolean),
    (item) => item
  );
}

async function searchProcessesByPartesPair(reference) {
  const sides = splitProcessSides(reference);
  if (sides.length < 2) return [];

  const [leftIds, rightIds] = await Promise.all([
    findParteProcessIdsByName(sides[0]),
    findParteProcessIdsByName(sides[1]),
  ]);

  if (!leftIds.length || !rightIds.length) return [];
  const rightSet = new Set(rightIds.map((item) => String(item)));
  const intersection = leftIds.filter((item) => rightSet.has(String(item)));
  if (!intersection.length) return [];

  const processMap = new Map();
  for (let index = 0; index < intersection.length; index += 40) {
    const chunk = intersection.slice(index, index + 40).map((item) => `"${item}"`).join(',');
    const processes = await queryProcessesAll(
      `processos?select=id,numero_cnj,numero,titulo,status,updated_at,account_id_freshsales&account_id_freshsales=not.is.null&id=in.(${chunk})`,
      100,
      200
    );
    for (const process of processes) {
      const key = `${process.id}:${process.account_id_freshsales || ''}`;
      if (!processMap.has(key)) processMap.set(key, { ...process, _pair_match: true });
    }
  }

  return Array.from(processMap.values());
}

function extractNameHints(row, contact) {
  const hints = new Set();
  const add = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    if (text.length < 5) return;
    hints.add(text);
  };

  add(row.person_name);
  add(contact?.name);

  const reference = String(row.deal_reference_raw || '').trim();
  if (reference) {
    reference
      .split(/\s+[xX]\s+|\s+vs\.?\s+|\s+contra\s+/i)
      .map((item) => item.trim())
      .forEach(add);
  }

  return Array.from(hints);
}

async function searchProcessesByNames(nameHints) {
  const processMap = new Map();

  for (const name of nameHints.slice(0, 4)) {
    const encoded = encodeURIComponent(`*${name.slice(0, 60)}*`);
    const partes = await queryProcessesAll(
      `partes?select=id,processo_id,nome,polo,cliente_hmadv,representada_pelo_escritorio,principal_no_account&nome=ilike.${encoded}`,
      100,
      200
    );
    const processIds = uniqueBy(partes.map((item) => item.processo_id).filter(Boolean), (item) => item);
    if (!processIds.length) continue;

    for (let index = 0; index < processIds.length; index += 40) {
      const chunk = processIds.slice(index, index + 40).map((item) => `"${item}"`).join(',');
      const processes = await queryProcessesAll(
        `processos?select=id,numero_cnj,titulo,account_id_freshsales,status&account_id_freshsales=not.is.null&id=in.(${chunk})`,
        100,
        200
      );
      for (const process of processes) {
        const key = `${process.id}:${process.account_id_freshsales || ''}`;
        if (!processMap.has(key)) processMap.set(key, process);
      }
    }
  }

  return Array.from(processMap.values());
}

function scoreProcessCandidate(row, process, totalCandidates = 0) {
  const rowText = normalizeText(row.deal_reference_raw);
  const rowDigits = normalizeDigits(row.deal_reference_raw);
  const processReference = process.numero_cnj || process.numero || process.titulo || null;
  const processText = normalizeText(processReference);
  const processDigits = normalizeDigits(process.numero_cnj || process.numero || process.titulo);
  const titleText = normalizeText(process.titulo);
  const rowNameText = normalizeText(row.person_name);

  let score = 0;
  if (rowDigits && processDigits) {
    if (rowDigits === processDigits) score = 1;
    else if (processDigits.includes(rowDigits) || rowDigits.includes(processDigits)) score = Math.max(score, 0.94);
  }

  if (rowText && titleText) {
    if (rowText === titleText || rowText === processText) score = Math.max(score, 0.96);
    else if (titleText.includes(rowText) || processText.includes(rowText)) score = Math.max(score, 0.86);
  }

  if (rowNameText && titleText && (titleText.includes(rowNameText) || rowNameText.includes(titleText))) {
    score = Math.max(score, 0.8);
  }

  if (process._pair_match) {
    score = Math.max(score, 0.98);
  }

  if (!rowText && !rowDigits) {
    if (totalCandidates === 1 && process.account_id_freshsales) score = 0.9;
    else score = process.account_id_freshsales ? 0.55 : 0.35;
  }

  if (process.account_id_freshsales) score += 0.03;
  if (normalizeText(process.status).includes('ativo')) score += 0.01;
  score = Math.min(1, Number(score.toFixed(4)));

  return {
    process_id: process.id || null,
    account_id_freshsales: process.account_id_freshsales || null,
    process_reference,
    process_title: process.titulo || null,
    process_status: process.status || null,
    score,
  };
}

async function queryProcesses(pathname) {
  return queryProcessesAll(pathname, 200, 200);
}

async function queryProcessesAll(pathname, pageSize = 200, maxRows = 1000) {
  const merged = [];
  for (const schema of ['public', 'judiciario']) {
    try {
      const rows = await supabaseRequestAll(pathname, pageSize, maxRows, schema);
      merged.push(...rows);
    } catch {
      // segue para o proximo schema
    }
  }
  return uniqueBy(merged, (item) => `${item.id}:${item.account_id_freshsales || ''}`);
}

function writeSuggestionsCsv(rows) {
  const outDir = path.join(process.cwd(), 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, `hmadv-process-suggestions-${Date.now()}.csv`);
  const header = [
    'import_row_id',
    'source_row_number',
    'email',
    'person_name',
    'process_hint',
    'top_score',
    'top_process_id',
    'top_account_id_freshsales',
    'top_process_reference',
    'candidates_json',
  ];
  const lines = [header.join(',')];
  for (const row of rows) {
    lines.push([
      row.import_row_id,
      row.source_row_number,
      escapeCsv(row.email),
      escapeCsv(row.person_name),
      escapeCsv(row.process_hint),
      row.top_score == null ? '' : row.top_score,
      row.top_process_id || '',
      row.top_account_id_freshsales || '',
      escapeCsv(row.top_process_reference || ''),
      escapeCsv(JSON.stringify(row.candidates || [])),
    ].join(','));
  }
  fs.writeFileSync(filePath, lines.join('\n'));
  return filePath;
}

function escapeCsv(value) {
  const text = String(value || '');
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function normalizeEmail(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeDigits(value) {
  const text = String(value || '').replace(/\D+/g, '').trim();
  return text || null;
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = String(getKey(item) || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function supabaseRequest(pathname, init = {}, schema = 'public') {
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
      'Accept-Profile': schema,
      'Content-Profile': schema,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function supabaseRequestAll(pathname, pageSize = 200, maxRows = 1000, schema = 'public') {
  const rows = [];
  let offset = 0;
  while (rows.length < maxRows) {
    const separator = pathname.includes('?') ? '&' : '?';
    const batch = await supabaseRequest(`${pathname}${separator}limit=${pageSize}&offset=${offset}`, {}, schema);
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows.slice(0, maxRows);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
