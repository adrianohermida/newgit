import "jsr:@supabase/functions-js/edge-runtime.d.ts";

/**
 * advise-sync  v1
 *
 * Cron diário de busca de novas publicações no Advise.
 *
 * Regras:
 *   - Só busca publicações NOVAS (após a última data já armazenada ou D-1)
 *   - EXCLUI qualquer publicação cuja palavrasChave contenha 'leilão' ou 'leilões'
 *     OU cujo despacho/conteúdo contenha esses termos
 *   - Persiste novas publicações em judiciario.publicacoes
 *   - Vincula processo_id automaticamente
 *   - Ao final dispara publicacoes-freshsales para enviar as novas ao FS
 *   - Registra log em advise_sync_log
 *
 * Actions:
 *   sync        (default) — busca do dia anterior até hoje
 *   sync_range  — busca entre ?data_inicio=YYYY-MM-DD e ?data_fim=YYYY-MM-DD
 *   status      — última execução e contagens
 *
 * Secrets necessárias:
 *   ADVISE_API_URL, ADVISE_API_TOKEN, ADVISE_CLIENTE_ID
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Env ──────────────────────────────────────────────────────────────────
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADVISE_API_URL       = Deno.env.get('ADVISE_API_URL')      ?? 'https://api.advise.com.br';
const ADVISE_API_TOKEN     = Deno.env.get('ADVISE_API_TOKEN') ?? Deno.env.get('ADVISE_TOKEN') ?? '';
const ADVISE_CLIENTE_ID    = Deno.env.get('ADVISE_CLIENTE_ID') ?? Deno.env.get('ADVISE_CLIENT_ID') ?? '';
const DEFAULT_POR_PAGINA   = Math.max(1, Number(Deno.env.get('ADVISE_SYNC_POR_PAGINA') ?? '50'));
const DEFAULT_MAX_PAGINAS  = Math.max(1, Number(Deno.env.get('ADVISE_SYNC_MAX_PAGINAS') ?? '3'));

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'judiciario' },
});

const log = (n:'info'|'warn'|'error', m:string, e:Record<string,unknown>={}) =>
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
const sleep = (ms:number) => new Promise(r => setTimeout(r, ms));

// ─── Palavras-chave de exclusão (leilão — outro projeto) ─────────────────────
const EXCLUIR_PALAVRAS = ['leilão','leilões','leilao','leiloes'];

function isPublicacaoExcluida(pub: Record<string,unknown>): boolean {
  // Verifica palavrasChave do payload Advise
  const palavras = (pub.palavrasChave as string[] ?? []);
  for (const p of palavras) {
    if (EXCLUIR_PALAVRAS.some(ex => p.toLowerCase().includes(ex))) return true;
  }
  // Verifica despacho e conteúdo
  const txt = String((pub.despacho??'') + ' ' + (pub.conteudo??'')).toLowerCase();
  return EXCLUIR_PALAVRAS.some(ex => txt.includes(ex));
}

// ─── CNJ helpers ──────────────────────────────────────────────────────────
function normCNJ(r:string): string|null {
  const d=(r??'').replace(/[^0-9]/g,'');
  return d.length===20 ? d : null;
}
function cnj20toFmt(cnj:string): string {
  return `${cnj.slice(0,7)}-${cnj.slice(7,9)}.${cnj.slice(9,13)}.${cnj.slice(13,14)}.${cnj.slice(14,16)}.${cnj.slice(16)}`;
}
function extractScopedCnjs(input: unknown): string[] {
  const rawItems = Array.isArray(input)
    ? input
    : String(input ?? '')
        .split(/[\s,;\n\r\t]+/g)
        .map((item) => item.trim())
        .filter(Boolean);
  const unique = new Set<string>();
  for (const item of rawItems) {
    const cnj = normCNJ(String(item ?? ''));
    if (cnj) unique.add(cnj);
  }
  return Array.from(unique);
}
function inferirTribunal(d:string): string|null {
  const u=(d??'').toUpperCase();
  if(u.includes('DJSP')||u.includes('TJSP'))return'TJSP';
  if(u.includes('TRT15'))return'TRT15'; if(u.includes('TRT'))return'TRT';
  if(u.includes('TRF'))return'TRF';     if(u.includes('STJ'))return'STJ';
  if(u.includes('STF'))return'STF';     return null;
}

// ─── Advise API ────────────────────────────────────────────────────────────
async function adviseGet(path:string): Promise<unknown> {
  const url = `${ADVISE_API_URL}${path}`;
  for (let i=1;i<=3;i++) {
    try {
      const r = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${ADVISE_API_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Cliente-ID': ADVISE_CLIENTE_ID,
        },
        signal: AbortSignal.timeout(15000),
      });
      if (r.status===429||r.status>=500) { await sleep(1500*i); continue; }
      if (!r.ok) throw new Error(`Advise ${path} HTTP ${r.status}`);
      return await r.json();
    } catch(e) { if(i===3)throw e; await sleep(1000*i); }
  }
  throw new Error('adviseGet retries esgotados');
}

async function advisePost(path:string, body:unknown): Promise<unknown> {
  const url = `${ADVISE_API_URL}${path}`;
  for (let i=1;i<=3;i++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ADVISE_API_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Cliente-ID': ADVISE_CLIENTE_ID,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (r.status===429||r.status>=500) { await sleep(1500*i); continue; }
      if (!r.ok) throw new Error(`Advise POST ${path} HTTP ${r.status}: ${await r.text()}`);
      return await r.json();
    } catch(e) { if(i===3)throw e; await sleep(1000*i); }
  }
  throw new Error('advisePost retries esgotados');
}

async function adviseCoreGet(params: URLSearchParams): Promise<unknown> {
  const url = `${ADVISE_API_URL}/core/v1/publicacoes-clientes/consulta-paginada?${params.toString()}`;
  for (let i=1;i<=3;i++) {
    try {
      const r = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${ADVISE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (r.status===429||r.status>=500) { await sleep(1500*i); continue; }
      if (!r.ok) throw new Error(`Advise core GET HTTP ${r.status}: ${await r.text()}`);
      return await r.json();
    } catch(e) { if(i===3)throw e; await sleep(1000*i); }
  }
  throw new Error('adviseCoreGet retries esgotados');
}

// ─── Busca publicações do Advise para um período ─────────────────────────────
async function buscarPublicacoesAdvise(
  dataInicio: string,
  dataFim: string,
  pagina = 1,
  porPagina = 100,
): Promise<{ pubs: Record<string,unknown>[]; totalPaginas: number; total: number }> {
  if (!ADVISE_API_TOKEN) throw new Error('ADVISE token não configurado');

  if (!ADVISE_CLIENTE_ID) {
    const params = new URLSearchParams({
      paginaAtual: String(pagina),
      registrosPorPagina: String(porPagina),
      Lido: 'false',
      dataMovimentoInicial: dataInicio,
    });
    const data = await adviseCoreGet(params) as Record<string,unknown>;
    const pubsRaw = (data.itens ?? []) as Record<string,unknown>[];
    const pubs = pubsRaw.filter((pub) => {
      const rawDate = String(pub.dataHoraMovimento ?? pub.dataPublicacao ?? '');
      const iso = rawDate ? new Date(rawDate).toISOString().split('T')[0] : '';
      return !iso || iso <= dataFim;
    });
    const pag = (data.paginacao ?? {}) as Record<string,unknown>;
    const total = Number(pag.totalRegistros ?? data.totalRegistros ?? pubs.length);
    const totalPaginas = Number(pag.paginaTotal ?? 1) || 1;
    return { pubs, totalPaginas, total };
  }

  const data = await advisePost('/v1/publicacoes/pesquisar', {
    dataInicio,
    dataFim,
    clienteId: ADVISE_CLIENTE_ID,
    pagina,
    porPagina,
  }) as Record<string,unknown>;

  const pubs = (data.publicacoes ?? data.items ?? data.data ?? []) as Record<string,unknown>[];
  const total = Number(data.total ?? data.totalRegistros ?? pubs.length);
  const totalPaginas = Math.ceil(total / porPagina) || 1;
  return { pubs, totalPaginas, total };
}

// ─── Persiste uma publicação no Supabase ──────────────────────────────────────
interface PubRecord {
  advise_id_publicacao: number;
  advise_id_publicacao_cliente: number;
  advise_cod_publicacao: number;
  advise_id_cliente: string;
  numero_processo_api: string | null;
  data_publicacao: string | null;
  despacho: string | null;
  conteudo: string | null;
  nome_diario: string | null;
  nome_caderno_diario: string | null;
  descricao_caderno_diario: string | null;
  cidade_comarca_descricao: string | null;
  vara_descricao: string | null;
  pagina_inicial_publicacao: number | null;
  pagina_final_publicacao: number | null;
  ano_publicacao: number | null;
  edicao_diario: number | null;
  raw_payload: Record<string,unknown>;
}

function advPubToRecord(pub: Record<string,unknown>): PubRecord {
  return {
    advise_id_publicacao:         Number(pub.id           ?? pub.idPublicacao         ?? 0),
    advise_id_publicacao_cliente: Number(pub.idPublicacaoCliente ?? pub.id           ?? 0),
    advise_cod_publicacao:        Number(pub.codPublicacao ?? 0),
    advise_id_cliente:            String(pub.idCliente    ?? ADVISE_CLIENTE_ID),
    numero_processo_api:          String(pub.numero       ?? pub.numeroProcesso       ?? '').trim() || null,
    data_publicacao:              String(pub.dataPublicacao ?? pub.data               ?? '').split('T')[0] || null,
    despacho:                     String(pub.despacho     ?? '').trim()  || null,
    conteudo:                     String(pub.conteudo     ?? '').trim()  || null,
    nome_diario:                  String(pub.nomeDiario   ?? pub.descricaoDiario ?? '').trim() || null,
    nome_caderno_diario:          String(pub.nomeCadernoDiario ?? '').trim() || null,
    descricao_caderno_diario:     String(pub.descricaoCadernoDiario ?? '').trim() || null,
    cidade_comarca_descricao:     String(pub.cidadeComarcaDescricao ?? '').trim() || null,
    vara_descricao:               String(pub.varaDescricao ?? '').trim() || null,
    pagina_inicial_publicacao:    Number(pub.paginaInicialPublicacao ?? null) || null,
    pagina_final_publicacao:      Number(pub.paginaFinalPublicacao   ?? null) || null,
    ano_publicacao:               Number(pub.anoPublicacao           ?? null) || null,
    edicao_diario:                Number(pub.edicaoDiario            ?? null) || null,
    raw_payload:                  pub,
  };
}

// ─── Vincula processo_id nas publicações reciém inseridas ────────────────────
async function vincularProcessos(ids: string[]): Promise<{ vinculados: number; criados: number }> {
  if (ids.length===0) return { vinculados:0, criados:0 };

  const { data: pubs } = await db.from('publicacoes')
    .select('id,numero_processo_api,cidade_comarca_descricao,vara_descricao,nome_diario')
    .in('id', ids).is('processo_id',null);

  const cnjMap = new Map<string,{ids:string[];comarca:string|null;vara:string|null;diario:string|null}>();
  for (const p of pubs??[]) {
    const cnj = normCNJ(String(p.numero_processo_api??''));
    if (!cnj) continue;
    if (!cnjMap.has(cnj)) cnjMap.set(cnj,{ids:[],comarca:p.cidade_comarca_descricao,vara:p.vara_descricao,diario:p.nome_diario});
    cnjMap.get(cnj)!.ids.push(p.id);
  }

  let vinculados=0, criados=0;
  for (const [cnj20, info] of cnjMap) {
    let { data: proc } = await db.from('processos').select('id')
      .or(`numero_cnj.eq.${cnj20},numero_processo.eq.${cnj20}`).maybeSingle();
    if (!proc) {
      const { data: np, error: ie } = await db.from('processos').insert({
        numero_cnj:    cnj20, numero_processo: cnj20, titulo: cnj20toFmt(cnj20),
        tribunal:      inferirTribunal(info.diario??''),
        comarca:       info.comarca, orgao_julgador: info.vara,
        dados_incompletos: true, fonte_criacao: 'ADVISE_BACKFILL',
      }).select('id').single();
      if (ie||!np) continue;
      proc = np; criados++;
    }
    const { error: ue } = await db.from('publicacoes')
      .update({ processo_id: proc.id }).in('id', info.ids).is('processo_id',null);
    if (!ue) vinculados += info.ids.length;
  }
  return { vinculados, criados };
}

// ─── Dispara o exportador oficial para o Freshsales ──────────────────────────
async function dispararSyncWorker(): Promise<unknown> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/functions/v1/sync-worker?action=run`,
      {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(12000),
      }
    );
    return await r.json().catch(() => ({ status: r.status }));
  } catch(e) {
    log('warn','sync_worker_erro',{erro:String(e)});
    return { erro: String(e) };
  }
}

async function touchAdviseStatus(patch: Record<string, unknown>): Promise<void> {
  const { data: row } = await db.from('advise_sync_status')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (row?.id) {
    const { error } = await db.from('advise_sync_status').update({
      updated_at: new Date().toISOString(),
      ...patch,
    }).eq('id', row.id);
    if (error) log('warn', 'advise_status_update', { erro: error.message });
    return;
  }

  const { error } = await db.from('advise_sync_status').insert({
    fonte: 'ADVISE',
    status: 'idle',
    ...patch,
  });
  if (error) log('warn', 'advise_status_insert', { erro: error.message });
}

async function getAdviseStatusRow(): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.from('advise_sync_status')
    .select('status,ultima_execucao,ultima_data_movimento,ultima_pagina,total_paginas,total_registros,erro')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    log('warn', 'advise_status_read', { erro: error.message });
    return null;
  }
  return data ?? null;
}

// ─── SYNC principal ────────────────────────────────────────────────────────
async function actionSync(
  dataInicio:string,
  dataFim:string,
  options: { paginaInicial?: number; porPagina?: number; maxPaginas?: number; scopeCnjs?: string[] } = {},
): Promise<Record<string,unknown>> {
  const porPagina = Math.max(1, options.porPagina ?? DEFAULT_POR_PAGINA);
  const paginaInicial = Math.max(1, options.paginaInicial ?? 1);
  const maxPaginas = Math.max(1, options.maxPaginas ?? DEFAULT_MAX_PAGINAS);
  const scopeCnjs = Array.isArray(options.scopeCnjs) ? options.scopeCnjs.filter(Boolean) : [];
  const scopeSet = new Set(scopeCnjs);
  log('info','advise_sync_inicio',{ dataInicio, dataFim, paginaInicial, porPagina, maxPaginas, scope_count: scopeCnjs.length });
  await touchAdviseStatus({ status: 'running', erro: null });

  const stats = {
    periodo: { de: dataInicio, ate: dataFim },
    execucao: { pagina_inicial: paginaInicial, por_pagina: porPagina, max_paginas: maxPaginas, scope_count: scopeCnjs.length, scoped: scopeCnjs.length > 0 },
    total_advise: 0,
    paginas_processadas: 0,
    pagina_atual: paginaInicial,
    total_paginas: 1,
    parcial: false,
    fora_escopo: 0,
    excluidas_leilao: 0,
    novas: 0,
    duplicadas: 0,
    erros: 0,
    vinculadas: 0,
    processos_criados: 0,
    fs_sync: null as unknown,
  };

  // Busca página a página
  let pagina = paginaInicial;
  let totalPaginas = 1;
  let paginasProcessadas = 0;

  do {
    const { pubs: pubsOriginais, totalPaginas: tp, total } = await buscarPublicacoesAdvise(dataInicio, dataFim, pagina, porPagina);
    const pubs = scopeSet.size > 0
      ? pubsOriginais.filter((pub) => {
          const cnj = normCNJ(String(pub.numero ?? pub.numeroProcesso ?? ''));
          const keep = Boolean(cnj && scopeSet.has(cnj));
          if (!keep) stats.fora_escopo++;
          return keep;
        })
      : pubsOriginais;
    if (pagina===paginaInicial) { stats.total_advise = total; totalPaginas = tp; }
    stats.pagina_atual = pagina;
    stats.total_paginas = totalPaginas;
    log('info','advise_pagina',{ pagina, totalPaginas, pubs_recebidas: pubsOriginais.length, pubs_escopo: pubs.length, scope_count: scopeCnjs.length });

    const novasIds: string[] = [];

    for (const pub of pubs) {
      // FILTRO LEILÃO — excluí antes de qualquer persistência
      if (isPublicacaoExcluida(pub)) {
        stats.excluidas_leilao++;
      }

      const record = advPubToRecord(pub);
      if (!record.advise_id_publicacao) { stats.erros++; continue; }

      // Upsert por advise_id_publicacao (evita duplicatas em re-execuções)
      const { data: inserted, error } = await db.from('publicacoes')
        .upsert(record, { onConflict: 'advise_id_publicacao_cliente', ignoreDuplicates: true })
        .select('id');

      if (error) {
        log('warn','pub_upsert_erro',{ id:record.advise_id_publicacao, erro:error.message });
        stats.erros++;
        continue;
      }

      if (inserted && inserted.length > 0) {
        // Nova publicação inserida
        stats.novas++;
        novasIds.push(inserted[0].id);
      } else {
        stats.duplicadas++;
      }
    }

    // Vincula processo_id para as novas publicações desta página
    if (novasIds.length > 0) {
      const { vinculados, criados } = await vincularProcessos(novasIds);
      stats.vinculadas += vinculados;
      stats.processos_criados += criados;
    }

    paginasProcessadas++;
    stats.paginas_processadas = paginasProcessadas;
    stats.parcial = pagina < totalPaginas;
    await touchAdviseStatus({
      status: stats.parcial ? 'running' : 'idle',
      erro: null,
      ultima_execucao: new Date().toISOString(),
      ultima_data_movimento: dataFim,
      ultima_pagina: pagina,
      total_paginas: totalPaginas,
      total_registros: stats.total_advise,
    });

    pagina++;
    if (pagina <= totalPaginas && paginasProcessadas < maxPaginas) await sleep(300); // respeita rate limit
  } while (pagina <= totalPaginas && paginasProcessadas < maxPaginas);

  stats.parcial = pagina <= totalPaginas;
  const proximaPagina = stats.parcial ? pagina : 1;

  // Dispara o exportador oficial após a ingestão do Advise
  if (stats.novas > 0) {
    stats.fs_sync = await dispararSyncWorker();
  }

  // Grava log da execução
  const { error: logErr } = await db.from('advise_sync_log').insert({
    executado_em:      new Date().toISOString(),
    data_inicio:       dataInicio,
    data_fim:          dataFim,
    total_advise:      stats.total_advise,
    excluidas_leilao:  stats.excluidas_leilao,
    novas:             stats.novas,
    duplicadas:        stats.duplicadas,
    erros:             stats.erros,
    vinculadas:        stats.vinculadas,
    processos_criados: stats.processos_criados,
  });
  if (logErr) log('warn','advise_sync_log',{erro:logErr.message});

  await touchAdviseStatus({
    status: stats.parcial ? 'running' : 'idle',
    erro: null,
    ultima_execucao: new Date().toISOString(),
    ultima_data_movimento: dataFim,
    ultima_pagina: proximaPagina,
    total_paginas: totalPaginas,
    total_registros: stats.total_advise,
  });

  log('info','advise_sync_cursor',{ proximaPagina, totalPaginas, parcial: stats.parcial });
  log('info','advise_sync_fim', stats as unknown as Record<string,unknown>);
  return {
    ...stats,
    scope: scopeCnjs.length > 0 ? { count: scopeCnjs.length, processNumbers: scopeCnjs } : null,
    proxima_pagina: proximaPagina,
  } as unknown as Record<string,unknown>;
}

// ─── STATUS ─────────────────────────────────────────────────────────────────
async function actionStatus(): Promise<Record<string,unknown>> {
  const statusRow = await getAdviseStatusRow();
  const [r1, r2, r3, r4] = await Promise.all([
    db.from('publicacoes').select('*',{count:'exact',head:true}),
    db.from('publicacoes').select('*',{count:'exact',head:true}).is('freshsales_activity_id',null),
    // Última execução do sync
    db.from('advise_sync_log').select('executado_em,data_inicio,data_fim,novas,erros')
      .order('executado_em',{ascending:false}).limit(1),
    db.from('advise_sync_status').select('status,ultima_execucao,ultima_data_movimento,erro,ultima_pagina,total_paginas,total_registros')
      .order('created_at',{ascending:true}).limit(1),
  ]);
  return {
    publicacoes_total:    r1.count ?? 0,
    publicacoes_pendentes_fs: r2.count ?? 0,
    ultima_execucao:      statusRow ?? r4.data?.[0] ?? r3.data?.[0] ?? null,
    ultimo_log:           r3.data?.[0] ?? null,
    status_cursor:        statusRow ?? r4.data?.[0] ?? null,
    config: {
      advise_api_url:    ADVISE_API_URL,
      advise_cliente_id: ADVISE_CLIENTE_ID ? ADVISE_CLIENTE_ID.slice(0,8)+'...' : 'N/A',
      token_ok:          !!ADVISE_API_TOKEN,
      modo:              ADVISE_CLIENTE_ID ? 'api_v1' : 'core_fallback',
      por_pagina_padrao: DEFAULT_POR_PAGINA,
      max_paginas_padrao: DEFAULT_MAX_PAGINAS,
    },
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────
Deno.serve(async (req:Request) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'sync';
  let body: Record<string, unknown> = {};

  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  try {
    let result: unknown;
    switch (action) {
      case 'status':
        result = await actionStatus();
        break;

      case 'sync': {
        // Intervalo padrão: ontem a hoje
        const hoje   = new Date();
        const ontem  = new Date(hoje); ontem.setDate(hoje.getDate()-1);
        const fmt    = (d:Date) => d.toISOString().split('T')[0];
        const inicio = url.searchParams.get('data_inicio') ?? fmt(ontem);
        const fim    = url.searchParams.get('data_fim')    ?? fmt(hoje);
        const cursor = await getAdviseStatusRow();
        const paginaParam = url.searchParams.get('pagina');
        const scopeCnjs = extractScopedCnjs(
          body.processNumbers
          ?? body.numero_cnj
          ?? url.searchParams.get('processNumbers')
          ?? url.searchParams.get('numero_cnj')
          ?? ''
        );
        const paginaCursor = (
          !paginaParam &&
          cursor?.status === 'running' &&
          String(cursor?.ultima_data_movimento ?? '').startsWith(fim)
        ) ? Number(cursor?.ultima_pagina ?? 1) : 1;
        result = await actionSync(inicio, fim, {
          paginaInicial: Number(paginaParam ?? paginaCursor),
          porPagina: Number(url.searchParams.get('por_pagina') ?? DEFAULT_POR_PAGINA),
          maxPaginas: Number(url.searchParams.get('max_paginas') ?? DEFAULT_MAX_PAGINAS),
          scopeCnjs,
        });
        break;
      }

      case 'sync_range': {
        const inicio = url.searchParams.get('data_inicio');
        const fim    = url.searchParams.get('data_fim');
        if (!inicio||!fim)
          return new Response(
            JSON.stringify({error:'data_inicio e data_fim são obrigatórios para sync_range'}),
            {status:400,headers:{'Content-Type':'application/json'}});
        const cursor = await getAdviseStatusRow();
        const paginaParam = url.searchParams.get('pagina');
        const scopeCnjs = extractScopedCnjs(
          body.processNumbers
          ?? body.numero_cnj
          ?? url.searchParams.get('processNumbers')
          ?? url.searchParams.get('numero_cnj')
          ?? ''
        );
        const paginaCursor = (
          !paginaParam &&
          cursor?.status === 'running' &&
          String(cursor?.ultima_data_movimento ?? '').startsWith(fim)
        ) ? Number(cursor?.ultima_pagina ?? 1) : 1;
        result = await actionSync(inicio, fim, {
          paginaInicial: Number(paginaParam ?? paginaCursor),
          porPagina: Number(url.searchParams.get('por_pagina') ?? DEFAULT_POR_PAGINA),
          maxPaginas: Number(url.searchParams.get('max_paginas') ?? DEFAULT_MAX_PAGINAS),
          scopeCnjs,
        });
        break;
      }

      default:
        return new Response(
          JSON.stringify({error:`action desconhecida: "${action}". Use: sync | sync_range | status`}),
          {status:400,headers:{'Content-Type':'application/json'}});
    }

    return new Response(JSON.stringify(result,null,2), {
      headers:{'Content-Type':'application/json'},
    });
  } catch(err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (action === 'sync' || action === 'sync_range') {
      await touchAdviseStatus({ status: 'error', erro: msg, updated_at: new Date().toISOString() });
    }
    log('error','erro_fatal',{action,erro:msg});
    return new Response(JSON.stringify({error:msg}),
      {status:500,headers:{'Content-Type':'application/json'}});
  }
});
