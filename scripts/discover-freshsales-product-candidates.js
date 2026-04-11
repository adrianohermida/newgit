#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const outputPath = process.argv[2] || path.join(process.cwd(), 'out', `freshsales-product-candidates-${Date.now()}.json`);
  const token = cleanValue(process.env.FRESHSALES_ACCESS_TOKEN);
  const org = cleanValue(process.env.FRESHSALES_ORG_DOMAIN);
  if (!token || !org) throw new Error('FRESHSALES_ACCESS_TOKEN e FRESHSALES_ORG_DOMAIN sao obrigatorios');

  const filterIds = ['31003526187', '31003526190', '31003526191', '31003526192', '31003526193', '31008485850', '31008485851', '31008485852'];
  const products = new Map();

  for (const filterId of filterIds) {
    for (let page = 1; page <= 5; page += 1) {
      const response = await fetch(`https://${org}/crm/sales/api/deals/view/${filterId}?page=${page}&per_page=100`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Authtoken=${token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      const deals = Array.isArray(payload.deals) ? payload.deals : [];
      if (!deals.length) break;

      for (const deal of deals) {
        for (const product of deal.products || []) {
          const id = cleanValue(product.product_id || product.id);
          if (!id) continue;
          if (!products.has(id)) {
            products.set(id, {
              id,
              name: cleanValue(product.name),
              category: cleanValue(product.category),
              pricing_type: product.pricing_type ?? null,
              seen_in_deals: 0,
              sample_deals: [],
            });
          }
          const item = products.get(id);
          item.seen_in_deals += 1;
          if (item.sample_deals.length < 6) {
            item.sample_deals.push({
              deal_id: deal.id,
              deal_name: deal.name,
              amount: deal.amount,
              cf_categoria: deal.custom_field?.cf_categoria || null,
              cf_tipo_fatura: deal.custom_field?.cf_tipo_fatura || null,
              cf_referencia_fatura: deal.custom_field?.cf_referencia_fatura || null,
            });
          }
        }
      }

      if (deals.length < 100) break;
    }
  }

  const items = Array.from(products.values())
    .sort((a, b) => b.seen_in_deals - a.seen_in_deals || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));

  const suggestions = buildSuggestions(items);
  const report = { ok: true, total_products: items.length, items, suggestions };

  ensureParentDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify({ ...report, output: outputPath }, null, 2));
}

function buildSuggestions(items) {
  const byId = new Map(items.map((item) => [String(item.id), item]));
  const suggestions = [];

  const pushSuggestion = (canonicalName, productId, reason) => {
    const product = byId.get(String(productId));
    if (!product) return;
    suggestions.push({
      canonical_name: canonicalName,
      suggested_product_id: String(product.id),
      product_name: product.name || null,
      category: product.category || null,
      pricing_type: product.pricing_type,
      confidence: reason.confidence,
      rationale: reason.rationale,
    });
  };

  pushSuggestion('Honorarios Unitarios', '31002148103', {
    confidence: 'high',
    rationale: 'Nome do produto no CRM indica honorarios unitarios.',
  });
  pushSuggestion('Parcela Contratual', '31002919756', {
    confidence: 'medium',
    rationale: 'Produto aparece em varios deals de parcelas/faturas sequenciais.',
  });
  pushSuggestion('Honorarios Recorrentes', '31002920027', {
    confidence: 'medium',
    rationale: 'Produto recorrente/assinatura mais frequente nos deals historicos.',
  });

  return suggestions;
}

function ensureParentDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
