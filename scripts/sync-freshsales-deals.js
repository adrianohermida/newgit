#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const args = process.argv.slice(2);
  const applyStatus = args.includes('--apply-status');
  const filteredArgs = args.filter((item) => item !== '--apply-status');
  const limit = sanitizePositiveInt(filteredArgs[0], 200);
  const specificDealId = sanitizeNumericId(filteredArgs[1]);
  const outputPath = filteredArgs[2] || path.join(process.cwd(), 'out', `freshsales-deals-sync-${Date.now()}.json`);

  const liveDeals = await loadFreshsalesDeals(limit, specificDealId);
  if (!liveDeals.length) {
    console.log(JSON.stringify({ ok: true, total: 0, matched: 0, unmatched: 0, message: 'Nenhum deal encontrado no Freshsales.' }, null, 2));
    return;
  }

  const normalizedDeals = liveDeals.map((deal) => normalizeFreshsalesDeal(deal));
  for (const deal of normalizedDeals) {
    await syncDealContacts(deal);
  }

  const context = await loadLocalContext();
  const summary = {
    ok: true,
    total: liveDeals.length,
    matched: 0,
    unmatched: 0,
    receivables_updated: 0,
    registry_updated: 0,
    statuses_updated: 0,
    products_reconciled: 0,
    details: [],
    unmatched_details: [],
  };

  for (const normalized of normalizedDeals) {
    summary.products_reconciled += await syncDealProducts(normalized, context.productIndex);
    const match = resolveReceivableMatch(normalized, context);

    if (!match) {
      const processHints = await findPossibleProcessesForDeal(normalized);
      summary.unmatched += 1;
      summary.unmatched_details.push({
        freshsales_deal_id: normalized.id,
        name: normalized.name,
        amount: normalized.amount,
        external_reference: normalized.externalReference,
        invoice_reference: normalized.invoiceReference,
        inferred_status: normalized.inboundStatus,
        contacts: normalized.contacts.map((item) => ({
          id: String(item.id),
          name: firstNonEmpty(item.display_name, [item.first_name, item.last_name].filter(Boolean).join(' '), item.name),
          email: cleanValue(item.email),
        })),
        possible_processes: processHints,
      });
      continue;
    }

    const syncResult = await syncMatchedDeal(match.row, normalized, { applyStatus });
    summary.matched += 1;
    summary.receivables_updated += syncResult.receivableUpdated ? 1 : 0;
    summary.registry_updated += 1;
    summary.statuses_updated += syncResult.statusUpdated ? 1 : 0;
    summary.details.push({
      freshsales_deal_id: normalized.id,
      billing_receivable_id: match.row.id,
      matched_by: match.reason,
      local_status_before: match.row.status || null,
      local_status_after: syncResult.nextStatus,
      apply_status: applyStatus,
    });
  }

  ensureParentDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify({ ...summary, output: outputPath }, null, 2));
}

function sanitizePositiveInt(value, fallback) {
  const text = String(value || '').trim();
  if (!/^\d+$/.test(text)) return fallback;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function sanitizeNumericId(value) {
  const text = String(value || '').trim();
  return /^\d+$/.test(text) ? text : null;
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

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

function normalizeInvoiceToken(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.replace(/\s+/g, '').replace(/^#+/, '').toLowerCase();
}

function firstRelation(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function extractUuid(value) {
  const match = String(value || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
}

function buildExternalReference(receivableId) {
  return `hmadv-receivable-${receivableId}`;
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

function readCustomField(deal, fieldName) {
  if (!fieldName) return null;
  const custom = deal?.custom_field && typeof deal.custom_field === 'object' ? deal.custom_field : {};
  const value = custom[fieldName];
  if (value == null || value === '') return null;
  return value;
}

function inferInvoiceFromName(name) {
  const text = String(name || '');
  const hashMatch = text.match(/#([A-Za-z0-9!._-]+)/);
  if (hashMatch?.[1]) return hashMatch[1];
  const parcelaMatch = text.match(/fatura\s+([A-Za-z0-9!._-]+)/i);
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

function deriveInboundStatus(deal, billingConfig) {
  const fieldStatus = cleanValue(readCustomField(deal, billingConfig.fieldMap.receivable_status));
  if (fieldStatus) return normalizeText(fieldStatus);

  const stageKey = String(deal.deal_stage_id || '').trim();
  const inverted = invertStageMap(billingConfig.stageIdMap);
  if (stageKey && inverted[stageKey]) return normalizeText(inverted[stageKey]);

  if (Number(deal.probability || 0) >= 100) return 'pago';
  return null;
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
    deal_stage_id: deal.deal_stage_id ? String(deal.deal_stage_id) : null,
    probability: Number(deal.probability || 0),
    expected_close: deal.expected_close || null,
    products: Array.isArray(deal.products) ? deal.products : [],
    contacts: Array.isArray(deal.contacts) ? deal.contacts : [],
    sales_accounts: Array.isArray(deal.sales_accounts) ? deal.sales_accounts : [],
    custom_field: deal.custom_field || {},
    raw: deal,
    externalReference: inferredExternal,
    externalReceivableId: extractUuid(inferredExternal),
    invoiceReference: normalizeInvoiceToken(invoiceReference),
    processReferences: uniqueValues([
      readCustomField(deal, billingConfig.fieldMap.process_reference),
      deal.name,
      inferredExternal,
    ].flatMap((item) => extractProcessReferences(item))),
    inboundStatus: deriveInboundStatus(deal, billingConfig),
  };
}

async function loadFreshsalesDeals(limit, specificDealId = null) {
  if (specificDealId) {
    const payload = await freshsalesRequest(`/deals/${encodeURIComponent(String(specificDealId))}?include=contacts,sales_account`);
    const deal = payload?.deal || payload || null;
    if (deal && payload?.contacts) deal.contacts = payload.contacts;
    if (deal && payload?.sales_accounts) deal.sales_accounts = payload.sales_accounts;
    return deal ? [deal] : [];
  }

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

async function loadLocalContext() {
  const [receivables, registry, products, contacts, importRows] = await Promise.all([
    supabaseRequestAll(
      'billing_receivables?select=id,contract_id,contact_id,source_import_row_id,invoice_number,status,balance_due,balance_due_corrected,amount_original,freshsales_deal_id,freshsales_account_id,contracts:billing_contracts(id,workspace_id,title,external_reference,contact_id,freshsales_contact_id,freshsales_account_id,process_reference)&order=created_at.asc'
    ),
    supabaseRequestAll(
      'freshsales_deals_registry?select=id,billing_receivable_id,freshsales_deal_id,last_sync_status,payload_last_sent'
    ),
    supabaseRequestAll(
      'freshsales_products?select=id,name,billing_type,freshsales_product_id,status,last_synced_at'
    ).catch(() => []),
    supabaseRequestAll(
      'freshsales_contacts?select=id,freshsales_contact_id,name,email,email_normalized'
    ).catch(() => []),
    supabaseRequestAll(
      'billing_import_rows?select=id,raw_payload'
    ).catch(() => []),
  ]);

  const contactById = new Map((contacts || []).map((item) => [String(item.id), item]));
  const importRowById = new Map((importRows || []).map((item) => [String(item.id), item]));
  const byReceivableId = new Map();
  const byDealId = new Map();
  const byExternalRef = new Map();
  const byInvoice = new Map();
  const byContactId = new Map();
  const byContactAmount = new Map();
  const byContactEmail = new Map();
  const byContactEmailAmount = new Map();
  const byContactName = new Map();
  const byContactNameAmount = new Map();
  const byProcessReference = new Map();
  const byProcessReferenceAmount = new Map();

  for (const row of receivables) {
    const contract = firstRelation(row.contracts);
    const localContact = contactById.get(String(contract?.contact_id || row.contact_id || '')) || null;
    byReceivableId.set(String(row.id), row);

    const liveDealId = cleanValue(row.freshsales_deal_id);
    if (liveDealId) byDealId.set(liveDealId, row);

    const importRow = importRowById.get(String(row.source_import_row_id || '')) || null;
    const importedDealId = cleanValue(importRow?.raw_payload?.freshsales_deal_id);
    if (importedDealId) byDealId.set(importedDealId, row);

    const externalRefs = new Set([
      buildExternalReference(row.id),
      cleanValue(contract?.external_reference),
    ].filter(Boolean));
    for (const externalRef of externalRefs) {
      byExternalRef.set(externalRef, row);
    }

    const invoiceKey = normalizeInvoiceToken(row.invoice_number);
    if (invoiceKey) {
      const items = byInvoice.get(invoiceKey) || [];
      items.push(row);
      byInvoice.set(invoiceKey, items);
    }

    const amountKey = buildAmountKey(row.balance_due_corrected ?? row.balance_due ?? row.amount_original);
    const processReferenceKeys = uniqueValues([
      contract?.process_reference,
      contract?.title,
      contract?.external_reference,
    ].flatMap((item) => extractProcessReferences(item)));
    for (const processReference of processReferenceKeys) {
      const items = byProcessReference.get(processReference) || [];
      items.push(row);
      byProcessReference.set(processReference, items);
      if (amountKey) {
        const processAmountKey = `${processReference}::${amountKey}`;
        const amountItems = byProcessReferenceAmount.get(processAmountKey) || [];
        amountItems.push(row);
        byProcessReferenceAmount.set(processAmountKey, amountItems);
      }
    }

    const contactId = cleanValue(contract?.freshsales_contact_id);
    if (contactId) {
      const byContactItems = byContactId.get(contactId) || [];
      byContactItems.push(row);
      byContactId.set(contactId, byContactItems);

      if (amountKey) {
        const contactAmountKey = `${contactId}::${amountKey}`;
        const byContactAmountItems = byContactAmount.get(contactAmountKey) || [];
        byContactAmountItems.push(row);
        byContactAmount.set(contactAmountKey, byContactAmountItems);
      }
    }

    const emailKey = normalizeText(localContact?.email_normalized || localContact?.email);
    if (emailKey) {
      const items = byContactEmail.get(emailKey) || [];
      items.push(row);
      byContactEmail.set(emailKey, items);
      if (amountKey) {
        const emailAmountKey = `${emailKey}::${amountKey}`;
        const amountItems = byContactEmailAmount.get(emailAmountKey) || [];
        amountItems.push(row);
        byContactEmailAmount.set(emailAmountKey, amountItems);
      }
    }

    const nameKey = normalizeText(localContact?.name);
    if (nameKey) {
      const items = byContactName.get(nameKey) || [];
      items.push(row);
      byContactName.set(nameKey, items);
      if (amountKey) {
        const nameAmountKey = `${nameKey}::${amountKey}`;
        const amountItems = byContactNameAmount.get(nameAmountKey) || [];
        amountItems.push(row);
        byContactNameAmount.set(nameAmountKey, amountItems);
      }
    }
  }

  for (const item of registry) {
    const receivableId = String(item?.billing_receivable_id || '').trim();
    const dealId = cleanValue(item?.freshsales_deal_id);
    const row = byReceivableId.get(receivableId);
    if (dealId && row) byDealId.set(dealId, row);

    const externalRef = cleanValue(item?.payload_last_sent?.external_reference);
    if (externalRef && row) byExternalRef.set(externalRef, row);
  }

  return {
    byReceivableId,
    byDealId,
    byExternalRef,
    byInvoice,
    byContactId,
    byContactAmount,
    byContactEmail,
    byContactEmailAmount,
    byContactName,
    byContactNameAmount,
    byProcessReference,
    byProcessReferenceAmount,
    productIndex: buildProductIndex(products),
  };
}

function resolveReceivableMatch(deal, context) {
  if (context.byDealId.has(deal.id)) {
    return { row: context.byDealId.get(deal.id), reason: 'freshsales_deal_id' };
  }

  if (deal.externalReceivableId && context.byReceivableId.has(deal.externalReceivableId)) {
    return { row: context.byReceivableId.get(deal.externalReceivableId), reason: 'external_reference_uuid' };
  }

  if (deal.externalReference && context.byExternalRef.has(deal.externalReference)) {
    return { row: context.byExternalRef.get(deal.externalReference), reason: 'external_reference_exact' };
  }

  if (deal.invoiceReference) {
    const invoiceMatches = context.byInvoice.get(deal.invoiceReference) || [];
    if (invoiceMatches.length === 1) {
      return { row: invoiceMatches[0], reason: 'invoice_number_unique' };
    }
  }

  const contactIds = deal.contacts.map((item) => cleanValue(item?.id)).filter(Boolean);
  const contactEmails = uniqueValues(deal.contacts.map((item) => normalizeText(item?.email)));
  const contactNames = uniqueValues(
    deal.contacts.map((item) => normalizeText(firstNonEmpty(item?.display_name, [item?.first_name, item?.last_name].filter(Boolean).join(' '), item?.name)))
  );
  const amountKey = buildAmountKey(deal.amount);
  const processReferences = uniqueValues(deal.processReferences || []);

  for (const processReference of processReferences) {
    if (amountKey) {
      const processAmountMatches = context.byProcessReferenceAmount.get(`${processReference}::${amountKey}`) || [];
      if (processAmountMatches.length === 1) {
        return { row: processAmountMatches[0], reason: 'process_reference_amount_unique' };
      }
    }

    const processMatches = context.byProcessReference.get(processReference) || [];
    const openMatches = processMatches.filter((item) => !cleanValue(item.freshsales_deal_id));
    if (openMatches.length === 1) {
      return { row: openMatches[0], reason: 'process_reference_unique_open_receivable' };
    }
  }

  for (const contactId of contactIds) {
    if (amountKey) {
      const contactAmountMatches = context.byContactAmount.get(`${contactId}::${amountKey}`) || [];
      if (contactAmountMatches.length === 1) {
        return { row: contactAmountMatches[0], reason: 'freshsales_contact_id_amount_unique' };
      }
    }

    const contactMatches = context.byContactId.get(contactId) || [];
    const openMatches = contactMatches.filter((item) => !cleanValue(item.freshsales_deal_id));
    if (openMatches.length === 1) {
      return { row: openMatches[0], reason: 'freshsales_contact_id_unique_open_receivable' };
    }
  }

  for (const contactEmail of contactEmails) {
    if (amountKey) {
      const emailAmountMatches = context.byContactEmailAmount.get(`${contactEmail}::${amountKey}`) || [];
      if (emailAmountMatches.length === 1) {
        return { row: emailAmountMatches[0], reason: 'contact_email_amount_unique' };
      }
    }

    const emailMatches = context.byContactEmail.get(contactEmail) || [];
    const openMatches = emailMatches.filter((item) => !cleanValue(item.freshsales_deal_id));
    if (openMatches.length === 1) {
      return { row: openMatches[0], reason: 'contact_email_unique_open_receivable' };
    }
  }

  for (const contactName of contactNames) {
    if (amountKey) {
      const nameAmountMatches = context.byContactNameAmount.get(`${contactName}::${amountKey}`) || [];
      if (nameAmountMatches.length === 1) {
        return { row: nameAmountMatches[0], reason: 'contact_name_amount_unique' };
      }
    }

    const nameMatches = context.byContactName.get(contactName) || [];
    const openMatches = nameMatches.filter((item) => !cleanValue(item.freshsales_deal_id));
    if (openMatches.length === 1) {
      return { row: openMatches[0], reason: 'contact_name_unique_open_receivable' };
    }
  }

  return null;
}

function buildAmountKey(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed.toFixed(2);
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

function buildProductIndex(products = []) {
  const byId = new Map();
  const byFreshsalesId = new Map();
  const byName = new Map();

  for (const item of products || []) {
    const id = cleanValue(item?.id);
    const freshsalesProductId = cleanValue(item?.freshsales_product_id);
    const normalizedName = normalizeText(item?.name);
    if (id) byId.set(id, item);
    if (freshsalesProductId) byFreshsalesId.set(freshsalesProductId, item);
    if (normalizedName && !byName.has(normalizedName)) byName.set(normalizedName, item);
  }

  return { byId, byFreshsalesId, byName };
}

function inferProductCategory(name) {
  const normalized = normalizeText(name);
  if (normalized.includes('honor')) return 'honorarios';
  if (normalized.includes('parcela')) return 'parcelamento';
  if (normalized.includes('despesa')) return 'despesa';
  if (normalized.includes('encargo') || normalized.includes('juros') || normalized.includes('multa')) return 'encargos';
  if (normalized.includes('assinatura') || normalized.includes('mensal')) return 'assinatura';
  return 'fatura';
}

function inferProductBillingType(name, fallback = null) {
  const normalized = `${normalizeText(name)} ${normalizeText(fallback)}`;
  if (normalized.includes('recorr') || normalized.includes('mensal') || normalized.includes('assinatura')) return 'recorrente';
  if (normalized.includes('parcela') || normalized.includes('parcel')) return 'parcelado';
  if (normalized.includes('despesa') || normalized.includes('reembolso')) return 'reembolso';
  if (normalized.includes('encargo') || normalized.includes('juros') || normalized.includes('multa')) return 'encargo';
  return 'unitario';
}

function mapDealProductToRow(product) {
  const freshsalesProductId = cleanValue(product?.product_id || product?.id);
  const name = firstNonEmpty(product?.name, product?.display_name, product?.product_name, product?.title);
  if (!freshsalesProductId && !name) return null;

  const category = inferProductCategory(name);
  return {
    freshsales_product_id: freshsalesProductId,
    name: name || `Produto ${freshsalesProductId}`,
    category,
    billing_type: inferProductBillingType(name, category),
    currency: cleanValue(product?.currency) || 'BRL',
    status: 'active',
    metadata: {
      source: 'freshsales_deal_import',
      live_product: product,
    },
    last_synced_at: new Date().toISOString(),
  };
}

async function patchProductById(productId, patch) {
  await supabaseRequest(`freshsales_products?id=eq.${encodeURIComponent(String(productId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
}

async function syncDealProducts(deal, productIndex) {
  if (!Array.isArray(deal.products) || !deal.products.length || !productIndex) return 0;

  let changes = 0;
  for (const rawProduct of deal.products) {
    const nextRow = mapDealProductToRow(rawProduct);
    if (!nextRow) continue;

    const normalizedName = normalizeText(nextRow.name);
    const freshsalesProductId = cleanValue(nextRow.freshsales_product_id);
    const currentByFreshsalesId = freshsalesProductId ? productIndex.byFreshsalesId.get(freshsalesProductId) || null : null;
    const currentByName = normalizedName ? productIndex.byName.get(normalizedName) || null : null;

    if (currentByFreshsalesId) {
      productIndex.byName.set(normalizedName, currentByFreshsalesId);
      continue;
    }

    if (currentByName?.id) {
      await patchProductById(currentByName.id, {
        freshsales_product_id: freshsalesProductId,
        status: currentByName.status || nextRow.status,
        last_synced_at: nextRow.last_synced_at,
        metadata: nextRow.metadata,
      });
      const merged = { ...currentByName, ...nextRow };
      if (freshsalesProductId) productIndex.byFreshsalesId.set(freshsalesProductId, merged);
      productIndex.byName.set(normalizedName, merged);
      if (currentByName.id) productIndex.byId.set(String(currentByName.id), merged);
      changes += 1;
      continue;
    }

    if (freshsalesProductId) {
      await upsertByConflictFallback('freshsales_products', 'freshsales_product_id', freshsalesProductId, nextRow);
    } else {
      await supabaseRequest('freshsales_products', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(nextRow),
      }).catch(() => null);
    }
    const inserted = { ...nextRow };
    if (freshsalesProductId) productIndex.byFreshsalesId.set(freshsalesProductId, inserted);
    if (normalizedName) productIndex.byName.set(normalizedName, inserted);
    changes += 1;
  }

  return changes;
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

async function findPossibleProcessesForDeal(deal) {
  const names = uniqueValues(
    deal.contacts.map((item) => firstNonEmpty(item.display_name, [item.first_name, item.last_name].filter(Boolean).join(' '), item.name))
  ).slice(0, 2);
  if (!names.length) return [];

  const candidates = [];
  for (const name of names) {
    const like = encodeURIComponent(`*${String(name).replace(/\*/g, '').trim()}*`);
    const partes = await supabaseRequest(
      `partes?select=processo_id,nome,polo,tipo_pessoa&nome=ilike.${like}&limit=10`,
      {
        headers: {
          'Accept-Profile': 'judiciario',
          'Content-Profile': 'judiciario',
        },
      }
    ).catch(() => []);

    const processIds = uniqueValues((partes || []).map((item) => item?.processo_id).filter(Boolean)).slice(0, 5);
    if (!processIds.length) continue;

    const processes = await supabaseRequest(
      `processos?select=id,numero_cnj,numero_processo,titulo,account_id_freshsales,status_atual_processo&id=in.(${processIds.map((item) => `"${item}"`).join(',')})&limit=5`,
      {
        headers: {
          'Accept-Profile': 'judiciario',
          'Content-Profile': 'judiciario',
        },
      }
    ).catch(() => []);

    for (const process of processes || []) {
      candidates.push({
        id: process.id,
        numero_cnj: process.numero_cnj || null,
        numero_processo: process.numero_processo || null,
        titulo: process.titulo || null,
        account_id_freshsales: process.account_id_freshsales || null,
        status: process.status_atual_processo || null,
        matched_contact_name: name,
      });
    }
  }

  return dedupeObjects(candidates, (item) => item.id).slice(0, 5);
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)));
}

function dedupeObjects(items, getKey) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = String(getKey(item) || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function syncMatchedDeal(row, deal, { applyStatus = false } = {}) {
  const contract = firstRelation(row.contracts);
  const nextStatus = applyStatus && deal.inboundStatus ? deal.inboundStatus : (row.status || null);
  const receivablePatch = {};

  if (String(row.freshsales_deal_id || '').trim() !== String(deal.id)) {
    receivablePatch.freshsales_deal_id = String(deal.id);
  }
  if (applyStatus && deal.inboundStatus && normalizeText(row.status) !== normalizeText(deal.inboundStatus)) {
    receivablePatch.status = deal.inboundStatus;
  }

  if (Object.keys(receivablePatch).length) {
    await supabaseRequest(`billing_receivables?id=eq.${encodeURIComponent(String(row.id))}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(receivablePatch),
    });
  }

  await upsertByConflictFallback('freshsales_deals_registry', 'billing_receivable_id', row.id, {
    workspace_id: contract?.workspace_id || null,
    billing_receivable_id: row.id,
    freshsales_deal_id: String(deal.id),
    freshsales_contact_id: contract?.freshsales_contact_id || null,
    freshsales_account_id: row.freshsales_account_id || contract?.freshsales_account_id || null,
    freshsales_product_id: deal.products?.[0]?.product_id ? String(deal.products[0].product_id) : null,
    deal_name: deal.name || null,
    deal_stage: deal.deal_stage_id || null,
    deal_status: deal.inboundStatus || null,
    amount_last_sent: deal.amount || null,
    payload_last_sent: {
      source: 'freshsales_live_import',
      external_reference: deal.externalReference,
      invoice_reference: deal.invoiceReference,
      live_deal: deal.raw,
    },
    last_sync_status: 'ok',
    last_sync_error: null,
    last_synced_at: new Date().toISOString(),
  });

  return {
    receivableUpdated: Object.keys(receivablePatch).length > 0,
    statusUpdated: Object.prototype.hasOwnProperty.call(receivablePatch, 'status'),
    nextStatus,
  };
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
    } else {
      const host = base.replace(/^https?:\/\//i, '');
      const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
      push(`${base}/crm/sales/api`);
      push(`${base}/api`);
      push(`https://${myfreshworksHost}/crm/sales/api`);
      push(`https://${myfreshworksHost}/api`);
    }
  }

  return bases;
}

async function getStoredOauthRow() {
  const rows = await supabaseRequest('freshsales_oauth_tokens?provider=eq.freshsales&select=access_token,refresh_token,expires_at,token_type,scope,updated_at&limit=1');
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

async function upsertByConflictFallback(table, conflictColumn, conflictValue, payload) {
  try {
    await supabaseRequest(`${table}?on_conflict=${encodeURIComponent(conflictColumn)}`, {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(payload),
    });
    return;
  } catch (error) {
    const message = String(error.message || error);
    if (!message.includes('42P10')) throw error;
  }

  const existing = await supabaseRequest(`${table}?${conflictColumn}=eq.${encodeURIComponent(String(conflictValue))}&select=id&limit=1`);
  if (existing[0]) {
    await supabaseRequest(`${table}?${conflictColumn}=eq.${encodeURIComponent(String(conflictValue))}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
    return;
  }

  try {
    await supabaseRequest(table, {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = String(error.message || error);
    if (!message.includes('23505')) throw error;
    await supabaseRequest(`${table}?${conflictColumn}=eq.${encodeURIComponent(String(conflictValue))}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
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
