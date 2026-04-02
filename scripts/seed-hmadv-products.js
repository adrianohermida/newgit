#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

const DEFAULT_PRODUCTS = [
  {
    name: 'Honorarios Unitarios',
    category: 'honorarios',
    billing_type: 'unitario',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 10,
    interest_percent_month_default: 1,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
  {
    name: 'Honorarios Recorrentes',
    category: 'honorarios',
    billing_type: 'recorrente',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 10,
    interest_percent_month_default: 1,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
  {
    name: 'Parcela Contratual',
    category: 'parcelamento',
    billing_type: 'parcelado',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 10,
    interest_percent_month_default: 1,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
  {
    name: 'Fatura Avulsa',
    category: 'fatura',
    billing_type: 'unitario',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 10,
    interest_percent_month_default: 1,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
  {
    name: 'Despesa do Cliente',
    category: 'despesa',
    billing_type: 'reembolso',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 0,
    interest_percent_month_default: 0,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
  {
    name: 'Encargos de Atraso',
    category: 'encargos',
    billing_type: 'encargo',
    price_default: null,
    currency: 'BRL',
    late_fee_percent_default: 10,
    interest_percent_month_default: 1,
    monetary_index_default: 'IGP-M',
    status: 'active',
    metadata: { source: 'hmadv_seed', canonical_product: true },
  },
];

async function main() {
  const workspaceId = process.argv[2] || process.env.HMADV_WORKSPACE_ID || null;
  const payload = DEFAULT_PRODUCTS.map((item) => ({ ...item, workspace_id: workspaceId }));

  await supabaseRequest('freshsales_products?on_conflict=name', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(payload),
  });

  console.log(`Produtos HMADV sincronizados: ${payload.length}`);
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
