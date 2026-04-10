#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

loadLocalEnv();

async function main() {
  const limit = Number(process.argv[2] || '50');
  const queueItems = await loadQueue(limit);

  if (!queueItems.length) {
    console.log('Nenhum evento pendente na crm_event_queue.');
    return;
  }

  let processed = 0;
  let failed = 0;

  for (const item of queueItems) {
    try {
      await processQueueItem(item);
      processed += 1;
    } catch (error) {
      failed += 1;
      await supabaseRequest(`crm_event_queue?id=eq.${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'error',
          attempts: Number(item.attempts || 0) + 1,
          error: String(error.message || error).slice(0, 1000),
          processed_at: new Date().toISOString(),
        }),
      });
    }
  }

  console.log(JSON.stringify({ total: queueItems.length, processed, failed }, null, 2));
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

async function loadQueue(limit) {
  const query = [
    'crm_event_queue?select=id,workspace_id,entity_type,entity_id,event_type,payload,status,attempts,scheduled_at',
    'status=eq.pending',
    'order=scheduled_at.asc',
    `limit=${limit}`,
  ].join('&');
  return supabaseRequest(query);
}

async function processQueueItem(item) {
  const eventType = mapQueueEventToJourney(item.event_type, item.payload || {});
  if (!eventType) {
    await markSkipped(item, 'Evento sem mapeamento de jornada.');
    return;
  }

  const receivable = await loadReceivable(item.payload?.billing_receivable_id || item.entity_id);
  if (!receivable) {
    throw new Error('Receivable nao encontrado para o evento.');
  }

  const contract = firstRelation(receivable.contracts);
  const contact = firstRelation(receivable.contacts);
  const freshsalesContactId = contract?.freshsales_contact_id || contact?.freshsales_contact_id || null;

  if (!freshsalesContactId) {
    throw new Error('Contato Freshsales nao resolvido para o evento.');
  }

  const contactUpdate = buildJourneyContactUpdate(eventType);
  if (!Object.keys(contactUpdate).length) {
    await markSkipped(item, 'Evento nao exige alteracao de jornada.');
    return;
  }

  await freshsalesRequest(`/contacts/${encodeURIComponent(String(freshsalesContactId))}`, {
    method: 'PUT',
    body: JSON.stringify({
      contact: {
        custom_field: contactUpdate,
      },
    }),
  });

  await supabaseRequest(`freshsales_contacts?freshsales_contact_id=eq.${encodeURIComponent(String(freshsalesContactId))}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(mapLocalFreshsalesContactUpdate(contactUpdate)),
  });

  await supabaseRequest(`crm_event_queue?id=eq.${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'processed',
      attempts: Number(item.attempts || 0) + 1,
      error: null,
      processed_at: new Date().toISOString(),
    }),
  });
}

function mapQueueEventToJourney(queueEventType, payload) {
  if (payload?.has_partial_payment) return 'proposal_pending';
  if (payload?.is_overdue) return 'contract_sent';
  const mapping = getFinancialEventMap();
  return mapping[queueEventType] || mapping[payload?.receivable_status] || null;
}

function getFinancialEventMap() {
  return parseJsonEnv(process.env.FRESHSALES_FINANCIAL_EVENT_STAGE_MAP, {
    deal_published: 'proposal_pending',
    deal_publish_failed: null,
    pago: 'client_active',
    parcial: 'proposal_pending',
    em_aberto: 'proposal_pending',
    vencido: 'contract_sent',
  });
}

function buildJourneyContactUpdate(eventType) {
  const fieldMap = {
    lifecycleField: process.env.FRESHSALES_CONTACT_LIFECYCLE_FIELD || 'cf_fase_ciclo_vida',
    negotiationField: process.env.FRESHSALES_CONTACT_NEGOTIATION_FIELD || 'cf_negociacao_status',
    closingField: process.env.FRESHSALES_CONTACT_CLOSING_FIELD || 'cf_fechamento_status',
    clientField: process.env.FRESHSALES_CONTACT_CLIENT_FIELD || 'cf_cliente_status',
  };

  const update = {};
  switch (eventType) {
    case 'proposal_pending':
      update[fieldMap.negotiationField] = 'Pendente de aceite';
      break;
    case 'proposal_sent':
      update[fieldMap.negotiationField] = 'Envio de Proposta';
      break;
    case 'proposal_accepted':
      update[fieldMap.negotiationField] = 'Proposta Aceita';
      break;
    case 'contract_sent':
      update[fieldMap.closingField] = 'Envio de contrato';
      break;
    case 'signature_pending':
      update[fieldMap.closingField] = 'Pendente de assinatura';
      break;
    case 'client_active':
      update[fieldMap.clientField] = 'Ativo';
      update[fieldMap.lifecycleField] = 'Conectado';
      break;
    case 'client_inactive':
      update[fieldMap.clientField] = 'Inativo';
      break;
    default:
      break;
  }
  return update;
}

function mapLocalFreshsalesContactUpdate(contactUpdate) {
  return {
    lifecycle_stage: contactUpdate[process.env.FRESHSALES_CONTACT_LIFECYCLE_FIELD || 'cf_fase_ciclo_vida'] || undefined,
    negotiation_stage: contactUpdate[process.env.FRESHSALES_CONTACT_NEGOTIATION_FIELD || 'cf_negociacao_status'] || undefined,
    closing_stage: contactUpdate[process.env.FRESHSALES_CONTACT_CLOSING_FIELD || 'cf_fechamento_status'] || undefined,
    client_stage: contactUpdate[process.env.FRESHSALES_CONTACT_CLIENT_FIELD || 'cf_cliente_status'] || undefined,
    last_synced_at: new Date().toISOString(),
  };
}

async function loadReceivable(receivableId) {
  if (!receivableId) return null;
  const rows = await supabaseRequest(
    `billing_receivables?id=eq.${encodeURIComponent(String(receivableId))}&select=id,status,contract_id,contact_id,contracts:billing_contracts(id,freshsales_contact_id,contact_id),contacts:freshsales_contacts(id,freshsales_contact_id)`
  );
  return rows[0] || null;
}

async function markSkipped(item, reason) {
  await supabaseRequest(`crm_event_queue?id=eq.${encodeURIComponent(item.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      status: 'skipped',
      attempts: Number(item.attempts || 0) + 1,
      error: reason,
      processed_at: new Date().toISOString(),
    }),
  });
}

function resolveFreshsalesBases() {
  const raw = process.env.FRESHSALES_API_BASE || process.env.FRESHSALES_BASE_URL || process.env.FRESHSALES_DOMAIN;
  if (!raw) throw new Error('FRESHSALES_API_BASE/FRESHSALES_BASE_URL/FRESHSALES_DOMAIN nao configurado');
  const base = raw.startsWith('http') ? raw.replace(/\/+$/, '') : `https://${raw.replace(/\/+$/, '')}`;
  if (base.includes('/crm/sales/api') || base.includes('/api')) {
    const host = base.replace(/^https?:\/\//i, '').replace(/\/(crm\/sales\/api|api)\/?$/i, '');
    const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
    return Array.from(new Set([
      base,
      `https://${host}/api`,
      `https://${host}/crm/sales/api`,
      `https://${myfreshworksHost}/api`,
      `https://${myfreshworksHost}/crm/sales/api`,
    ]));
  }
  const host = base.replace(/^https?:\/\//i, '');
  const myfreshworksHost = host.includes('myfreshworks.com') ? host : host.replace(/\.freshsales\.io$/i, '.myfreshworks.com');
  return Array.from(new Set([
    `${base}/api`,
    `${base}/crm/sales/api`,
    `https://${myfreshworksHost}/api`,
    `https://${myfreshworksHost}/crm/sales/api`,
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
    for (const headers of freshsalesHeaderCandidates()) {
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

function parseJsonEnv(value, fallback = {}) {
  const text = cleanValue(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function cleanValue(value) {
  const text = String(value || '').trim();
  return text || null;
}

function firstRelation(value) {
  return Array.isArray(value) ? value[0] || null : value || null;
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
