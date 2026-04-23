// @@@@@@@@@@@@@@
// fs-contacts-sync v3 — Sincronização Freshsales Contacts <-> Supabase
// Supabase é a única fonte da verdade.
// Token OAuth de contacts: FRESHSALES_CONTACTS_ACCESS_TOKEN (secret Supabase)
// Renovação automática via função oauth?action=refresh&kind=contacts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_DOMAIN     = (Deno.env.get('FRESHSALES_DOMAIN') ?? 'hmadv-org.myfreshworks.com').trim()
  .replace(/\.freshsales\.io$/, '.myfreshworks.com');

// Token OAuth de contacts — lido diretamente do secret (sem consulta ao banco)
const FS_CONTACTS_TOKEN = Deno.env.get('FRESHSALES_CONTACTS_ACCESS_TOKEN') ?? '';
// Fallback: API key genérica
const FS_API_KEY = Deno.env.get('FRESHSALES_API_KEY') ?? '';

// Cliente Supabase — schema judiciario para contacts_freshsales
const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: 'judiciario' } });

function authHdr(): string {
  if (FS_CONTACTS_TOKEN) return `Authtoken ${FS_CONTACTS_TOKEN}`;
  if (FS_API_KEY) return `Token token=${FS_API_KEY}`;
  throw new Error('Nenhum token de autenticação disponível. Configure FRESHSALES_CONTACTS_ACCESS_TOKEN.');
}

async function fsGet(path: string): Promise<Record<string, unknown>> {
  const r = await fetch(`https://${FS_DOMAIN}/crm/sales/api/${path}`, {
    headers: { Authorization: authHdr(), 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(28000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`FS GET ${path} → ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data as Record<string, unknown>;
}

function normalizeName(name: string): string {
  return (name ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function mapContact(c: Record<string, unknown>) {
  const cpf  = c.cf_cpf  ? String(c.cf_cpf).replace(/\D/g, '')  : null;
  const cnpj = c.cf_cnpj ? String(c.cf_cnpj).replace(/\D/g, '') : null;
  const displayName = String(
    c.display_name ?? `${c.first_name ?? ''} ${c.last_name ?? ''}`
  ).trim();
  return {
    fs_id:              String(c.id),
    first_name:         String(c.first_name ?? '').trim() || null,
    last_name:          String(c.last_name  ?? '').trim() || null,
    display_name:       displayName || null,
    nome_normalizado:   normalizeName(displayName),
    email:              String(c.email ?? '').trim().toLowerCase() || null,
    mobile:             String(c.mobile_number ?? '').replace(/\D/g, '') || null,
    phone:              String(c.phone ?? '').replace(/\D/g, '') || null,
    job_title:          c.job_title  ? String(c.job_title)  : null,
    external_id:        c.external_id ? String(c.external_id) : null,
    owner_id:           c.owner_id   ? String(c.owner_id)   : null,
    fs_account_id:      c.sales_account_id ? String(c.sales_account_id) : null,
    tag_list:           Array.isArray(c.tag_list) ? c.tag_list : [],
    lifecycle_stage_id: c.lifecycle_stage_id ? String(c.lifecycle_stage_id) : null,
    contact_status_id:  c.contact_status_id  ? String(c.contact_status_id)  : null,
    cf_cpf:             cpf && cpf.length >= 11 ? cpf : null,
    cf_cnpj:            cnpj && cnpj.length >= 14 ? cnpj : null,
    cf_tipo:            c.cf_tipo ? String(c.cf_tipo) : null,
    cf_fase_ciclo_vida: c.cf_fase_ciclo_vida ? String(c.cf_fase_ciclo_vida) : null,
    cf_oab:             c.cf_oab  ? String(c.cf_oab)  : null,
    is_deleted:         Boolean(c.is_deleted),
    raw_payload:        c,
    fs_updated_at:      c.updated_at ?? null,
    fs_created_at:      c.created_at ?? null,
    synced_at:          new Date().toISOString(),
  };
}

// ─── ACTION: count ────────────────────────────────────────────────────────────
async function actionCount() {
  const data = await fsGet('contacts/view/1?per_page=1&page=1');
  const meta = data.meta as Record<string, unknown>;
  return {
    freshsales_total: meta?.total_count ?? 'desconhecido',
    token_type:       FS_CONTACTS_TOKEN ? 'OAuth contacts' : (FS_API_KEY ? 'API key' : 'none'),
    domain:           FS_DOMAIN,
  };
}

// ─── ACTION: inspect ──────────────────────────────────────────────────────────
async function actionInspect() {
  const data = await fsGet('contacts/view/1?per_page=1&page=1');
  const contacts = (data.contacts as Record<string, unknown>[]) ?? [];
  if (!contacts.length) return { error: 'nenhum contato' };
  const s = contacts[0];
  return {
    total_fields:  Object.keys(s).length,
    custom_fields: Object.keys(s).filter(k => k.startsWith('cf_')),
    sample_cf:     Object.fromEntries(Object.entries(s).filter(([k]) => k.startsWith('cf_'))),
    sample_name:   s.display_name ?? `${s.first_name} ${s.last_name}`,
    sample_tags:   s.tag_list,
    sample_lifecycle: s.lifecycle_stage_id,
  };
}

// ─── ACTION: status ───────────────────────────────────────────────────────────
async function actionStatus() {
  const [
    { count: total },
    { count: comCpf },
    { count: comEmail },
    { count: clientes },
    { data: ultima },
  ] = await Promise.all([
    db.from('contacts_freshsales').select('*', { count: 'exact', head: true }),
    db.from('contacts_freshsales').select('*', { count: 'exact', head: true }).not('cf_cpf', 'is', null),
    db.from('contacts_freshsales').select('*', { count: 'exact', head: true }).not('email', 'is', null),
    db.from('contacts_freshsales').select('*', { count: 'exact', head: true }).eq('cf_tipo', 'Cliente'),
    db.from('contacts_freshsales').select('synced_at').order('synced_at', { ascending: false }).limit(1),
  ]);
  return {
    supabase: {
      total_contacts: total ?? 0,
      com_cpf:        comCpf ?? 0,
      com_email:      comEmail ?? 0,
      clientes:       clientes ?? 0,
      ultima_sync:    ultima?.[0]?.synced_at ?? null,
    },
    auth: {
      token_type:   FS_CONTACTS_TOKEN ? 'OAuth contacts (secret)' : (FS_API_KEY ? 'API key' : 'none'),
      token_prefix: FS_CONTACTS_TOKEN ? FS_CONTACTS_TOKEN.slice(0, 30) + '...' : null,
    },
  };
}

// ─── ACTION: ingest_incremental / ingest_full ─────────────────────────────────
async function actionIngest(since: string) {
  let page = 1;
  let total_upserted = 0;
  let total_pages = 1;
  const errors: string[] = [];
  const PER_PAGE = 100;
  const BATCH_SIZE = 50; // upsert em lotes menores

  while (page <= total_pages) {
    let data: Record<string, unknown>;
    try {
      data = await fsGet(`contacts/view/1?per_page=${PER_PAGE}&page=${page}`);
    } catch (e) {
      errors.push(`page ${page}: ${String(e)}`);
      break;
    }

    const contacts = (data.contacts as Record<string, unknown>[]) ?? [];
    const meta     = data.meta as Record<string, unknown>;
    total_pages    = Math.ceil(Number(meta?.total_count ?? 0) / PER_PAGE) || 1;

    if (!contacts.length) break;

    // Parar quando os registros forem mais antigos que 'since' (modo incremental)
    if (since !== '2020-01-01') {
      const oldest = contacts[contacts.length - 1];
      const oldestDate = String(oldest.updated_at ?? '').split('T')[0];
      if (oldestDate < since) {
        const filtered = contacts.filter(c => String(c.updated_at ?? '').split('T')[0] >= since);
        if (filtered.length > 0) {
          const rows = filtered.map(mapContact);
          const { error } = await db.from('contacts_freshsales').upsert(rows, { onConflict: 'fs_id' });
          if (error) errors.push(`page ${page} parcial: ${error.message}`);
          else total_upserted += rows.length;
        }
        break;
      }
    }

    // Upsert em lotes
    const rows = contacts.map(mapContact);
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error } = await db.from('contacts_freshsales').upsert(batch, { onConflict: 'fs_id' });
      if (error) errors.push(`page ${page} batch ${i}: ${error.message}`);
      else total_upserted += batch.length;
    }

    page++;
    if (contacts.length < PER_PAGE) break;
    await new Promise(r => setTimeout(r, 150)); // rate limiting
  }

  return {
    since,
    total_upserted,
    pages_processed: page - 1,
    total_pages,
    errors: errors.length ? errors : null,
  };
}

// ─── ACTION: find_duplicates ──────────────────────────────────────────────────
async function actionFindDuplicates() {
  const { data: all } = await db
    .from('contacts_freshsales')
    .select('fs_id, display_name, nome_normalizado, cf_cpf, email, cf_tipo, is_deleted')
    .eq('is_deleted', false);

  const byEmail = new Map<string, typeof all>();
  const byCpf   = new Map<string, typeof all>();
  const byNome  = new Map<string, typeof all>();

  for (const c of (all ?? [])) {
    if (c.email) {
      const k = c.email.toLowerCase();
      if (!byEmail.has(k)) byEmail.set(k, []);
      byEmail.get(k)!.push(c);
    }
    if (c.cf_cpf && String(c.cf_cpf).length >= 11) {
      const k = String(c.cf_cpf);
      if (!byCpf.has(k)) byCpf.set(k, []);
      byCpf.get(k)!.push(c);
    }
    if (c.nome_normalizado && c.nome_normalizado.length >= 5) {
      const k = c.nome_normalizado;
      if (!byNome.has(k)) byNome.set(k, []);
      byNome.get(k)!.push(c);
    }
  }

  return {
    duplicatas_por_email: {
      total: [...byEmail.values()].filter(v => v.length > 1).length,
      exemplos: [...byEmail.entries()].filter(([,v]) => v.length > 1).slice(0, 10)
        .map(([email, contacts]) => ({ email, count: contacts.length, ids: contacts.map(c => c.fs_id) })),
    },
    duplicatas_por_cpf: {
      total: [...byCpf.values()].filter(v => v.length > 1).length,
      exemplos: [...byCpf.entries()].filter(([,v]) => v.length > 1).slice(0, 10)
        .map(([cpf, contacts]) => ({ cpf, count: contacts.length, ids: contacts.map(c => c.fs_id) })),
    },
    duplicatas_por_nome: {
      total: [...byNome.values()].filter(v => v.length > 1).length,
      exemplos: [...byNome.entries()].filter(([,v]) => v.length > 1).slice(0, 10)
        .map(([nome, contacts]) => ({ nome, count: contacts.length, ids: contacts.map(c => c.fs_id) })),
    },
  };
}

// ─── HANDLER ──────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'status';

  try {
    let result: unknown;
    switch (action) {
      case 'count':              result = await actionCount(); break;
      case 'inspect':            result = await actionInspect(); break;
      case 'status':             result = await actionStatus(); break;
      case 'ingest_incremental': {
        const since = url.searchParams.get('since')
          ?? new Date(Date.now() - 86400000).toISOString().split('T')[0];
        result = await actionIngest(since);
        break;
      }
      case 'ingest_full':        result = await actionIngest('2020-01-01'); break;
      case 'find_duplicates':    result = await actionFindDuplicates(); break;
      default:
        result = {
          error: `ação desconhecida: "${action}"`,
          acoes: ['count','inspect','status','ingest_incremental','ingest_full','find_duplicates'],
        };
    }
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
