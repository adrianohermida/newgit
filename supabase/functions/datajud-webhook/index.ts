import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * datajud-webhook  v7
 *
 * Novidades vs v6:
 *   - action=sync_account agora aceita o payload direto do Freshsales:
 *       { sales_account: { id, custom_field: { cf_processo } } }
 *     ou qualquer combinacao de campos com o CNJ/account_id.
 *   - Fluxo completo: recebe CNJ do FS -> upsert processo no Supabase ->
 *     busca DataJud -> persiste partes+movimentos -> atualiza Sales Account
 *     com todos os campos enriquecidos (titulo, polo_ativo/passivo, classe, etc.)
 *   - FS_DOMAIN corrigido com DOMAIN_MAP (Suite vs Classic)
 *   - activity_type_id usa constantes corretas do tenant
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_API_KEY    = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_DOMAIN_RAW = Deno.env.get('FRESHSALES_DOMAIN')!;
const WEBHOOK_SECRET = Deno.env.get('FRESHSALES_WEBHOOK_SECRET') ?? '';
const FS_OWNER_ID   = Number(Deno.env.get('FS_OWNER_ID') ?? '31000147944');

// Activity types reais do tenant (confirmados via diagnostico)
const FS_TYPE_ANDAMENTOS  = 31001147751; // "Andamentos"
const FS_TYPE_PUBLICACOES = 31001147699; // "Publicacoes"

const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: 'judiciario' } });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function log(n: 'info'|'warn'|'error', m: string, e: Record<string,unknown> = {}) {
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
}

async function callHmadvFunction(name: string, query: Record<string, unknown> = {}, body: Record<string, unknown> = {}) {
  const url = new URL(`${SUPABASE_URL}/functions/v1/${name}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SVC_KEY}`,
      apikey: SVC_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body || {}),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Falha na function ${name} (${response.status}).`);
  }
  return payload;
}

// --- Freshsales (Suite) ------------------------------------------------------
const DOMAIN_MAP: Record<string,string> = {
  'hmadv-7b725ea101eff55.freshsales.io': 'hmadv-org.myfreshworks.com',
};
function fsDomain(): string {
  const d = (FS_DOMAIN_RAW ?? '').trim();
  if (d.includes('myfreshworks.com')) return d;
  return DOMAIN_MAP[d] ?? d.replace(/\.freshsales\.io$/, '.myfreshworks.com');
}
function authHdr(): string {
  const k = (FS_API_KEY ?? '').trim()
    .replace(/^Token token=/i,'').replace(/^Bearer /i,'').trim();
  return `Token token=${k}`;
}
const shouldRetry = (s: number) => s === 429 || s >= 500;

async function fsGet(path: string): Promise<Record<string,unknown>> {
  for (let i=1; i<=3; i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`,
      { headers: { Authorization: authHdr(), 'Content-Type': 'application/json' } });
    if (r.ok) return r.json();
    if (!shouldRetry(r.status) || i===3) throw new Error(`FS GET ${path} ${r.status}`);
    await sleep(600*i);
  }
  throw new Error('fsGet esgotado');
}
async function fsPost(path: string, body: unknown): Promise<{status:number;data:Record<string,unknown>}> {
  for (let i=1; i<=3; i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
      method:'POST', headers:{Authorization:authHdr(),'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!shouldRetry(r.status)||i===3) return {status:r.status, data};
    await sleep(600*i);
  }
  throw new Error('fsPost esgotado');
}

function normalizeTag(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function salesAccountHasTag(salesAccount: Record<string, unknown>, expectedTag = 'datajud'): boolean {
  const tags = Array.isArray(salesAccount.tags)
    ? salesAccount.tags
    : typeof salesAccount.tags === 'string'
      ? String(salesAccount.tags).split(',').map((item) => item.trim()).filter(Boolean)
      : [];
  const normalizedExpected = normalizeTag(expectedTag);
  return tags.some((tag) => normalizeTag(tag) === normalizedExpected);
}

async function enqueueDatajudMonitoring(
  processoId: string,
  accountId: string | null,
  cnj20: string,
  source = 'freshsales_tag',
): Promise<{ queued: boolean; skipped?: string }> {
  const { data: existing } = await db.from('monitoramento_queue')
    .select('id,status')
    .eq('processo_id', processoId)
    .in('status', ['pendente', 'processando'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return { queued: false, skipped: `fila_${String(existing.status || 'ativa')}` };
  }

  const { error } = await db.from('monitoramento_queue').insert({
    processo_id: processoId,
    fonte: source,
    tipo: 'processo',
    status: 'pendente',
    prioridade: 1,
    proxima_execucao: new Date().toISOString(),
    account_id_freshsales: accountId || null,
    payload: {
      numero_cnj: cnj20,
      origem: source,
      account_id: accountId || null,
    },
  });

  if (error) {
    log('warn', 'monitoramento_queue_insert_erro', { processo_id: processoId, cnj: cnj20, erro: error.message });
    return { queued: false, skipped: error.message };
  }

  return { queued: true };
}
async function fsPut(path: string, body: unknown): Promise<{status:number}> {
  for (let i=1; i<=3; i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
      method:'PUT', headers:{Authorization:authHdr(),'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (r.ok) return {status: r.status};
    if (!shouldRetry(r.status)||i===3) return {status: r.status};
    await sleep(600*i);
  }
  return {status:500};
}

// --- CNJ helpers -------------------------------------------------------------
function normCNJ(r: string): string|null {
  const d = (r??'').replace(/[^0-9]/g,'');
  return d.length===20 ? d : null;
}
function cnj20toFmt(c: string): string {
  return `${c.slice(0,7)}-${c.slice(7,9)}.${c.slice(9,13)}.${c.slice(13,14)}.${c.slice(14,16)}.${c.slice(16)}`;
}

function extractCnjFromText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const direct = normCNJ(text);
  if (direct) return direct;
  const digits = text.replace(/[^0-9]/g, '');
  if (digits.length === 20) return normCNJ(digits);
  if (digits.length > 20) {
    for (let index = 0; index <= digits.length - 20; index += 1) {
      const candidate = normCNJ(digits.slice(index, index + 20));
      if (candidate) return candidate;
    }
  }
  return null;
}

function extractCnjFromCustomFields(customFields: Record<string, unknown>): string | null {
  const priorityKeys = [
    'cf_processo',
    'cf_numero_processo',
    'cf_numero_do_processo',
    'numero_processo',
    'numero_cnj',
    'cnj',
    'website',
  ];
  for (const key of priorityKeys) {
    const candidate = extractCnjFromText(customFields?.[key]);
    if (candidate) return candidate;
  }
  for (const value of Object.values(customFields || {})) {
    const candidate = extractCnjFromText(value);
    if (candidate) return candidate;
  }
  return null;
}

function extractCnjFromSalesAccountPayload(payload: Record<string, unknown>): string | null {
  const salesAccount = (payload.sales_account ?? payload) as Record<string, unknown>;
  const customFields = (salesAccount.custom_fields ?? salesAccount.custom_field ?? {}) as Record<string, unknown>;

  const priorityCandidates = [
    customFields.cf_processo,
    customFields.cf_numero_processo,
    customFields.cf_numero_do_processo,
    payload.cf_processo,
    payload.numeroProcesso,
    payload.numero_processo,
    payload.numero_cnj,
    salesAccount.website,
    salesAccount.name,
    salesAccount.display_name,
    salesAccount.title,
    payload.website,
    payload.name,
    payload.display_name,
    payload.title,
  ];

  for (const value of priorityCandidates) {
    const candidate = extractCnjFromText(value);
    if (candidate) return candidate;
  }

  return extractCnjFromCustomFields(customFields);
}

// --- Extrair CNJ e account_id do payload do Freshsales ----------------------
function extrairDoPayloadFS(body: Record<string,unknown>): {
  cnj: string|null; accountId: string|null;
} {
  // O webhook do FS envia:
  // { sales_account: { id: 123, custom_fields: { cf_processo: "CNJ" } } }
  // OU { numeroProcesso: "CNJ" } (chamada direta)
  // OU { cf_processo: "CNJ", account_id: "123" }

  const sa  = (body.sales_account ?? {}) as Record<string,unknown>;
  const cf  = (sa.custom_fields ?? sa.custom_field ?? {}) as Record<string,unknown>;

  const rawAcc = String(
    sa.id ??
    body.account_id ??
    body.sales_account_id ??
    ''
  ).trim();

  return {
    cnj:       extractCnjFromSalesAccountPayload(body),
    accountId: rawAcc || null,
  };
}

function buildMissingCnjResult(payload: Record<string, unknown>, source = 'freshsales_tag'): Record<string, unknown> {
  const salesAccount = (payload.sales_account ?? {}) as Record<string, unknown>;
  const customFields = (salesAccount.custom_fields ?? salesAccount.custom_field ?? {}) as Record<string, unknown>;
  return {
    ok: false,
    error: 'cf_processo/CNJ ausente no account com tag datajud',
    source,
    account_id: String(payload.account_id ?? payload.id ?? salesAccount.id ?? '') || null,
    inferred_cnj: extractCnjFromSalesAccountPayload(payload),
    payload_keys: Object.keys(payload),
    custom_field_keys: Object.keys(customFields),
    missing_cnj: true,
  };
}

// --- Busca DataJud e persiste ------------------------------------------------
async function buscarDatajud(cnj20: string): Promise<{
  ok:boolean; processoId:string|null; hits:number; dados:Record<string,unknown>;
}> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/datajud-search`, {
      method:'POST',
      headers:{'Content-Type':'application/json', Authorization:`Bearer ${SVC_KEY}`},
      body: JSON.stringify({ numeroProcesso: cnj20, persistir: true }),
      signal: AbortSignal.timeout(25_000),
    });
    const d = await r.json();
    const hits = d?.resultado?.hits?.total?.value ?? d?.hits ?? 0;
    log(r.ok?'info':'warn','datajud_busca',{cnj:cnj20, ok:r.ok, hits, persistido:d?.persistido});
    return { ok:r.ok, processoId: d?.processo_id??null, hits, dados:d };
  } catch(e) {
    log('warn','datajud_excecao',{cnj:cnj20, erro:String(e)});
    return {ok:false, processoId:null, hits:0, dados:{}};
  }
}

// --- Upsert processo no Supabase a partir do CNJ + account_id do FS ----------
async function upsertProcesso(cnj20: string, accountId: string|null): Promise<string|null> {
  const cnjFmt = cnj20toFmt(cnj20);
  const { data: existente } = await db.from('processos').select('id')
    .or(`numero_cnj.eq.${cnj20},numero_processo.eq.${cnj20}`).maybeSingle();

  if (existente?.id) {
    // Garante account_id vinculado
    if (accountId) {
      await db.from('processos').update({
        account_id_freshsales: accountId,
        updated_at: new Date().toISOString(),
      }).eq('id', existente.id);
    }
    return existente.id;
  }

  // Cria novo processo
  const { data: novo, error } = await db.from('processos').insert({
    numero_cnj:           cnj20,
    numero_processo:      cnj20,
    titulo:               cnjFmt,
    dados_incompletos:    true,
    fonte_criacao:        'freshsales_webhook',
    account_id_freshsales: accountId,
    updated_at:           new Date().toISOString(),
  }).select('id').single();

  if (error) { log('warn','upsert_processo_erro',{cnj:cnj20, erro:error.message}); return null; }
  log('info','processo_criado',{cnj:cnj20, id:novo?.id});
  return novo?.id ?? null;
}

// --- Monta titulo com partes -------------------------------------------------
type Parte = {nome:string; polo:string};
function nomesPolo(partes:Parte[], polo:'ativo'|'passivo'): string {
  const ns = partes.filter(p=>p.polo===polo).map(p=>p.nome.trim()).filter(Boolean);
  if (!ns.length) return '';
  return ns.length===1 ? ns[0] : `${ns[0]} e outros`;
}
async function buildTitulo(processoId:string, cnjFmt:string, proc:Record<string,unknown>): Promise<string> {
  const {data:partes} = await db.from('partes').select('nome,polo').eq('processo_id',processoId).in('polo',['ativo','passivo']);
  const ativo   = partes ? nomesPolo(partes as Parte[],'ativo')   : '';
  const passivo = partes ? nomesPolo(partes as Parte[],'passivo') : '';
  const a = ativo   || String(proc.polo_ativo   ?? '');
  const p = passivo || String(proc.polo_passivo ?? '');
  if (a && p) return `${cnjFmt} (${a} x ${p})`;
  if (a)      return `${cnjFmt} (${a})`;
  return cnjFmt;
}

// --- Push completo para o Freshsales -----------------------------------------
async function pushParaFS(processoId: string, accountId: string): Promise<Record<string,unknown>> {
  const {data:proc} = await db.from('processos').select('*').eq('id',processoId).single();
  if (!proc) return {skip:'processo nao encontrado'};

  const cnj20  = String(proc.numero_cnj ?? proc.numero_processo ?? '');
  const cnjFmt = cnj20.length===20 ? cnj20toFmt(cnj20) : cnj20;

  // 1. Monta titulo com partes
  const titulo = await buildTitulo(processoId, cnjFmt, proc as Record<string,unknown>);

  // 2. Monta custom_fields — apenas campos preenchidos (nunca sobrescreve com null)
  const cf: Record<string,unknown> = { cf_processo: cnjFmt };
  const set = (k:string, v:unknown) => { if (v!=null && v!=='') cf[k]=v; };
  set('cf_tribunal',            proc.tribunal);
  set('cf_vara',                proc.orgao_julgador);
  set('cf_instancia',           proc.instancia);
  set('cf_polo_ativo',          proc.polo_ativo);
  set('cf_parte_adversa',       proc.polo_passivo);
  set('cf_status',              proc.status_atual_processo);
  set('cf_data_de_distribuio',  proc.data_ajuizamento);
  set('cf_data_ultimo_movimento', proc.data_ultima_movimentacao);
  set('cf_area',                proc.area);
  set('cf_valor_causa',         proc.valor_causa);
  if (proc.parte_representada_adriano)
    set('cf_DJ', `Parte repr.: ${proc.parte_representada_adriano}`);

  // 3. Busca dados atuais do account para nao sobrescrever campos preenchidos
  let fsAcc: Record<string,unknown> = {};
  try {
    const r = await fsGet(`sales_accounts/${accountId}`);
    fsAcc = ((r as Record<string,Record<string,unknown>>).sales_account?.custom_fields ?? {}) as Record<string,unknown>;
  } catch {}

  // Remove do cf campos que o FS ja tem preenchido
  const cfFinal: Record<string,unknown> = {};
  for (const [k,v] of Object.entries(cf)) {
    if (!fsAcc[k] || k==='cf_processo') cfFinal[k]=v; // cf_processo sempre atualiza
  }

  // 4. Atualiza Sales Account
  const body: Record<string,unknown> = { custom_field: cfFinal };
  // Atualiza nome se nao tem partes ainda ou se agora tem
  const fsName = String((await fsGet(`sales_accounts/${accountId}`)
    .then(r=>(r as Record<string,Record<string,unknown>>).sales_account?.name ?? '')
    .catch(()=>'')) ?? '');
  if (!fsName.includes(' x ') && titulo.includes(' x ')) body.name = titulo;
  else if (fsName === cnjFmt && titulo !== cnjFmt) body.name = titulo;

  const putRes = await fsPut(`sales_accounts/${accountId}`, { sales_account: body });
  log('info','account_atualizado',{account_id:accountId, campos:Object.keys(cfFinal), titulo_atualizado:!!body.name, status:putRes.status});

  // 5. Atualiza titulo e fs_sync_at no Supabase
  await db.from('processos').update({
    titulo,
    fs_sync_at: new Date().toISOString(),
    dados_incompletos: false,
  }).eq('id', processoId);

  // 6. Envia andamentos DataJud como activities
  const {data:movimentos} = await db.from('movimentos')
    .select('id,codigo,descricao,data_movimento')
    .eq('processo_id',processoId).limit(100);

  let andamentosEnviados = 0;
  const toDate = (d:Date) => d.toISOString().split('T')[0];
  for (const mov of movimentos??[]) {
    try {
      const dtBase = mov.data_movimento ? new Date(mov.data_movimento) : new Date();
      const dtFim  = new Date(dtBase); dtFim.setDate(dtBase.getDate()+1);
      const {status} = await fsPost('sales_activities',{
        sales_activity:{
          sales_account_id: Number(accountId),
          owner_id:          FS_OWNER_ID,
          activity_type_id:  FS_TYPE_ANDAMENTOS,
          title: `[Andamento] ${String(mov.descricao??'').slice(0,80)}`,
          starts_at: `${toDate(dtBase)}T00:01:00Z`,
          ends_at:   `${toDate(dtFim)}T23:59:00Z`,
          notes: `Código TPU: ${mov.codigo??''}\n${mov.descricao??''}`,
        },
      });
      if (status===200||status===201) andamentosEnviados++;
      await sleep(100);
    } catch {}
  }

  // 7. Envia publicacoes vinculadas como activities
  const {data:pubs} = await db.from('publicacoes')
    .select('id,data_publicacao,nome_diario,cidade_comarca_descricao,vara_descricao,despacho,conteudo')
    .eq('processo_id',processoId)
    .is('freshsales_activity_id',null)
    .order('data_publicacao',{ascending:false}).limit(20);

  let pubsEnviadas = 0;
  for (const pub of pubs??[]) {
    try {
      const dtBase = pub.data_publicacao ? new Date(pub.data_publicacao) : new Date();
      const dtFim  = new Date(dtBase); dtFim.setDate(dtBase.getDate()+2);
      const {status,data:actData} = await fsPost('sales_activities',{
        sales_activity:{
          sales_account_id: Number(accountId),
          owner_id:          FS_OWNER_ID,
          activity_type_id:  FS_TYPE_PUBLICACOES,
          title: 'Diario de Justica',
          starts_at: `${toDate(dtBase)}T00:01:00Z`,
          ends_at:   `${toDate(dtFim)}T23:59:00Z`,
          notes: [
            '=== PUBLICACAO DJ ===',
            `Diario  : ${pub.nome_diario??''}`,
            `Comarca : ${pub.cidade_comarca_descricao??''}`,
            `Vara    : ${pub.vara_descricao??''}`,
            '',
            String(pub.despacho||pub.conteudo||'').slice(0,3000),
          ].join('\n'),
        },
      });
      if (status===200||status===201) {
        const aid = String(((actData as Record<string,Record<string,unknown>>).sales_activity?.id)??'');
        if (aid) { await db.from('publicacoes').update({freshsales_activity_id:aid}).eq('id',pub.id); pubsEnviadas++; }
      }
      await sleep(100);
    } catch {}
  }

  log('info','push_fs_completo',{processoId, accountId, andamentosEnviados, pubsEnviadas});
  return { ok:true, account_id:accountId, titulo, campos_enviados:Object.keys(cfFinal), andamentos_enviados:andamentosEnviados, pubs_enviadas:pubsEnviadas, put_status:putRes.status };
}

// =============================================================================
// ACTION: sync_account  <- chamado pelo workflow do Freshsales
// Payload do FS: { sales_account: { id, custom_fields: { cf_processo } } }
// =============================================================================
async function handleSyncAccount(body: Record<string,unknown>): Promise<Record<string,unknown>> {
  const { cnj, accountId } = extrairDoPayloadFS(body);

  if (!cnj) {
    log('warn','sync_account_sem_cnj',{body:JSON.stringify(body).slice(0,200)});
    return {ok:false, erro:'cf_processo/CNJ nao encontrado no payload', payload_recebido: Object.keys(body)};
  }

  const cnjFmt = cnj20toFmt(cnj);
  log('info','sync_account_inicio',{cnj, cnjFmt, account_id:accountId});

  // 1. Upsert processo no Supabase
  const processoId = await upsertProcesso(cnj, accountId);
  if (!processoId) return {ok:false, erro:'Falha ao criar/localizar processo no Supabase', cnj};

  // 2. Busca DataJud
  const dj = await buscarDatajud(cnj);

  // 3. Determina o account_id: usa o recebido ou busca no banco
  let fsAccountId = accountId;
  if (!fsAccountId) {
    const {data:proc} = await db.from('processos').select('account_id_freshsales').eq('id',processoId).maybeSingle();
    fsAccountId = proc?.account_id_freshsales ?? null;
  }
  if (!fsAccountId) {
    log('warn','sync_account_sem_account_id',{cnj, processoId});
    return {ok:true, cnj, processoId, datajud:dj, aviso:'Processo salvo mas sem account_id — sera sincronizado quando o account for criado'};
  }

  // 4. Push completo para o Freshsales
  const fsResult = await pushParaFS(processoId, fsAccountId);

  return {
    ok:     true,
    cnj,
    cnjFmt,
    processo_id:  processoId,
    account_id:   fsAccountId,
    datajud_hits: dj.hits,
    datajud_ok:   dj.ok,
    freshsales:   fsResult,
  };
}

// =============================================================================
// Handlers existentes (tag_added, tag_removed, daily_sync, sync_andamentos)
// =============================================================================
async function handleTagAdded(payload: Record<string,unknown>) {
  const accountId   = String(payload.account_id ?? payload.id ?? (payload.sales_account as Record<string,unknown>)?.id ?? '');
  const salesAccount = (payload.sales_account ?? {}) as Record<string, unknown>;
  const customFields = (salesAccount.custom_fields ?? salesAccount.custom_field ?? {}) as Record<string, unknown>;
  const cnj20       = extractCnjFromSalesAccountPayload(payload) ?? '';
  if (!cnj20) {
    const result = buildMissingCnjResult(payload, 'tag_added');
    log('warn', 'tag_added_sem_cnj', result as Record<string, unknown>);
    return result;
  }

  if (accountId && !String(customFields.cf_processo ?? '').trim()) {
    const patched = await patchSalesAccountProcessNumber(accountId, cnj20);
    log(patched.ok ? 'info' : 'warn', 'tag_added_cf_processo_recovered', {
      account_id: accountId,
      cnj: cnj20,
      status: patched.status,
    });
  }

  await db.from('datajud_sync_status').upsert(
    {numero_processo:cnj20, status:'ativo', updated_at:new Date().toISOString()},
    {onConflict:'numero_processo'}
  );

  let {data:proc} = await db.from('processos').select('id')
    .or(`numero_cnj.eq.${cnj20},numero_processo.eq.${cnj20}`).maybeSingle();
  if (!proc) {
    const {data:np, error:ie} = await db.from('processos').insert({
      numero_cnj:cnj20, numero_processo:cnj20, titulo:cnj20toFmt(cnj20),
      account_id_freshsales:accountId||null, fonte_criacao:'freshsales_tag',
    }).select('id').single();
    if (ie) throw ie;
    proc = np;
  } else {
    const upd:Record<string,unknown> = {updated_at:new Date().toISOString()};
    if (accountId) upd.account_id_freshsales = accountId;
    await db.from('processos').update(upd).eq('id',proc.id);
  }

  const queued = await enqueueDatajudMonitoring(proc!.id, accountId || null, cnj20, 'freshsales_tag');
  return {ok:true, processo_id:proc!.id, cnj:cnj20, queue: queued};
}

async function handleTagRemoved(payload: Record<string,unknown>) {
  const sa  = (payload.sales_account ?? {}) as Record<string,unknown>;
  const cf  = (sa.custom_fields ?? sa.custom_field ?? {}) as Record<string,unknown>;
  const num = normCNJ(String(cf.cf_processo ?? payload.numero_processo ?? '').replace(/[^0-9]/g,'')) ?? '';
  if (!num) return {error:'numero_processo ausente'};
  await db.from('datajud_sync_status')
    .update({status:'inativo', updated_at:new Date().toISOString()})
    .eq('numero_processo', num);
  const {data:proc} = await db.from('processos').select('id')
    .or(`numero_cnj.eq.${num},numero_processo.eq.${num}`).maybeSingle();
  if (proc?.id)
    await db.from('monitoramento_queue').update({status:'cancelado'})
      .eq('processo_id',proc.id).eq('status','pendente');
  return {ok:true, removido:num};
}

async function handleSyncAndamentos(limite=200): Promise<Record<string,unknown>> {
  const {data:movs} = await db.from('movimentacoes')
    .select('id,processo_id,conteudo,data_movimentacao')
    .is('freshsales_activity_id',null).limit(limite);
  if (!movs||movs.length===0) return {ok:true, total:0, msg:'Nenhuma movimentacao pendente'};
  const porProc = new Map<string,typeof movs>();
  for (const m of movs) { if (!porProc.has(m.processo_id)) porProc.set(m.processo_id,[]); porProc.get(m.processo_id)!.push(m); }
  let enviados=0, erros=0;
  for (const [pid,mvs] of porProc) {
    const {data:proc} = await db.from('processos').select('account_id_freshsales').eq('id',pid).maybeSingle();
    if (!proc?.account_id_freshsales) { erros+=mvs.length; continue; }
    const acc = proc.account_id_freshsales;
    for (const m of mvs) {
      try {
        const dtBase = m.data_movimentacao ? new Date(m.data_movimentacao) : new Date();
        const dtFim  = new Date(dtBase); dtFim.setDate(dtBase.getDate()+1);
        const toDate = (d:Date)=>d.toISOString().split('T')[0];
        const {status,data:ad} = await fsPost('sales_activities',{
          sales_activity:{
            sales_account_id:Number(acc), owner_id:FS_OWNER_ID, activity_type_id:FS_TYPE_ANDAMENTOS,
            title:`[Andamento] ${String(m.conteudo??'').slice(0,80)}`,
            starts_at:`${toDate(dtBase)}T00:01:00Z`, ends_at:`${toDate(dtFim)}T23:59:00Z`,
            notes:m.conteudo??'',
          },
        });
        if (status===200||status===201) {
          const aid=String(((ad as Record<string,Record<string,unknown>>).sales_activity?.id)??'');
          if (aid) { await db.from('movimentacoes').update({freshsales_activity_id:aid}).eq('id',m.id); enviados++; }
        } else erros++;
      } catch { erros++; }
    }
  }
  return {ok:true, total:movs.length, enviados, erros};
}

async function handleDailySync(): Promise<Record<string,unknown>> {
  const {data:queue} = await db.from('monitoramento_queue')
    .select('*').eq('status','pendente')
    .lte('proxima_execucao',new Date().toISOString())
    .order('prioridade',{ascending:true}).limit(30);
  const resultados:unknown[] = [];
  for (const item of queue??[]) {
    try {
      await db.from('monitoramento_queue').update({status:'processando',executado_em:new Date().toISOString()}).eq('id',item.id);
      if (item.tipo==='datajud_sync'||item.tipo==='processo') {
        // Usa handleSyncAccount que faz o fluxo completo
        const cnj20 = item.payload?.numero_cnj as string|undefined;
        if (cnj20) {
          const {data:proc} = await db.from('processos').select('id,account_id_freshsales')
            .eq('id',item.processo_id).maybeSingle();
          const res = await handleSyncAccount({
            numeroProcesso: cnj20,
            account_id: proc?.account_id_freshsales ?? '',
          });
          resultados.push({item_id:item.id, cnj:cnj20, ok:res.ok});
        }
      }
      await db.from('monitoramento_queue').update({status:'concluido',tentativas:(item.tentativas??0)+1}).eq('id',item.id);
    } catch(e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.from('monitoramento_queue').update({
        status:'erro', ultimo_erro:msg, tentativas:(item.tentativas??0)+1,
        proxima_execucao:new Date(Date.now()+30*60_000).toISOString(),
      }).eq('id',item.id);
    }
  }
  return {ok:true, processados:resultados.length, resultados};
}

async function handleReconcileTaggedAccounts(limit = 100, tag = 'datajud'): Promise<Record<string, unknown>> {
  const safeLimit = Math.max(1, Math.min(Number(limit || 100), 250));
  const perPage = Math.min(50, safeLimit);
  const pages = Math.max(1, Math.ceil(safeLimit / perPage));
  const salesAccounts: Record<string, unknown>[] = [];

  for (let page = 1; page <= pages; page += 1) {
    const { status, data } = await fsPost('filtered_search/sales_account', {
      filter_rule: [{ attribute: 'tags', operator: 'is_in', value: [tag] }],
      page,
      per_page: perPage,
    });
    if (status !== 200) {
      return { ok: false, erro: `filtered_search tags ${status}` };
    }
    const batch = Array.isArray(data.sales_accounts) ? data.sales_accounts as Record<string, unknown>[] : [];
    salesAccounts.push(...batch);
    if (batch.length < perPage || salesAccounts.length >= safeLimit) break;
  }

  let scanned = 0;
  let activated = 0;
  let ignored = 0;
  let missingCnj = 0;
  const sample: unknown[] = [];

  for (const salesAccount of salesAccounts.slice(0, safeLimit)) {
    scanned += 1;
    if (!salesAccountHasTag(salesAccount, tag)) {
      ignored += 1;
      continue;
    }
    const result = await handleTagAdded({
      account_id: String(salesAccount.id ?? ''),
      sales_account: salesAccount,
    });
    if ((result as Record<string, unknown>).ok) activated += 1;
    else if ((result as Record<string, unknown>).missing_cnj) missingCnj += 1;
    if (sample.length < 10) sample.push({
      account_id: String(salesAccount.id ?? ''),
      processo: ((salesAccount.custom_field ?? salesAccount.custom_fields ?? {}) as Record<string, unknown>).cf_processo ?? null,
      ok: Boolean((result as Record<string, unknown>).ok),
      error: (result as Record<string, unknown>).error ?? null,
      missing_cnj: Boolean((result as Record<string, unknown>).missing_cnj),
      queue: (result as Record<string, unknown>).queue ?? null,
    });
  }

  return {
    ok: true,
    scanned,
    activated,
    ignored,
    missing_cnj: missingCnj,
    sample,
  };
}

async function listTaggedSalesAccounts(limit = 100, tag = 'datajud'): Promise<Record<string, unknown>[]> {
  const safeLimit = Math.max(1, Math.min(Number(limit || 100), 250));
  const perPage = Math.min(50, safeLimit);
  const pages = Math.max(1, Math.ceil(safeLimit / perPage));
  const salesAccounts: Record<string, unknown>[] = [];

  for (let page = 1; page <= pages; page += 1) {
    const { status, data } = await fsPost('filtered_search/sales_account', {
      filter_rule: [{ attribute: 'tags', operator: 'is_in', value: [tag] }],
      page,
      per_page: perPage,
    });
    if (status !== 200) {
      throw new Error(`filtered_search tags ${status}`);
    }
    const batch = Array.isArray(data.sales_accounts) ? data.sales_accounts as Record<string, unknown>[] : [];
    salesAccounts.push(...batch);
    if (batch.length < perPage || salesAccounts.length >= safeLimit) break;
  }

  return salesAccounts.slice(0, safeLimit);
}

async function handleDiagnoseTaggedAccounts(limit = 100, tag = 'datajud'): Promise<Record<string, unknown>> {
  const salesAccounts = await listTaggedSalesAccounts(limit, tag);
  const summary = {
    scanned: 0,
    missing_cnj: 0,
    without_process: 0,
    without_account_link: 0,
    without_movements: 0,
    movement_activity_gap: 0,
    publication_activity_gap: 0,
    parts_contact_gap: 0,
    hearing_activity_gap: 0,
    fully_covered: 0,
  };
  const sample: unknown[] = [];

  for (const salesAccount of salesAccounts) {
    if (!salesAccountHasTag(salesAccount, tag)) continue;
    summary.scanned += 1;
    const accountId = String(salesAccount.id ?? '');
    const cnj20 = extractCnjFromSalesAccountPayload({ sales_account: salesAccount }) ?? '';
    if (!cnj20) {
      summary.missing_cnj += 1;
      if (sample.length < 20) {
        sample.push({
          account_id: accountId,
          status: 'missing_cnj',
          numero_cnj: null,
          account_name: String(salesAccount.name ?? salesAccount.display_name ?? '').trim() || null,
          website: String(salesAccount.website ?? '').trim() || null,
        });
      }
      continue;
    }

    const { data: proc } = await db.from('processos')
      .select('id,numero_cnj,account_id_freshsales,quantidade_movimentacoes')
      .or(`numero_cnj.eq.${cnj20},numero_processo.eq.${cnj20}`)
      .maybeSingle();

    if (!proc?.id) {
      summary.without_process += 1;
      if (sample.length < 20) {
        sample.push({
          account_id: accountId,
          status: 'without_process',
          numero_cnj: cnj20,
        });
      }
      continue;
    }

    const [movGap, pubGap, partGap, hearingGap] = await Promise.all([
      db.from('movimentacoes')
        .select('id', { count: 'exact', head: true })
        .eq('processo_id', proc.id)
        .is('freshsales_activity_id', null),
      db.from('publicacoes')
        .select('id', { count: 'exact', head: true })
        .eq('processo_id', proc.id)
        .is('freshsales_activity_id', null),
      db.from('partes')
        .select('id', { count: 'exact', head: true })
        .eq('processo_id', proc.id)
        .is('contato_freshsales_id', null),
      db.from('audiencias')
        .select('id', { count: 'exact', head: true })
        .eq('processo_id', proc.id)
        .is('freshsales_activity_id', null),
    ]);

    const diagnostics = [];
    if (!proc.account_id_freshsales) {
      summary.without_account_link += 1;
      diagnostics.push('without_account_link');
    }
    if (Number(proc.quantidade_movimentacoes ?? 0) <= 0) {
      summary.without_movements += 1;
      diagnostics.push('without_movements');
    }
    if (Number(movGap.count || 0) > 0) {
      summary.movement_activity_gap += 1;
      diagnostics.push('movement_activity_gap');
    }
    if (Number(pubGap.count || 0) > 0) {
      summary.publication_activity_gap += 1;
      diagnostics.push('publication_activity_gap');
    }
    if (Number(partGap.count || 0) > 0) {
      summary.parts_contact_gap += 1;
      diagnostics.push('parts_contact_gap');
    }
    if (Number(hearingGap?.count || 0) > 0) {
      summary.hearing_activity_gap += 1;
      diagnostics.push('hearing_activity_gap');
    }
    if (!diagnostics.length) {
      summary.fully_covered += 1;
      diagnostics.push('fully_covered');
    }

    if (sample.length < 20) {
      sample.push({
        account_id: accountId,
        processo_id: proc.id,
        numero_cnj: proc.numero_cnj ?? cnj20,
        status: diagnostics[0],
        diagnostics,
        movement_activity_gap: Number(movGap.count || 0),
        publication_activity_gap: Number(pubGap.count || 0),
        parts_contact_gap: Number(partGap.count || 0),
        hearing_activity_gap: Number(hearingGap?.count || 0),
      });
    }
  }

  return {
    ok: true,
    tag,
    ...summary,
    sample,
  };
}

async function patchSalesAccountProcessNumber(accountId: string, cnj20: string): Promise<{ ok: boolean; status: number; processNumber: string }> {
  const processNumber = cnj20toFmt(cnj20);
  const { status } = await fsPut(`sales_accounts/${accountId}`, {
    sales_account: {
      custom_field: {
        cf_processo: processNumber,
      },
    },
  });
  return {
    ok: status === 200 || status === 201,
    status,
    processNumber,
  };
}

async function handleRecoverTaggedMissingCnj(limit = 100, tag = 'datajud'): Promise<Record<string, unknown>> {
  const salesAccounts = await listTaggedSalesAccounts(limit, tag);
  const summary = {
    scanned: 0,
    recoverable: 0,
    recovered: 0,
    skipped: 0,
    failed: 0,
    queued: 0,
  };
  const sample: unknown[] = [];

  for (const salesAccount of salesAccounts) {
    if (!salesAccountHasTag(salesAccount, tag)) continue;
    summary.scanned += 1;
    const customFields = (salesAccount.custom_fields ?? salesAccount.custom_field ?? {}) as Record<string, unknown>;
    const currentProcess = String(customFields.cf_processo ?? '').trim();
    const inferredCnj = extractCnjFromSalesAccountPayload({ sales_account: salesAccount }) ?? '';

    if (currentProcess || !inferredCnj) {
      summary.skipped += 1;
      continue;
    }

    summary.recoverable += 1;
    const accountId = String(salesAccount.id ?? '').trim();
    if (!accountId) {
      summary.failed += 1;
      if (sample.length < 20) {
        sample.push({
          account_id: null,
          account_name: String(salesAccount.name ?? salesAccount.display_name ?? '').trim() || null,
          inferred_cnj: inferredCnj,
          ok: false,
          error: 'account_id ausente',
        });
      }
      continue;
    }

    const patch = await patchSalesAccountProcessNumber(accountId, inferredCnj);
    if (patch.ok) summary.recovered += 1;
    else summary.failed += 1;

    let queued = null;
    if (patch.ok) {
      const patchedSalesAccount = {
        ...salesAccount,
        custom_fields: {
          ...customFields,
          cf_processo: patch.processNumber,
        },
      };
      const enqueueResult = await handleTagAdded({
        account_id: accountId,
        sales_account: patchedSalesAccount,
        cf_processo: patch.processNumber,
      });
      queued = (enqueueResult as Record<string, unknown>).queue ?? null;
      if (queued) summary.queued += 1;
    }
    if (sample.length < 20) {
      sample.push({
        account_id: accountId,
        account_name: String(salesAccount.name ?? salesAccount.display_name ?? '').trim() || null,
        inferred_cnj: inferredCnj,
        process_number: patch.processNumber,
        ok: patch.ok,
        status: patch.status,
        queue: queued,
      });
    }
  }

  return {
    ok: true,
    tag,
    ...summary,
    sample,
  };
}

async function handleEnqueueActiveDatajud(limit = 100): Promise<Record<string, unknown>> {
  const safeLimit = Math.max(1, Math.min(Number(limit || 100), 250));
  const { data: rows } = await db.from('datajud_sync_status')
    .select('numero_processo,status')
    .eq('status', 'ativo')
    .limit(safeLimit);

  let queued = 0;
  let skipped = 0;
  const sample: unknown[] = [];

  for (const row of rows ?? []) {
    const cnj20 = normCNJ(String(row.numero_processo ?? ''));
    if (!cnj20) {
      skipped += 1;
      continue;
    }
    const { data: proc } = await db.from('processos')
      .select('id,account_id_freshsales')
      .or(`numero_cnj.eq.${cnj20},numero_processo.eq.${cnj20}`)
      .maybeSingle();
    if (!proc?.id) {
      skipped += 1;
      continue;
    }
    const result = await enqueueDatajudMonitoring(String(proc.id), proc.account_id_freshsales ? String(proc.account_id_freshsales) : null, cnj20, 'datajud_active_cron');
    if (result.queued) queued += 1;
    else skipped += 1;
    if (sample.length < 10) sample.push({
      cnj: cnj20,
      processo_id: proc.id,
      account_id: proc.account_id_freshsales ?? null,
      queue: result,
    });
  }

  return {
    ok: true,
    ativos: rows?.length ?? 0,
    queued,
    skipped,
    sample,
  };
}

async function handleCronTaggedDatajud({
  scanLimit = 50,
  monitorLimit = 100,
  movementLimit = 120,
} = {}): Promise<Record<string, unknown>> {
  const recoverMissing = await handleRecoverTaggedMissingCnj(scanLimit, 'datajud');
  const reconcile = await handleReconcileTaggedAccounts(scanLimit, 'datajud');
  const enqueue = await handleEnqueueActiveDatajud(monitorLimit);
  const daily = await handleDailySync();
  const movimentos = await handleSyncAndamentos(movementLimit);
  return {
    ok: true,
    recoverMissing,
    reconcile,
    enqueue,
    daily,
    movimentos,
  };
}

async function handleCronIntegracaoTotal({
  scanLimit = 50,
  monitorLimit = 100,
  movementLimit = 120,
  advisePages = 2,
  advisePerPage = 50,
  publicacoesBatch = 20,
} = {}): Promise<Record<string, unknown>> {
  const datajud = await handleCronTaggedDatajud({ scanLimit, monitorLimit, movementLimit });
  let advise: Record<string, unknown> | null = null;
  let publicacoes: Record<string, unknown> | null = null;
  let worker: Record<string, unknown> | null = null;
  try {
    advise = await callHmadvFunction("advise-sync", { action: "sync", por_pagina: advisePerPage, max_paginas: advisePages });
  } catch (error) {
    advise = { ok: false, error: String(error?.message || error) };
  }
  try {
    publicacoes = await callHmadvFunction("publicacoes-freshsales", { action: "sync", batch: publicacoesBatch });
  } catch (error) {
    publicacoes = { ok: false, error: String(error?.message || error) };
  }
  try {
    worker = await callHmadvFunction("sync-worker", { action: "run" });
  } catch (error) {
    worker = { ok: false, error: String(error?.message || error) };
  }
  return {
    ok: true,
    datajud,
    advise,
    publicacoes,
    worker,
  };
}

// =============================================================================
// Main
// =============================================================================
Deno.serve(async (req: Request) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? '';

  // Auth: aceita anon key (webhook FS), service key, ou nenhum secret configurado
  const authHeader = req.headers.get('authorization') ?? '';
  const isService  = authHeader.includes(SVC_KEY);
  // Acoes internas requerem service key; sync_account aceita qualquer token (o FS usa anon)
  const publicActions = ['sync_account','tag_added','tag_removed'];
  if (!publicActions.includes(action) && !isService && WEBHOOK_SECRET) {
    const secret = req.headers.get('x-webhook-secret') ?? req.headers.get('x-freshsales-secret') ?? '';
    if (secret !== WEBHOOK_SECRET)
      return new Response(JSON.stringify({error:'Unauthorized'}),{status:401});
  }

  let body: Record<string,unknown> = {};
  if (req.method==='POST') { try { body = await req.json(); } catch {/***/} }

  try {
    let result: unknown;
    switch (action) {
      case 'sync_account':    result = await handleSyncAccount(body);              break;
      case 'tag_added':       result = await handleTagAdded(body);                 break;
      case 'tag_removed':     result = await handleTagRemoved(body);               break;
      case 'sync_andamentos': result = await handleSyncAndamentos(Number(url.searchParams.get('limite')??200)); break;
      case 'daily_sync':      result = await handleDailySync();                    break;
      case 'reconcile_tagged_accounts': result = await handleReconcileTaggedAccounts(Number(url.searchParams.get('limite') ?? 100), String(url.searchParams.get('tag') ?? 'datajud')); break;
      case 'recover_tagged_missing_cnj': result = await handleRecoverTaggedMissingCnj(Number(url.searchParams.get('limite') ?? 100), String(url.searchParams.get('tag') ?? 'datajud')); break;
      case 'diagnose_tagged_accounts': result = await handleDiagnoseTaggedAccounts(Number(url.searchParams.get('limite') ?? 100), String(url.searchParams.get('tag') ?? 'datajud')); break;
      case 'enqueue_active_datajud': result = await handleEnqueueActiveDatajud(Number(url.searchParams.get('limite') ?? 100)); break;
      case 'cron_tagged_datajud': result = await handleCronTaggedDatajud({
        scanLimit: Number(url.searchParams.get('scan_limit') ?? 50),
        monitorLimit: Number(url.searchParams.get('monitor_limit') ?? 100),
        movementLimit: Number(url.searchParams.get('movement_limit') ?? 120),
      }); break;
      case 'cron_integracao_total': result = await handleCronIntegracaoTotal({
        scanLimit: Number(url.searchParams.get('scan_limit') ?? 50),
        monitorLimit: Number(url.searchParams.get('monitor_limit') ?? 100),
        movementLimit: Number(url.searchParams.get('movement_limit') ?? 120),
        advisePages: Number(url.searchParams.get('advise_pages') ?? 2),
        advisePerPage: Number(url.searchParams.get('advise_per_page') ?? 50),
        publicacoesBatch: Number(url.searchParams.get('publicacoes_batch') ?? 20),
      }); break;
      default: {
        // Payload generico do FS (sem action na URL)
        const sa = (body.sales_account ?? {}) as Record<string,unknown>;
        const cf = (sa.custom_fields ?? sa.custom_field ?? {}) as Record<string,unknown>;
        if (cf.cf_processo || body.cf_processo || body.numeroProcesso) {
          result = await handleSyncAccount(body);
        } else {
          result = {received:true, msg:'Nenhuma acao reconhecida', keys:Object.keys(body)};
        }
      }
    }
    return new Response(JSON.stringify(result,null,2),{headers:{'Content-Type':'application/json'}});
  } catch(err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error','erro_fatal',{action, erro:msg});
    return new Response(JSON.stringify({error:msg}),{status:500,headers:{'Content-Type':'application/json'}});
  }
});
