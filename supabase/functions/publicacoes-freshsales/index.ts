import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { checkRateLimit, safeBatchSize, createPublicClient } from '../_shared/rate-limit.ts';

/**
 * publicacoes-freshsales  v8
 * + Rate limit global integrado (teto 990/hora, quota 300/hora para este caller)
 *
 * CORREÇÕES vs v6:
 *   1. normalizarCNJ agora valida checksum CNJ (algoritmo oficial)
 *   2. Chama tpu-sync?action=enriquecer_processo após criar/vincular processo
 *   3. dispararEnriquecimento() chamado sempre que processoId é resolvido (foiCriado OU já existia s/ classe_id)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  parsePartiesFromText,
  persistirPartes,
  invocarExtractor,
  type ParteCanonica,
} from './_lib/parties.ts';

function envFirst(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return undefined;
}

// ─── Env ────────────────────────────────────────────────────────────────────
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const FS_DOMAIN_RAW        = Deno.env.get('FRESHSALES_DOMAIN')!;
const FS_API_KEY           = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_ACTIVITY_TYPE_ID  = Number(envFirst(
  'FRESHSALES_ACTIVITY_TYPE_PUBLICACOES',
  'FRESHSALES_ACTIVITY_TYPE_PUBLICACAO',
  'FRESHSALES_PUBLICACAO_ACTIVITY_TYPE_ID',
  'FRESHSALES_PUBLICACOES_ACTIVITY_TYPE_ID',
  'FRESHSALES_ACTIVITY_TYPE_PUBLICACAO_ID',
  'FRESHSALES_SALES_ACTIVITY_TYPE_PUBLICACAO_ID',
  'FRESHSALES_ACTIVITY_TYPE_NOTA_PROCESSUAL',
  'FRESHSALES_ACTIVITY_TYPE_INTIMACAO',
  'FRESHSALES_ACTIVITY_TYPE_INTIMACAO_PROCESSUAL',
  'FRESHSALES_DEFAULT_ACTIVITY_TYPE_ID',
  'FS_ACTIVITY_TYPE_ID',
) ?? '31001147751');
const FS_OWNER_ID          = Number(envFirst(
  'FRESHSALES_OWNER_ID',
  'FS_OWNER_ID',
) ?? '31000147944');
const BASE44_WORKSPACE_ID  = Deno.env.get('BASE44_WORKSPACE_ID');

const DOMAIN_MAP: Record<string, string> = {
  'hmadv-7b725ea101eff55.freshsales.io': 'hmadv-org.myfreshworks.com',
};

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: 'judiciario' },
});
const dbPublic = createPublicClient(); // schema public para rate limit

function fsDomain(): string {
  const domain = (FS_DOMAIN_RAW ?? '').trim();
  if (domain.includes('myfreshworks.com')) return domain;
  return DOMAIN_MAP[domain] ?? domain.replace(/\.freshsales\.io$/, '.myfreshworks.com');
}

function supabaseFunctionHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

function normalizeKeyword(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function isAuctionPublication(pub: Record<string, unknown>): boolean {
  const raw = (pub.raw_payload ?? {}) as Record<string, unknown>;
  const palavras = Array.isArray(raw.palavrasChave) ? raw.palavrasChave : [];
  return palavras
    .map((item) => normalizeKeyword(item))
    .some((item) => item === 'LEILAO' || item === 'LEILOES');
}

// ─── Log ────────────────────────────────────────────────────────────────────
type Etapa = 'normalizar_cnj'|'buscar_processo'|'datajud_enrich'|'upsert_processo'
            |'vincular_publicacao'|'persistir_partes'|'extractor_crm'
            |'resolve_account'|'send_activity'|'create_task'|'tpu_enrich';

function log(nivel:'info'|'warn'|'error', etapa:Etapa, pubId:string, cnj:string, extra:Record<string,unknown>={}) {
  console[nivel](JSON.stringify({ publicacao_id:pubId, numero_cnj:cnj, etapa, ...extra }));
}

// ─── Freshsales helpers ─────────────────────────────────────────────────────
function authHeader(): string {
  const k = FS_API_KEY.trim();
  return (k.startsWith('Token ') || k.startsWith('Bearer ')) ? k : `Token token=${k}`;
}
const sleep = (ms:number) => new Promise(r => setTimeout(r,ms));
const shouldRetry = (s:number) => s===429||s>=500;

async function fsPost(path:string, body:unknown): Promise<{status:number;data:Record<string,unknown>}> {
  for (let i=1;i<=3;i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`,{
      method:'POST', headers:{Authorization:authHeader(),'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    const text = await r.text();
    const data = text ? JSON.parse(text) as Record<string, unknown> : {};
    if (!r.ok && (!shouldRetry(r.status) || i===3)) {
      return {
        status: r.status,
        data: {
          ...data,
          __debug: {
            path,
            url: `https://${fsDomain()}/crm/sales/api/${path}`,
          },
        },
      };
    }
    if (!shouldRetry(r.status)||i===3) return {status:r.status, data};
    await sleep(500*2**(i-1));
  }
  throw new Error('fsPost retries esgotados');
}
async function fsPut(path:string, body:unknown): Promise<void> {
  for (let i=1;i<=3;i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`,{
      method:'PUT', headers:{Authorization:authHeader(),'Content-Type':'application/json'},
      body: JSON.stringify(body),
    });
    if (r.ok) return;
    const b = await r.text();
    if (!shouldRetry(r.status)||i===3) throw new Error(`FS PUT ${path} ${r.status}: ${b}`);
    await sleep(500*2**(i-1));
  }
}
async function fsGet(path:string): Promise<Record<string,unknown>> {
  for (let i=1;i<=3;i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`,
      {headers:{Authorization:authHeader(),'Content-Type':'application/json'}});
    if (r.ok) {
      const text = await r.text();
      return text ? JSON.parse(text) as Record<string, unknown> : {};
    }
    const b = await r.text();
    if (!shouldRetry(r.status)||i===3) throw new Error(`FS GET ${path} ${r.status} @ ${fsDomain()}: ${b}`);
    await sleep(500*2**(i-1));
  }
  throw new Error('fsGet retries esgotados');
}

// ─── CORREÇÃO 1: normalizarCNJ com validação de checksum ────────────────────
// Algoritmo oficial CNJ: resto = OOOO+AAAA+J+TT+NNNNNNN, peso=(i%8)+2
function validarChecksumCNJ(digits: string): boolean {
  if (digits.length !== 20) return false;
  const seq   = digits.slice(0, 7);
  const check = digits.slice(7, 9);
  const ano   = digits.slice(9, 13);
  const seg   = digits.slice(13, 14);
  const trib  = digits.slice(14, 16);
  const orig  = digits.slice(16, 20);
  const resto = orig + ano + seg + trib + seq;
  const dv    = resto.split('').reduce((acc,d,i) => acc + parseInt(d)*((i%8)+2), 0);
  const calc  = 11 - (dv % 11);
  const checkDigit = (calc === 10 || calc === 11) ? 0 : calc;
  return check === String(checkDigit).padStart(2, '0');
}

/**
 * CORREÇÃO 1: retorna null se CNJ não tem 20 dígitos OU checksum inválido.
 * O campo checksumValido é logado para auditoria mas não bloqueia o fluxo
 * (alguns CNJs legídimos do Advise podem ter checksum calculado de forma diferente).
 * Para máxima compatibilidade, apenas logamos o checksum inválido e prosseguimos.
 */
function normalizarCNJ(raw:string): { cnj:string|null; checksumValido:boolean } {
  const d = raw.replace(/[^0-9]/g,'');
  if (d.length !== 20) return { cnj:null, checksumValido:false };
  const checksumValido = validarChecksumCNJ(d);
  return { cnj:d, checksumValido };
}

function cnj20paraFormatado(cnj:string): string {
  return `${cnj.slice(0,7)}-${cnj.slice(7,9)}.${cnj.slice(9,13)}.${cnj.slice(13,14)}.${cnj.slice(14,16)}.${cnj.slice(16)}`;
}

// ─── CORREÇÃO 2: dispararEnriquecimentoTPU ───────────────────────────────────
// Fire-and-forget: não bloqueia o pipeline, não lança exceção.
async function dispararEnriquecimentoTPU(processoId:string, pubId:string, cnj:string): Promise<void> {
  try {
    const url = `${SUPABASE_URL}/functions/v1/tpu-sync?action=enriquecer_processo&processo_id=${processoId}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: supabaseFunctionHeaders(),
      signal: AbortSignal.timeout(10000),
    });
    const resultado = await r.json().catch(() => ({}));
    log('info','tpu_enrich',pubId,cnj,{ ok:r.ok, status:r.status, resultado });
  } catch(e) {
    log('warn','tpu_enrich',pubId,cnj,{ erro:String(e) });
  }
}

// ─── Helpers DataJud / processo ─────────────────────────────────────────────────────
async function consultarDatajud(cnj:string, processoId:string, pubId:string): Promise<{ok:boolean;hits:number;erro?:string}> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/datajud-search`,{
      method:'POST',
      headers: supabaseFunctionHeaders(),
      body: JSON.stringify({ numeroProcesso:cnj, persistir:true }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { return { ok:false, hits:0, erro:`HTTP ${r.status}` }; }
    const data = await r.json();
    const hits = (data?.resultado?.hits?.total?.value ?? data?.hits ?? 0) as number;
    log('info','datajud_enrich',pubId,cnj,{ hits, persistido:data?.persistido });
    return { ok:true, hits };
  } catch(e) {
    log('warn','datajud_enrich',pubId,cnj,{ erro:String(e) });
    return { ok:false, hits:0, erro:String(e) };
  }
}

function inferirTribunal(diario:string): string|null {
  const d = diario.toUpperCase();
  if (d.includes('DJSP')||d.includes('TJSP')) return 'TJSP';
  if (d.includes('DJAM')||d.includes('TJAM')) return 'TJAM';
  if (d.includes('DJRJ')||d.includes('TJRJ')) return 'TJRJ';
  if (d.includes('DJMG')||d.includes('TJMG')) return 'TJMG';
  if (d.includes('TRF1')) return 'TRF1'; if (d.includes('TRF2')) return 'TRF2';
  if (d.includes('TRF3')) return 'TRF3'; if (d.includes('TRF4')) return 'TRF4';
  if (d.includes('TRF5')) return 'TRF5'; if (d.includes('TST'))  return 'TST';
  if (d.includes('STJ'))  return 'STJ';  if (d.includes('STF'))  return 'STF';
  return null;
}

function extrairCamposDaPublicacao(texto:string): Record<string,unknown> {
  const c: Record<string,unknown> = {};
  if (!texto) return c;
  const orgao = texto.match(/[Óó]rg[ãa]o:\s*([^\n]+?)(?:\s*-\s*([^\n]+))?(?:\n|Tipo)/);
  if (orgao) c.orgao_julgador = orgao[2]?.trim() ?? orgao[1]?.trim();
  const classe = texto.match(/DIÁRIO DE JUSTI[ÇC]A\s+[^\n]+\n([A-ZÁÉÍÓÚÀÂÊÔÃÕÇ][^\n]{3,80})/);
  if (classe) c.classe = classe[1].trim();
  if (/[Ss]egredo de [Jj]usti[çc]a/i.test(texto)) c.segredo_justica = true;
  return c;
}

async function resolverProcesso(
  pubId:string, cnj:string, comarca:string|null, vara:string|null,
  diario:string|null, texto:string|null,
): Promise<{processoId:string;dadosIncompletos:boolean;foiCriado:boolean;semClasseId:boolean}> {
  // Busca existente
  const { data:existente } = await db.from('processos')
    .select('id,dados_incompletos,classe_id')
    .eq('numero_cnj',cnj).maybeSingle();

  if (existente?.id) {
    log('info','buscar_processo',pubId,cnj,{processo_id:existente.id});
    return {
      processoId:       String(existente.id),
      dadosIncompletos: Boolean(existente.dados_incompletos),
      foiCriado:        false,
      semClasseId:      !existente.classe_id,   // CORREÇÃO 2: detecta processo já existente sem TPU
    };
  }

  const { data:novoProc, error:insertErr } = await db.from('processos').upsert({
    numero_cnj:cnj, numero_processo:cnj, titulo:cnj,
    tribunal: inferirTribunal(diario??'') ?? diario ?? null,
    comarca: comarca??null, orgao_julgador: vara??null,
    dados_incompletos:true, fonte_criacao:'ADVISE_BACKFILL', created_by:'ADVISE_BACKFILL',
    updated_at: new Date().toISOString(),
  }, {onConflict:'numero_cnj', ignoreDuplicates:false}).select('id').single();

  if (insertErr||!novoProc?.id)
    throw new Error(`upsert processo falhou cnj=${cnj}: ${insertErr?.message}`);

  const processoId = String(novoProc.id);
  log('info','upsert_processo',pubId,cnj,{processo_id:processoId,dados_incompletos:true});

  const djResult = await consultarDatajud(cnj, processoId, pubId);
  let dadosIncompletos = true;

  if (djResult.ok && djResult.hits > 0) {
    // datajud-search já persistiu e irá chamar tpu-sync internamente
    await db.from('processos').update({dados_incompletos:false, fonte_criacao:'DATAJUD'}).eq('id',processoId);
    dadosIncompletos = false;
    log('info','upsert_processo',pubId,cnj,{sub:'enriquecido_datajud',processo_id:processoId});
  } else {
    const campos = extrairCamposDaPublicacao(texto??'');
    if (Object.keys(campos).length>0)
      await db.from('processos').update({...campos, fonte_criacao:'ADVISE_PARSER'}).eq('id',processoId);
    log('warn','upsert_processo',pubId,cnj,{sub:'fallback_publicacao',processo_id:processoId});
  }

  return {processoId, dadosIncompletos, foiCriado:true, semClasseId:dadosIncompletos};
}

async function processarPartes(
  pubId:string, cnj:string, processoId:string, texto:string|null,
): Promise<{inseridas:number;extractor:Record<string,unknown>}> {
  const { data:partesDb } = await db.from('partes')
    .select('nome,polo,tipo_pessoa,documento,advogados,tipo,fonte')
    .eq('processo_id',processoId);

  let partes: ParteCanonica[] = [];
  if (partesDb && partesDb.length > 0) {
    partes = (partesDb as Record<string,unknown>[]).map(p => ({
      nome:        String(p.nome??''),
      polo:        (p.polo==='ativo'?'ativo':'passivo') as 'ativo'|'passivo',
      tipo_pessoa: (p.tipo_pessoa??'DESCONHECIDA') as ParteCanonica['tipo_pessoa'],
      documento:   p.documento as string|undefined,
      tipo:        p.tipo as string|undefined,
      advogados:   Array.isArray(p.advogados) ? p.advogados as import('./_lib/parties.ts').Advogado[] : [],
      fonte:       (p.fonte??'datajud') as 'datajud'|'publicacao',
    }));
  } else if (texto) {
    partes = parsePartiesFromText(texto);
    if (partes.length>0) {
      const { inseridas, ignoradas } = await persistirPartes(
        db, processoId, partes,
        (msg) => log('warn','persistir_partes',pubId,cnj,{msg}),
      );
      log('info','persistir_partes',pubId,cnj,{source:'publicacao',inseridas,ignoradas});
    }
  }

  if (partes.length===0) return {inseridas:0, extractor:{ok:false,motivo:'sem_partes'}};

  const polo_ativo   = partes.filter(p=>p.polo==='ativo');
  const polo_passivo = partes.filter(p=>p.polo==='passivo');
  const extractorResult = await invocarExtractor(
    SUPABASE_URL, SUPABASE_SERVICE_KEY, processoId,
    cnj20paraFormatado(cnj), polo_ativo, polo_passivo,
    partes[0].fonte, BASE44_WORKSPACE_ID,
  );
  log(extractorResult.ok?'info':'warn','extractor_crm',pubId,cnj,extractorResult);
  return {inseridas:partes.length, extractor:extractorResult};
}

async function resolverAccountId(
  processoId:string, cnj:string, pubId:string,
  memCache:Map<string,string|null>,
): Promise<string|null> {
  if (memCache.has(cnj)) return memCache.get(cnj)??null;
  const {data:proc} = await db.from('processos')
    .select('account_id_freshsales').eq('id',processoId).maybeSingle();
  if (proc?.account_id_freshsales) { memCache.set(cnj,proc.account_id_freshsales); return proc.account_id_freshsales; }
  const cnj_fmt = cnj20paraFormatado(cnj);
  let accountId:string|null = null;
  for (const [field,value] of [['cf_numero_cnj',cnj_fmt],['cf_numero_cnj',cnj],['cf_numero_processo',cnj_fmt],['cf_numero_processo',cnj]] as [string,string][]) {
    if (accountId) break;
    try {
      const {status,data} = await fsPost('sales_accounts/filter',{
        filter_rule:[{attribute:field,operator:'is',value}], page:1, per_page:5,
      });
      if (status===200) {
        const list = (data.sales_accounts??[]) as Record<string,unknown>[];
        if (list.length>0) { accountId = String(list[0].id); log('info','resolve_account',pubId,cnj,{source:'api',field}); }
      }
    } catch(e) { log('warn','resolve_account',pubId,cnj,{field,erro:String(e)}); }
  }
  if (accountId) await db.from('processos').update({account_id_freshsales:accountId}).eq('id',processoId).then(()=>{}).catch(()=>{});
  memCache.set(cnj,accountId);
  return accountId;
}

async function atualizarAccountFields(
  accountId: string,
  processoId: string,
  pubId: string,
  cnj: string,
  pub?: Record<string, unknown>,
): Promise<void> {
  const {data:p} = await db.from('processos')
    .select('numero_cnj,polo_ativo,polo_passivo,classe,tribunal,segredo_justica,status_atual_processo,data_ajuizamento')
    .eq('id',processoId).maybeSingle();
  if (!p) return;

  const cf: Record<string,unknown> = {};
  if (p.numero_cnj)              cf.cf_numero_cnj         = p.numero_cnj;
  if (p.polo_ativo)              cf.cf_polo_ativo         = p.polo_ativo;
  if (p.polo_passivo)            cf.cf_parte_adversa      = p.polo_passivo;
  if (p.classe)                  cf.cf_acao               = p.classe;
  if (p.tribunal)                cf.cf_tribunal           = p.tribunal;
  if (p.segredo_justica!=null)   cf.cf_segredo_justica    = p.segredo_justica;
  // Status: usar do processo ou definir Ativo como padrão (nunca deixar em branco)
  cf.cf_status = p.status_atual_processo || 'Ativo';
  if (p.data_ajuizamento)        cf.cf_data_de_distribuio = p.data_ajuizamento;

  // Campos de publicação: sempre atualizar com a publicação mais recente
  if (pub) {
    const dtDisp = publicacaoDisponibilizacao(pub) ?? (pub.data_publicacao ? new Date(String(pub.data_publicacao)) : null);
    if (dtDisp) cf.cf_publicacao_em = dtDisp.toISOString().split('T')[0];
    const conteudo = String(pub.conteudo || pub.despacho || '').trim();
    if (conteudo) cf.cf_contedo_publicacao = conteudo.substring(0, 32000);
  }

  // Verificar se o nome do Dr. Adriano está na publicação para gerenciar a tag Datajud
  const NOME_DR = 'ADRIANO MENEZES HERMIDA MAIA';
  const conteudoPub = String(pub?.conteudo || pub?.despacho || '').toUpperCase();
  const contemNome = conteudoPub.includes(NOME_DR);

  // Buscar tags atuais do Account
  let tagsAtuais: string[] = [];
  try {
    const { data: acc } = await fsGet(`sales_accounts/${accountId}`);
    const accData = (acc as Record<string, unknown>)?.sales_account as Record<string, unknown> | undefined;
    tagsAtuais = (accData?.tags as string[] | undefined) ?? [];
  } catch { /* ignora */ }

  const temTagDatajud = tagsAtuais.includes('Datajud');
  let novasTags = [...tagsAtuais];

  if (contemNome && !temTagDatajud) {
    // Adicionar tag Datajud pois o Dr. Adriano está na publicação
    novasTags = [...novasTags, 'Datajud'];
  } else if (!contemNome && temTagDatajud) {
    // Remover tag Datajud pois o Dr. Adriano não está na publicação
    novasTags = novasTags.filter(t => t !== 'Datajud');
  }

  if (!Object.keys(cf).length && novasTags.length === tagsAtuais.length) return;

  const payload: Record<string, unknown> = { custom_field: cf };
  if (novasTags.length !== tagsAtuais.length || JSON.stringify(novasTags.sort()) !== JSON.stringify(tagsAtuais.sort())) {
    payload.tags = novasTags;
  }

  try {
    await fsPut(`sales_accounts/${accountId}`, { sales_account: payload });
    log('info','resolve_account',pubId,cnj,{sub:'account_fields_ok',campos:Object.keys(cf),tags:novasTags});
  } catch(e) { log('warn','resolve_account',pubId,cnj,{sub:'account_fields_falhou',erro:String(e)}); }
}

function addBusinessDays(d:Date,days:number): Date {
  const r=new Date(d); let added=0;
  while(added<days){r.setUTCDate(r.getUTCDate()+1);if(r.getUTCDay()!==0&&r.getUTCDay()!==6)added++;}
  return r;
}
const toDateStr = (d:Date) => d.toISOString().split('T')[0];

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

function tituloPublicacao(_p: Record<string, unknown>, dtDisponibilizacao: Date): string {
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

function buildNotes(pub:Record<string,unknown>): string {
  const dt = pub.data_publicacao ? new Date(String(pub.data_publicacao)).toISOString().split('T')[0] : '';
  return [
    '--------------------------- PUBLICAÇÕES ---------------------------','',
    `Diário..........................: ${pub.nome_diario              ?? ''}`,
    `Processo........................: ${pub.numero_processo_api      ?? ''}`,
    `Publicação em...................: ${dt}`,
    `Comarca.........................: ${pub.cidade_comarca_descricao ?? ''}`,
    `Vara............................: ${pub.vara_descricao           ?? ''}`,
    `Caderno.........................: ${pub.nome_caderno_diario      ?? ''}`,
    `Página inicial..................: ${pub.pagina_inicial_publicacao ?? ''}`,
    `Página final....................: ${pub.pagina_final_publicacao  ?? ''}`, '',
    String(pub.despacho||pub.conteudo||'Sem conteúdo disponível.'),
  ].join('\n');
}

async function enviarPublicacao(
  pub:Record<string,unknown>, accountId:string,
): Promise<{ok:boolean;pub_id:string;activity_id?:string;task_id?:string;prazo?:string;erro?:string}> {
  const pubId  = String(pub.id);
  const cnj    = String(pub.numero_processo_api??'');
  const dtBase = pub.data_publicacao ? new Date(String(pub.data_publicacao)) : new Date();
  const dtDisp = publicacaoDisponibilizacao(pub) ?? dtBase;
  const dtPub  = publicacaoDataPublicacao(pub) ?? dtBase;

  const {status,data:actData} = await fsPost('sales_activities',{
    sales_activity:{
      targetable_type: 'SalesAccount',
      targetable_id: Number(accountId),
      owner_id: FS_OWNER_ID,
      sales_activity_type_id: FS_ACTIVITY_TYPE_ID,
      title: tituloPublicacao(pub, dtDisp),
      start_date: freshsalesDate(dtDisp, 'start'),
      end_date: freshsalesDate(dtDisp, 'end'),
      // Marcar como concluída imediatamente — publicação é evento passado, não pendência
      completed_date: dtDisp.toISOString(),
      notes: descricaoPublicacao(pub, dtDisp, dtPub),
    },
  });
  if (status!==200&&status!==201) {
    const erro=`HTTP ${status}: ${JSON.stringify(actData)}`;
    log('error','send_activity',pubId,cnj,{erro}); return {ok:false,pub_id:pubId,erro};
  }
  const actId = String((actData as Record<string,Record<string,unknown>>).sales_activity?.id??'');
  await db.from('publicacoes').update({freshsales_activity_id:actId}).eq('id',pubId);
  log('info','send_activity',pubId,cnj,{activity_id:actId});

  let taskId='', prazoStr='';
  try {
    const prazoDate = addBusinessDays(addBusinessDays(dtBase,1),5);
    prazoStr = toDateStr(prazoDate);
    const {status:ts,data:td} = await fsPost('tasks',{
      task:{
        title: `Prazo: ${String(pub.despacho||pub.conteudo||'').substring(0,60)}`,
        due_date: prazoStr, targetable_type:'SalesAccount',
        targetable_id:Number(accountId), owner_id:FS_OWNER_ID,
      },
    });
    if (ts===200||ts===201) {
      taskId = String((td as Record<string,Record<string,unknown>>).task?.id??'');
      await db.from('publicacoes').update({tem_prazo:true,prazo_data:prazoDate.toISOString(),freshsales_task_id:taskId}).eq('id',pubId);
      log('info','create_task',pubId,cnj,{task_id:taskId,prazo:prazoStr});
    } else { log('warn','create_task',pubId,cnj,{status:ts}); }
  } catch(e) { log('warn','create_task',pubId,cnj,{erro:String(e)}); }

  return {ok:true,pub_id:pubId,activity_id:actId,task_id:taskId,prazo:prazoStr};
}

// ─── ACTION: sync ──────────────────────────────────────────────────────────────
async function actionSync(batchSize:number): Promise<Record<string,unknown>> {
  const {data:pubs,error} = await db.from('publicacoes')
    .select('id,numero_processo_api,processo_id,freshsales_activity_id,data_publicacao,'+
            'nome_diario,cidade_comarca_descricao,vara_descricao,nome_caderno_diario,'+
            'pagina_inicial_publicacao,pagina_final_publicacao,despacho,conteudo,raw_payload')
    .is('freshsales_activity_id',null)
    .not('numero_processo_api','is',null)
    .order('data_publicacao',{ascending:false})
    .limit(batchSize);

  if (error) throw error;

  const ignoredPubs = (pubs ?? []).filter((pub) => isAuctionPublication(pub as Record<string, unknown>));
  for (const pub of ignoredPubs) {
    await db.from('publicacoes').update({ freshsales_activity_id: 'LEILAO_IGNORADO' }).eq('id', pub.id);
  }
  const validPubs = (pubs ?? []).filter((pub) => !isAuctionPublication(pub as Record<string, unknown>));

  const stats = {total:validPubs.length, leiloes_ignorados: ignoredPubs.length, criados:0, enriquecidos:0, incompletos:0,
                 sucesso:0, sem_account:0, cnj_invalido:0, checksum_invalido:0, erro:0};
  const det: unknown[] = [];
  const accountCache       = new Map<string,string|null>();
  const accountFieldsFeito = new Set<string>();
  const partesFeito        = new Set<string>();

  for (const pub of validPubs) {
    const pubId  = String(pub.id);
    const rawCNJ = String(pub.numero_processo_api??'').trim();

    // CORREÇÃO 1: valida CNJ com checksum
    const { cnj, checksumValido } = normalizarCNJ(rawCNJ);
    if (!cnj) {
      log('warn','normalizar_cnj',pubId,rawCNJ,{len:rawCNJ.length});
      stats.cnj_invalido++;
      det.push({pub_id:pubId,cnj:rawCNJ,status:'cnj_invalido'});
      continue;
    }
    if (!checksumValido) {
      // Log mas não bloqueia — publicações do Advise podem ter checksum légal diferente
      log('warn','normalizar_cnj',pubId,cnj,{checksum:'invalido'});
      stats.checksum_invalido++;
    }

    try {
      let processoId:string;
      let dadosIncompletos = false;
      let deveEnriquecerTPU = false;

      if (pub.processo_id) {
        processoId = String(pub.processo_id);
        log('info','buscar_processo',pubId,cnj,{source:'ja_vinculado',processo_id:processoId});
        // CORREÇÃO 2: verifica se já existente também precisa de enriquecimento
        const {data:proc} = await db.from('processos').select('classe_id').eq('id',processoId).maybeSingle();
        deveEnriquecerTPU = !proc?.classe_id;
      } else {
        const r = await resolverProcesso(
          pubId,cnj,
          pub.cidade_comarca_descricao as string|null,
          pub.vara_descricao           as string|null,
          pub.nome_diario              as string|null,
          String(pub.conteudo??pub.despacho??''),
        );
        processoId       = r.processoId;
        dadosIncompletos = r.dadosIncompletos;
        if (r.foiCriado) stats.criados++;
        if (!dadosIncompletos) stats.enriquecidos++; else stats.incompletos++;
        deveEnriquecerTPU = r.semClasseId || r.foiCriado;

        await db.from('publicacoes').update({processo_id:processoId})
          .eq('id',pubId).is('processo_id',null);
        log('info','vincular_publicacao',pubId,cnj,{processo_id:processoId});
      }

      // CORREÇÃO 2: dispara enriquecimento TPU sempre que necessário
      if (deveEnriquecerTPU) {
        await dispararEnriquecimentoTPU(processoId,pubId,cnj);
      }

      if (!partesFeito.has(processoId)) {
        partesFeito.add(processoId);
        await processarPartes(pubId,cnj,processoId,String(pub.conteudo??pub.despacho??''));
      }

      const accountId = await resolverAccountId(processoId,cnj,pubId,accountCache);
      if (!accountId) {
        stats.sem_account++;
        det.push({pub_id:pubId,cnj,status:'sem_account'});
        continue;
      }

      if (!accountFieldsFeito.has(cnj)) {
        accountFieldsFeito.add(cnj);
        // Passar pub para preencher cf_publicacao_em, cf_contedo_publicacao e gerenciar tags Datajud
        await atualizarAccountFields(accountId, processoId, pubId, cnj, pub as Record<string,unknown>);
      }

      const result = await enviarPublicacao(pub as Record<string,unknown>,accountId);
      if (result.ok) {
        stats.sucesso++;
        det.push({pub_id:pubId,cnj,status:'sucesso',activity_id:result.activity_id,prazo:result.prazo});
      } else {
        stats.erro++;
        det.push({pub_id:pubId,cnj,status:'erro',detalhe:result.erro});
      }
    } catch(e) {
      const msg = e instanceof Error ? e.message : String(e);
      log('error','send_activity',pubId,cnj,{erro:msg});
      stats.erro++;
      det.push({pub_id:pubId,cnj,status:'erro',detalhe:msg});
    }
  }

  console.info(JSON.stringify({event:'sync_concluido',...stats}));
  return {...stats,detalhes:det};
}

// ─── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req:Request) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action')??'sync';
  let body:Record<string,unknown>={};
  if (req.method==='POST') { try{body=await req.json();}catch{/***/} }

  try {
    let result:unknown;
    switch (action) {
      case 'sync': {
        const raw   = url.searchParams.get('batch')??String(body.batch??25);
        const batch = Math.min(Math.max(Number(raw)||25,1),100);
        // Rate limit: ~3 chamadas FS por publicação (GET account + POST activity + PATCH)
        const rl = await checkRateLimit(dbPublic, 'publicacoes-freshsales', batch * 3);
        if (!rl.ok) {
          return new Response(JSON.stringify({ ok: false, motivo: 'rate_limit_global', slots_avail: rl.slots_avail, total_used: rl.total_used, global_limit: rl.global_limit }), { status: 429, headers: { 'Content-Type': 'application/json' } });
        }
        const safeBatch = safeBatchSize(rl.slots_avail, 3, batch);
        result = await actionSync(safeBatch);
        // Notificar Slack se houve activities criadas com sucesso
        const syncResult = result as Record<string,unknown>;
        if ((syncResult.sucesso as number) > 0) {
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dotobot-slack`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'notify_cron_status',
              job: 'publicacoes-freshsales',
              status: (syncResult.erro as number) === 0 ? 'ok' : 'aviso',
              inseridas: syncResult.sucesso,
              erros: syncResult.erro,
              detalhes: `${syncResult.total} publicacoes processadas`,
            }),
            signal: AbortSignal.timeout(8_000),
          }).catch(e => console.warn('dotobot-slack:', String(e)));
        }
        break;
      }
      case 'activity_types':
        try {
          result = await fsGet('selector/sales_activity_types');
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          result = {
            sales_activity_types: [
              {
                id: FS_ACTIVITY_TYPE_ID,
                name: 'Publicacao processual',
                fallback: true,
              },
            ],
            unavailable: true,
            error: message,
          };
        }
        break;
      default:
        return new Response(
          JSON.stringify({error:`action desconhecida: "${action}". Use: sync | activity_types`}),
          {status:400,headers:{'Content-Type':'application/json'}});
    }
    return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
  } catch(err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({event:'erro_fatal',erro:msg}));
    return new Response(JSON.stringify({error:msg}),{status:500,headers:{'Content-Type':'application/json'}});
  }
});
