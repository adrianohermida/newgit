import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { checkRateLimit, safeBatchSize, createPublicClient } from '../_shared/rate-limit.ts';

/**
 * processo-sync  v1
 *
 * Pipeline completo de sincronização bidirecional conforme microsprints:
 *
 * Sprint 1 – levantamento:   action=levantamento
 * Sprint 2 – sync bidirecional: action=sync_bidirectional  (FS→Supabase + Supabase→FS)
 * Sprint 3 – título CNJ:     embutido em criar_accounts e sync_bidirectional
 * Sprint 4 – enriquecimento: action=enriquecer  (partes, adriano, audiências)
 * Sprint 5 – push FS:        action=push_freshsales  (somente após levantamento completo)
 * Sprint 6 – cron advise:    action=cron_advise  (novas pubs sem leilão)
 * Sprint 7 – auditoria:      action=auditoria
 * Pipeline completo:         action=pipeline  (S1→S4→S2→S5→S7)
 *
 * REGRAS MANDATÓRIAS:
 *  - Nunca sobrescrever campo preenchido com valor nulo/vazio.
 *  - Sobrescrita só permitida quando dado DataJud diverge do FS.
 *  - Títulos sempre no formato: CNJ (POLO ATIVO [e outros] x POLO PASSIVO [e outros]).
 *  - Publicações com palavrasChave leilão/leilões → nunca persistir.
 *  - Fluxo bidirecional FS↔Supabase; unidirecional Supabase→FS para enriquecimento.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return undefined;
}

// ── Env ──────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_DOMAIN_RAW = Deno.env.get('FRESHSALES_DOMAIN')!;
const FS_API_KEY    = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_OWNER_ID   = Number(envFirst(
  'FRESHSALES_OWNER_ID',
  'FS_OWNER_ID',
) ?? '31000147944');
const ADVISE_TOKEN  = Deno.env.get('ADVISE_TOKEN')!;

const FS_TYPE_PUBLICACOES = Number(envFirst(
  'FRESHSALES_PUBLICACAO_ACTIVITY_TYPE_ID',
  'FRESHSALES_PUBLICACOES_ACTIVITY_TYPE_ID',
  'FRESHSALES_ACTIVITY_TYPE_PUBLICACAO_ID',
  'FRESHSALES_SALES_ACTIVITY_TYPE_PUBLICACAO_ID',
  'FRESHSALES_DEFAULT_ACTIVITY_TYPE_ID',
  'FS_TYPE_PUBLICACOES',
) ?? '31001147699');
const FS_TYPE_ANDAMENTOS  = Number(envFirst(
  'FRESHSALES_ACTIVITY_TYPE_ANDAMENTO',
  'FRESHSALES_ACTIVITY_TYPE_ANDAMENTOS',
  'FRESHSALES_ANDAMENTO_ACTIVITY_TYPE_ID',
  'FS_TYPE_ANDAMENTOS',
) ?? '31001147751');

// Advogado cujo polo representado deve ser identificado
const ADVOGADO_REGEX = /adriano\s+menezes\s+hermida\s+maia/i;

const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: 'judiciario' } });
const dbPublic = createPublicClient(); // schema public para rate limit
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
function log(n: 'info'|'warn'|'error', m: string, e: Record<string,unknown> = {}) {
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
}

// ── Freshsales ────────────────────────────────────────────────────────────────
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
async function fsReq(
  method: 'GET'|'POST'|'PUT',
  path: string, body?: unknown,
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
      if (r.status === 429) { await sleep(2500 * i); continue; }
      if (r.status >= 500 && i < 3) { await sleep(1500 * i); continue; }
      return { status: r.status, data };
    } catch(e) { if (i === 3) throw e; await sleep(1000*i); }
  }
  throw new Error('fsReq retries esgotados');
}
const fsGet  = (p: string)             => fsReq('GET',  p);
const fsPost = (p: string, b: unknown) => fsReq('POST', p, b);
const fsPut  = (p: string, b: unknown) => fsReq('PUT',  p, b);

// ── CNJ ───────────────────────────────────────────────────────────────────────
function normCNJ(r: string): string|null {
  const d = (r ?? '').replace(/[^0-9]/g,'');
  return d.length === 20 ? d : null;
}
function cnj20toFmt(cnj: string): string {
  return `${cnj.slice(0,7)}-${cnj.slice(7,9)}.${cnj.slice(9,13)}.${cnj.slice(13,14)}.${cnj.slice(14,16)}.${cnj.slice(16)}`;
}
function inferirTribunal(d: string): string|null {
  const u=(d??'').toUpperCase();
  if(u.includes('DJSP')||u.includes('TJSP')) return 'TJSP';
  if(u.includes('DJAM')||u.includes('TJAM')) return 'TJAM';
  if(u.includes('DJSC')||u.includes('TJSC')) return 'TJSC';
  if(u.includes('TRT15')) return 'TRT15';
  if(u.includes('TRT'))   return 'TRT';
  if(u.includes('TRF'))   return 'TRF';
  if(u.includes('STJ'))   return 'STJ';
  if(u.includes('STF'))   return 'STF';
  return null;
}

// ── Sprint 3: buildTitulo ─────────────────────────────────────────────────────
type Parte = { nome: string; polo: string };
function nomesPolo(partes: Parte[], polo: 'ativo'|'passivo'): string {
  const ns = partes.filter(p => p.polo === polo).map(p => p.nome.trim()).filter(Boolean);
  if (ns.length === 0) return '';
  if (ns.length === 1) return ns[0];
  return `${ns[0]} e outros`;
}
async function buildTitulo(
  processoId: string, cnjFmt: string, proc: Record<string,unknown>,
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

// ── Sprint 2: merge seguro (nunca sobrescreve com nulo) ───────────────────────
// Retorna campos do FS que devem ser copiados para o Supabase
function mergeSeguro(
  supabase: Record<string,unknown>,
  freshsales: Record<string,unknown>,
): Record<string,unknown> {
  const update: Record<string,unknown> = {};
  const campos: [string, string][] = [
    ['polo_ativo',            'cf_polo_ativo'],
    ['polo_passivo',          'cf_parte_adversa'],
    ['tribunal',              'cf_tribunal'],
    ['orgao_julgador',        'cf_vara'],
    ['status_atual_processo', 'cf_status'],
    ['area',                  'cf_area'],
    ['valor_causa',           'annual_revenue'],
    ['instancia',             'cf_instancia'],
    ['classe',                'cf_classe'],
    ['assunto_principal',     'cf_assunto'],
    ['sistema',               'cf_sistema'],
    ['comarca',               'city'],
  ];
  for (const [sbCampo, fsCampo] of campos) {
    const sbVal = supabase[sbCampo];
    const fsVal = freshsales[fsCampo];
    // FS → Supabase: só copia se Supabase está nulo e FS tem dado
    if (!sbVal && fsVal) update[sbCampo] = fsVal;
  }
  return update;
}

// Custom fields para envio ao FS (Supabase → FS)
// REGRA: só envia campos não-nulos; nunca apaga valor existente no FS
function buildCF(
  proc: Record<string,unknown>, cnjFmt: string,
): Record<string,unknown> {
  const cf: Record<string,unknown> = { cf_processo: cnjFmt };
  // Só adiciona se valor existe no Supabase
  const set = (key: string, val: unknown) => { if (val != null && val !== '') cf[key] = val; };
  set('cf_tribunal',             proc.tribunal);
  set('cf_vara',                 proc.orgao_julgador);
  set('cf_numero_do_juizo',      proc.orgao_julgador_codigo);
  set('cf_classe',               proc.classe);
  set('cf_assunto',              proc.assunto_principal ?? proc.assunto);
  set('cf_instancia',            proc.instancia);
  set('cf_polo_ativo',           proc.polo_ativo);
  set('cf_parte_adversa',        proc.polo_passivo);
  set('cf_status',               proc.status_atual_processo);
  set('cf_data_de_distribuio',   proc.data_ajuizamento);
  set('cf_data_ultimo_movimento',proc.data_ultima_movimentacao);
  set('cf_descricao_ultimo_movimento', proc.ultimo_movimento_descricao);
  set('cf_area',                 proc.area);
  set('cf_sistema',              proc.sistema);
  if (proc.segredo_justica != null) set('cf_segredo_de_justica', proc.segredo_justica);
  set('cf_DJ',                   proc.nome_diario);
  set('cf_publicacao_em',        proc.ultima_publicacao_em);
  set('cf_contedo_publicacao',   proc.ultima_publicacao_conteudo);
  set('cf_prazo_fim',            proc.ultimo_prazo_fim);
  return cf;
}

function buildStandardAccountFields(proc: Record<string,unknown>): Record<string,unknown> {
  const body: Record<string,unknown> = {};
  const set = (key: string, val: unknown) => { if (val != null && val !== '') body[key] = val; };
  set('website', proc.link_externo_processo);
  set('city', proc.comarca);
  set('annual_revenue', proc.valor_causa);
  return body;
}

// ── Sprint 6: filtro leilão ───────────────────────────────────────────────────
function ehLeilao(item: Record<string,unknown>): boolean {
  const pk = (item.palavrasChave ?? []) as unknown[];
  return (pk as string[]).some(p => typeof p==='string' && /leil[ãõa][oe]?s?/i.test(p));
}

// ── Deduplicação: busca account existente no FS por cf_processo ───────────────
async function buscarAccountFs(cnjFmt: string): Promise<Record<string,unknown>|null> {
  try {
    const { status, data } = await fsPost('filtered_search/sales_account', {
      filter_rule: [{ attribute: 'cf_processo', operator: 'is_in', value: [cnjFmt] }],
      page: 1, per_page: 3,
    });
    if (status === 200) {
      const list = ((data as Record<string,unknown>).sales_accounts ?? []) as Record<string,unknown>[];
      if (list.length > 0) return list[0];
    }
  } catch(e) { log('warn','buscar_account_fs_erro',{ cnj: cnjFmt, erro: String(e) }); }
  return null;
}

// ── Registrar divergência ────────────────────────────────────────────────────
async function registrarDivergencia(
  processoId: string|null, accountId: string|null,
  tipo: string, campo?: string, valSB?: string, valFS?: string,
): Promise<void> {
  try {
    await db.from('sync_divergencias').insert({
      processo_id: processoId, account_id_fs: accountId,
      tipo, campo, valor_supabase: valSB, valor_freshsales: valFS,
    });
  } catch { /* não bloqueia */ }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPRINT 1 — Levantamento
// ═══════════════════════════════════════════════════════════════════════════════
async function sprintLevantamento(): Promise<Record<string,unknown>> {
  const [r1,r2,r3,r4,r5,r6,r7,r8,r9,r10] = await Promise.all([
    db.from('processos').select('*',{count:'exact',head:true}),
    db.from('processos').select('*',{count:'exact',head:true}).not('account_id_freshsales','is',null),
    db.from('processos').select('*',{count:'exact',head:true}).is('account_id_freshsales',null),
    db.from('processos').select('*',{count:'exact',head:true}).eq('dados_incompletos',true),
    db.from('publicacoes').select('*',{count:'exact',head:true}),
    db.from('publicacoes').select('*',{count:'exact',head:true}).is('freshsales_activity_id',null).not('processo_id','is',null),
    db.from('partes').select('*',{count:'exact',head:true}),
    db.from('movimentacoes').select('*',{count:'exact',head:true}).is('freshsales_activity_id',null),
    db.from('sync_divergencias').select('*',{count:'exact',head:true}).eq('resolvido',false),
    db.from('processos').select('*',{count:'exact',head:true}).not('parte_representada_adriano','is',null),
  ]);

  // Detectar títulos no formato errado (não segue padrão CNJ)
  const { data: titErrados } = await db.from('processos')
    .select('id,numero_cnj,titulo,account_id_freshsales')
    .or('titulo.ilike.Processo no%,titulo.ilike.Processo n°%')
    .limit(100);

  // Detectar processos com account mas campos nulos (divergência)
  const { data: incompletos } = await db.from('processos')
    .select('id,numero_cnj,account_id_freshsales')
    .not('account_id_freshsales','is',null)
    .is('polo_ativo',null).limit(5);

  return {
    processos: {
      total:         r1.count??0,
      com_account:   r2.count??0,
      sem_account:   r3.count??0,
      incompletos:   r4.count??0,
    },
    publicacoes: {
      total:         r5.count??0,
      pendentes_fs:  r6.count??0,
    },
    partes:          { total: r7.count??0 },
    movimentacoes:   { pendentes_fs: r8.count??0 },
    divergencias_abertas: r9.count??0,
    processos_com_adriano: r10.count??0,
    titulos_errados: titErrados?.length ?? 0,
    amostra_incompletos: incompletos?.map(p => p.numero_cnj) ?? [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPRINT 4 — Enriquecimento: partes das publicações + identificação do Adriano
// ═══════════════════════════════════════════════════════════════════════════════
function parsePartesDoConteudo(conteudo: string): { nome: string; polo: 'ativo'|'passivo' }[] {
  if (!conteudo) return [];
  const match = conteudo.match(/Parte\(s\):\s*([^\n]{3,500})/);
  if (!match) return [];
  const trecho = match[1];
  const partes: { nome: string; polo: 'ativo'|'passivo' }[] = [];
  const re = /([A-ZÁÉÍÓÚÀÂÊÔÃÕÇŒ][A-ZÁÉÍÓÚÀÂÊÔÃÕÇŒa-záéíóúàâêôãõç0-9\s\.\-\/\'&]+?)\s*\(([AP])\)/g;
  let m;
  while ((m = re.exec(trecho)) !== null) {
    const nome = m[1].trim();
    if (nome.length < 3) continue;
    partes.push({ nome, polo: m[2] === 'A' ? 'ativo' : 'passivo' });
  }
  return partes;
}

function extrairAdvogados(conteudo: string): string[] {
  const match = conteudo.match(/Advogado\(s\):\s*([^\n]{3,})/);
  if (!match) return [];
  return match[1].split(',').map(a => a.trim()).filter(Boolean);
}

async function sprintEnriquecer(limite: number): Promise<Record<string,unknown>> {
  // Publica com conteúdo que tem Parte(s): — ainda não processadas
  const { data: pubs } = await db.from('publicacoes')
    .select('id,processo_id,numero_processo_api,raw_payload,adriano_polo')
    .not('processo_id','is',null)
    .is('adriano_polo',null)
    .limit(limite);

  if (!pubs || pubs.length === 0)
    return { ok: true, total: 0, msg: 'Nenhuma publicação pendente de enriquecimento' };

  let partesInseridas = 0, adrianoId = 0, erros = 0;
  const processosTituloAtualizar = new Set<string>();

  for (const pub of pubs) {
    const raw = pub.raw_payload as Record<string,unknown>;
    const conteudo = String(raw?.conteudo ?? '');
    if (!conteudo || !pub.processo_id) {
      await db.from('publicacoes').update({ adriano_polo: 'nao_identificado' }).eq('id', pub.id);
      continue;
    }

    // 1. Extrair partes
    const partesTexto = parsePartesDoConteudo(conteudo);
    const advogados   = extrairAdvogados(conteudo);
    const temAdrianoAdv = advogados.some(a => ADVOGADO_REGEX.test(a));

    for (const parte of partesTexto) {
      const { error } = await db.from('partes').upsert(
        { processo_id: pub.processo_id, nome: parte.nome, polo: parte.polo,
          tipo_pessoa: /\b(LTDA|S\.A|SA|ME|EPP|EIRELI|BANCO|FUND|ASSOC|SIND|CONSTRU|INCORP)/i.test(parte.nome)
            ? 'JURIDICA' : 'FISICA',
          advogados: [], fonte: 'publicacao' },
        { onConflict: 'processo_id,nome,polo', ignoreDuplicates: true },
      );
      if (!error) partesInseridas++;
    }

    // 2. Identificar polo representado pelo Adriano
    let adrianoPolo = 'nao_identificado';
    if (temAdrianoAdv && partesTexto.length > 0) {
      // Adriano representa tipicamente o polo ativo (autor/requerente)
      // Identifica pelo polo das partes mencionadas após o nome Adriano no texto
      const textoAdrianoPos = conteudo.search(ADVOGADO_REGEX);
      if (textoAdrianoPos >= 0) {
        // Busca qual parte está associada ao Adriano pelo contexto
        // Estratégia: se tem polo ativo definido → representa polo ativo
        const ativos   = partesTexto.filter(p => p.polo === 'ativo');
        const passivos = partesTexto.filter(p => p.polo === 'passivo');
        if (ativos.length > 0)   adrianoPolo = 'ativo';
        else if (passivos.length > 0) adrianoPolo = 'passivo';
      }

      // Atualiza o processo com a parte representada
      if (adrianoPolo !== 'nao_identificado') {
        const parteRep = partesTexto.find(p => p.polo === adrianoPolo);
        if (parteRep) {
          const nomePartes = partesTexto.filter(p => p.polo === adrianoPolo).map(p => p.nome);
          const nomeRep = nomePartes.length === 1 ? nomePartes[0] : `${nomePartes[0]} e outros`;
          await db.from('processos')
            .update({ parte_representada_adriano: nomeRep })
            .eq('id', pub.processo_id)
            .is('parte_representada_adriano', null); // só atualiza se ainda não definido
          adrianoId++;
          log('info','adriano_identificado',{ processo_id: pub.processo_id, parte: nomeRep, polo: adrianoPolo });
        }
      }
    }

    await db.from('publicacoes')
      .update({ adriano_polo: adrianoPolo }).eq('id', pub.id);

    // 3. Marcar processo para atualizar título (agora tem partes)
    if (partesTexto.length > 0) processosTituloAtualizar.add(pub.processo_id);
  }

  // 4. Atualizar títulos dos processos que ganharam partes
  let titulosAtualizados = 0;
  for (const processoId of processosTituloAtualizar) {
    const { data: proc } = await db.from('processos')
      .select('id,numero_cnj,numero_processo,polo_ativo,polo_passivo,titulo')
      .eq('id', processoId).maybeSingle();
    if (!proc) continue;
    const cnj20 = normCNJ(proc.numero_cnj ?? proc.numero_processo ?? '');
    if (!cnj20) continue;
    const cnjFmt  = cnj20toFmt(cnj20);
    const novoTitulo = await buildTitulo(processoId, cnjFmt, proc as Record<string,unknown>);
    // Só atualiza se o título vai melhorar (ganhar partes)
    if (novoTitulo !== proc.titulo && novoTitulo !== cnjFmt) {
      await db.from('processos').update({ titulo: novoTitulo }).eq('id', processoId);
      titulosAtualizados++;
      log('info','titulo_atualizado',{ processo_id: processoId, titulo: novoTitulo });
    }
  }

  log('info','sprint_enriquecer',{ partesInseridas, adrianoId, titulosAtualizados, erros });
  return { ok: true, total: pubs.length, partesInseridas, adrianoId, titulosAtualizados, erros };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPRINT 2 — Sincronização bidirecional FS ↔ Supabase
// ═══════════════════════════════════════════════════════════════════════════════
async function sprintSyncBidirectional(limite: number): Promise<Record<string,unknown>> {
  // Processos com account — busca dados do FS e compara com Supabase
  const { data: procs } = await db.from('processos')
    .select('id,numero_cnj,numero_processo,titulo,polo_ativo,polo_passivo,'+
            'tribunal,orgao_julgador,orgao_julgador_codigo,instancia,area,valor_causa,'+
            'classe,assunto,assunto_principal,sistema,comarca,link_externo_processo,segredo_justica,'+
            'status_atual_processo,data_ajuizamento,data_ultima_movimentacao,'+
            'account_id_freshsales,dados_incompletos,parte_representada_adriano')
    .not('account_id_freshsales','is',null)
    .limit(limite);

  if (!procs || procs.length === 0)
    return { ok: true, total: 0, msg: 'Nenhum processo com account_id' };

  let atualizadosSb = 0, atualizadosFs = 0, erros = 0, divergencias = 0;

  for (const proc of procs) {
    const accountId = proc.account_id_freshsales;
    const cnj20 = normCNJ(proc.numero_cnj ?? proc.numero_processo ?? '');
    if (!cnj20 || !accountId) continue;
    const cnjFmt = cnj20toFmt(cnj20);

    try {
      // Busca dados atuais do account no FS
      const { status, data: fsData } = await fsGet(`sales_accounts/${accountId}`);
      if (status !== 200) { erros++; continue; }

      const fsCF = (((fsData as Record<string,Record<string,unknown>>)
        .sales_account?.custom_fields) ??
        ((fsData as Record<string,Record<string,unknown>>).sales_account?.custom_field) ??
        {}) as Record<string,unknown>;
      const fsName = String(
        (fsData as Record<string,Record<string,unknown>>).sales_account?.name ?? ''
      );

      // ── FS → Supabase: copia campos que o Supabase não tem ──────────────
      const sbUpdate = mergeSeguro(proc as Record<string,unknown>, fsCF);
      if (Object.keys(sbUpdate).length > 0) {
        await db.from('processos').update(sbUpdate).eq('id', proc.id);
        atualizadosSb++;
        log('info','fs_to_sb',{ processo_id: proc.id, campos: Object.keys(sbUpdate) });
        for (const [campo, val] of Object.entries(sbUpdate)) {
          await registrarDivergencia(proc.id, accountId,
            'campo_nulo_sb', campo, undefined, String(val));
        }
      }

      // ── Sprint 3: título — verifica/corrige no FS se não segue padrão ──
      const tituloCorreto = await buildTitulo(
        proc.id, cnjFmt, { ...proc, ...sbUpdate } as Record<string,unknown>
      );
      const tituloDivergente = fsName && fsName !== tituloCorreto;
      // Só atualiza nome no FS se:
      //   a) nome atual no FS não tem partes E tituloCorreto tem, OU
      //   b) nome no FS está no formato errado ("Processo no...")
      const nomeErrado = /^Processo n[o°]/i.test(fsName);
      const ganhariuPartes = !fsName.includes(' x ') && tituloCorreto.includes(' x ');
      if (tituloDivergente && (nomeErrado || ganhariuPartes)) {
        await registrarDivergencia(proc.id, accountId,
          'titulo_errado', 'name', tituloCorreto, fsName);
        divergencias++;
      }

      // ── Supabase → FS: envia dados do Supabase que o FS não tem ─────────
      // (só campos vazios no FS, nunca sobrescreve)
      const procMerged = { ...proc, ...sbUpdate } as Record<string,unknown>;
      const cf = buildCF(procMerged, cnjFmt);
      const std = buildStandardAccountFields(procMerged);
      // Filtra apenas campos que o FS não tem (cf no FS está vazio/nulo)
      const cfParaEnviar: Record<string,unknown> = {};
      for (const [k, v] of Object.entries(cf)) {
        if (v != null && v !== '' && !fsCF[k]) cfParaEnviar[k] = v;
      }
      if (Object.keys(cfParaEnviar).length > 0 || (nomeErrado && tituloCorreto !== cnjFmt)) {
        const body: Record<string,unknown> = {
          ...std,
          custom_fields: cfParaEnviar,
          custom_field: cfParaEnviar,
        };
        if (nomeErrado && tituloCorreto !== cnjFmt) body.name = tituloCorreto;
        const { status: pu } = await fsPut(`sales_accounts/${accountId}`,
          { sales_account: body });
        if (pu === 200) { atualizadosFs++; log('info','sb_to_fs',{ processo_id: proc.id, campos: Object.keys(cfParaEnviar) }); }
        else erros++;
      }
    } catch(e) { erros++; log('error','sync_bi_erro',{ processo_id: proc.id, erro: String(e) }); }
    await sleep(200);
  }

  log('info','sprint_sync_bidirectional',{ atualizadosSb, atualizadosFs, divergencias, erros });
  return { ok: true, total: procs.length, atualizadosSb, atualizadosFs, divergencias, erros };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPRINT 5 — Push Freshsales (criar novos accounts + sync publicações + andamentos)
// ═══════════════════════════════════════════════════════════════════════════════
async function sprintPushFs(limite: number, batch: number): Promise<Record<string,unknown>> {
  // 5a. Criar accounts para processos sem account
  const { data: semAccount } = await db.from('processos')
    .select('id,numero_cnj,numero_processo,titulo,polo_ativo,polo_passivo,'+
            'tribunal,orgao_julgador,orgao_julgador_codigo,instancia,area,valor_causa,'+
            'classe,assunto,assunto_principal,sistema,comarca,link_externo_processo,segredo_justica,'+
            'data_ajuizamento,data_ultima_movimentacao,status_atual_processo,'+
            'parte_representada_adriano')
    .is('account_id_freshsales', null)
    .limit(limite);

  let criados = 0, vinculados = 0, errosCriar = 0;
  const detalhe: unknown[] = [];
  const erroAmostra: unknown[] = [];

  for (const proc of semAccount ?? []) {
    const cnj20 = normCNJ(proc.numero_cnj ?? proc.numero_processo ?? '');
    if (!cnj20) { errosCriar++; continue; }
    const cnjFmt = cnj20toFmt(cnj20);

    // Deduplicação: busca existente no FS
    const fsAccount = await buscarAccountFs(cnjFmt);
    await sleep(300);
    if (fsAccount) {
      const accountId = String(fsAccount.id);
      await db.from('processos').update({ account_id_freshsales: accountId }).eq('id', proc.id);
      vinculados++;
      log('info','account_vinculado_existente',{ cnj: cnjFmt, account_id: accountId });
      if (detalhe.length < 10) detalhe.push({ cnj: cnjFmt, account_id: accountId, acao: 'vinculado' });

      // FS→Supabase: copia campos do account existente que o Supabase não tem
      const fsCF = (fsAccount.custom_fields ?? fsAccount.custom_field ?? {}) as Record<string,unknown>;
      const sbUpd = mergeSeguro(proc as Record<string,unknown>, fsCF);
      if (Object.keys(sbUpd).length > 0)
        await db.from('processos').update(sbUpd).eq('id', proc.id);
      continue;
    }

    // Não existe → criar
    // Sprint 4 deve ter rodado antes: título já tem partes se disponíveis
    const titulo = proc.titulo && proc.titulo !== cnj20
      ? proc.titulo
      : await buildTitulo(proc.id, cnjFmt, proc as Record<string,unknown>);
    try {
      const cf = buildCF(proc as Record<string,unknown>, cnjFmt);
      const std = buildStandardAccountFields(proc as Record<string,unknown>);
      const { status, data } = await fsPost('sales_accounts', {
        sales_account: {
          name: titulo,
          owner_id: FS_OWNER_ID,
          ...std,
          custom_fields: cf,
          custom_field: cf,
        },
      });
      if (status === 200 || status === 201) {
        const acct = (data as Record<string,Record<string,unknown>>).sales_account;
        const accountId = String(acct?.id ?? '');
        if (accountId && accountId !== 'undefined') {
          await db.from('processos')
            .update({ account_id_freshsales: accountId, titulo, fs_sync_at: new Date().toISOString() })
            .eq('id', proc.id);
          criados++;
          log('info','account_criado',{ cnj: cnjFmt, account_id: accountId, titulo });
          if (detalhe.length < 10) detalhe.push({ cnj: cnjFmt, account_id: accountId, titulo, acao: 'criado' });
        } else errosCriar++;
      } else {
        errosCriar++;
        if (erroAmostra.length < 3)
          erroAmostra.push({ cnj: cnjFmt, status, erro: (data as Record<string,unknown>).errors });
      }
    } catch(e) { errosCriar++; log('error','criar_account_exc',{ cnj: cnjFmt, erro: String(e) }); }
    await sleep(200);
  }

  // 5b. Enviar publicações pendentes como activities
  const { data: pubs } = await db.from('publicacoes')
    .select('id,processo_id,data_publicacao,nome_diario,cidade_comarca_descricao,'+
            'vara_descricao,despacho,conteudo,raw_payload')
    .is('freshsales_activity_id',null)
    .not('processo_id','is',null)
    .order('data_publicacao',{ ascending: false })
    .limit(batch);

  const procIds = [...new Set((pubs ?? []).map(p => p.processo_id))];
  const { data: accs } = await db.from('processos')
    .select('id,account_id_freshsales').in('id', procIds);
  const accMap = new Map<string,string>();
  for (const a of accs ?? []) if (a.account_id_freshsales) accMap.set(a.id, a.account_id_freshsales);

  let pubEnviadas = 0, pubSemAccount = 0, pubErros = 0;
  const pubErroAmostra: Record<string,unknown>[] = [];
  const pubSemAccountAmostra: Record<string,unknown>[] = [];
  for (const pub of pubs ?? []) {
    const raw = pub.raw_payload as Record<string,unknown>;
    // Filtro leilão
    if (ehLeilao(raw)) continue;
    const accountId = accMap.get(pub.processo_id);
    if (!accountId) {
      pubSemAccount++;
      if (pubSemAccountAmostra.length < 5) pubSemAccountAmostra.push({ pub_id: pub.id, processo_id: pub.processo_id });
      continue;
    }
    try {
      const dtBase = pub.data_publicacao ? new Date(String(pub.data_publicacao)) : new Date();
      const dtFim  = new Date(dtBase); dtFim.setDate(dtBase.getDate() + 2);
      const toDate = (d: Date) => d.toISOString().split('T')[0];
      const notes = [
        '=== PUBLICAÇÃO DJ ===',
        `Diário   : ${pub.nome_diario??''}`,
        `Data     : ${dtBase.toLocaleDateString('pt-BR')}`,
        `Comarca  : ${pub.cidade_comarca_descricao??''}`,
        `Vara     : ${pub.vara_descricao??''}`, '',
        String(pub.despacho || pub.conteudo || 'Sem conteúdo.').slice(0, 5000),
      ].join('\n');
      const { status, data: actData } = await fsPost('sales_activities', {
        sales_activity: {
          targetable_type: 'SalesAccount',
          targetable_id: Number(accountId),
          owner_id: FS_OWNER_ID,
          sales_activity_type_id: FS_TYPE_PUBLICACOES,
          title: 'Diário de Justiça',
          start_date: `${toDate(dtBase)}T00:01:00Z`,
          end_date:   `${toDate(dtFim)}T23:59:00Z`,
          notes,
        },
      });
      if (status === 200 || status === 201) {
        const aid = String(
          ((actData as Record<string,Record<string,unknown>>).sales_activity?.id) ?? ''
        );
        if (aid) { await db.from('publicacoes').update({ freshsales_activity_id: aid }).eq('id', pub.id); pubEnviadas++; }
        else pubErros++;
      } else {
        pubErros++;
        if (pubErroAmostra.length < 5) pubErroAmostra.push({
          pub_id: pub.id,
          processo_id: pub.processo_id,
          account_id: accountId,
          status,
          erro: actData,
        });
      }
    } catch (e) {
      pubErros++;
      if (pubErroAmostra.length < 5) pubErroAmostra.push({
        pub_id: pub.id,
        processo_id: pub.processo_id,
        account_id: accountId,
        erro: String(e),
      });
    }
    await sleep(120);
  }

  // 5c. Enviar andamentos pendentes
  const { data: movs } = await db.from('movimentacoes')
    .select('id,processo_id,conteudo,data_movimentacao,fonte')
    .is('freshsales_activity_id',null).limit(Math.min(limite, 50));
  let movEnviados = 0, movErros = 0;
  const movErroAmostra: Record<string,unknown>[] = [];
  const movSemAccountAmostra: Record<string,unknown>[] = [];
  const movAccMap = new Map<string,string>();
  for (const m of movs ?? []) {
    if (!movAccMap.has(m.processo_id)) {
      const { data: p } = await db.from('processos').select('account_id_freshsales')
        .eq('id', m.processo_id).maybeSingle();
      if (p?.account_id_freshsales) movAccMap.set(m.processo_id, p.account_id_freshsales);
    }
    const accountId = movAccMap.get(m.processo_id);
    if (!accountId) {
      if (movSemAccountAmostra.length < 5) movSemAccountAmostra.push({ mov_id: m.id, processo_id: m.processo_id });
      continue;
    }
    try {
      const dtBase = m.data_movimentacao ? new Date(m.data_movimentacao) : new Date();
      const dtFim  = new Date(dtBase); dtFim.setDate(dtBase.getDate() + 1);
      const toDate = (d: Date) => d.toISOString().split('T')[0];
      const { status, data: actData } = await fsPost('sales_activities', {
        sales_activity: {
          targetable_type: 'SalesAccount',
          targetable_id: Number(accountId),
          owner_id: FS_OWNER_ID,
          sales_activity_type_id: FS_TYPE_ANDAMENTOS,
          title: `[Andamento] ${String(m.conteudo??'').slice(0,80)}`,
          start_date: `${toDate(dtBase)}T00:01:00Z`,
          end_date: `${toDate(dtFim)}T23:59:00Z`,
          notes: `=== ANDAMENTO PROCESSUAL ===\nData: ${dtBase.toLocaleDateString('pt-BR')}\nFonte: ${m.fonte??'DataJud'}\n\n${m.conteudo??''}`,
        },
      });
      if (status === 200 || status === 201) {
        const aid = String(((actData as Record<string,Record<string,unknown>>).sales_activity?.id)??'');
        if (aid) { await db.from('movimentacoes').update({ freshsales_activity_id: aid }).eq('id', m.id); movEnviados++; }
        else movErros++;
      } else {
        movErros++;
        if (movErroAmostra.length < 5) movErroAmostra.push({
          mov_id: m.id,
          processo_id: m.processo_id,
          account_id: accountId,
          status,
          erro: actData,
        });
      }
    } catch (e) {
      movErros++;
      if (movErroAmostra.length < 5) movErroAmostra.push({
        mov_id: m.id,
        processo_id: m.processo_id,
        account_id: accountId,
        erro: String(e),
      });
    }
    await sleep(80);
  }

  log('info','sprint_push_fs',{ criados, vinculados, errosCriar, pubEnviadas, pubSemAccount, pubErros, movEnviados, movErros });
  return {
    ok: true,
    accounts: { total: semAccount?.length??0, criados, vinculados, erros: errosCriar, detalhe, erroAmostra },
    publicacoes: {
      total: pubs?.length??0,
      enviadas: pubEnviadas,
      sem_account: pubSemAccount,
      erros: pubErros,
      amostra_sem_account: pubSemAccountAmostra,
      amostra_erros: pubErroAmostra,
    },
    andamentos:  {
      total: movs?.length??0,
      enviados: movEnviados,
      erros: movErros,
      amostra_sem_account: movSemAccountAmostra,
      amostra_erros: movErroAmostra,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPRINT 6 — Cron Advise: busca novas publicações sem leilão
// ═══════════════════════════════════════════════════════════════════════════════
async function sprintCronAdvise(): Promise<Record<string,unknown>> {
  if (!ADVISE_TOKEN) return { ok: false, erro: 'ADVISE_TOKEN não configurado' };

  const { data: sync } = await db.from('advise_sync_status').select('*').limit(1).maybeSingle();
  const ultimaMov = sync?.ultima_data_movimento ?? '2000-01-01';

  const resp = await fetch(
    `https://api.advise.com.br/core/v1/publicacoes-clientes/consulta-paginada?paginaAtual=1&registrosPorPagina=100&Lido=false&dataMovimentoInicial=${ultimaMov}`,
    { headers: { Authorization: `Bearer ${ADVISE_TOKEN}` }, signal: AbortSignal.timeout(20000) }
  );
  if (!resp.ok) return { ok: false, erro: `Advise API: ${resp.status}` };

  const api   = await resp.json();
  const itens = (api?.itens ?? []) as Record<string,unknown>[];
  const filtrados  = itens.filter(i => !ehLeilao(i));
  const leiloes    = itens.length - filtrados.length;

  if (filtrados.length > 0) {
    const lote = filtrados.map(item => ({
      advise_id_publicacao_cliente:  item.id,
      advise_id_publicacao:          item.idPublicacao,
      advise_id_mov_usuario_cliente: item.idMovUsuarioCliente,
      advise_id_cliente:             item.idCliente,
      advise_id_usuario_cliente:     item.idUsuarioCliente,
      advise_cod_publicacao:         item.codPublicacao,
      advise_cod_diario:             item.codDiario,
      advise_cod_caderno:            item.codCaderno,
      advise_id_municipio:           item.idMunicipio,
      advise_id_caderno_diario_edicao: item.idCadernoDiarioEdicao,
      data_publicacao:    item.dataPublicacao    ? new Date(item.dataPublicacao as string)    : null,
      data_hora_movimento:item.dataHoraMovimento ? new Date(item.dataHoraMovimento as string) : null,
      data_hora_cadastro: item.dataHoraCadastro  ? new Date(item.dataHoraCadastro as string)  : null,
      ativo: item.ativo, ativo_publicacao: item.ativoPublicacao,
      ano_publicacao: item.anoPublicacao, edicao_diario: item.edicaoDiario,
      cidade_comarca_descricao: item.cidadeComarcaDescricao,
      vara_descricao: item.varaDescricao,
      pagina_inicial_publicacao: item.paginaInicialPublicacao,
      pagina_final_publicacao:   item.paginaFinalPublicacao,
      conteudo: item.conteudo, despacho: item.despacho, corrigido: item.corrigido, lido: item.lido,
      nome_diario: item.nomeDiario, descricao_diario: item.descricaoDiario,
      nome_caderno_diario: item.nomeCadernoDiario, descricao_caderno_diario: item.descricaoCadernoDiario,
      nome_cliente: item.nomeCliente, nome_usuario_cliente: item.nomeUsuarioCliente,
      numero_processo_api: item.numero, raw_payload: item,
    }));
    const { error } = await db.from('publicacoes')
      .upsert(lote, { onConflict: 'advise_id_publicacao_cliente' });
    if (error) return { ok: false, erro: error.message };
  }

  if (sync?.id) {
    const ultimaMovNova = itens.length
      ? (itens[0].dataHoraMovimento as string | null)
      : ultimaMov;
    await db.from('advise_sync_status').update({
      ultima_data_movimento: ultimaMovNova, ultima_execucao: new Date(),
    }).eq('id', sync.id);
  }

  log('info','sprint_cron_advise',{ total: itens.length, inseridos: filtrados.length, leiloes });
  return { ok: true, total_api: itens.length, inseridos: filtrados.length, filtrados_leilao: leiloes };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPRINT 7 — Auditoria
// ═══════════════════════════════════════════════════════════════════════════════
async function sprintAuditoria(): Promise<Record<string,unknown>> {
  const result: Record<string,unknown> = {};

  // 7a. Processos sem account_id (ainda não criados no FS)
  const { count: semAccount } = await db.from('processos')
    .select('*',{count:'exact',head:true}).is('account_id_freshsales',null);
  result.processos_sem_account = semAccount;

  // 7b. Processos com título no formato errado
  const { data: titErrados } = await db.from('processos')
    .select('id,numero_cnj,titulo,account_id_freshsales')
    .or('titulo.ilike.Processo no%,titulo.ilike.Processo n°%').limit(50);
  result.titulos_errados = titErrados?.length ?? 0;
  if (titErrados && titErrados.length > 0) {
    for (const p of titErrados) {
      await registrarDivergencia(p.id, p.account_id_freshsales,
        'titulo_errado', 'titulo', p.numero_cnj, p.titulo);
    }
  }

  // 7c. Processos com account mas sem polo_ativo (dados incompletos)
  const { count: semPolo } = await db.from('processos')
    .select('*',{count:'exact',head:true})
    .not('account_id_freshsales','is',null).is('polo_ativo',null);
  result.processos_sem_polo_ativo = semPolo;

  // 7d. Publicações sem processo vinculado
  const { count: pubSemProc } = await db.from('publicacoes')
    .select('*',{count:'exact',head:true}).is('processo_id',null);
  result.publicacoes_sem_processo = pubSemProc;

  // 7e. Movimentações sem activity_id (pendentes)
  const { count: movPend } = await db.from('movimentacoes')
    .select('*',{count:'exact',head:true}).is('freshsales_activity_id',null);
  result.movimentacoes_pendentes = movPend;

  // 7f. Divergências abertas
  const { count: divAbertas } = await db.from('sync_divergencias')
    .select('*',{count:'exact',head:true}).eq('resolvido',false);
  result.divergencias_abertas = divAbertas;

  // 7g. Publicações sem adriano_polo verificado
  const { count: pubSemAdrianoCheck } = await db.from('publicacoes')
    .select('*',{count:'exact',head:true}).is('adriano_polo',null).not('processo_id','is',null);
  result.publicacoes_sem_verificacao_adriano = pubSemAdrianoCheck;

  // 7h. Processos com adriano identificado
  const { count: comAdrianoId } = await db.from('processos')
    .select('*',{count:'exact',head:true}).not('parte_representada_adriano','is',null);
  result.processos_adriano_identificado = comAdrianoId;

  // 7i. Andamentos sem código TPU (correspondência STG)
  const { count: movSemTpu } = await db.from('movimentacoes')
    .select('*',{count:'exact',head:true}).is('freshsales_activity_id',null);
  result.movimentos_sem_activity_fs = movSemTpu;

  // Resumo de integridade
  result.ok = true;
  result.timestamp = new Date().toISOString();
  log('info','sprint_auditoria', result as Record<string,unknown>);
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'levantamento';
  const limite = Number(url.searchParams.get('limite') ?? '50');
  const batch  = Number(url.searchParams.get('batch')  ?? '25');

  try {
    let result: unknown;
    switch (action) {

      case 'levantamento':       // Sprint 1
        result = await sprintLevantamento();
        break;

      case 'enriquecer':         // Sprint 4
        result = await sprintEnriquecer(limite);
        break;

      case 'sync_bidirectional': // Sprint 2
        result = await sprintSyncBidirectional(limite);
        break;

      case 'push_freshsales':    // Sprint 5
        // Rate limit: ~4 chamadas FS por processo (POST account + PUT campos + GET verify + POST contact)
        {
          const rlPush = await checkRateLimit(dbPublic, 'processo-sync', batch * 4);
          if (!rlPush.ok) {
            result = { ok: false, motivo: 'rate_limit_global', slots_avail: rlPush.slots_avail };
          } else {
            result = await sprintPushFs(limite, safeBatchSize(rlPush.slots_avail, 4, batch));
          }
        }
        break;

      case 'cron_advise':        // Sprint 6
        result = await sprintCronAdvise();
        break;

      case 'auditoria':          // Sprint 7
        result = await sprintAuditoria();
        break;

      case 'pipeline': {         // S1 → S4 → S2 → S5 → S7
        log('info','pipeline_inicio',{ limite, batch });
        const s1 = await sprintLevantamento();
        const s4 = await sprintEnriquecer(Math.min(limite * 5, 500)); // enriquece mais pubs
        const s2 = await sprintSyncBidirectional(Math.min(limite, 30));
        // Rate limit para pipeline
        const rlPipeline = await checkRateLimit(dbPublic, 'processo-sync', batch * 4);
        const safeBatchPipeline = rlPipeline.ok ? safeBatchSize(rlPipeline.slots_avail, 4, batch) : 0;
        const s5 = safeBatchPipeline > 0 ? await sprintPushFs(limite, safeBatchPipeline) : { ok: false, motivo: 'rate_limit_global' };
        const s7 = await sprintAuditoria();
        result = { s1_levantamento: s1, s4_enriquecimento: s4, s2_sync_bi: s2, s5_push_fs: s5, s7_auditoria: s7 };
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
