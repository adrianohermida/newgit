/**
 * fs-populate  v11
 *
 * Correcoes vs v10:
 *  - buscarAccountExistente: backoff 2s entre tentativas, timeout 15s
 *  - stepPublicacoes: calculo correto de ignoradas_leilao
 *    (busca batch items, filtra leilao, pega ate 'batch' validos)
 *  - stepCriarAccounts: sleep 300ms apos filtered_search para evitar 429
 *  - pipeline_completo: sync_campos reduzido a 30 para nao acumular timeout
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_DOMAIN            = Deno.env.get('FRESHSALES_DOMAIN')!;
const FS_API_KEY           = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_OWNER_ID          = Number(Deno.env.get('FS_OWNER_ID') ?? '31000147944');
const FS_TYPE_PUBLICACOES  = 31001147699;
const FS_TYPE_ANDAMENTOS   = 31001147751;

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'judiciario' },
});

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function log(n: 'info'|'warn'|'error', m: string, e: Record<string,unknown> = {}) {
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
}

// --- Dominio ---
const DOMAIN_MAP: Record<string,string> = {
  'hmadv-7b725ea101eff55.freshsales.io': 'hmadv-org.myfreshworks.com',
};
function fsDomain(): string {
  const d = (FS_DOMAIN ?? '').trim();
  if (d.includes('myfreshworks.com')) return d;
  return DOMAIN_MAP[d] ?? d.replace(/\.freshsales\.io$/, '.myfreshworks.com');
}
function authHdr(): string {
  const k = (FS_API_KEY ?? '').trim()
    .replace(/^Token token=/i,'').replace(/^Bearer /i,'').trim();
  return `Token token=${k}`;
}

async function fsReq(
  method: 'GET'|'POST'|'PUT',
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const url = `https://${fsDomain()}/crm/sales/api/${path}`;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(url, {
        method,
        headers: { Authorization: authHdr(), 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
      const data = await r.json().catch(() => ({}));
      // Rate limit: espera e tenta de novo
      if (r.status === 429) {
        const wait = 2000 * i;
        log('warn','rate_limit',{ path, tentativa: i, wait_ms: wait });
        await sleep(wait);
        continue;
      }
      if (r.status >= 500 && i < 3) { await sleep(1500*i); continue; }
      return { status: r.status, data };
    } catch(e) { if (i === 3) throw e; await sleep(1000*i); }
  }
  throw new Error('fsReq retries esgotados');
}
const fsPost = (p: string, b: unknown) => fsReq('POST', p, b);
const fsPut  = (p: string, b: unknown) => fsReq('PUT',  p, b);

// --- CNJ ---
function normCNJ(r: string): string|null {
  const d = (r ?? '').replace(/[^0-9]/g,'');
  return d.length === 20 ? d : null;
}
function cnj20toFmt(cnj: string): string {
  return `${cnj.slice(0,7)}-${cnj.slice(7,9)}.${cnj.slice(9,13)}.${cnj.slice(13,14)}.${cnj.slice(14,16)}.${cnj.slice(16)}`;
}
function inferirTribunal(d: string): string|null {
  const u = (d ?? '').toUpperCase();
  if (u.includes('DJSP')||u.includes('TJSP')) return 'TJSP';
  if (u.includes('DJAM')||u.includes('TJAM')) return 'TJAM';
  if (u.includes('TRT15')) return 'TRT15'; if (u.includes('TRT')) return 'TRT';
  if (u.includes('TRF'))   return 'TRF';   if (u.includes('STJ')) return 'STJ';
  if (u.includes('STF'))   return 'STF';   return null;
}

// --- buildTitulo ---
type Parte = { nome: string; polo: string };
function nomesPolo(partes: Parte[], polo: 'ativo'|'passivo'): string {
  const nomes = partes.filter(p => p.polo === polo).map(p => p.nome.trim()).filter(Boolean);
  if (nomes.length === 0) return '';
  if (nomes.length === 1) return nomes[0];
  return `${nomes[0]} e outros`;
}
async function buildTitulo(
  processoId: string, cnjFmt: string, proc: Record<string,unknown>
): Promise<string> {
  const { data: partes } = await db.from('partes')
    .select('nome,polo').eq('processo_id', processoId).in('polo',['ativo','passivo']);
  let ativo   = partes ? nomesPolo(partes as Parte[], 'ativo')   : '';
  let passivo = partes ? nomesPolo(partes as Parte[], 'passivo') : '';
  if (!ativo   && proc.polo_ativo)   ativo   = String(proc.polo_ativo);
  if (!passivo && proc.polo_passivo) passivo = String(proc.polo_passivo);
  if (ativo && passivo) return `${cnjFmt} (${ativo} x ${passivo})`;
  if (ativo)            return `${cnjFmt} (${ativo})`;
  return cnjFmt;
}

// --- Custom fields ---
function buildCustomFields(proc: Record<string,unknown>, cnjFmt: string): Record<string,unknown> {
  const cf: Record<string,unknown> = { cf_processo: cnjFmt };
  if (proc.tribunal)                 cf.cf_tribunal                  = proc.tribunal;
  if (proc.orgao_julgador)           cf.cf_vara                      = proc.orgao_julgador;
  if (proc.instancia)                cf.cf_instancia                 = proc.instancia;
  if (proc.polo_ativo)               cf.cf_polo_ativo                = proc.polo_ativo;
  if (proc.polo_passivo)             cf.cf_parte_adversa             = proc.polo_passivo;
  if (proc.status_atual_processo)    cf.cf_status                    = proc.status_atual_processo;
  if (proc.data_ajuizamento)         cf.cf_data_de_distribuio        = proc.data_ajuizamento;
  if (proc.data_ultima_movimentacao) cf.cf_data_ultimo_movimento      = proc.data_ultima_movimentacao;
  if (proc.area)                     cf.cf_area                      = proc.area;
  if (proc.valor_causa)              cf.cf_valor_causa               = proc.valor_causa;
  return cf;
}

// --- Deduplicacao via filtered_search ---
async function buscarAccountExistente(cnjFmt: string): Promise<string|null> {
  try {
    const { status, data } = await fsPost('filtered_search/sales_account', {
      filter_rule: [{ attribute: 'cf_processo', operator: 'is_in', value: [cnjFmt] }],
      page: 1, per_page: 3,
    });
    if (status === 200) {
      const list = ((data as Record<string,unknown>).sales_accounts ?? []) as Record<string,unknown>[];
      if (list.length > 0) return String(list[0].id);
    }
  } catch(e) { log('warn','dedup_busca_erro',{ cnj: cnjFmt, erro: String(e) }); }
  return null;
}

// --- STATUS ---
async function stepStatus(): Promise<Record<string,unknown>> {
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
    config: { ok: !!(FS_DOMAIN&&FS_API_KEY), domain_raw: FS_DOMAIN?.slice(0,35), domain_used: fsDomain() },
    publicacoes:   { sem_processo: r1.count??0, pendentes_fs: r2.count??0, enviadas: r3.count??0 },
    processos:     { sem_account: r4.count??0,  com_account:  r5.count??0 },
    movimentacoes: { pendentes_fs: r6.count??0, enviadas: r7.count??0 },
  };
}

// --- PASSO 1: vincular ---
async function stepVincular(limite: number): Promise<Record<string,unknown>> {
  const { data: pubs } = await db.from('publicacoes')
    .select('id,numero_processo_api,cidade_comarca_descricao,vara_descricao,nome_diario')
    .is('processo_id', null).not('numero_processo_api','is',null).limit(limite);
  if (!pubs || pubs.length === 0) return { ok: true, total: 0, msg: 'Todas vinculadas' };
  const cnjMap = new Map<string,string[]>();
  for (const p of pubs) {
    const cnj = normCNJ(String(p.numero_processo_api ?? ''));
    if (!cnj) continue;
    if (!cnjMap.has(cnj)) cnjMap.set(cnj,[]);
    cnjMap.get(cnj)!.push(p.id);
  }
  let criados = 0, vinculados = 0, erros = 0;
  for (const [cnj20, ids] of cnjMap) {
    let { data: proc } = await db.from('processos').select('id')
      .or(`numero_cnj.eq.${cnj20},numero_processo.eq.${cnj20}`).maybeSingle();
    if (!proc) {
      const pub0 = pubs.find(p => ids.includes(p.id));
      const { data: np, error: ie } = await db.from('processos').insert({
        numero_cnj: cnj20, numero_processo: cnj20, titulo: cnj20toFmt(cnj20),
        tribunal: inferirTribunal(pub0?.nome_diario ?? ''),
        comarca: pub0?.cidade_comarca_descricao ?? null,
        orgao_julgador: pub0?.vara_descricao ?? null,
        dados_incompletos: true, fonte_criacao: 'ADVISE_BACKFILL',
      }).select('id').single();
      if (ie || !np) { erros++; continue; }
      proc = np; criados++;
    }
    const { error: ue } = await db.from('publicacoes')
      .update({ processo_id: proc.id }).in('id', ids).is('processo_id', null);
    if (!ue) vinculados += ids.length; else erros++;
  }
  log('info','step_vincular',{ criados, vinculados, erros });
  return { ok: true, cnjs: cnjMap.size, criados, vinculados, erros };
}

// --- PASSO 2: criar accounts com deduplicacao ---
async function stepCriarAccounts(limite: number): Promise<Record<string,unknown>> {
  if (!FS_DOMAIN || !FS_API_KEY) return { ok: false, erro: 'Secrets nao configuradas' };
  const { data: procs } = await db.from('processos')
    .select('id,numero_cnj,numero_processo,classe,tribunal,comarca,orgao_julgador,'+
            'instancia,polo_ativo,polo_passivo,area,valor_causa,'+
            'data_ajuizamento,data_ultima_movimentacao,status_atual_processo')
    .is('account_id_freshsales', null).limit(limite);
  if (!procs || procs.length === 0)
    return { ok: true, total: 0, msg: 'Todos os processos ja tem account_id' };

  let criados = 0, vinculados = 0, erros = 0;
  const detalhe: unknown[] = [];
  const erroAmostra: unknown[] = [];

  for (const proc of procs) {
    const cnj20 = normCNJ(proc.numero_cnj ?? proc.numero_processo ?? '');
    if (!cnj20) { erros++; continue; }
    const cnjFmt = cnj20toFmt(cnj20);

    // 1. Busca existente no FS (deduplicacao)
    const accountIdExistente = await buscarAccountExistente(cnjFmt);
    await sleep(300); // pausa apos filtered_search para evitar 429

    if (accountIdExistente) {
      await db.from('processos')
        .update({ account_id_freshsales: accountIdExistente }).eq('id', proc.id);
      vinculados++;
      log('info','account_vinculado_existente',{ cnj: cnjFmt, account_id: accountIdExistente });
      if (detalhe.length < 10)
        detalhe.push({ cnj: cnjFmt, account_id: accountIdExistente, acao: 'vinculado_existente' });
      continue;
    }

    // 2. Nao existe -> criar
    try {
      const titulo = await buildTitulo(String(proc.id), cnjFmt, proc as Record<string,unknown>);
      const { status, data } = await fsPost('sales_accounts', {
        sales_account: {
          name:         titulo,
          owner_id:     FS_OWNER_ID,
          custom_field: buildCustomFields(proc as Record<string,unknown>, cnjFmt),
        },
      });
      if (status === 200 || status === 201) {
        const acct = (data as Record<string,Record<string,unknown>>).sales_account;
        const accountId = String(acct?.id ?? '');
        if (accountId && accountId !== 'undefined') {
          await db.from('processos')
            .update({ account_id_freshsales: accountId, titulo }).eq('id', proc.id);
          criados++;
          log('info','account_criado',{ cnj: cnjFmt, account_id: accountId, titulo });
          if (detalhe.length < 10)
            detalhe.push({ cnj: cnjFmt, account_id: accountId, titulo, acao: 'criado' });
        } else erros++;
      } else {
        erros++;
        if (erroAmostra.length < 3)
          erroAmostra.push({ cnj: cnjFmt, status, erro: (data as Record<string,unknown>).errors });
        log('warn','account_criar_erro',{ cnj: cnjFmt, status });
      }
    } catch(e) {
      erros++;
      log('error','account_exception',{ cnj: cnjFmt, erro: String(e) });
    }
    await sleep(200);
  }
  log('info','step_criar_accounts',{ criados, vinculados, erros, total: procs.length });
  return { ok: true, total: procs.length, criados, vinculados, erros, detalhe, erroAmostra };
}

// --- PASSO 3: sync campos ---
async function stepSyncCampos(limite: number): Promise<Record<string,unknown>> {
  const { data: procs } = await db.from('processos')
    .select('id,numero_cnj,numero_processo,clube,tribunal,comarca,orgao_julgador,'+
            'instancia,polo_ativo,polo_passivo,area,valor_causa,'+
            'data_ajuizamento,data_ultima_movimentacao,status_atual_processo,account_id_freshsales')
    .not('account_id_freshsales','is',null).limit(limite);
  if (!procs || procs.length === 0) return { ok: true, total: 0, msg: 'Nenhum com account_id' };
  let atualizados = 0, erros = 0;
  for (const proc of procs) {
    const cnj20  = normCNJ(proc.numero_cnj ?? proc.numero_processo ?? '');
    const cnjFmt = cnj20 ? cnj20toFmt(cnj20) : String(proc.numero_cnj ?? '');
    try {
      const { status } = await fsPut(`sales_accounts/${proc.account_id_freshsales}`,
        { sales_account: { custom_field: buildCustomFields(proc as Record<string,unknown>, cnjFmt) } });
      if (status === 200) atualizados++; else erros++;
    } catch { erros++; }
    await sleep(100);
  }
  log('info','step_sync_campos',{ atualizados, erros });
  return { ok: true, total: procs.length, atualizados, erros };
}

// --- Filtro leilao ---
function ehLeilao(pub: Record<string,unknown>): boolean {
  try {
    const palavras = ((pub.raw_payload as Record<string,unknown>)?.palavrasChave ?? []) as unknown[];
    return (palavras as string[]).some(
      p => typeof p === 'string' && /leil[\u00e3\u00f5a][oe]?s?/i.test(p)
    );
  } catch { return false; }
}

// --- PASSO 4: publicacoes ---
const isoDate = (d: Date) => d.toISOString().split('T')[0];
function buildNotesPub(pub: Record<string,unknown>): string {
  const dt = pub.data_publicacao
    ? new Date(String(pub.data_publicacao)).toLocaleDateString('pt-BR') : '';
  return [
    '=== PUBLICACAO DJ ===',
    `Diario    : ${pub.nome_diario??''}`,
    `Processo  : ${pub.numero_processo_api??''}`,
    `Data      : ${dt}`,
    `Comarca   : ${pub.cidade_comarca_descricao??''}`,
    `Vara      : ${pub.vara_descricao??''}`,
    '',
    String(pub.despacho || pub.conteudo || 'Sem conteudo.'),
  ].join('\n');
}

async function stepPublicacoes(batch: number): Promise<Record<string,unknown>> {
  // Busca batch items ja filtrados no banco (publicacoes pendentes vinculadas)
  const { data: pubs } = await db.from('publicacoes')
    .select('id,numero_processo_api,processo_id,data_publicacao,nome_diario,'+
            'cidade_comarca_descricao,vara_descricao,nome_caderno_diario,'+
            'pagina_inicial_publicacao,pagina_final_publicacao,despacho,conteudo,raw_payload')
    .is('freshsales_activity_id', null).not('processo_id','is',null)
    .order('data_publicacao',{ ascending: false }).limit(batch);
  if (!pubs || pubs.length === 0) return { ok: true, total: 0, msg: 'Nenhuma publicacao pendente' };

  const validas        = pubs.filter(p => !ehLeilao(p as Record<string,unknown>));
  const ignoradas_leilao = pubs.length - validas.length;

  const procIds = [...new Set(validas.map(p => p.processo_id))];
  const { data: procs } = await db.from('processos')
    .select('id,account_id_freshsales').in('id', procIds);
  const accMap = new Map<string,string>();
  for (const p of procs ?? []) if (p.account_id_freshsales) accMap.set(p.id, p.account_id_freshsales);

  let enviados = 0, sem_account = 0, erros = 0;
  const erroAmostra: unknown[] = [];

  for (const pub of validas) {
    const accountId = accMap.get(pub.processo_id);
    if (!accountId) { sem_account++; continue; }
    try {
      const dtBase = pub.data_publicacao ? new Date(String(pub.data_publicacao)) : new Date();
      const dtFim  = new Date(dtBase); dtFim.setDate(dtBase.getDate() + 2);
      const { status, data: actData } = await fsPost('sales_activities', {
        sales_activity: {
          sales_account_id: Number(accountId),
          owner_id:          FS_OWNER_ID,
          activity_type_id:  FS_TYPE_PUBLICACOES,
          title:             'Diario de Justica',
          starts_at:         `${isoDate(dtBase)}T00:01:00Z`,
          ends_at:           `${isoDate(dtFim)}T23:59:00Z`,
          notes:             buildNotesPub(pub as Record<string,unknown>),
        },
      });
      if (status === 200 || status === 201) {
        const aid = String(((actData as Record<string,Record<string,unknown>>).sales_activity?.id)??'');
        if (aid) { await db.from('publicacoes').update({ freshsales_activity_id: aid }).eq('id', pub.id); enviados++; }
        else erros++;
      } else {
        erros++;
        if (erroAmostra.length < 3)
          erroAmostra.push({ id: pub.id, status, erro: (actData as Record<string,unknown>).errors });
        log('warn','pub_fs_erro',{ id: pub.id, status });
      }
    } catch(e) { erros++; log('error','pub_exception',{ erro: String(e) }); }
    await sleep(120);
  }
  log('info','step_publicacoes',{ enviados, sem_account, erros, ignoradas_leilao });
  return { ok: true, total: validas.length, ignoradas_leilao, enviados, sem_account, erros, erroAmostra };
}

// --- PASSO 5: andamentos ---
async function stepAndamentos(limite: number): Promise<Record<string,unknown>> {
  const { data: movs } = await db.from('movimentacoes')
    .select('id,processo_id,conteudo,data_movimentacao,fonte')
    .is('freshsales_activity_id', null).limit(limite);
  if (!movs || movs.length === 0) return { ok: true, total: 0, msg: 'Nenhum andamento pendente' };
  const procIds = [...new Set(movs.map(m => m.processo_id))];
  const { data: procs } = await db.from('processos')
    .select('id,account_id_freshsales').in('id', procIds);
  const accMap = new Map<string,string>();
  for (const p of procs ?? []) if (p.account_id_freshsales) accMap.set(p.id, p.account_id_freshsales);
  let enviados = 0, sem_account = 0, erros = 0;
  for (const mov of movs) {
    const accountId = accMap.get(mov.processo_id);
    if (!accountId) { sem_account++; continue; }
    try {
      const dtBase = mov.data_movimentacao ? new Date(mov.data_movimentacao) : new Date();
      const dtFim  = new Date(dtBase); dtFim.setDate(dtBase.getDate() + 1);
      const { status, data: actData } = await fsPost('sales_activities', {
        sales_activity: {
          sales_account_id: Number(accountId), owner_id: FS_OWNER_ID,
          activity_type_id:  FS_TYPE_ANDAMENTOS,
          title: `[Andamento] ${String(mov.conteudo??'').substring(0,80)}`,
          starts_at: `${isoDate(dtBase)}T00:01:00Z`, ends_at: `${isoDate(dtFim)}T23:59:00Z`,
          notes: [
            '=== ANDAMENTO PROCESSUAL ===',
            `Data : ${dtBase.toLocaleDateString('pt-BR')}`,
            `Fonte: ${mov.fonte??'DataJud'}`, '',
            String(mov.conteudo || 'Sem descricao.'),
          ].join('\n'),
        },
      });
      if (status === 200 || status === 201) {
        const aid = String(((actData as Record<string,Record<string,unknown>>).sales_activity?.id)??'');
        if (aid) { await db.from('movimentacoes').update({ freshsales_activity_id: aid }).eq('id', mov.id); enviados++; }
        else erros++;
      } else erros++;
    } catch { erros++; }
    await sleep(80);
  }
  log('info','step_andamentos',{ enviados, sem_account, erros });
  return { ok: true, total: movs.length, enviados, sem_account, erros };
}

// --- Main ---
Deno.serve(async (req: Request) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'status';
  const limite = Number(url.searchParams.get('limite') ?? '100');
  const batch  = Number(url.searchParams.get('batch')  ?? '25');
  try {
    let result: unknown;
    switch (action) {
      case 'status':             result = await stepStatus();              break;
      case 'vincular_processos': result = await stepVincular(3000);       break;
      case 'criar_accounts':     result = await stepCriarAccounts(limite); break;
      case 'sync_campos':        result = await stepSyncCampos(limite);    break;
      case 'sync_publicacoes':   result = await stepPublicacoes(batch);    break;
      case 'sync_andamentos':    result = await stepAndamentos(limite);    break;
      case 'pipeline_completo': {
        log('info','pipeline_inicio',{ limite, batch });
        const p1 = await stepVincular(3000);
        const p2 = await stepCriarAccounts(limite);
        const p3 = await stepSyncCampos(Math.min(limite, 30));
        const p4 = await stepPublicacoes(batch);
        const p5 = await stepAndamentos(Math.min(limite, 50));
        result = {
          p1_vincular: p1, p2_criar_accounts: p2, p3_campos: p3,
          p4_publicacoes: p4, p5_andamentos: p5,
          status_final: await stepStatus(),
        };
        log('info','pipeline_fim');
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `action desconhecida: "${action}"` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
    }
    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch(err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error','erro_fatal',{ action, erro: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
