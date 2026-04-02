#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const workspaceId = process.argv[2] || process.env.HMADV_WORKSPACE_ID || null;
  const snapshots = await supabaseRequest(
    "freshsales_sync_snapshots?entity=eq.products&select=source_id,display_name,status,summary,attributes,custom_attributes,raw_payload,synced_at"
  );

  if (!snapshots.length) {
    console.log('Nenhum snapshot de products encontrado. Mantendo apenas o catalogo seed.');
    return;
  }

  const rows = snapshots.map((snapshot) => {
    const attributes = asObject(snapshot.attributes);
    const custom = asObject(snapshot.custom_attributes);
    const summary = asObject(snapshot.summary);
    const payload = asObject(snapshot.raw_payload);

    const name = snapshot.display_name || readValue(attributes.name) || readValue(payload.name) || null;
    const category = firstText([
      readValue(custom.category),
      readValue(custom.cf_categoria),
      readValue(attributes.category),
      readValue(summary.category),
      inferCategoryFromName(name),
    ]);
    const billingType = firstText([
      readValue(custom.billing_type),
      readValue(custom.cf_billing_type),
      readValue(custom.cf_modalidade),
      inferBillingType(name, category),
    ]);
    const priceDefault = parseMoney(readValue(attributes.price) || readValue(summary.price) || readValue(payload.price));
    const currency = firstText([
      readValue(attributes.currency),
      readValue(summary.currency),
      'BRL',
    ]);

    return {
      workspace_id: workspaceId,
      freshsales_product_id: String(snapshot.source_id),
      name: name || `Produto ${snapshot.source_id}`,
      category,
      billing_type: billingType,
      price_default: priceDefault,
      currency,
      status: normalizeStatus(snapshot.status),
      metadata: {
        source: 'freshsales_snapshot',
        summary,
        attributes,
        custom_attributes: custom,
      },
      last_synced_at: snapshot.synced_at,
    };
  });

  const chunkSize = 200;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const batch = rows.slice(index, index + chunkSize);
    await supabaseRequest('freshsales_products?on_conflict=freshsales_product_id', {
      method: 'POST',
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
  }

  console.log(`freshsales_products atualizado com ${rows.length} registro(s).`);
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

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function readValue(value) {
  if (value == null) return null;
  if (typeof value !== 'object') return String(value).trim() || null;
  if (value.display_value != null && String(value.display_value).trim()) return String(value.display_value).trim();
  if (value.value != null && String(value.value).trim()) return String(value.value).trim();
  return null;
}

function firstText(values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function inferCategoryFromName(name) {
  const normalized = normalizeText(name);
  if (normalized.includes('honor')) return 'honorarios';
  if (normalized.includes('parcela')) return 'parcelamento';
  if (normalized.includes('despesa')) return 'despesa';
  if (normalized.includes('encargo') || normalized.includes('juros') || normalized.includes('multa')) return 'encargos';
  if (normalized.includes('assinatura') || normalized.includes('mensal')) return 'assinatura';
  return 'fatura';
}

function inferBillingType(name, category) {
  const normalized = `${normalizeText(name)} ${normalizeText(category)}`;
  if (normalized.includes('recorr') || normalized.includes('mensal') || normalized.includes('assinatura')) return 'recorrente';
  if (normalized.includes('parcela') || normalized.includes('parcel')) return 'parcelado';
  if (normalized.includes('despesa') || normalized.includes('reembolso')) return 'reembolso';
  if (normalized.includes('encargo') || normalized.includes('juros') || normalized.includes('multa')) return 'encargo';
  return 'unitario';
}

function parseMoney(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = text
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStatus(value) {
  const normalized = normalizeText(value);
  if (normalized.includes('inativ') || normalized.includes('archiv')) return 'inactive';
  return 'active';
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
