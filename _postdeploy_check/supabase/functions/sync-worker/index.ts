/**
 * sync-worker  v9 — versão definitiva
 *
 * Fix vs v8:
 *   - contarTabela usa header 'Accept-Profile: judiciario' para o schema correto
 *   - Teste de escrita no inicio para detectar problema de permissão
 *   - Loop simplificado: 5 rodadas max, queries sequenciais
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_BASE    = `${SUPABASE_URL}/functions/v1/processo-sync`;

const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: 'judiciario' } });

const MAX_RODADAS  = 5;
const LOCK_TIMEOUT = 8;
const LOTE_PUSH    = 20;
const LOTE_BATCH   = 20;
const LOTE_SYNC_BI = 10;
const LOTE_MOV_DJ  = 20;
const LOTE_PUBS    = 25;

const FS_OWNER_ID         = Number(Deno.env.get('FS_OWNER_ID') ?? '31000147944');
const FS_TYPE_ANDAMENTOS  = 31001147751;
const FS_TYPE_PUBLICACOES = 31001147699;

function log(n: 'info'|'warn'|'error', m: string, e: Record<string,unknown> = {}) {
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// --- Freshsales ---
const DOMAIN_MAP: Record<string,string> = {
  'hmadv-7b725ea101eff55.freshsales.io': 'hmadv-org.myfreshworks.com',
};
function fsDomain() {
  const d = (Deno.env.get('FRESHSALES_DOMAIN') ?? '').trim();
  return d.includes('myfreshworks.com') ? d
    : (DOMAIN_MAP[d] ?? d.replace(/\.freshsales\.io$/, '.myfreshworks.com'));
}
function authHdr() {
  const k = (Deno.env.get('FRESHSALES_API_KEY') ?? '').trim()
    .replace(/^Token token=/i,'').replace(/^Bearer /i,'').trim();
  return `Token token=${k}`;
}
async function fsPost(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
      method: 'POST', headers: { Authorization: authHdr(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12_000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 429 && i < 3) { await sleep(2000*i); continue; }
    if (r.status >= 500 && i < 3) { await sleep(1000*i); continue; }
    return { status: r.status, data };
  }
  return { status: 500, data: {} };
}

// --- REST headers para schema judiciario ---
function restHeaders(extra: Record<string,string> = {}): Record<string,string> {
  return {
    apikey:           SVC_KEY,
    Authorization:    `Bearer ${SVC_KEY}`,
    'Content-Type':   'application/json',
    'Accept-Profile': 'judiciario',  // schema alternativo
    ...extra,
  };
}

async function contarTabela(tabela: string, filtros: string): Promise<number> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${tabela}?${filtros}&select=id`;
    const r = await fetch(url, {
      headers: restHeaders({ Prefer: 'count=exact', Range: '0-0' }),
      signal: AbortSignal.timeout(8_000),
    });
    const cr = r.headers.get('content-range') ?? '';
    const m  = cr.match(/\/(\d+)/);
    const n  = m ? Number(m[1]) : 0;
    log('info','count',{tabela,filtros,n,status:r.status});
    return n;
  } catch(e) { log('warn','count_err',{tabela,erro:String(e)}); return 0; }
}

type Pend = { movs_dj: number; pubs: number; proc_sem_acc: number; movs_advise: number; fila_dj: number; total: number };
type WorkerRow = Record<string, unknown> & { degraded?: boolean };

async function pendencias(): Promise<Pend> {
  const movs_dj    = await contarTabela('movimentos',           'freshsales_activity_id=is.null');
  const pubs       = await contarTabela('publicacoes',          'freshsales_activity_id=is.null&processo_id=not.is.null');
  const proc_sem_acc = await contarTabela('processos',          'account_id_freshsales=is.null');
  const movs_advise = await contarTabela('movimentacoes',       'freshsales_activity_id=is.null');
  const fila_dj    = await contarTabela('monitoramento_queue',  'status=eq.pendente&account_id_freshsales=not.is.null');
  const total = movs_dj + pubs + proc_sem_acc + movs_advise + fila_dj;
  log('info','pend',{ movs_dj, pubs, proc_sem_acc, movs_advise, fila_dj, total });
  return { movs_dj, pubs, proc_sem_acc, movs_advise, fila_dj, total };
}

function degradedWorkerRow(reason: string): WorkerRow {
  return {
    id: 1,
    em_execucao: false,
    iniciado_em: null,
    ultima_execucao: null,
    ultimo_lote: { degraded: true, reason },
    pendencias: {},
    historico: [],
    rodadas_atual: 0,
    erro_ultimo: reason,
    versao: 1,
    degraded: true,
  };
}

async function ensureWorkerRow(): Promise<WorkerRow> {
  const { data: existing, error: readErr } = await db
    .from('sync_worker_status')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (readErr) {
    log('warn', 'worker_row_read', { e: readErr.message });
    return degradedWorkerRow(`read: ${readErr.message}`);
  }
  if (existing) return existing as WorkerRow;

  const seed = {
    id: 1,
    em_execucao: false,
    iniciado_em: null,
    ultima_execucao: null,
    ultimo_lote: {},
    pendencias: {},
    historico: [],
    rodadas_atual: 0,
    erro_ultimo: null,
    versao: 1,
  };
  const { data: created, error: createErr } = await db
    .from('sync_worker_status')
    .upsert(seed, { onConflict: 'id' })
    .select('*')
    .single();
  if (createErr) {
    log('warn', 'worker_row_create', { e: createErr.message });
    return degradedWorkerRow(`create: ${createErr.message}`);
  }
  log('info', 'worker_row_bootstrap', {});
  return created as WorkerRow;
}

// --- Lock ---
async function adquirirLock(): Promise<boolean> {
  const boot = await ensureWorkerRow();
  if (boot.degraded) {
    log('warn', 'lock_degraded', { reason: boot.erro_ultimo });
    return true;
  }
  const { data: st, error: re } = await db.from('sync_worker_status').select('em_execucao,iniciado_em').eq('id',1).single();
  if (re) { log('warn','lock_read',{e:re.message}); return false; }
  if (st?.em_execucao) {
    const mins = (Date.now() - new Date(st.iniciado_em??0).getTime()) / 60_000;
    if (mins < LOCK_TIMEOUT) { log('info','lock_skip',{mins}); return false; }
  }
  const { error: we } = await db.from('sync_worker_status').update({
    em_execucao: true, iniciado_em: new Date().toISOString(), rodadas_atual: 0, erro_ultimo: null,
  }).eq('id',1);
  if (we) { log('warn','lock_write',{e:we.message}); return false; }
  log('info','lock_acquired',{});
  return true;
}
async function liberarLock(resumo: Record<string,unknown>, erro?: string) {
  const worker = await ensureWorkerRow();
  if (worker.degraded) {
    log('warn', 'lock_release_degraded', { erro });
    return;
  }
  const { data: st } = await db.from('sync_worker_status').select('historico').eq('id',1).single();
  const hist = ((st?.historico??[]) as unknown[]);
  hist.unshift({ ts: new Date().toISOString(), ...resumo });
  if (hist.length > 20) hist.splice(20);
  const { error: we } = await db.from('sync_worker_status').update({
    em_execucao: false, ultima_execucao: new Date().toISOString(),
    ultimo_lote: resumo, historico: hist, erro_ultimo: erro??null,
  }).eq('id',1);
  log(we ? 'warn' : 'info','lock_released',{erro:we?.message});
}

// --- processo-sync ---
async function chamarSync(action: string, params: Record<string,string|number> = {}): Promise<Record<string,unknown>> {
  const qs = new URLSearchParams({ action });
  for (const [k,v] of Object.entries(params)) qs.set(k,String(v));
  try {
    const r = await fetch(`${SYNC_BASE}?${qs}`, {
      method: 'POST', headers: { 'Content-Type':'application/json', Authorization:`Bearer ${SVC_KEY}` },
      body: '{}', signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) { log('warn','sync_http',{action,s:r.status}); return {ok:false,status:r.status}; }
    return r.json();
  } catch(e) { log('warn','sync_exc',{action,e:String(e)}); return {ok:false,erro:String(e)}; }
}

// --- Lote D: Andamentos DataJud -> FS ---
async function loteD(limite: number): Promise<number> {
  const toD = (d: Date) => d.toISOString().split('T')[0];
  const { data: movs } = await db.from('movimentos')
    .select('id,processo_id,codigo,descricao,data_movimento')
    .is('freshsales_activity_id',null).limit(limite);
  if (!movs?.length) return 0;
  const pids = [...new Set(movs.map(m=>m.processo_id))];
  const { data: procs } = await db.from('processos').select('id,account_id_freshsales').in('id',pids);
  const acc = new Map<string,string>();
  for (const p of procs??[]) if (p.account_id_freshsales) acc.set(p.id, p.account_id_freshsales);
  let ok = 0;
  for (const m of movs) {
    const aid = acc.get(m.processo_id); if (!aid) continue;
    try {
      const dt = m.data_movimento ? new Date(m.data_movimento) : new Date();
      const df = new Date(dt); df.setDate(dt.getDate()+1);
      const { status, data: ad } = await fsPost('sales_activities', {
        sales_activity: {
          sales_account_id: Number(aid), owner_id: FS_OWNER_ID,
          activity_type_id: FS_TYPE_ANDAMENTOS,
          title: `[Andamento] ${String(m.descricao??'').slice(0,80)}`,
          starts_at: `${toD(dt)}T00:01:00Z`, ends_at: `${toD(df)}T23:59:00Z`,
          notes: `=== ANDAMENTO DATAJUD ===\nData: ${dt.toLocaleDateString('pt-BR')}\nCód.TPU: ${m.codigo??''}\n${m.descricao??''}`,
        },
      });
      if (status===200||status===201) {
        const id = String(((ad as Record<string,Record<string,unknown>>).sales_activity?.id)??'');
        if (id) { await db.from('movimentos').update({freshsales_activity_id:id}).eq('id',m.id); ok++; }
      } else if (status===429) await sleep(3000);
    } catch(e) { log('warn','movD',{id:m.id,e:String(e)}); }
    await sleep(100);
  }
  log('info','loteD',{total:movs.length,ok});
  return ok;
}

// --- Lote E: Publicacoes -> FS ---
async function loteE(limite: number): Promise<{ e: number; l: number }> {
  const toD = (d: Date) => d.toISOString().split('T')[0];
  const { data: pubs } = await db.from('publicacoes')
    .select('id,processo_id,data_publicacao,nome_diario,cidade_comarca_descricao,vara_descricao,despacho,conteudo,raw_payload')
    .is('freshsales_activity_id',null).not('processo_id','is',null)
    .order('data_publicacao',{ascending:false}).limit(limite);
  if (!pubs?.length) return {e:0,l:0};
  const isLeilao = (p: Record<string,unknown>) => {
    try { return ((p.raw_payload as Record<string,unknown>)?.palavrasChave as string[]??[]).some(w=>/leil[ãõa][oe]?s?/i.test(w)); }
    catch { return false; }
  };
  const leiloes = pubs.filter(p=>isLeilao(p as Record<string,unknown>));
  for (const p of leiloes) await db.from('publicacoes').update({freshsales_activity_id:'LEILAO_IGNORADO'}).eq('id',p.id);
  const validas = pubs.filter(p=>!isLeilao(p as Record<string,unknown>));
  const pids = [...new Set(validas.map(p=>p.processo_id))];
  const { data: procs } = await db.from('processos').select('id,account_id_freshsales').in('id',pids);
  const acc = new Map<string,string>();
  for (const p of procs??[]) if (p.account_id_freshsales) acc.set(p.id,p.account_id_freshsales);
  let env = 0;
  for (const p of validas) {
    const aid = acc.get(p.processo_id); if (!aid) continue;
    try {
      const dt = p.data_publicacao ? new Date(p.data_publicacao) : new Date();
      const df = new Date(dt); df.setDate(dt.getDate()+2);
      const { status, data: ad } = await fsPost('sales_activities', {
        sales_activity: {
          sales_account_id: Number(aid), owner_id: FS_OWNER_ID,
          activity_type_id: FS_TYPE_PUBLICACOES, title: 'Diário de Justiça',
          starts_at: `${toD(dt)}T00:01:00Z`, ends_at: `${toD(df)}T23:59:00Z`,
          notes: ['=== PUBLICAÇÃO DJ ===',`Diário: ${p.nome_diario??''}`,
            `Data: ${dt.toLocaleDateString('pt-BR')}`,`Comarca: ${p.cidade_comarca_descricao??''}`,
            `Vara: ${p.vara_descricao??''}`,'',String(p.despacho||p.conteudo||'').slice(0,4000)].join('\n'),
        },
      });
      if (status===200||status===201) {
        const id = String(((ad as Record<string,Record<string,unknown>>).sales_activity?.id)??'');
        if (id) { await db.from('publicacoes').update({freshsales_activity_id:id}).eq('id',p.id); env++; }
      } else if (status===429) await sleep(3000);
    } catch(e) { log('warn','pubE',{id:p.id,e:String(e)}); }
    await sleep(100);
  }
  log('info','loteE',{v:validas.length,env,l:leiloes.length});
  return {e:env,l:leiloes.length};
}

// --- Loop ---
async function loop(): Promise<Record<string,unknown>> {
  const g = { r:0,criadas:0,movs_advise:0,andamentos_dj:0,publicacoes:0,leilao:0,sync_sb:0,sync_fs:0,pend0:0,pendN:0,motivo:'' };
  const p0 = await pendencias(); g.pend0 = p0.total;
  let prev = -1;
  for (let r=1;r<=MAX_RODADAS;r++) {
    g.r=r;
    await db.from('sync_worker_status').update({rodadas_atual:r,ultimo_lote:g}).eq('id',1);
    const p = await pendencias(); g.pendN=p.total;
    if (p.total===0) { g.motivo='zero'; break; }
    // B: criar accounts + movs Advise
    if (p.proc_sem_acc>0||p.movs_advise>0) {
      const res = await chamarSync('push_freshsales',{limite:LOTE_PUSH,batch:LOTE_BATCH});
      g.criadas     += Number((res as Record<string,Record<string,number>>).accounts?.criados??0);
      g.movs_advise += Number((res as Record<string,Record<string,number>>).andamentos?.enviados??0);
    }
    // C: sync bi
    const p2 = await pendencias();
    if (p2.proc_sem_acc===0) {
      const res = await chamarSync('sync_bidirectional',{limite:LOTE_SYNC_BI});
      g.sync_sb += Number((res as Record<string,number>).atualizadosSb??0);
      g.sync_fs += Number((res as Record<string,number>).atualizadosFs??0);
    }
    // D: andamentos DJ
    const p3 = await pendencias();
    if (p3.movs_dj>0) g.andamentos_dj += await loteD(LOTE_MOV_DJ);
    // E: publicacoes
    const p4 = await pendencias();
    if (p4.pubs>0) { const res = await loteE(LOTE_PUBS); g.publicacoes+=res.e; g.leilao+=res.l; }
    // F: datajud-worker
    const p5 = await pendencias();
    if (p5.fila_dj>0) {
      fetch(`${SUPABASE_URL}/functions/v1/datajud-worker`,{
        method:'POST',headers:{Authorization:`Bearer ${SVC_KEY}`,'Content-Type':'application/json'},
        body:'{}',signal:AbortSignal.timeout(3_000),
      }).catch(()=>{});
    }
    const prog = g.criadas+g.movs_advise+g.andamentos_dj+g.publicacoes+g.sync_sb+g.sync_fs;
    if (r>=3&&prog===prev) { g.motivo='sem_prog'; break; }
    prev=prog;
    if (r===MAX_RODADAS) g.motivo='max';
  }
  g.pendN=(await pendencias()).total;
  log('info','fim',g);
  return g;
}

// --- Main ---
Deno.serve(async (req: Request) => {
  const act = new URL(req.url).searchParams.get('action')?? 'run';
  const res = (d: unknown, s=200) =>
    new Response(JSON.stringify(d,null,2),{status:s,headers:{'Content-Type':'application/json'}});

  if (act==='status') {
    const worker = await ensureWorkerRow();
    const { data:st } = await db.from('sync_worker_status').select('*').eq('id',1).single();
    const p = await pendencias();
    return res({worker:st ?? worker, p});
  }
  if (act==='reset') {
    await ensureWorkerRow();
    await db.from('sync_worker_status').update({em_execucao:false,erro_ultimo:'reset',rodadas_atual:0}).eq('id',1);
    return res({ok:true});
  }

  const worker = await ensureWorkerRow();
  if (worker.degraded) {
    log('warn', 'worker_status_degraded', { reason: worker.erro_ultimo });
  }

  // Teste de escrita imediato
  if (!worker.degraded) {
    const { error: we } = await db.from('sync_worker_status')
      .update({ versao: Number(worker.versao ?? 1) + 1 }).eq('id',1);
    if (we) {
      log('error','write_test_fail',{e:we.message});
      return res({ok:false,erro:'write_test: '+we.message},500);
    }
    log('info','write_test_ok',{});
  } else {
    log('warn','write_test_skip',{reason:worker.erro_ultimo});
  }

  const p = await pendencias();
  log('info','start',{total:p.total});
  if (p.total===0) return res({ok:true,msg:'idle',p});

  const lock = await adquirirLock();
  if (!lock) return res({ok:true,msg:'skip',p});

  let resumo: Record<string,unknown> = {};
  let err: string|undefined;
  try   { resumo = await loop(); }
  catch (e) { err=String(e); resumo={erro:err}; }
  finally { await liberarLock(resumo,err); }
  return res({ok:!err,resumo});
});
