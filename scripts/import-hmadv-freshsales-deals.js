#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const limit = sanitizePositiveInt(process.argv[2], 100);
  const workspaceId = cleanValue(process.argv[3]) || null;

  const liveDeals = await loadFreshsalesDeals(limit);
  if (!liveDeals.length) {
    console.log(JSON.stringify({ ok: true, total: 0, imported: 0, message: 'Nenhum deal encontrado no Freshsales.' }, null, 2));
    return;
  }

  const normalizedDeals = liveDeals.map(normalizeFreshsalesDeal);
  for (const deal of normalizedDeals) {
    await syncDealContacts(deal);
  }

  const context = await loadImportContext();
  const rows = normalizedDeals
    .filter((deal) => !context.existingDealIds.has(deal.id))
    .map((deal, index) => buildImportRow(deal, index + 1, context))
    .filter(Boolean);

  if (!rows.length) {
    console.log(JSON.stringify({ ok: true, total: normalizedDeals.length, imported: 0, skipped_existing: normalizedDeals.length }, null, 2));
    return;
  }

  const summary = summarizeRows(rows);
  const run = await createImportRun({
    workspace_id: workspaceId,
    source_name: 'hmadv_freshsales_deals',
    source_file: `freshsales://deals/import?limit=${limit}`,
    status: 'processing',
    total_rows: summary.total_rows,
    valid_rows: summary.valid_rows,
    error_rows: summary.error_rows,
    duplicate_rows: summary.duplicate_rows,
    summary,
  });

  await insertImportRows(run.id, rows);
  await updateImportRun(run.id, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    summary,
  });

  console.log(JSON.stringify({
    ok: true,
    total: normalizedDeals.length,
    imported: rows.length,
    skipped_existing: normalizedDeals.length - rows.length,
    import_run_id: run.id,
    summary,
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

function sanitizePositiveInt(value, fallback) {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function parseJsonEnv(value, fallback = {}) {
  const text = cleanValue(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function normalizeInvoiceToken(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.replace(/\s+/g, '').replace(/^#+/, '').toLowerCase();
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)));
}

function readCustomField(deal, fieldName) {
  if (!fieldName) return null;
  const custom = deal?.custom_field && typeof deal.custom_field === 'object' ? deal.custom_field : {};
  const value = custom[fieldName];
  if (value == null || value === '') return null;
  return value;
}

function inferInvoiceFromName(name) {
  const text = String(name || '');
  const hashMatch = text.match(/#([A-Za-z0-9!._/-]+)/);
  if (hashMatch?.[1]) return hashMatch[1];
  const parcelaMatch = text.match(/parcela\s+([0-9]+\/[0-9]+)/i);
  if (parcelaMatch?.[1]) return parcelaMatch[1];
  return null;
}

function extractProcessReferences(value) {
  const text = String(value || '');
  if (!text) return [];

  const found = [];
  const cnjMatches = text.match(/\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g) || [];
  const digitsMatches = text.match(/\b\d{20}\b/g) || [];
  for (const item of [...cnjMatches, ...digitsMatches]) {
    const normalized = normalizeText(item);
    if (normalized && !found.includes(normalized)) found.push(normalized);
  }
  return found;
}

function getBillingConfig() {
  return {
    fieldMap: parseJsonEnv(process.env.FRESHSALES_BILLING_DEAL_FIELD_MAP, {
      external_reference: 'cf_hmadv_external_reference',
      invoice_number: 'cf_hmadv_invoice_number',
      receivable_status: 'cf_hmadv_receivable_status',
      billing_type: 'cf_hmadv_billing_type',
      process_reference: 'cf_hmadv_process_reference',
    }),
    stageIdMap: parseJsonEnv(process.env.FRESHSALES_BILLING_DEAL_STAGE_ID_MAP, {}),
  };
}

function invertStageMap(stageMap = {}) {
  const inverted = {};
  for (const [status, stageId] of Object.entries(stageMap)) {
    const key = String(stageId || '').trim();
    if (key && !inverted[key]) inverted[key] = status;
  }
  return inverted;
}

function deriveInboundStatus(deal, billingConfig) {
  const fieldStatus = cleanValue(readCustomField(deal, billingConfig.fieldMap.receivable_status));
  if (fieldStatus) return normalizeText(fieldStatus);

  const stageKey = String(deal.deal_stage_id || '').trim();
  const inverted = invertStageMap(billingConfig.stageIdMap);
  if (stageKey && inverted[stageKey]) return normalizeText(inverted[stageKey]);
  if (Number(deal.probability || 0) >= 100) return 'pago';
  return 'aberto';
}

function normalizeFreshsalesDeal(deal) {
  const billingConfig = getBillingConfig();
  const allCustomValues = Object.values(deal?.custom_field || {}).map((item) => String(item || ''));
  const explicitExternal = cleanValue(readCustomField(deal, billingConfig.fieldMap.external_reference));
  const inferredExternal = explicitExternal || firstNonEmpty(...allCustomValues.filter((item) => /hmadv-receivable-/i.test(item)));
  const invoiceReference =
    cleanValue(readCustomField(deal, billingConfig.fieldMap.invoice_number)) ||
    inferInvoiceFromName(deal.name) ||
    null;

  return {
    id: String(deal.id),
    name: deal.name || null,
    amount: Number(deal.amount || 0),
    expected_close: deal.expected_close || null,
    products: Array.isArray(deal.products) ? deal.products : [],
    contacts: Array.isArray(deal.contacts) ? deal.contacts : [],
    sales_accounts: Array.isArray(deal.sales_accounts) ? deal.sales_accounts : [],
    custom_field: deal.custom_field || {},
    externalReference: inferredExternal,
    invoiceReference: normalizeInvoiceToken(invoiceReference),
    processReferences: uniqueValues([
      readCustomField(deal, billingConfig.fieldMap.process_reference),
      deal.name,
      inferredExternal,
    ].flatMap((item) => extractProcessReferences(item))),
    inboundStatus: deriveInboundStatus(deal, billingConfig),
  };
}

function mapFreshsalesContactToRow(contact) {
  const primaryEmail = cleanValue(contact?.email);
  const name = firstNonEmpty(
    contact?.display_name,
    [contact?.first_name, contact?.last_name].filter(Boolean).join(' '),
    contact?.name
  );

  return {
    workspace_id: null,
    freshsales_contact_id: String(contact.id),
    name: name || null,
    email: primaryEmail,
    email_normalized: primaryEmail ? primaryEmail.toLowerCase() : null,
    phone: cleanValue(contact?.mobile_number || contact?.work_number),
    phone_normalized: String(contact?.mobile_number || contact?.work_number || '').replace(/\D+/g, '') || null,
    raw_payload: contact,
    last_synced_at: new Date().toISOString(),
  };
}

async function syncDealContacts(deal) {
  if (!Array.isArray(deal.contacts) || !deal.contacts.length) return;
  const rows = deal.contacts
    .filter((item) => item?.id)
    .map((item) => mapFreshsalesContactToRow(item));
  if (!rows.length) return;

  await supabaseRequest('freshsales_contacts?on_conflict=freshsales_contact_id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
}

async function loadImportContext() {
  const [contacts, products, registry, receivables] = await Promise.all([
    supabaseRequestAll('freshsales_contacts?select=id,freshsales_contact_id,name,email,email_normalized'),
    supabaseRequestAll('freshsales_products?select=id,name,billing_type,freshsales_product_id'),
    supabaseRequestAll('freshsales_deals_registry?select=freshsales_deal_id'),
    supabaseRequestAll('billing_receivables?select=freshsales_deal_id'),
  ]);

  const contactByFreshsalesId = new Map();
  const contactByEmail = new Map();
  for (const item of contacts || []) {
    const byIdKey = cleanValue(item?.freshsales_contact_id);
    if (byIdKey) contactByFreshsalesId.set(byIdKey, item);
    const emailKey = normalizeText(item?.email_normalized || item?.email);
    if (emailKey && !contactByEmail.has(emailKey)) contactByEmail.set(emailKey, item);
  }

  const productByFreshsalesId = new Map();
  const productByName = new Map();
  for (const item of products || []) {
    const productIdKey = cleanValue(item?.freshsales_product_id);
    if (productIdKey) productByFreshsalesId.set(productIdKey, item);
    const nameKey = normalizeText(item?.name);
    if (nameKey && !productByName.has(nameKey)) productByName.set(nameKey, item);
  }

  const existingDealIds = new Set(
    [...(registry || []), ...(receivables || [])]
      .map((item) => cleanValue(item?.freshsales_deal_id))
      .filter(Boolean)
  );

  return {
    contactByFreshsalesId,
    contactByEmail,
    productByFreshsalesId,
    productByName,
    existingDealIds,
  };
}

function inferProductFamily(deal) {
  const product = Array.isArray(deal.products) ? deal.products[0] || null : null;
  const productName = firstNonEmpty(product?.name, product?.display_name, product?.product_name);
  if (productName) return productName;
  const normalizedName = normalizeText(deal.name);
  if (normalizedName.includes('assinatura') || normalizedName.includes('consultoria')) return 'Honorarios Recorrentes';
  if (normalizedName.includes('despesa')) return 'Despesa do Cliente';
  return 'Fatura Avulsa';
}

function inferBillingType(productFamily) {
  const normalized = normalizeText(productFamily);
  if (normalized.includes('recorr') || normalized.includes('assinatura') || normalized.includes('consultoria')) return 'recorrente';
  if (normalized.includes('parcela')) return 'parcelado';
  if (normalized.includes('despesa')) return 'reembolso';
  if (normalized.includes('encargo') || normalized.includes('juros') || normalized.includes('multa')) return 'encargo';
  return 'unitario';
}

function mapCanonicalStatus(status) {
  const normalized = normalizeText(status);
  if (normalized.includes('pago')) return 'pago';
  if (normalized.includes('venc')) return 'vencido';
  if (normalized.includes('cancel')) return 'cancelado';
  if (normalized.includes('aberto') || normalized.includes('faturar')) return 'em_aberto';
  return 'em_aberto';
}

function buildDedupeKey(row) {
  return [
    normalizeText(row.person_name),
    normalizeText(row.email_normalized || row.email),
    normalizeText(row.invoice_number),
    normalizeText(row.due_date),
    normalizeText(row.amount_original_raw),
    normalizeText(row.entry_direction),
  ].join('|');
}

function buildImportRow(deal, sourceRowNumber, context) {
  const primaryContact = Array.isArray(deal.contacts) ? deal.contacts[0] || null : null;
  const personName = firstNonEmpty(
    primaryContact?.display_name,
    [primaryContact?.first_name, primaryContact?.last_name].filter(Boolean).join(' '),
    primaryContact?.name,
    deal.name
  );
  const email = cleanValue(primaryContact?.email);
  const emailNormalized = email ? email.toLowerCase() : null;
  const matchedContact =
    context.contactByFreshsalesId.get(cleanValue(primaryContact?.id)) ||
    context.contactByEmail.get(normalizeText(emailNormalized)) ||
    null;

  const product = Array.isArray(deal.products) ? deal.products[0] || null : null;
  const productFamily = inferProductFamily(deal);
  const matchedProduct =
    context.productByFreshsalesId.get(cleanValue(product?.product_id || product?.id)) ||
    context.productByName.get(normalizeText(productFamily)) ||
    null;

  const account = Array.isArray(deal.sales_accounts) ? deal.sales_accounts[0] || null : null;
  const processReference = firstNonEmpty(
    deal.processReferences?.[0],
    account?.name,
    account?.cf_processo,
    deal.name
  );
  const canonicalStatus = mapCanonicalStatus(deal.inboundStatus);
  const validationErrors = [];
  if (!matchedContact?.id && !emailNormalized) validationErrors.push('missing_email');
  if (!matchedProduct?.id) validationErrors.push('missing_product_match');

  return {
    source_row_number: sourceRowNumber,
    raw_payload: {
      source: 'freshsales_deal_import',
      freshsales_deal_id: deal.id,
      deal_name: deal.name,
      live_contacts: deal.contacts,
      live_products: deal.products,
      live_sales_accounts: deal.sales_accounts,
    },
    person_name: personName,
    email,
    email_normalized: emailNormalized,
    invoice_number: deal.invoiceReference || null,
    invoice_date: deal.expected_close || null,
    due_date: deal.expected_close || null,
    category_raw: productFamily,
    comment_raw: deal.name || null,
    deal_reference_raw: processReference || null,
    amount_original_raw: String(deal.amount || 0),
    payment_raw: canonicalStatus === 'pago' ? String(deal.amount || 0) : null,
    status_raw: deal.inboundStatus || null,
    entry_type_raw: 'Entrada',
    entry_direction: 'entrada',
    canonical_status: canonicalStatus,
    billing_type_inferred: inferBillingType(productFamily),
    product_family_inferred: productFamily,
    dedupe_key: buildDedupeKey({
      person_name: personName,
      email_normalized: emailNormalized,
      invoice_number: deal.invoiceReference || null,
      due_date: deal.expected_close || null,
      amount_original_raw: String(deal.amount || 0),
      entry_direction: 'entrada',
    }),
    is_duplicate: false,
    matching_status: matchedContact?.id
      ? (cleanValue(account?.id) || processReference ? 'pareado' : 'pendente_account')
      : emailNormalized
        ? 'pendente_contato'
        : 'pendente_revisao',
    matching_notes: `Importado do Freshsales deal ${deal.id}`,
    resolved_contact_id: matchedContact?.id || null,
    resolved_product_id: matchedProduct?.id || null,
    resolved_process_id: null,
    resolved_account_id_freshsales: cleanValue(account?.id) || null,
    resolved_process_reference: processReference || null,
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

function resolveFreshsalesBases() {
  const raw =
    cleanValue(process.env.FRESHSALES_API_BASE) ||
    cleanValue(process.env.FRESHSALES_BASE_URL) ||
    cleanValue(process.env.FRESHSALES_ALIAS_DOMAIN) ||
    cleanValue(process.env.FRESHSALES_DOMAIN);
  const orgDomain = cleanValue(process.env.FRESHSALES_ORG_DOMAIN);
  const bases = [];
  const push = (value) => {
    if (!value) return;
    if (!bases.includes(value)) bases.push(value);
  };

  if (!raw && !orgDomain) throw new Error('FRESHSALES_API_BASE/FRESHSALES_BASE_URL/FRESHSALES_DOMAIN nao configurado');

  if (orgDomain) {
    push(`https://${orgDomain}/crm/sales/api`);
    push(`https://${orgDomain}/api`);
  }

  if (raw) {
    const base = raw.startsWith('http') ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
    if (base.includes('/crm/sales/api') || base.includes('/api')) {
      const host = base.replace(/^https?:\/\//i, '').replace(/\/(crm\/sales\/api|api)\/?$/i, '');
      const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
      push(`https://${host}/crm/sales/api`);
      push(`https://${host}/api`);
      push(`https://${myfreshworksHost}/crm/sales/api`);
      push(`https://${myfreshworksHost}/api`);
      push(base);
    }
  }

  return bases;
}

async function getStoredOauthRow() {
  const rows = await supabaseRequest('freshsales_oauth_tokens?provider=eq.freshsales&select=access_token&limit=1');
  return Array.isArray(rows) ? rows[0] || null : rows || null;
}

async function freshsalesHeaderCandidates() {
  const apiKey = cleanValue(process.env.FRESHSALES_API_KEY);
  const basicAuth = cleanValue(process.env.FRESHSALES_BASIC_AUTH);
  const accessToken = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  const storedOauth = await getStoredOauthRow().catch(() => null);
  const storedToken = cleanValue(storedOauth?.access_token);

  const candidates = [];
  if (apiKey) {
    candidates.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Token token=${apiKey}`,
    });
  }
  if (basicAuth) {
    candidates.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: /^Basic\s+/i.test(basicAuth) ? basicAuth : `Basic ${basicAuth}`,
    });
  }
  if (storedToken) {
    candidates.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Authtoken=${storedToken}`,
    });
  }
  if (accessToken) {
    candidates.push({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Authtoken=${accessToken}`,
    });
  }
  if (!candidates.length) throw new Error('Credenciais do Freshsales ausentes');
  return candidates;
}

async function freshsalesRequest(pathname, init = {}) {
  const attemptErrors = [];
  for (const base of resolveFreshsalesBases()) {
    for (const headers of await freshsalesHeaderCandidates()) {
      const response = await fetch(`${base}${pathname}`, {
        ...init,
        headers: {
          ...headers,
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

async function loadFreshsalesDeals(limit) {
  const filtersPayload = await freshsalesRequest('/deals/filters');
  const filters = Array.isArray(filtersPayload?.filters) ? filtersPayload.filters : Array.isArray(filtersPayload) ? filtersPayload : [];
  const wantedNames = new Set(['Open Deals', 'Won Deals', 'Lost Deals', 'Recent Deals', 'Recently Imported', 'My Deals']);
  const chosenFilters = filters.filter((item) => wantedNames.has(String(item?.name || '').trim()));
  const selected = chosenFilters.length ? chosenFilters : filters.slice(0, 3);

  const results = [];
  const seen = new Set();
  const maxPages = Math.max(1, Math.ceil(limit / 100) + 1);

  for (const filter of selected) {
    if (!filter?.id) continue;
    for (let page = 1; page <= maxPages; page += 1) {
      const payload = await freshsalesRequest(`/deals/view/${encodeURIComponent(String(filter.id))}?page=${page}&per_page=100`);
      const items = Array.isArray(payload?.deals) ? payload.deals : Array.isArray(payload) ? payload : [];
      if (!items.length) break;

      for (const item of items) {
        const id = String(item?.id || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const detailPayload = await freshsalesRequest(`/deals/${encodeURIComponent(id)}?include=contacts,sales_account`);
        const detailedDeal = detailPayload?.deal || item;
        if (detailPayload?.contacts) detailedDeal.contacts = detailPayload.contacts;
        if (detailPayload?.sales_accounts) detailedDeal.sales_accounts = detailPayload.sales_accounts;
        results.push(detailedDeal);
        if (results.length >= limit) return results;
      }

      if (items.length < 100) break;
    }
  }
  return results;
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

async function supabaseRequestAll(pathname, pageSize = 1000) {
  const rows = [];
  let offset = 0;
  while (true) {
    const separator = pathname.includes('?') ? '&' : '?';
    const batch = await supabaseRequest(`${pathname}${separator}limit=${pageSize}&offset=${offset}`);
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
