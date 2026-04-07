/**
 * fs-exec  v1
 * Executor de pipeline — pode ser chamado diretamente pelo browser.
 * Usa as secrets do próprio ambiente Deno.
 * 
 * GET /fs-exec?action=status
 * GET /fs-exec?action=resolver_accounts&limite=100
 * GET /fs-exec?action=sync_campos&limite=500  
 * GET /fs-exec?action=sync_publicacoes&batch=25
 * GET /fs-exec?action=sync_andamentos&limite=200
 * GET /fs-exec?action=pipeline_completo
 * GET /fs-exec?action=reset_publicacoes  (zera freshsales_activity_id para reenviar)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return undefined;
}

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_DOMAIN            = Deno.env.get('FRESHSALES_DOMAIN')!;
const FS_API_KEY           = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_ACTIVITY_TYPE_ID  = Number(envFirst(
  'FRESHSALES_PUBLICACAO_ACTIVITY_TYPE_ID',
  'FRESHSALES_PUBLICACOES_ACTIVITY_TYPE_ID',
  'FRESHSALES_ACTIVITY_TYPE_PUBLICACAO_ID',
  'FRESHSALES_SALES_ACTIVITY_TYPE_PUBLICACAO_ID',
  'FRESHSALES_DEFAULT_ACTIVITY_TYPE_ID',
  'FS_ACTIVITY_TYPE_ID',
) ?? '31005023082');
const FS_OWNER_ID          = Number(envFirst(
  'FRESHSALES_OWNER_ID',
  'FS_OWNER_ID',
) ?? '31000147944');

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema: 'judiciario' } });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set((values ?? []).map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function normalizeProcessNumber(value: string | null | undefined): string {
  return String(value ?? '').replace(/[^0-9]/g, '');
}

function splitProcessNumbers(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueStrings(value);
  return uniqueStrings(
    String(value ?? '')
      .split(/\r?\n|,|;/)
      .map((item) => item.trim()),
  );
}

function log(n: 'info'|'warn'|'error', m: string, e: Record<string,unknown> = {}) {
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
}

function authHdr(): string {
  const k = (FS_API_KEY ?? '').trim();
  return (k.startsWith('Token ') || k.startsWith('Bearer ')) ? k : `Token token=${k}`;
}

async function fsReq(method: 'GET'|'POST'|'PUT', path: string, body?: unknown): Promise<{status: number; data: unknown}> {
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(`https://${FS_DOMAIN}/crm/sales/api/${path}`, {
        method,
        headers: { Authorization: authHdr(), 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(12000),
      });
      const data = await r.json().catch(() => ({}));
      if ((r.status === 429 || r.status >= 500) && i < 3) { await sleep(1500 * i); continue; }
      return { status: r.status, data };
    } catch (e) {
      if (i === 3) throw e;
      await sleep(1000 * i);
    }
  }
  throw new Error('fsReq retries esgotados');
}

const fsGet  = (p: string)          => fsReq('GET',  p);
const fsPost = (p: string, b: unknown) => fsReq('POST', p, b);
const fsPut  = (p: string, b: unknown) => fsReq('PUT',  p, b);

function normCNJ(r: string): string | null {
  const d = (r ?? '').replace(/[^0-9]/g, '');
  return d.length === 20 ? d : null;
}
function fmt(cnj: string): string {
  return `${cnj.slice(0,7)}-${cnj.slice(7,9)}.${cnj.slice(9,13)}.${cnj.slice(13,14)}.${cnj.slice(14,16)}.${cnj.slice(16)}`;
}

async function resolverAccount(cnj20: string): Promise<string | null> {
  const cnjFmt = fmt(cnj20);
  // A. Busca textual
  try {
    const { status, data } = await fsGet(`search?q=${encodeURIComponent(cnjFmt)}&include=sales_account`);
    if (status === 200) {
      const list = Array.isArray(data) ? data as Record<string,unknown>[] : [];
      for (const r of list) {
        if (String(r.type ?? '').includes('account') || r.sales_account) {
          const id = String(r.id ?? '');
          if (id && id !== 'undefined' && id !== 'null') return id;
        }
      }
    }
  } catch {}
  // B. filtered_search
  for (const [field, value] of [
    ['cf_numero_cnj', cnj20], ['cf_numero_cnj', cnjFmt],
    ['cf_numero_processo', cnj20], ['cf_numero_processo', cnjFmt],
    ['name', cnjFmt],
  ] as [string,string][]) {
    try {
      const { status, data } = await fsPost('filtered_search/sales_account', {
        filter_rule: [{ attribute: field, operator: 'is_in', value }],
      });
      if (status === 200) {
        const list = ((data as Record<string,unknown>).sales_accounts ?? []) as Record<string,unknown>[];
        if (list.length > 0) return String(list[0].id);
      }
    } catch {}
    await sleep(100);
  }
  return null;
}

// ── STATUS ────────────────────────────────────────────────────────────────────
async function getStatus() {
  const [r1,r2,r3,r4,r5,r6,r7] = await Promise.all([
    db.from('publicacoes').select('*',{count:'exact',head:true}).is('processo_id',null),
    db.from('publicacoes').select('*',{count:'exact',head:true}).not('processo_id','is',null).is('freshsales_activity_id',null),
    db.from('publicacoes').select('*',{count:'exact',head:true}).not('freshsales_activity_id','is',null),
    db.from('processos').select('*',{count:'exact',head:true}).is('account_id_freshsales',null),
    db.from('processos').select('*',{count:'exact',head:true}).not('account_id_freshsales','is',null),
    db.from('movimentacoes').select('*',{count:'exact',head:true}).is('freshsales_activity_id',null),
    db.from('movimentacoes').select('*',{count:'exact',head:true}).not('freshsales_activity_id','is',null),
  ]);
  return {
    secrets_ok: !!(FS_DOMAIN && FS_API_KEY && SUPABASE_SERVICE_KEY),
    fs_domain: FS_DOMAIN,
    publicacoes:   { sem_processo: r1.count??0, pendentes_fs: r2.count??0, enviadas_fs: r3.count??0 },
    processos:     { sem_account: r4.count??0, com_account: r5.count??0 },
    movimentacoes: { pendentes_fs: r6.count??0, enviadas_fs: r7.count??0 },
  };
}

// ── PASSO 2: RESOLVER ACCOUNTS ────────────────────────────────────────────────
async function resolverAccounts(limite: number) {
  const { data: procs } = await db.from('processos')
    .select('id,numero_cnj,numero_processo')
    .is('account_id_freshsales', null).limit(limite);
  if (!procs?.length) return { ok: true, total: 0, msg: 'Todos resolvidos' };

  let resolvidos = 0, nao_encontrados = 0, erros = 0;
  const encontrados: string[] = [];

  for (const proc of procs) {
    const cnj20 = normCNJ(proc.numero_cnj ?? proc.numero_processo ?? '');
    if (!cnj20) { erros++; continue; }
    try {
      const aid = await resolverAccount(cnj20);
      if (aid) {
        await db.from('processos').update({ account_id_freshsales: aid }).eq('id', proc.id);
        resolvidos++;
        encontrados.push(`${cnj20}→${aid}`);
        log('info', 'account_ok', { cnj: cnj20, aid });
      } else {
        nao_encontrados++;
        log('warn', 'account_nao_encontrado', { cnj: cnj20 });
      }
    } catch (e) { erros++; log('error', 'account_err', { erro: String(e) }); }
    await sleep(150);
  }
  return { ok: true, total: procs.length, resolvidos, nao_encontrados, erros, encontrados };
}

// ── PASSO 3: SYNC CAMPOS ──────────────────────────────────────────────────────
async function syncCampos(limite: number) {
  const { data: procs } = await db.from('processos')
    .select('id,numero_cnj,classe,tribunal,comarca,assunto_principal,polo_ativo,polo_passivo,'+
            'valor_causa,data_ajuizamento,status_atual_processo,segredo_justica,orgao_julgador,account_id_freshsales')
    .not('account_id_freshsales', 'is', null).limit(limite);
  if (!procs?.length) return { ok: true, total: 0, msg: 'Nenhum processo com account_id' };

  let atualizados = 0, erros = 0;
  for (const p of procs) {
    const cf: Record<string,unknown> = {};
    if (p.numero_cnj)            cf.cf_numero_cnj              = fmt(p.numero_cnj);
    if (p.tribunal)              cf.cf_tribunal                = p.tribunal;
    if (p.classe)                cf.cf_acao                    = p.classe;
    if (p.comarca)               cf.cf_comarca                 = p.comarca;
    if (p.assunto_principal)     cf.cf_assunto                 = p.assunto_principal;
    if (p.polo_ativo)            cf.cf_polo_ativo              = p.polo_ativo;
    if (p.polo_passivo)          cf.cf_parte_adversa           = p.polo_passivo;
    if (p.valor_causa)           cf.cf_valor_causa             = p.valor_causa;
    if (p.data_ajuizamento)      cf.cf_data_de_distribuio      = p.data_ajuizamento;
    if (p.status_atual_processo) cf.cf_status                  = p.status_atual_processo;
    if (p.orgao_julgador)        cf.cf_orgao_julgador          = p.orgao_julgador;
    if (p.segredo_justica!=null) cf.cf_segredo_justica         = p.segredo_justica;
    cf.cf_ultima_atualizacao_judicial = new Date().toISOString();
    try {
      const { status } = await fsPut(`sales_accounts/${p.account_id_freshsales}`, { sales_account: { custom_field: cf } });
      if (status === 200) atualizados++; else erros++;
    } catch { erros++; }
    await sleep(80);
  }
  return { ok: true, total: procs.length, atualizados, erros };
}

// ── PASSO 4: SYNC PUBLICACOES ─────────────────────────────────────────────────
function buildNotes(pub: Record<string,unknown>): string {
  const dt = pub.data_publicacao ? new Date(String(pub.data_publicacao)).toISOString().split('T')[0] : '';
  return [
    '=== PUBLICAÇÃO DJ ===',
    `Diário: ${pub.nome_diario??''}`,
    `Processo: ${pub.numero_processo_api??''}`,
    `Publicação em: ${dt}`,
    `Comarca: ${pub.cidade_comarca_descricao??''}`,
    `Vara: ${pub.vara_descricao??''}`,
    `Caderno: ${pub.nome_caderno_diario??''}`,
    `Páginas: ${pub.pagina_inicial_publicacao??''}-${pub.pagina_final_publicacao??''}`,
    '',
    String(pub.despacho || pub.conteudo || 'Sem conteúdo.'),
  ].join('\n');
}

async function syncPublicacoes(batch: number) {
  const { data: pubs } = await db.from('publicacoes')
    .select('id,numero_processo_api,processo_id,data_publicacao,nome_diario,'+
            'cidade_comarca_descricao,vara_descricao,nome_caderno_diario,'+
            'pagina_inicial_publicacao,pagina_final_publicacao,despacho,conteudo')
    .is('freshsales_activity_id', null)
    .not('processo_id', 'is', null)
    .order('data_publicacao', { ascending: false })
    .limit(batch);

  if (!pubs?.length) return { ok: true, total: 0, msg: 'Nenhuma publicação pendente' };

  const procIds = [...new Set(pubs.map(p => p.processo_id))];
  const { data: procs } = await db.from('processos').select('id,account_id_freshsales').in('id', procIds);
  const accMap = new Map<string,string>();
  for (const p of procs ?? []) if (p.account_id_freshsales) accMap.set(p.id, p.account_id_freshsales);

  let enviados = 0, sem_account = 0, erros = 0;
  const isoDate = (d: Date) => d.toISOString().split('T')[0];

  for (const pub of pubs) {
    const aid = accMap.get(pub.processo_id);
    if (!aid) { sem_account++; continue; }
    try {
      const dtBase = pub.data_publicacao ? new Date(String(pub.data_publicacao)) : new Date();
      const dtFim  = new Date(dtBase); dtFim.setDate(dtBase.getDate() + 2);
      const { status, data: actData } = await fsPost('sales_activities', {
        sales_activity: {
          sales_account_id: Number(aid),
          owner_id:          FS_OWNER_ID,
          activity_type_id:  FS_ACTIVITY_TYPE_ID,
          title:             'Diário de Justiça',
          starts_at:         `${isoDate(dtBase)}T00:01:00Z`,
          ends_at:           `${isoDate(dtFim)}T23:59:00Z`,
          notes:             buildNotes(pub as Record<string,unknown>),
        },
      });
      if (status === 200 || status === 201) {
        const actId = String(((actData as Record<string,Record<string,unknown>>).sales_activity?.id) ?? '');
        if (actId) { await db.from('publicacoes').update({ freshsales_activity_id: actId }).eq('id', pub.id); enviados++; }
        else erros++;
      } else {
        erros++;
        log('warn','pub_erro',{pub_id:pub.id,status,body:JSON.stringify(actData).slice(0,200)});
      }
    } catch (e) { erros++; log('error','pub_ex',{pub_id:pub.id,erro:String(e)}); }
    await sleep(100);
  }
  return { ok: true, total: pubs.length, enviados, sem_account, erros };
}

// ── PASSO 5: SYNC ANDAMENTOS ──────────────────────────────────────────────────
async function syncAndamentos(limite: number) {
  const { data: movs } = await db.from('movimentacoes')
    .select('id,processo_id,conteudo,data_movimentacao,fonte')
    .is('freshsales_activity_id', null).limit(limite);
  if (!movs?.length) return { ok: true, total: 0, msg: 'Nenhum andamento pendente' };

  const procIds = [...new Set(movs.map(m => m.processo_id))];
  const { data: procs } = await db.from('processos').select('id,account_id_freshsales').in('id', procIds);
  const accMap = new Map<string,string>();
  for (const p of procs ?? []) if (p.account_id_freshsales) accMap.set(p.id, p.account_id_freshsales);

  let enviados = 0, sem_account = 0, erros = 0;
  const isoDate = (d: Date) => d.toISOString().split('T')[0];

  for (const mov of movs) {
    const aid = accMap.get(mov.processo_id);
    if (!aid) { sem_account++; continue; }
    try {
      const dtBase = mov.data_movimentacao ? new Date(mov.data_movimentacao) : new Date();
      const dtFim  = new Date(dtBase); dtFim.setDate(dtBase.getDate() + 1);
      const { status, data: actData } = await fsPost('sales_activities', {
        sales_activity: {
          sales_account_id: Number(aid),
          owner_id:          FS_OWNER_ID,
          activity_type_id:  FS_ACTIVITY_TYPE_ID,
          title:             `[Andamento] ${String(mov.conteudo ?? '').substring(0, 80)}`,
          starts_at:         `${isoDate(dtBase)}T00:01:00Z`,
          ends_at:           `${isoDate(dtFim)}T23:59:00Z`,
          notes:             `=== ANDAMENTO ===\nData: ${isoDate(dtBase)}\nFonte: ${mov.fonte ?? 'DataJud'}\n\n${mov.conteudo ?? ''}`,
        },
      });
      if (status === 200 || status === 201) {
        const actId = String(((actData as Record<string,Record<string,unknown>>).sales_activity?.id) ?? '');
        if (actId) { await db.from('movimentacoes').update({ freshsales_activity_id: actId }).eq('id', mov.id); enviados++; }
        else erros++;
      } else erros++;
    } catch { erros++; }
    await sleep(80);
  }
  return { ok: true, total: movs.length, enviados, sem_account, erros };
}

async function syncAndamentosScoped(processNumbers: string[], limite: number) {
  const targets = uniqueStrings(processNumbers.map((item) => normalizeProcessNumber(item)).filter(Boolean));
  if (!targets.length) return { ok: true, total: 0, msg: 'Nenhum processo selecionado' };

  const { data: processos } = await db.from('processos')
    .select('id,numero_cnj,numero_processo,account_id_freshsales')
    .or(targets.map((item) => `numero_cnj.eq.${item},numero_processo.eq.${item}`).join(','))
    .limit(Math.max(targets.length * 2, targets.length));

  const scoped = (processos ?? []).filter((row) => {
    const cnj = normalizeProcessNumber(String(row.numero_cnj ?? ''));
    const numero = normalizeProcessNumber(String(row.numero_processo ?? ''));
    return targets.includes(cnj) || targets.includes(numero);
  });
  if (!scoped.length) {
    return { ok: true, total: 0, msg: 'Nenhum processo encontrado para os CNJs informados', processNumbers: targets };
  }

  const processIds = scoped.map((row) => row.id);
  const accountMap = new Map<string, string>();
  for (const row of scoped) {
    if (row.account_id_freshsales) accountMap.set(row.id, String(row.account_id_freshsales));
  }

  const { data: movs } = await db.from('movimentacoes')
    .select('id,processo_id,conteudo,data_movimentacao,fonte,freshsales_activity_id')
    .in('processo_id', processIds)
    .is('freshsales_activity_id', null)
    .order('data_movimentacao', { ascending: false })
    .limit(Math.max(1, limite));

  if (!movs?.length) {
    return {
      ok: true,
      total: 0,
      enviados: 0,
      sem_account: 0,
      erros: 0,
      processNumbers: targets,
      processos: scoped.length,
      msg: 'Nenhum andamento pendente para os processos selecionados',
    };
  }

  let enviados = 0;
  let sem_account = 0;
  let erros = 0;
  const detalhes: Record<string, unknown>[] = [];
  const isoDate = (d: Date) => d.toISOString().split('T')[0];

  for (const mov of movs) {
    const aid = accountMap.get(mov.processo_id);
    if (!aid) {
      sem_account++;
      if (detalhes.length < 10) detalhes.push({ mov_id: mov.id, processo_id: mov.processo_id, status: 'sem_account' });
      continue;
    }
    try {
      const dtBase = mov.data_movimentacao ? new Date(mov.data_movimentacao) : new Date();
      const dtFim  = new Date(dtBase); dtFim.setDate(dtBase.getDate() + 1);
      const { status, data: actData } = await fsPost('sales_activities', {
        sales_activity: {
          sales_account_id: Number(aid),
          owner_id: FS_OWNER_ID,
          activity_type_id: FS_TYPE_ANDAMENTOS,
          title: `[Andamento] ${String(mov.conteudo ?? '').substring(0, 80)}`,
          starts_at: `${isoDate(dtBase)}T00:01:00Z`,
          ends_at: `${isoDate(dtFim)}T23:59:00Z`,
          notes: `=== ANDAMENTO ===\nData: ${isoDate(dtBase)}\nFonte: ${mov.fonte ?? 'DataJud'}\n\n${mov.conteudo ?? ''}`,
        },
      });
      if (status === 200 || status === 201) {
        const actId = String(((actData as Record<string,Record<string,unknown>>).sales_activity?.id) ?? '');
        if (actId) {
          await db.from('movimentacoes').update({ freshsales_activity_id: actId }).eq('id', mov.id);
          enviados++;
          if (detalhes.length < 10) detalhes.push({ mov_id: mov.id, processo_id: mov.processo_id, freshsales_activity_id: actId, status: 'enviado' });
        } else {
          erros++;
        }
      } else {
        erros++;
        if (detalhes.length < 10) detalhes.push({ mov_id: mov.id, processo_id: mov.processo_id, status, erro: actData });
      }
    } catch (e) {
      erros++;
      if (detalhes.length < 10) detalhes.push({ mov_id: mov.id, processo_id: mov.processo_id, erro: String(e) });
    }
    await sleep(80);
  }

  return {
    ok: true,
    total: movs.length,
    enviados,
    sem_account,
    erros,
    processos: scoped.length,
    processNumbers: targets,
    detalhes,
  };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Permite CORS para chamadas diretas do browser
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'status';
  const limite = Number(url.searchParams.get('limite') ?? '200');
  const batch  = Number(url.searchParams.get('batch')  ?? '25');
  const body   = req.method === 'POST' ? await req.json().catch(() => ({})) as Record<string, unknown> : {};

  try {
    let result: unknown;
    switch (action) {
      case 'status':             result = await getStatus();           break;
      case 'resolver_accounts':  result = await resolverAccounts(limite); break;
      case 'sync_campos':        result = await syncCampos(limite);    break;
      case 'sync_publicacoes':   result = await syncPublicacoes(batch); break;
      case 'sync_andamentos':    result = await syncAndamentos(limite); break;
      case 'sync_andamentos_scoped': {
        const processNumbers = splitProcessNumbers(body.processNumbers ?? body.process_numbers ?? url.searchParams.get('processNumbers') ?? '');
        result = await syncAndamentosScoped(processNumbers, limite);
        break;
      }
      case 'pipeline_completo': {
        log('info','pipeline_inicio',{limite,batch});
        const p2 = await resolverAccounts(limite);
        const p3 = await syncCampos(limite);
        const p4 = await syncPublicacoes(batch);
        const p5 = await syncAndamentos(limite);
        const st = await getStatus();
        result = { p2_accounts:p2, p3_campos:p3, p4_publicacoes:p4, p5_andamentos:p5, status_final:st };
        break;
      }
      default:
        return new Response(JSON.stringify({ error:`action desconhecida: ${action}` }), { status:400, headers });
    }
    return new Response(JSON.stringify(result, null, 2), { headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error','erro_fatal',{action,erro:msg});
    return new Response(JSON.stringify({ error: msg }), { status:500, headers });
  }
});
