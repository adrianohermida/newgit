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
const FS_ACCOUNT_REPAIR_BASE = `${SUPABASE_URL}/functions/v1/fs-account-repair`;
const PROCESS_AI_BASE = (Deno.env.get('PROCESS_AI_BASE') ?? '').trim();
const PROCESS_AI_SECRET = (Deno.env.get('HMDAV_AI_SHARED_SECRET') ?? '').trim();

const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: 'judiciario' } });

const MAX_RODADAS  = 5;
const LOCK_TIMEOUT = 8;
const LOTE_PUSH    = 20;
const LOTE_BATCH   = 20;
const LOTE_SYNC_BI = 10;
const LOTE_MOV_DJ  = 20;
const LOTE_PUBS    = 25;

const FS_OWNER_ID         = Number(Deno.env.get('FS_OWNER_ID') ?? '31000147944');
const FS_TYPE_CONSULTA    = Number(Deno.env.get('FRESHSALES_ACTIVITY_TYPE_CONSULTA') ?? '31001147694');
const FS_TYPE_ANDAMENTOS  = 31001147751;
const FS_TYPE_PUBLICACOES = 31001147699;
const FS_TYPE_AUDIENCIAS  = Number(Deno.env.get('FRESHSALES_ACTIVITY_TYPE_AUDIENCIA') ?? '31001147752');
const FS_MIN_INTERVAL_MS  = Number(Deno.env.get('FRESHSALES_MIN_INTERVAL_MS') ?? '4500');
let fsLastRequestAt = 0;

function log(n: 'info'|'warn'|'error', m: string, e: Record<string,unknown> = {}) {
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function fmtDataBr(value: string | Date | null | undefined): string {
  const d = value instanceof Date ? value : new Date(String(value ?? ''));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

function freshsalesDate(date: Date, kind: 'start' | 'end' = 'start'): string {
  const base = date.toISOString().split('T')[0];
  return kind === 'start'
    ? `${base}T09:00:00-03:00`
    : `${base}T18:00:00-03:00`;
}

function tituloAndamento(descricao: unknown): string {
  const raw = String(descricao ?? '').trim();
  return raw || 'Andamento';
}

function descricaoAndamento(m: Record<string, unknown>, dt: Date): string {
  const descricao = String(m.descricao ?? '').trim();
  const codigo = m.codigo != null && m.codigo !== '' ? `TPU: ${m.codigo}` : null;
  return [
    `Data: ${fmtDataBr(dt)}`,
    codigo,
    descricao || null,
  ].filter(Boolean).join('\n');
}

function textoPublicacao(p: Record<string, unknown>): string {
  return String(p.conteudo || p.despacho || '').trim();
}

function publicacaoDisponibilizacao(p: Record<string, unknown>): Date | null {
  const raw = (p.raw_payload ?? {}) as Record<string, unknown>;
  const value = raw.dataHoraMovimento ?? raw.dataDisponibilizacao ?? raw.dataDisponibilizacaoPublicacao ?? p.data_publicacao ?? null;
  if (!value) return null;
  const dt = new Date(String(value));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function publicacaoDataPublicacao(p: Record<string, unknown>): Date | null {
  const value = p.data_publicacao ?? null;
  if (!value) return null;
  const dt = new Date(String(value));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function tituloPublicacao(p: Record<string, unknown>, dtDisponibilizacao: Date): string {
  return `Publicação disponibilizada em ${fmtDataBr(dtDisponibilizacao)}`;
}

function descricaoPublicacao(p: Record<string, unknown>, dtDisponibilizacao: Date, dtPublicacao: Date | null): string {
  const header = [
    `Diário: ${p.nome_diario ?? ''}`,
    `Disponibilização: ${fmtDataBr(dtDisponibilizacao)}`,
    `Publicação: ${fmtDataBr(dtPublicacao)}`,
    `Comarca: ${p.cidade_comarca_descricao ?? ''}`,
    `Vara: ${p.vara_descricao ?? ''}`,
  ].join('\n');
  const conteudo = textoPublicacao(p);
  return [header, conteudo].filter(Boolean).join('\n\n').slice(0, 65000);
}

function normalizarKeyword(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function publicacaoNegativaPorKeyword(p: Record<string, unknown>): boolean {
  try {
    const raw = (p.raw_payload ?? {}) as Record<string, unknown>;
    const keywordsRaw = raw.palavrasChave;
    const keywords = Array.isArray(keywordsRaw) ? keywordsRaw : [];
    return keywords
      .map((keyword) => normalizarKeyword(keyword))
      .some((keyword) => keyword === 'LEILAO' || keyword === 'LEILOES');
  } catch {
    return false;
  }
}

function firstDefined(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return null;
}

function audienciaDate(row: Record<string, unknown>): Date | null {
  const raw = firstDefined(row, [
    'data_audiencia',
    'data',
    'data_evento',
    'data_inicio',
    'inicio',
    'scheduled_at',
    'starts_at',
  ]);
  if (!raw) return null;
  const dt = new Date(String(raw));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function audienciaTitulo(row: Record<string, unknown>, dt: Date): string {
  const raw = firstDefined(row, ['titulo', 'title', 'tipo', 'nome', 'assunto']);
  const title = String(raw ?? '').trim();
  return title || `AudiÃªncia em ${fmtDataBr(dt)}`;
}

function audienciaDescricao(row: Record<string, unknown>): string {
  const raw = firstDefined(row, ['descricao', 'description', 'observacao', 'observacoes', 'detalhes', 'notes']);
  return String(raw ?? '').trim();
}

function audienciaProcessoId(row: Record<string, unknown>): string {
  return String(firstDefined(row, ['processo_id', 'processoId']) ?? '').trim();
}

function audienciaFreshsalesId(row: Record<string, unknown>): string {
  return String(firstDefined(row, ['freshsales_activity_id', 'freshsalesActivityId']) ?? '').trim();
}

async function listarAudienciasPendentes(limite = 10): Promise<{ rows: Record<string, unknown>[]; erro?: string }> {
  try {
    const qs = new URLSearchParams({
      select: '*',
      limit: String(limite),
      freshsales_activity_id: 'is.null',
    });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/audiencias?${qs.toString()}`, {
      headers: restHeaders(),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await r.json().catch(() => []);
    if (!r.ok) {
      const erro = typeof data === 'object' && data && 'message' in data
        ? String((data as Record<string, unknown>).message ?? `http ${r.status}`)
        : `http ${r.status}`;
      return { rows: [], erro };
    }
    const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [];
    rows.sort((a, b) => {
      const da = audienciaDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const db = audienciaDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return da - db;
    });
    return { rows };
  } catch (e) {
    return { rows: [], erro: String(e) };
  }
}

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
    const now = Date.now();
    const wait = Math.max(0, fsLastRequestAt + FS_MIN_INTERVAL_MS - now);
    if (wait > 0) await sleep(wait);
    fsLastRequestAt = Date.now();
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
      method: 'POST',
      headers: {
        apikey: SVC_KEY,
        'Content-Type':'application/json',
        Authorization:`Bearer ${SVC_KEY}`,
      },
      body: '{}', signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) { log('warn','sync_http',{action,s:r.status}); return {ok:false,status:r.status}; }
    return r.json();
  } catch(e) { log('warn','sync_exc',{action,e:String(e)}); return {ok:false,erro:String(e)}; }
}

async function chamarFsAccountRepair(limit: number, offset = 0): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ action: 'batch', limit: String(limit), offset: String(offset) });
  try {
    const r = await fetch(`${FS_ACCOUNT_REPAIR_BASE}?${qs}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${SVC_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) {
      log('warn', 'fs_account_repair_http', { status: r.status });
      return { ok: false, status: r.status };
    }
    return await r.json();
  } catch (e) {
    log('warn', 'fs_account_repair_exc', { erro: String(e) });
    return { ok: false, erro: String(e) };
  }
}

async function repararAccountProcesso(processoId: string): Promise<boolean> {
  try {
    const r = await fetch(`${FS_ACCOUNT_REPAIR_BASE}?processo_id=${encodeURIComponent(processoId)}`, {
      method: 'GET',
      headers: {
        apikey: SVC_KEY,
        Authorization: `Bearer ${SVC_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(45_000),
    });
    if (!r.ok) {
      log('warn', 'fs_account_repair_process_http', { processoId, status: r.status });
      return false;
    }
    const data = await r.json().catch(() => ({}));
    return Boolean((data as Record<string, unknown>).ok);
  } catch (e) {
    log('warn', 'fs_account_repair_process_exc', { processoId, erro: String(e) });
    return false;
  }
}

async function registrarConsultaEvento(accountId: string, title: string, notes: string, eventAt = new Date()): Promise<void> {
  const toD = (d: Date) => d.toISOString().split('T')[0];
  const df = new Date(eventAt);
  df.setDate(eventAt.getDate() + 1);
  try {
    const { status } = await fsPost('sales_activities', {
      sales_activity: {
        targetable_type: 'SalesAccount',
        targetable_id: Number(accountId),
        owner_id: FS_OWNER_ID,
        sales_activity_type_id: FS_TYPE_CONSULTA,
        title,
        start_date: freshsalesDate(eventAt, 'start'),
        end_date: freshsalesDate(df, 'end'),
        notes: notes.slice(0, 65000),
      },
    });
    log(status === 200 || status === 201 ? 'info' : 'warn', 'consulta_evt', { accountId, title, status });
  } catch (e) {
    log('warn', 'consulta_evt_exc', { accountId, title, erro: String(e) });
  }
}

async function criarAppointmentAudiencia(accountId: string, title: string, description: string, startAt: Date): Promise<{ ok: boolean; id?: string }> {
  const endAt = new Date(startAt);
  endAt.setHours(endAt.getHours() + 1);
  try {
    const { status, data } = await fsPost('appointments', {
      appointment: {
        title,
        description,
        owner_id: FS_OWNER_ID,
        targetable_type: 'SalesAccount',
        targetable_id: Number(accountId),
        from_date: startAt.toISOString(),
        end_date: endAt.toISOString(),
      },
    });
    const id = String(((data as Record<string, Record<string, unknown>>).appointment?.id) ?? '');
    return { ok: status === 200 || status === 201, id: id || undefined };
  } catch (e) {
    log('warn', 'appointment_exc', { accountId, title, erro: String(e) });
    return { ok: false };
  }
}

async function chamarProcessAiReconcile(processoId: string): Promise<boolean> {
  if (!PROCESS_AI_BASE || !PROCESS_AI_SECRET) return false;
  try {
    const r = await fetch(`${PROCESS_AI_BASE.replace(/\/$/, '')}/reconcile/process`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PROCESS_AI_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ processo_id: processoId }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) {
      log('warn', 'process_ai_reconcile', { processoId, status: r.status });
      return false;
    }
    return true;
  } catch (e) {
    log('warn', 'process_ai_reconcile_err', { processoId, erro: String(e) });
    return false;
  }
}

async function tentarMarcarAudienciaSync(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await db.from('audiencias').update(payload).eq('id', id);
  if (error) log('warn', 'audiencia_sync_update', { id, erro: error.message });
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
          targetable_type: 'SalesAccount',
          targetable_id: Number(aid),
          owner_id: FS_OWNER_ID,
          sales_activity_type_id: FS_TYPE_ANDAMENTOS,
          title: tituloAndamento(m.descricao),
          start_date: freshsalesDate(dt, 'start'),
          end_date: freshsalesDate(df, 'end'),
          notes: descricaoAndamento(m as Record<string, unknown>, dt),
        },
      });
        if (status===200||status===201) {
          const id = String(((ad as Record<string,Record<string,unknown>>).sales_activity?.id)??'');
          if (id) {
            await db.from('movimentos').update({freshsales_activity_id:id}).eq('id',m.id);
            await registrarConsultaEvento(
              aid,
              `Novo andamento sincronizado - ${tituloAndamento(m.descricao)}`,
              [
                'Novo andamento sincronizado com sucesso.',
                `Data: ${fmtDataBr(dt)}`,
                m.codigo != null ? `TPU: ${m.codigo}` : null,
                String(m.descricao ?? '').trim() || null,
              ].filter(Boolean).join('\n'),
              dt,
            );
            await repararAccountProcesso(m.processo_id);
            await chamarProcessAiReconcile(m.processo_id);
            ok++;
        }
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
    .is('freshsales_activity_id', null).not('processo_id', 'is', null)
    .order('data_publicacao', { ascending: false }).limit(limite);
  if (!pubs?.length) return { e: 0, l: 0 };
  const leiloes = pubs.filter((p) => publicacaoNegativaPorKeyword(p as Record<string, unknown>));
  for (const p of leiloes) await db.from('publicacoes').update({ freshsales_activity_id: 'LEILAO_IGNORADO' }).eq('id', p.id);
  const validas = pubs.filter((p) => !publicacaoNegativaPorKeyword(p as Record<string, unknown>));
  const pids = [...new Set(validas.map((p) => p.processo_id))];
  const { data: procs } = await db.from('processos').select('id,account_id_freshsales').in('id', pids);
  const acc = new Map<string, string>();
  for (const p of procs ?? []) if (p.account_id_freshsales) acc.set(p.id, p.account_id_freshsales);
  let env = 0;
  for (const p of validas) {
    const aid = acc.get(p.processo_id); if (!aid) continue;
    try {
      const dtPub = publicacaoDataPublicacao(p as Record<string, unknown>) ?? new Date();
      const dtDisp = publicacaoDisponibilizacao(p as Record<string, unknown>) ?? dtPub;
      const { status, data: ad } = await fsPost('sales_activities', {
        sales_activity: {
          targetable_type: 'SalesAccount',
          targetable_id: Number(aid),
          owner_id: FS_OWNER_ID,
          sales_activity_type_id: FS_TYPE_PUBLICACOES,
          title: tituloPublicacao(p as Record<string, unknown>, dtDisp),
          start_date: freshsalesDate(dtDisp, 'start'),
          end_date: freshsalesDate(dtPub, 'end'),
          notes: descricaoPublicacao(p as Record<string, unknown>, dtDisp, dtPub),
        },
      });
        if (status === 200 || status === 201) {
          const id = String(((ad as Record<string, Record<string, unknown>>).sales_activity?.id) ?? '');
          if (id) {
            await db.from('publicacoes').update({ freshsales_activity_id: id }).eq('id', p.id);
            await registrarConsultaEvento(
              aid,
              tituloPublicacao(p as Record<string, unknown>, dtDisp),
              [
                'Nova publicação sincronizada com sucesso.',
                `Diário: ${p.nome_diario ?? ''}`,
                `Disponibilização: ${fmtDataBr(dtDisp)}`,
                `Publicação: ${fmtDataBr(dtPub)}`,
                `Comarca: ${p.cidade_comarca_descricao ?? ''}`,
                `Vara: ${p.vara_descricao ?? ''}`,
              ].join('\n'),
              dtDisp,
            );
            await repararAccountProcesso(p.processo_id);
            await chamarProcessAiReconcile(p.processo_id);
            env++;
        }
      } else if (status === 429) await sleep(3000);
    } catch (e) { log('warn', 'pubE', { id: p.id, e: String(e) }); }
    await sleep(100);
  }
  log('info', 'loteE', { v: validas.length, env, l: leiloes.length });
  return { e: env, l: leiloes.length };
}

async function loteDProcesso(processoId: string, limite = 200): Promise<{ enviados: number; total: number }> {
  const toD = (d: Date) => d.toISOString().split('T')[0];
  const { data: movs } = await db.from('movimentos')
    .select('id,processo_id,codigo,descricao,data_movimento')
    .eq('processo_id', processoId)
    .is('freshsales_activity_id', null)
    .order('data_movimento', { ascending: false })
    .limit(limite);
  if (!movs?.length) return { enviados: 0, total: 0 };
  const { data: proc } = await db.from('processos').select('account_id_freshsales').eq('id', processoId).maybeSingle();
  const aid = String(proc?.account_id_freshsales ?? '');
  if (!aid) return { enviados: 0, total: movs.length };
  let ok = 0;
  for (const m of movs) {
    try {
      const dt = m.data_movimento ? new Date(m.data_movimento) : new Date();
      const df = new Date(dt); df.setDate(dt.getDate() + 1);
      const { status, data: ad } = await fsPost('sales_activities', {
        sales_activity: {
          targetable_type: 'SalesAccount',
          targetable_id: Number(aid),
          owner_id: FS_OWNER_ID,
          sales_activity_type_id: FS_TYPE_ANDAMENTOS,
          title: tituloAndamento(m.descricao),
          start_date: freshsalesDate(dt, 'start'),
          end_date: freshsalesDate(df, 'end'),
          notes: descricaoAndamento(m as Record<string, unknown>, dt),
        },
      });
        if (status === 200 || status === 201) {
          const id = String(((ad as Record<string, Record<string, unknown>>).sales_activity?.id) ?? '');
          if (id) {
            await db.from('movimentos').update({ freshsales_activity_id: id }).eq('id', m.id);
            await registrarConsultaEvento(
              aid,
              `Novo andamento sincronizado - ${tituloAndamento(m.descricao)}`,
              [
                'Novo andamento sincronizado com sucesso.',
                `Data: ${fmtDataBr(dt)}`,
                m.codigo != null ? `TPU: ${m.codigo}` : null,
                String(m.descricao ?? '').trim() || null,
              ].filter(Boolean).join('\n'),
              dt,
            );
            await repararAccountProcesso(m.processo_id);
            await chamarProcessAiReconcile(m.processo_id);
            ok++;
        }
      }
    } catch (e) { log('warn', 'movD_proc', { id: m.id, e: String(e) }); }
    await sleep(80);
  }
  return { enviados: ok, total: movs.length };
}

async function loteEProcesso(processoId: string, limite = 100): Promise<{ enviados: number; leiloes: number; total: number }> {
  const toD = (d: Date) => d.toISOString().split('T')[0];
  const { data: pubs } = await db.from('publicacoes')
    .select('id,processo_id,data_publicacao,nome_diario,cidade_comarca_descricao,vara_descricao,despacho,conteudo,raw_payload')
    .eq('processo_id', processoId)
    .is('freshsales_activity_id', null)
    .order('data_publicacao', { ascending: false })
    .limit(limite);
  if (!pubs?.length) return { enviados: 0, leiloes: 0, total: 0 };
  const { data: proc } = await db.from('processos').select('account_id_freshsales').eq('id', processoId).maybeSingle();
  const aid = String(proc?.account_id_freshsales ?? '');
  if (!aid) return { enviados: 0, leiloes: 0, total: pubs.length };
  const leiloes = pubs.filter((p) => publicacaoNegativaPorKeyword(p as Record<string, unknown>));
  for (const p of leiloes) await db.from('publicacoes').update({ freshsales_activity_id: 'LEILAO_IGNORADO' }).eq('id', p.id);
  const validas = pubs.filter((p) => !publicacaoNegativaPorKeyword(p as Record<string, unknown>));
  let env = 0;
  for (const p of validas) {
    try {
      const dtPub = publicacaoDataPublicacao(p as Record<string, unknown>) ?? new Date();
      const dtDisp = publicacaoDisponibilizacao(p as Record<string, unknown>) ?? dtPub;
      const { status, data: ad } = await fsPost('sales_activities', {
        sales_activity: {
          targetable_type: 'SalesAccount',
          targetable_id: Number(aid),
          owner_id: FS_OWNER_ID,
          sales_activity_type_id: FS_TYPE_PUBLICACOES,
          title: tituloPublicacao(p as Record<string, unknown>, dtDisp),
          start_date: freshsalesDate(dtDisp, 'start'),
          end_date: freshsalesDate(dtPub, 'end'),
          notes: descricaoPublicacao(p as Record<string, unknown>, dtDisp, dtPub),
        },
      });
        if (status === 200 || status === 201) {
          const id = String(((ad as Record<string, Record<string, unknown>>).sales_activity?.id) ?? '');
          if (id) {
            await db.from('publicacoes').update({ freshsales_activity_id: id }).eq('id', p.id);
            await registrarConsultaEvento(
              aid,
              tituloPublicacao(p as Record<string, unknown>, dtDisp),
              [
                'Nova publicação sincronizada com sucesso.',
                `Diário: ${p.nome_diario ?? ''}`,
                `Disponibilização: ${fmtDataBr(dtDisp)}`,
                `Publicação: ${fmtDataBr(dtPub)}`,
                `Comarca: ${p.cidade_comarca_descricao ?? ''}`,
                `Vara: ${p.vara_descricao ?? ''}`,
              ].join('\n'),
              dtDisp,
            );
            await repararAccountProcesso(p.processo_id);
            await chamarProcessAiReconcile(p.processo_id);
            env++;
        }
      }
    } catch (e) { log('warn', 'pubE_proc', { id: p.id, e: String(e) }); }
    await sleep(80);
  }
  return { enviados: env, leiloes: leiloes.length, total: pubs.length };
}

async function loteAudiencias(limite = 10): Promise<{ enviados: number; reunioes: number; total: number }> {
  try {
    const { rows: auds, erro } = await listarAudienciasPendentes(limite);
    if (erro) {
      log('warn', 'audiencias_select', { erro });
      return { enviados: 0, reunioes: 0, total: 0 };
    }
    if (!auds?.length) return { enviados: 0, reunioes: 0, total: 0 };
    const pids = [...new Set(auds.map((a) => audienciaProcessoId(a)).filter(Boolean))];
    const { data: procs } = await db.from('processos').select('id,account_id_freshsales,numero_cnj').in('id', pids);
    const procMap = new Map<string, { account: string; cnj: string }>();
    for (const p of procs ?? []) {
      if (p.account_id_freshsales) procMap.set(p.id, { account: String(p.account_id_freshsales), cnj: String(p.numero_cnj ?? '') });
    }
    let enviados = 0;
    let reunioes = 0;
    for (const aud of auds) {
      const proc = procMap.get(aud.processo_id);
      if (!proc) continue;
      const dt = aud.data_audiencia ? new Date(aud.data_audiencia) : null;
      if (!dt || Number.isNaN(dt.getTime())) continue;
      const df = new Date(dt);
      df.setHours(df.getHours() + 1);
      const title = String(aud.titulo ?? `Audiência em ${fmtDataBr(dt)}`);
      const notes = [
        'Nova audiência sincronizada com sucesso.',
        `Data: ${fmtDataBr(dt)}`,
        aud.descricao ? String(aud.descricao) : null,
      ].filter(Boolean).join('\n');
      const { status, data } = await fsPost('sales_activities', {
        sales_activity: {
          targetable_type: 'SalesAccount',
          targetable_id: Number(proc.account),
          owner_id: FS_OWNER_ID,
          sales_activity_type_id: FS_TYPE_AUDIENCIAS,
          title,
          start_date: dt.toISOString(),
          end_date: df.toISOString(),
          notes,
        },
      });
      if (status === 200 || status === 201) {
        const activityId = String(((data as Record<string, Record<string, unknown>>).sales_activity?.id) ?? '');
        if (activityId) {
          await tentarMarcarAudienciaSync(aud.id, { freshsales_activity_id: activityId });
          await registrarConsultaEvento(proc.account, `Nova audiência identificada - ${title}`, notes, dt);
          if (dt.getTime() > Date.now()) {
            const appointment = await criarAppointmentAudiencia(proc.account, title, notes, dt);
            if (appointment.ok) reunioes++;
          }
          await repararAccountProcesso(aud.processo_id);
          await chamarProcessAiReconcile(aud.processo_id);
          enviados++;
        }
      }
      await sleep(80);
    }
    return { enviados, reunioes, total: auds.length };
  } catch (e) {
    log('warn', 'loteAudiencias_exc', { erro: String(e) });
    return { enviados: 0, reunioes: 0, total: 0 };
  }
}

async function loteAudienciasCompat(limite = 10): Promise<{ enviados: number; reunioes: number; total: number }> {
  try {
    const { rows: auds, erro } = await listarAudienciasPendentes(limite);
    if (erro) {
      log('warn', 'audiencias_select_compat', { erro });
      return { enviados: 0, reunioes: 0, total: 0 };
    }
    if (!auds?.length) return { enviados: 0, reunioes: 0, total: 0 };
    const pids = [...new Set(auds.map((a) => audienciaProcessoId(a)).filter(Boolean))];
    const { data: procs } = await db.from('processos').select('id,account_id_freshsales,numero_cnj').in('id', pids);
    const procMap = new Map<string, { account: string; cnj: string }>();
    for (const p of procs ?? []) {
      if (p.account_id_freshsales) procMap.set(p.id, { account: String(p.account_id_freshsales), cnj: String(p.numero_cnj ?? '') });
    }
    let enviados = 0;
    let reunioes = 0;
    for (const aud of auds) {
      const procId = audienciaProcessoId(aud);
      const proc = procMap.get(procId);
      if (!proc) continue;
      if (audienciaFreshsalesId(aud)) continue;
      const dt = audienciaDate(aud);
      if (!dt) continue;
      const df = new Date(dt);
      df.setHours(df.getHours() + 1);
      const title = audienciaTitulo(aud, dt);
      const descricao = audienciaDescricao(aud);
      const notes = [
        'Nova audiÃªncia sincronizada com sucesso.',
        `Data: ${fmtDataBr(dt)}`,
        descricao || null,
      ].filter(Boolean).join('\n');
      const { status, data } = await fsPost('sales_activities', {
        sales_activity: {
          targetable_type: 'SalesAccount',
          targetable_id: Number(proc.account),
          owner_id: FS_OWNER_ID,
          sales_activity_type_id: FS_TYPE_AUDIENCIAS,
          title,
          start_date: freshsalesDate(dt, 'start'),
          end_date: freshsalesDate(df, 'end'),
          notes,
        },
      });
      if (status === 200 || status === 201) {
        const activityId = String(((data as Record<string, Record<string, unknown>>).sales_activity?.id) ?? '');
        if (activityId) {
          await tentarMarcarAudienciaSync(String(aud.id ?? ''), { freshsales_activity_id: activityId });
          await registrarConsultaEvento(proc.account, `Nova audiÃªncia identificada - ${title}`, notes, dt);
          if (dt.getTime() > Date.now()) {
            const appointment = await criarAppointmentAudiencia(proc.account, title, notes, dt);
            if (appointment.ok) reunioes++;
          }
          await repararAccountProcesso(procId);
          await chamarProcessAiReconcile(procId);
          enviados++;
        }
      }
      await sleep(80);
    }
    return { enviados, reunioes, total: auds.length };
  } catch (e) {
    log('warn', 'loteAudiencias_compat_exc', { erro: String(e) });
    return { enviados: 0, reunioes: 0, total: 0 };
  }
}

// --- Loop ---
async function loop(): Promise<Record<string,unknown>> {
  const g = { r:0,accounts_reparadas:0,criadas:0,movs_advise:0,andamentos_dj:0,publicacoes:0,audiencias:0,reunioes:0,leilao:0,sync_sb:0,sync_fs:0,pend0:0,pendN:0,motivo:'' };
  const p0 = await pendencias(); g.pend0 = p0.total;
  let prev = -1;
  for (let r=1;r<=MAX_RODADAS;r++) {
    g.r=r;
    await db.from('sync_worker_status').update({rodadas_atual:r,ultimo_lote:g}).eq('id',1);
    const p = await pendencias(); g.pendN=p.total;
    if (p.total===0) { g.motivo='zero'; break; }
    // A: reparar Sales Accounts com campos críticos antes do restante do fluxo
    const repair = await chamarFsAccountRepair(5, (r - 1) * 5);
    g.accounts_reparadas += Number((repair as Record<string, unknown>).ok_count ?? 0);
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
    // E2: audiencias
    const aud = await loteAudienciasCompat(10);
    g.audiencias += aud.enviados;
    g.reunioes += aud.reunioes;
    // F: datajud-worker
    const p5 = await pendencias();
    if (p5.fila_dj>0) {
      fetch(`${SUPABASE_URL}/functions/v1/datajud-worker`,{
        method:'POST',
        headers:{
          apikey:SVC_KEY,
          Authorization:`Bearer ${SVC_KEY}`,
          'Content-Type':'application/json',
        },
        body:'{}',signal:AbortSignal.timeout(3_000),
      }).catch(()=>{});
    }
    const prog = g.accounts_reparadas+g.criadas+g.movs_advise+g.andamentos_dj+g.publicacoes+g.sync_sb+g.sync_fs;
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

  if (act === 'repair_process') {
    const url = new URL(req.url);
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const processoId = String((body as Record<string, unknown>).processo_id ?? url.searchParams.get('processo_id') ?? '');
    if (!processoId) return res({ ok: false, erro: 'processo_id obrigatorio' }, 400);
    const loted = await loteDProcesso(processoId, 300);
    const lotee = await loteEProcesso(processoId, 100);
    return res({
      ok: true,
      modo: 'repair_process',
      processo_id: processoId,
      movimentos: loted,
      publicacoes: lotee,
    });
  }

  if (act === 'repair_accounts') {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get('limit') ?? '10');
    const offset = Number(url.searchParams.get('offset') ?? '0');
    const repair = await chamarFsAccountRepair(limit, offset);
    return res({ ok: true, modo: 'repair_accounts', ...repair });
  }

  if (act === 'inspect_audiencias') {
    const limit = Number(new URL(req.url).searchParams.get('limit') ?? '5');
    const out = await listarAudienciasPendentes(limit);
    const sample = out.rows.slice(0, limit).map((row) => ({
      keys: Object.keys(row).sort(),
      id: row.id ?? null,
      processo_id: audienciaProcessoId(row) || null,
      data_resolvida: audienciaDate(row)?.toISOString() ?? null,
      titulo_resolvido: audienciaTitulo(row, audienciaDate(row) ?? new Date()),
      descricao_resolvida: audienciaDescricao(row) || null,
      freshsales_activity_id: audienciaFreshsalesId(row) || null,
      raw: row,
    }));
    return res({ ok: !out.erro, erro: out.erro ?? null, total: out.rows.length, sample });
  }

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



