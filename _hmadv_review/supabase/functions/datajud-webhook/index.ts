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

  const rawCNJ = String(
    cf.cf_processo ??
    body.cf_processo ??
    body.numeroProcesso ??
    body.numero_processo ??
    body.numero_cnj ??
    ''
  ).trim();

  const rawAcc = String(
    sa.id ??
    body.account_id ??
    body.sales_account_id ??
    ''
  ).trim();

  return {
    cnj:       normCNJ(rawCNJ.replace(/[^0-9]/g,'')) ? normCNJ(rawCNJ.replace(/[^0-9]/g,'')) : null,
    accountId: rawAcc || null,
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
  const sa          = (payload.sales_account ?? {}) as Record<string,unknown>;
  const cf          = (sa.custom_fields ?? sa.custom_field ?? {}) as Record<string,unknown>;
  const numProcesso = String(cf.cf_processo ?? payload.numero_processo ?? payload.cf_numero_processo ?? '').trim();
  const cnj20       = normCNJ(numProcesso) ?? '';
  if (!cnj20) return {error:'numero_processo ausente'};

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

  await db.from('monitoramento_queue').insert({
    processo_id:proc!.id, fonte:'freshsales_tag', tipo:'datajud_sync',
    status:'pendente', prioridade:1, proxima_execucao:new Date().toISOString(),
    payload:{numero_cnj:cnj20},
  }).select().catch(()=>{});

  return {ok:true, processo_id:proc!.id, cnj:cnj20};
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
