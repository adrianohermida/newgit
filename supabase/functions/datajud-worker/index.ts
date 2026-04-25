import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { checkRateLimit, safeBatchSize } from '../_shared/rate-limit.ts';

/**
 * datajud-worker  v11
 *
 * REDESIGN de responsabilidades:
 *   Este worker faz APENAS:
 *     1. Busca dados no DataJud e persiste no Supabase
 *     2. Atualiza campos do Sales Account (PUT custom_fields + nome)
 *     3. Registra activity de Consulta na timeline
 *
 *   O envio de Andamentos e Publicacoes como activities
 *   é feito pelo sync-worker (roda a cada 2min) em lotes separados.
 *   Isso evita timeout por tentar enviar 108+ activities em uma invocacao.
 *
 *   Limite: 5 itens por invocacao, prioridade fs_webhook_sync > processo.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_API_KEY    = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_DOMAIN_RAW = Deno.env.get('FRESHSALES_DOMAIN')!;
const FS_OWNER_ID   = Number(Deno.env.get('FS_OWNER_ID') ?? '31000147944');
const FS_TYPE_CONSULTA = 31001147694;

const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: 'judiciario' } });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function log(n: 'info'|'warn'|'error', m: string, e: Record<string,unknown> = {}) {
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
}

type DatajudStatusPatch = {
  datajud_status?: string;
  datajud_last_attempt_at?: string;
  datajud_last_success_at?: string;
  datajud_last_error?: string | null;
  datajud_nao_enriquecivel?: boolean;
  datajud_payload_hash?: string | null;
};

function payloadHash(dj: DJResult): string | null {
  try {
    const raw = JSON.stringify(dj.hitSource ?? {});
    let h = 0;
    for (let i = 0; i < raw.length; i++) h = ((h << 5) - h) + raw.charCodeAt(i);
    return String(h >>> 0);
  } catch {
    return null;
  }
}

async function atualizarStatusDatajud(processoId: string | null, patch: DatajudStatusPatch): Promise<void> {
  if (!processoId) return;
  const { error } = await db.from('processos').update({
    updated_at: new Date().toISOString(),
    ...patch,
  }).eq('id', processoId);
  if (error) {
    const ignorable = /column .* does not exist|schema cache/i.test(error.message);
    log(ignorable ? 'warn' : 'error', 'datajud_status_update', {
      processoId,
      erro: error.message,
      ignorable,
    });
  }
}

// --- CNJ ---
function normCNJ(r: string): string | null {
  const d = (r ?? '').replace(/[^0-9]/g, '');
  return d.length === 20 ? d : null;
}
function cnj20toFmt(c: string): string {
  return `${c.slice(0,7)}-${c.slice(7,9)}.${c.slice(9,13)}.${c.slice(13,14)}.${c.slice(14,16)}.${c.slice(16)}`;
}

// --- Freshsales Suite ---
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
async function fsGet(path: string): Promise<Record<string,unknown>> {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`,
      { headers: { Authorization: authHdr(), 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12_000) });
    if (r.ok) return r.json();
    if ((r.status !== 429 && r.status < 500) || i === 3)
      throw new Error(`FS GET ${path} ${r.status}`);
    await sleep(1500 * i);
  }
  throw new Error('fsGet esgotado');
}
async function fsPut(path: string, body: unknown): Promise<number> {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
      method: 'PUT',
      headers: { Authorization: authHdr(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12_000),
    });
    if (r.ok) return r.status;
    if (r.status === 429 && i < 3) { await sleep(2000 * i); continue; }
    if (r.status >= 500  && i < 3) { await sleep(1000 * i); continue; }
    return r.status;
  }
  return 500;
}
async function fsPost(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  for (let i = 1; i <= 3; i++) {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
      method: 'POST',
      headers: { Authorization: authHdr(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(12_000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 429 && i < 3) { await sleep(2000 * i); continue; }
    if (r.status >= 500  && i < 3) { await sleep(1000 * i); continue; }
    return { status: r.status, data };
  }
  return { status: 500, data: {} };
}

// --- Titulo com partes ---
type Parte = { nome: string; polo: string };
function nomesPolo(partes: Parte[], polo: string): string {
  const ns = partes
    .filter(p => p.polo?.toLowerCase() === polo.toLowerCase())
    .map(p => p.nome.trim()).filter(Boolean);
  if (!ns.length) return '';
  return ns.length === 1 ? ns[0] : `${ns[0]} e outros`;
}
async function buildTitulo(pid: string, fmt: string, proc: Record<string,unknown>): Promise<string> {
  const { data: p } = await db.from('partes').select('nome,polo').eq('processo_id', pid);
  const a = (p ? nomesPolo(p as Parte[], 'ativo')   : '') || String(proc.polo_ativo   ?? '');
  const b = (p ? nomesPolo(p as Parte[], 'passivo') : '') || String(proc.polo_passivo ?? '');
  if (a && b) return `${fmt} (${a} x ${b})`;
  if (a)      return `${fmt} (${a})`;
  return fmt;
}

async function polosFallback(pid: string, proc: Record<string, unknown>): Promise<{ ativo: string | null; passivo: string | null }> {
  const { data: p } = await db.from('partes').select('nome,polo').eq('processo_id', pid);
  const ativo = (p ? nomesPolo(p as Parte[], 'ativo') : '') || String(proc.polo_ativo ?? '') || null;
  const passivo = (p ? nomesPolo(p as Parte[], 'passivo') : '') || String(proc.polo_passivo ?? '') || null;
  return { ativo, passivo };
}

async function carregarResumoProcessual(pid: string): Promise<{
  ultimoMovimentoDescricao: string | null;
  ultimaPublicacaoEm: string | null;
  ultimaDisponibilizacaoEm: string | null;
  ultimoDiario: string | null;
  ultimoConteudoPublicacao: string | null;
  ultimoPrazoFim: string | null;
}> {
  const [{ data: mov }, { data: pub }] = await Promise.all([
    db.from('movimentos')
      .select('descricao,data_movimento')
      .eq('processo_id', pid)
      .order('data_movimento', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('publicacoes')
      .select('data_publicacao,nome_diario,conteudo,prazo_data,raw_payload')
      .eq('processo_id', pid)
      .order('data_publicacao', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const rawPayload = (pub?.raw_payload ?? {}) as Record<string, unknown>;
  const disponibilizacao =
    rawPayload.dataHoraMovimento ??
    rawPayload.dataDisponibilizacao ??
    rawPayload.dataDisponibilizacaoPublicacao ??
    pub?.data_publicacao ??
    null;

  return {
    ultimoMovimentoDescricao: mov?.descricao ? String(mov.descricao) : null,
    ultimaPublicacaoEm: pub?.data_publicacao ? String(pub.data_publicacao) : null,
    ultimaDisponibilizacaoEm: disponibilizacao ? String(disponibilizacao) : null,
    ultimoDiario: pub?.nome_diario ? String(pub.nome_diario) : null,
    ultimoConteudoPublicacao: pub?.conteudo ? String(pub.conteudo).slice(0, 65000) : null,
    ultimoPrazoFim: pub?.prazo_data ? String(pub.prazo_data) : null,
  };
}

function inferirNumeroJuizo(proc: Record<string, unknown>): string | null {
  const codigo = String(proc.orgao_julgador_codigo ?? '').trim();
  if (codigo) return codigo;
  const vara = String(proc.orgao_julgador ?? '').trim();
  if (!vara) return null;
  const m = vara.match(/\b(\d{1,6})\b/);
  return m?.[1] ?? null;
}

function normalizarInstancia(proc: Record<string, unknown>): string | null {
  const instancia = String(proc.instancia ?? '').trim();
  if (/^[123]$/.test(instancia)) return instancia;
  const grau = String(proc.grau ?? '').trim();
  if (/^[123]$/.test(grau)) return grau;
  return null;
}

function normalizarTribunal(proc: Record<string, unknown>): string | null {
  const tribunal = String(proc.tribunal ?? '').trim().toUpperCase();
  return tribunal || null;
}

function inferirSegredoJustica(proc: Record<string, unknown>, resumo: {
  ultimoConteudoPublicacao: string | null;
}): string | null {
  const raw = proc.segredo_justica;
  if (typeof raw === 'boolean') return raw ? 'Sim' : 'Não';
  const txt = String(raw ?? '').trim().toLowerCase();
  if (['sim', 's', 'true', '1'].includes(txt)) return 'Sim';
  if (['não', 'nao', 'n', 'false', '0'].includes(txt)) return 'Não';

  const conteudo = String(resumo.ultimoConteudoPublicacao ?? '');
  if (/segredo de justi[cç]a/i.test(conteudo)) return 'Sim';
  return null;
}

function inferirAreaProcessual(proc: Record<string, unknown>): string | null {
  const explicita = String(proc.area ?? '').trim();
  if (explicita) return explicita;

  const tribunal = String(proc.tribunal ?? '').trim().toUpperCase();
  if (tribunal.startsWith('TRT')) return 'Trabalhista';
  if (tribunal.startsWith('TRE')) return 'Eleitoral';
  if (tribunal.startsWith('TRF')) return 'Federal';
  if (tribunal.startsWith('TJM')) return 'Militar';

  const texto = `${String(proc.classe ?? '')} ${String(proc.assunto_principal ?? proc.assunto ?? '')}`.toUpperCase();
  if (/\bCRIMINAL\b|\bPENAL\b|\bCRIME\b/.test(texto)) return 'Criminal';
  if (/\bTRABALH/.test(texto)) return 'Trabalhista';
  if (/\bELEITORAL\b/.test(texto)) return 'Eleitoral';
  if (/\bMILITAR\b/.test(texto)) return 'Militar';
  if (/\bC[IÍ]VEL\b|\bCIVIL\b|\bFAZENDA\b|\bEXECUÇÃO FISCAL\b|\bFAM[IÍ]LIA\b/.test(texto)) return 'Cível';
  if (tribunal.startsWith('TJ')) return 'Cível';
  return null;
}

function inferirSistemaProcessual(proc: Record<string, unknown>, dj: DJResult): string | null {
  const explicito = String(proc.sistema ?? proc.parser_sistema ?? '').trim();
  if (explicito) return explicito;

  const sistema = dj.hitSource?.sistema;
  if (sistema && typeof sistema === 'object') {
    const rec = sistema as Record<string, unknown>;
    const nome = String(rec.sigla ?? rec.nome ?? rec.descricao ?? rec.codigo ?? '').trim();
    if (nome) return nome;
  }

  const texto = JSON.stringify(dj.hitSource ?? {});
  if (/"saj"/i.test(texto)) return 'SAJ';
  if (/"pje"/i.test(texto)) return 'PJE';
  if (/"projudi"/i.test(texto)) return 'PROJUDI';
  if (/"eproc"/i.test(texto)) return 'EPROC';
  return null;
}

// --- DataJud ---
interface DJResult {
  ok: boolean;
  processoId: string | null;
  hits: number;
  hitSource: Record<string,unknown>;
}
async function buscarDatajud(cnj: string): Promise<DJResult> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/datajud-search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SVC_KEY}` },
      body: JSON.stringify({ numeroProcesso: cnj, persistir: true }),
      signal: AbortSignal.timeout(25_000),
    });
    const d = await r.json();
    const hits      = d?.resultado?.hits?.total?.value ?? 0;
    const hitSource = d?.resultado?.hits?.hits?.[0]?._source ?? {};
    log(r.ok ? 'info' : 'warn', 'datajud', { cnj, ok: r.ok, hits });
    return { ok: r.ok, processoId: d?.processo_id ?? null, hits, hitSource };
  } catch(e) {
    log('warn', 'datajud_exc', { cnj, erro: String(e) });
    return { ok: false, processoId: null, hits: 0, hitSource: {} };
  }
}

// --- Atualiza Sales Account (campos + titulo) ---
async function atualizarAccount(
  processoId: string,
  accountId:  string,
  dj:         DJResult,
): Promise<{ putStatus: number; titulo: string; nomeAtual: boolean; cfEnviados: string[] }> {
  const { data: procData } = await db.from('processos').select('*').eq('id', processoId).single();
  if (!procData) throw new Error('processo nao encontrado');
  const proc = procData as Record<string, unknown>;

  const cnj20  = String(proc.numero_cnj ?? proc.numero_processo ?? '');
  const cnjFmt = cnj20.length === 20 ? cnj20toFmt(cnj20) : cnj20;
  const titulo = await buildTitulo(processoId, cnjFmt, proc as Record<string,unknown>);
  const polos = await polosFallback(processoId, proc);
  const resumo = await carregarResumoProcessual(processoId);

  if (!proc.polo_ativo && polos.ativo) proc.polo_ativo = polos.ativo;
  if (!proc.polo_passivo && polos.passivo) proc.polo_passivo = polos.passivo;

  if ((!procData.polo_ativo && polos.ativo) || (!procData.polo_passivo && polos.passivo)) {
    await db.from('processos').update({
      polo_ativo: proc.polo_ativo ?? null,
      polo_passivo: proc.polo_passivo ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', processoId);
  }

  // Le campos atuais do FS
  let fsCF: Record<string,unknown> = {};
  let fsNome = '';
  try {
    const fsAcc = await fsGet(`sales_accounts/${accountId}`);
    const sa    = (fsAcc as Record<string,Record<string,unknown>>).sales_account ?? {};
    fsCF   = (sa.custom_fields ?? sa.custom_field ?? {}) as Record<string,unknown>;
    fsNome = String(sa.name ?? '');
  } catch(e) { log('warn','fs_get_erro',{ accountId, erro: String(e) }); }

  const numeroJuizo = inferirNumeroJuizo(proc);
  const instancia = normalizarInstancia(proc);
  const tribunal = normalizarTribunal(proc);
  const segredoJustica = inferirSegredoJustica(proc, resumo);
  const area = inferirAreaProcessual(proc);
  const sistema = inferirSistemaProcessual(proc, dj);

  // Monta custom_fields
  const cfSuap: Record<string,unknown> = { cf_processo: cnjFmt };
  const stdSuap: Record<string,unknown> = {};
  const set = (k: string, v: unknown) => { if (v != null && v !== '') cfSuap[k] = v; };
  const setStd = (k: string, v: unknown) => { if (v != null && v !== '') stdSuap[k] = v; };
  setStd('website',               proc.link_externo_processo);
  setStd('city',                  proc.comarca);
  setStd('annual_revenue',        proc.valor_causa);
  set('cf_tribunal',              tribunal);
  set('cf_vara',                  proc.orgao_julgador);
  set('cf_numero_do_juizo',       numeroJuizo);
  set('cf_classe',                proc.classe);
  set('cf_assunto',               proc.assunto_principal ?? proc.assunto);
  set('cf_instancia',             instancia);
  set('cf_polo_ativo',            proc.polo_ativo);
  set('cf_parte_adversa',         proc.polo_passivo);
  set('cf_status',                proc.status_atual_processo);
  set('cf_data_de_distribuio',    proc.data_ajuizamento);
  set('cf_data_ultimo_movimento', proc.data_ultima_movimentacao);
  set('cf_descricao_ultimo_movimento', resumo.ultimoMovimentoDescricao);
  set('cf_area',                  area);
  set('cf_sistema',               sistema);
  if (segredoJustica != null) set('cf_segredo_de_justica', segredoJustica);
  set('cf_DJ',                    resumo.ultimoDiario);
  set('cf_publicacao_em',         resumo.ultimaPublicacaoEm);
  set('cf_contedo_publicacao',    resumo.ultimoConteudoPublicacao);
  set('cf_prazo_fim',             resumo.ultimoPrazoFim);
  set('cf_tipo_processo',          proc.formato);

  const cfFinal: Record<string,unknown> = {};
  for (const [k, v] of Object.entries(cfSuap)) {
    const overwriteDynamic = new Set([
      'cf_data_ultimo_movimento',
      'cf_descricao_ultimo_movimento',
      'cf_DJ',
      'cf_publicacao_em',
      'cf_contedo_publicacao',
      'cf_prazo_fim',
      'cf_status',
      'cf_polo_ativo',
      'cf_parte_adversa',
      'cf_numero_do_juizo',
      'cf_vara',
      'cf_classe',
      'cf_area',
      'cf_sistema',
      'cf_instancia',
      'cf_tribunal',
      'cf_assunto',
      'cf_data_de_distribuio',
      'cf_segredo_de_justica',
      'cf_tipo_processo',
    ]);
    if (k === 'cf_processo' || overwriteDynamic.has(k) || !fsCF[k]) cfFinal[k] = v;
  }

  const body: Record<string,unknown> = {
    ...stdSuap,
    custom_fields: cfFinal,
    custom_field: cfFinal,
  };
  const nomeMelhorou = titulo.includes(' x ') && !fsNome.includes(' x ');
  const nomeEraRuim  = /^Processo n[o°]/i.test(fsNome) || fsNome === cnjFmt;
  const nomeAtual    = nomeMelhorou || nomeEraRuim;
  if (nomeAtual) body.name = titulo;

  const putStatus = accountId
    ? await fsPut(`sales_accounts/${accountId}`, { sales_account: body })
    : 0;

  if (putStatus === 200 || putStatus === 201) {
    await db.from('processos').update({
      titulo,
      fs_sync_at: new Date().toISOString(),
      account_id_freshsales: accountId,
    }).eq('id', processoId);
  }

  log('info','account_atualizado',{ accountId, putStatus, campos: Object.keys(cfFinal), titulo });
  return { putStatus, titulo, nomeAtual, cfEnviados: Object.keys(cfFinal) };
}

// --- Activity de Consulta com detalhes completos do DataJud ---
async function registrarActivityConsulta(
  accountId: string,
  cnjFmt:    string,
  sucesso:   boolean,
  dj:        DJResult,
  proc:      Record<string,unknown> | null,
  upd:       { putStatus: number; titulo: string; nomeAtual: boolean; cfEnviados: string[] } | null,
  movimentosTotais: number,
  publicacoesTotais: number,
  erroMsg?:  string,
): Promise<void> {
  const toDate = (d: Date) => d.toISOString().split('T')[0];
  const agora  = new Date();
  const fmtTs  = agora.toLocaleDateString('pt-BR') + ' ' +
                 agora.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  const tituloAct = sucesso
    ? `Sincronização com o CNJ realizada com sucesso - ${cnjFmt}`
    : `Falha na sincronização com o CNJ - ${cnjFmt}`;

  let notes: string;

  if (sucesso && upd) {
    const djSrc = dj.hitSource;
    const p     = proc ?? {};
    const f     = (v: unknown, fb = '—') => (v != null && v !== '') ? String(v) : fb;

    const classe   = f(djSrc.classe?.nome     ?? p.classe);
    const tribunal = f(djSrc.tribunal         ?? p.tribunal);
    const orgao    = f(djSrc.orgaoJulgador?.nome ?? p.orgao_julgador);
    const poloAt   = f(p.polo_ativo);
    const poloPas  = f(p.polo_passivo);
    const dtAjuiz  = p.data_ajuizamento
      ? new Date(String(p.data_ajuizamento)).toLocaleDateString('pt-BR') : '—';
    const dtUltMov = p.data_ultima_movimentacao
      ? new Date(String(p.data_ultima_movimentacao)).toLocaleDateString('pt-BR') : '—';
    const valor    = p.valor_causa
      ? `R$ ${Number(p.valor_causa).toLocaleString('pt-BR',{ minimumFractionDigits:2 })}` : '—';
    const grauStr  = f(djSrc.grau ?? p.grau);
    const status   = f(djSrc.situacao?.nome ?? p.status_atual_processo);
    const assunto  = f(djSrc.assuntos?.[0]?.nome ?? p.assunto_principal);

    // Ultimos 5 andamentos
    const { data: ultMovs } = await db.from('movimentos')
      .select('codigo,descricao,data_movimento')
      .eq('processo_id', String(p.id ?? ''))
      .order('data_movimento', { ascending: false }).limit(5);
    const movsLinhas = (ultMovs ?? []).length > 0
      ? (ultMovs ?? []).map(m =>
          `   ${new Date(m.data_movimento).toLocaleDateString('pt-BR')} | ${String(m.codigo).padStart(5)} | ${m.descricao}`
        ).join('\n')
      : '   (sem andamentos no banco)';

    notes = [
      '╔═══════════════════════════════════════╗',
      '║  SINCRONIZAÇÃO DATAJUD — CONCLUÍDA   ║',
      '╚═══════════════════════════════════════╝',
      `📅 Data/hora        : ${fmtTs}`,
      `📊 Registros DataJud : ${dj.hits}`,
      `🌐 DataJud           : ${dj.ok ? '✔ OK' : '⚠️ sem retorno (dados do banco usados)'}`,
      '',
      '── DADOS DO PROCESSO ───────────────────────',
      `🏦 Tribunal       : ${tribunal}`,
      `🏢 Órgão julgador  : ${orgao}`,
      `📂 Classe          : ${classe}`,
      `📎 Assunto         : ${assunto}`,
      `📊 Grau/Instância  : ${grauStr}`,
      `🟡 Status          : ${status}`,
      '',
      '── PARTES ──────────────────────────────────',
      `🟦 Polo ativo    : ${poloAt}`,
      `🟥 Polo passivo  : ${poloPas}`,
      '',
      '── DATAS E VALORES ─────────────────────────',
      `📅 Distribuição       : ${dtAjuiz}`,
      `🔄 Última movimentação : ${dtUltMov}`,
      `💰 Valor da causa     : ${valor}`,
      '',
      `── ANDAMENTOS (${movimentosTotais} no banco) ────────────────`,
      `   ⚙️  Serão enviados ao Freshsales pelo sync-worker`,
      `   Últimos 5 registros:`,
      movsLinhas,
      '',
      `── PUBLICAÇÕES (${publicacoesTotais} vinculadas) ────────────`,
      `   ⚙️  Serão enviadas ao Freshsales pelo sync-worker`,
      '',
      '── SALES ACCOUNT ATUALIZADO ────────────────',
      upd.nomeAtual ? `   ✔ Título: ${upd.titulo}` : `   — Título sem alteração`,
      upd.cfEnviados.length > 0
        ? `   Campos: ${upd.cfEnviados.map(c => c.replace('cf_','')).join(' | ')}`
        : '   Campos: todos já preenchidos',
      `   HTTP PUT: ${upd.putStatus}`,
      '',
      '────────────────────────────────────────────',
      '   Gerado automaticamente — DataJud/Supabase',
    ].join('\n');

  } else {
    notes = [
      '╔═══════════════════════════════════════╗',
      '║  SINCRONIZAÇÃO DATAJUD — FALHOU       ║',
      '╚═══════════════════════════════════════╝',
      `📅 Data/hora   : ${fmtTs}`,
      `⚖️  Processo    : ${cnjFmt}`,
      '',
      `🔴 Motivo      : ${erroMsg ?? 'Erro desconhecido'}`,
      `🌐 API DataJud : ${dj.ok ? '✔ respondeu' : '✘ não respondeu'}`,
      `📊 Registros  : ${dj.hits}`,
      '',
      '── Próximos passos ─────────────────────────',
      '• Verificar se cf_processo está correto',
      '• Confirmar se o processo existe no DataJud',
      '• Sistema tentará novamente automaticamente',
      '',
      '────────────────────────────────────────────',
      '   Gerado automaticamente — DataJud/Supabase',
    ].join('\n');
  }

  // Sucesso: marcar como concluída imediatamente (completed_date = agora)
  // Falha: deixar em aberto com end_date futuro para gerar pendência
  const dtFim = new Date(agora);
  if (!sucesso) dtFim.setDate(agora.getDate() + 1); // pendência para amanhã

  const actPayload: Record<string, unknown> = {
    targetable_type: 'SalesAccount',
    targetable_id: Number(accountId),
    owner_id: FS_OWNER_ID,
    sales_activity_type_id: FS_TYPE_CONSULTA,
    title: tituloAct,
    start_date: `${toDate(agora)}T${agora.toISOString().slice(11,19)}Z`,
    end_date: `${toDate(sucesso ? agora : dtFim)}T${(sucesso ? agora : dtFim).toISOString().slice(11,19)}Z`,
    notes,
  };
  if (sucesso) {
    // Marcar como concluída — sem pendência no pipeline do usuário
    actPayload.completed_date = agora.toISOString();
  }

  try {
    const { status } = await fsPost('sales_activities', { sales_activity: actPayload });
    log(status === 200 || status === 201 ? 'info' : 'warn',
      'activity_consulta', { accountId, sucesso, status });
  } catch(e) {
    log('warn','activity_consulta_exc',{ accountId, erro: String(e) });
  }
}

async function registrarConsultaEvento(
  accountId: string,
  titulo: string,
  notes: string,
  eventAt = new Date(),
  isErro = false,
): Promise<void> {
  const toDate = (d: Date) => d.toISOString().split('T')[0];
  const dtFim = new Date(eventAt);
  if (isErro) dtFim.setDate(eventAt.getDate() + 1); // pendência apenas em caso de erro

  const actPayload: Record<string, unknown> = {
    targetable_type: 'SalesAccount',
    targetable_id: Number(accountId),
    owner_id: FS_OWNER_ID,
    sales_activity_type_id: FS_TYPE_CONSULTA,
    title: titulo,
    start_date: `${toDate(eventAt)}T${eventAt.toISOString().slice(11,19)}Z`,
    end_date: `${toDate(isErro ? dtFim : eventAt)}T${(isErro ? dtFim : eventAt).toISOString().slice(11,19)}Z`,
    notes: notes.slice(0, 65000),
  };
  if (!isErro) {
    actPayload.completed_date = eventAt.toISOString();
  }

  try {
    const { status } = await fsPost('sales_activities', { sales_activity: actPayload });
    log(status === 200 || status === 201 ? 'info' : 'warn', 'consulta_evento', { accountId, titulo, status });
  } catch (e) {
    log('warn', 'consulta_evento_exc', { accountId, titulo, erro: String(e) });
  }
}

// --- Processa 1 item ---
async function processarItem(fila: Record<string,unknown>): Promise<Record<string,unknown>> {
  const cnj20 = String(fila.payload?.numero_cnj ?? fila.payload?.numero_processo ?? '');

  // Busca account_id em cascata
  let accountId = String(fila.account_id_freshsales ?? fila.payload?.account_id ?? '');
  if (!accountId && fila.processo_id) {
    const { data: p } = await db.from('processos')
      .select('account_id_freshsales').eq('id', fila.processo_id as string).maybeSingle();
    accountId = String(p?.account_id_freshsales ?? '');
  }

  if (!cnj20 || cnj20.replace(/[^0-9]/g,'').length !== 20) {
    const err = `CNJ inválido: "${cnj20}"`;
    if (accountId) await registrarActivityConsulta(
      accountId, cnj20||'?', false,
      { ok:false, processoId:null, hits:0, hitSource:{} },
      null, null, 0, 0, err
    ).catch(()=>{});
    return { ok: false, erro: err };
  }

  const cnj    = cnj20.replace(/[^0-9]/g,'');
  const cnjFmt = cnj20toFmt(cnj);

  // 1. Garante processo no Supabase
  let processoId: string | null = String(fila.processo_id ?? '') || null;
  const { data: procExist } = await db.from('processos')
    .select('id,account_id_freshsales')
    .or(`numero_cnj.eq.${cnj},numero_processo.eq.${cnj}`).maybeSingle();

  if (procExist?.id) {
    processoId = procExist.id;
    if (!accountId) accountId = String(procExist.account_id_freshsales ?? '');
    if (accountId)
      await db.from('processos')
        .update({ account_id_freshsales: accountId, updated_at: new Date().toISOString() })
        .eq('id', processoId);
  } else {
    const { data: novo } = await db.from('processos').insert({
      numero_cnj: cnj, numero_processo: cnj, titulo: cnjFmt,
      dados_incompletos: true,
      fonte_criacao: fila.tipo === 'fs_webhook_sync' ? 'freshsales_webhook' : 'datajud_queue',
      account_id_freshsales: accountId || null,
      updated_at: new Date().toISOString(),
    }).select('id').single();
    processoId = novo?.id ?? null;
  }

  if (!processoId) {
    const err = 'Falha ao criar/localizar processo';
    if (accountId) await registrarActivityConsulta(
      accountId, cnjFmt, false,
      { ok:false, processoId:null, hits:0, hitSource:{} },
      null, null, 0, 0, err
    ).catch(()=>{});
    return { ok: false, erro: err };
  }

  await atualizarStatusDatajud(processoId, {
    datajud_status: 'processando',
    datajud_last_attempt_at: new Date().toISOString(),
    datajud_last_error: null,
    datajud_nao_enriquecivel: false,
  });

  // 2. DataJud
  const dj = await buscarDatajud(cnj);
  if (dj.processoId && dj.processoId !== processoId) processoId = dj.processoId;

  // Recarrega processo atualizado
  const { data: procAtual } = await db.from('processos')
    .select('*').eq('id', processoId).maybeSingle();
  if (!accountId && procAtual?.account_id_freshsales)
    accountId = String(procAtual.account_id_freshsales);

  // Conta movimentos e publicações pendentes para informar na Consulta
  const { count: movTot } = await db.from('movimentos')
    .select('*', { count:'exact', head:true }).eq('processo_id', processoId);
  const { count: pubTot } = await db.from('publicacoes')
    .select('*', { count:'exact', head:true }).eq('processo_id', processoId);

  // 3. Atualiza Sales Account (sem enviar andamentos/pubs - isso é do sync-worker)
  let upd: { putStatus: number; titulo: string; nomeAtual: boolean; cfEnviados: string[] } | null = null;
  let erroMsg: string | undefined;

  if (accountId) {
    try {
      upd = await atualizarAccount(processoId, accountId, dj);
    } catch(e) {
      erroMsg = e instanceof Error ? e.message : String(e);
      log('error','atualizar_account_erro',{ processoId, accountId, erro: erroMsg });
    }
  } else {
    erroMsg = 'Sem account_id — Sales Account não vinculado a este processo';
    log('warn','sem_account_id',{ cnj: cnjFmt, processoId });
  }

  // 4. Activity de Consulta
  const sucesso = upd !== null && !erroMsg;
    if (accountId) {
      await registrarActivityConsulta(
        accountId, cnjFmt, sucesso, dj,
      procAtual as Record<string,unknown> | null,
      upd,
      movTot ?? 0,
      pubTot ?? 0,
      erroMsg ?? (dj.hits === 0 && !dj.ok
        ? 'Processo não encontrado no DataJud (API pode estar indisponível ou processo sigiloso)'
        : undefined),
      );
      if (sucesso && upd?.cfEnviados?.length) {
        await registrarConsultaEvento(
          accountId,
          `Detalhes do processo atualizados - ${cnjFmt}`,
          [
            'Os detalhes do processo foram atualizados a partir da sincronização com o CNJ.',
            `Processo: ${cnjFmt}`,
            `Campos atualizados: ${upd.cfEnviados.join(', ')}`,
            `Data/Hora: ${new Date().toLocaleString('pt-BR')}`,
          ].join('\n'),
        );
      }
    }

  const semDadosSuficientes = !dj.ok && (dj.hits ?? 0) === 0;
  await atualizarStatusDatajud(processoId, {
    datajud_status: sucesso ? 'enriquecido' : (semDadosSuficientes ? 'nao_enriquecivel' : 'falha_temporaria'),
    datajud_last_success_at: sucesso ? new Date().toISOString() : undefined,
    datajud_last_error: sucesso ? null : (erroMsg ?? 'falha_datajud'),
    datajud_nao_enriquecivel: semDadosSuficientes,
    datajud_payload_hash: sucesso ? payloadHash(dj) : undefined,
  });

  return {
    ok:          sucesso,
    cnj:         cnjFmt,
    processo_id: processoId,
    account_id:  accountId,
    datajud_hits: dj.hits,
    datajud_ok:   dj.ok,
    titulo:      upd?.titulo   ?? cnjFmt,
    nomeAtual:   upd?.nomeAtual ?? false,
    putStatus:   upd?.putStatus ?? 0,
    cfEnviados:  upd?.cfEnviados ?? [],
    movimentos_banco: movTot ?? 0,
    publicacoes_banco: pubTot ?? 0,
    erro:        erroMsg,
  };
}

async function repairProcessoTarget(input: {
  processo_id?: string | null;
  numeroProcesso?: string | null;
  account_id?: string | null;
}): Promise<Record<string, unknown>> {
  let processoId = input.processo_id ?? null;
  let accountId = input.account_id ?? null;
  let numero = normCNJ(input.numeroProcesso ?? '');

  if (!processoId && numero) {
    const { data: proc } = await db.from('processos')
      .select('id,account_id_freshsales,numero_cnj,numero_processo')
      .or(`numero_cnj.eq.${numero},numero_processo.eq.${numero}`)
      .maybeSingle();
    if (proc) {
      processoId = proc.id;
      accountId = accountId ?? (String(proc.account_id_freshsales ?? '') || null);
      numero = normCNJ(String(proc.numero_cnj ?? proc.numero_processo ?? numero)) ?? numero;
    }
  }

  if (processoId && !numero) {
    const { data: proc } = await db.from('processos')
      .select('numero_cnj,numero_processo,account_id_freshsales')
      .eq('id', processoId)
      .maybeSingle();
    if (proc) {
      numero = normCNJ(String(proc.numero_cnj ?? proc.numero_processo ?? ''));
      accountId = accountId ?? (String(proc.account_id_freshsales ?? '') || null);
    }
  }

  if (!processoId || !numero) {
    throw new Error('processo alvo nao localizado para repair_process');
  }

  if (accountId) {
    await db.from('processos')
      .update({ account_id_freshsales: accountId, updated_at: new Date().toISOString() })
      .eq('id', processoId);
  }

  const fila = {
    id: `repair:${processoId}`,
    processo_id: processoId,
    account_id_freshsales: accountId,
    tipo: 'processo',
    payload: {
      numero_cnj: numero,
      numero_processo: numero,
      account_id: accountId,
    },
  };

  const result = await processarItem(fila);
  return { modo: 'repair_process', ...result };
}

async function inspectAccountTarget(input: {
  processo_id?: string | null;
  numeroProcesso?: string | null;
  account_id?: string | null;
}): Promise<Record<string, unknown>> {
  let processoId = input.processo_id ?? null;
  let accountId = input.account_id ?? null;
  let numero = normCNJ(input.numeroProcesso ?? '');

  if (!accountId && processoId) {
    const { data: proc } = await db.from('processos')
      .select('account_id_freshsales,numero_cnj,numero_processo')
      .eq('id', processoId)
      .maybeSingle();
    if (proc) {
      accountId = String(proc.account_id_freshsales ?? '') || null;
      numero = numero ?? normCNJ(String(proc.numero_cnj ?? proc.numero_processo ?? ''));
    }
  }

  if (!accountId && numero) {
    const { data: proc } = await db.from('processos')
      .select('id,account_id_freshsales')
      .or(`numero_cnj.eq.${numero},numero_processo.eq.${numero}`)
      .maybeSingle();
    if (proc) {
      processoId = proc.id;
      accountId = String(proc.account_id_freshsales ?? '') || null;
    }
  }

  if (!accountId) throw new Error('account alvo nao localizado para inspect_account');

  const fsAcc = await fsGet(`sales_accounts/${accountId}`);
  const sa = (fsAcc as Record<string, Record<string, unknown>>).sales_account ?? {};
  const cf = (sa.custom_fields ?? sa.custom_field ?? {}) as Record<string, unknown>;

  return {
    ok: true,
    modo: 'inspect_account',
    processo_id: processoId,
    account_id: accountId,
    name: sa.name ?? null,
    campos: {
      cf_processo: cf.cf_processo ?? null,
      website: sa.website ?? null,
      city: sa.city ?? null,
      cf_tribunal: cf.cf_tribunal ?? null,
      cf_vara: cf.cf_vara ?? null,
      cf_numero_do_juizo: cf.cf_numero_do_juizo ?? null,
      cf_classe: cf.cf_classe ?? null,
      cf_assunto: cf.cf_assunto ?? null,
      cf_polo_ativo: cf.cf_polo_ativo ?? null,
      cf_parte_adversa: cf.cf_parte_adversa ?? null,
      cf_data_de_distribuio: cf.cf_data_de_distribuio ?? null,
      cf_data_ultimo_movimento: cf.cf_data_ultimo_movimento ?? null,
      cf_descricao_ultimo_movimento: cf.cf_descricao_ultimo_movimento ?? null,
      cf_DJ: cf.cf_DJ ?? null,
      cf_publicacao_em: cf.cf_publicacao_em ?? null,
      cf_contedo_publicacao: cf.cf_contedo_publicacao ?? null,
      cf_prazo_fim: cf.cf_prazo_fim ?? null,
      cf_area: cf.cf_area ?? null,
      cf_sistema: cf.cf_sistema ?? null,
      annual_revenue: sa.annual_revenue ?? null,
      cf_segredo_de_justica: cf.cf_segredo_de_justica ?? null,
    },
  };
}

async function listAccountFields(): Promise<Record<string, unknown>> {
  const data = await fsGet('settings/sales_accounts/fields?include=field_group');
  const fields = ((data as Record<string, unknown>).fields ??
    (data as Record<string, unknown>).sales_account_fields ??
    []) as Array<Record<string, unknown>>;

  return {
    ok: true,
    modo: 'list_account_fields',
    total: fields.length,
    fields: fields.map((f) => ({
      id: f.id ?? null,
      name: f.name ?? null,
      label: f.label ?? f.display_name ?? null,
      type: f.type ?? f.field_type ?? null,
      required: f.required ?? null,
      custom: f.custom ?? f.is_custom ?? null,
      group: (f.field_group as Record<string, unknown> | undefined)?.name ?? null,
    })),
  };
}

// --- Main ---
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'run';

  if (action === 'repair_process') {
    try {
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      const result = await repairProcessoTarget({
        processo_id: String((body as Record<string, unknown>).processo_id ?? url.searchParams.get('processo_id') ?? '') || null,
        numeroProcesso: String((body as Record<string, unknown>).numeroProcesso ?? url.searchParams.get('numeroProcesso') ?? url.searchParams.get('numero_cnj') ?? '') || null,
        account_id: String((body as Record<string, unknown>).account_id ?? url.searchParams.get('account_id') ?? '') || null,
      });
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, erro: String(e) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (action === 'inspect_account') {
    try {
      const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      const result = await inspectAccountTarget({
        processo_id: String((body as Record<string, unknown>).processo_id ?? url.searchParams.get('processo_id') ?? '') || null,
        numeroProcesso: String((body as Record<string, unknown>).numeroProcesso ?? url.searchParams.get('numeroProcesso') ?? url.searchParams.get('numero_cnj') ?? '') || null,
        account_id: String((body as Record<string, unknown>).account_id ?? url.searchParams.get('account_id') ?? '') || null,
      });
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, erro: String(e) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (action === 'list_account_fields') {
    try {
      const result = await listAccountFields();
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, erro: String(e) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (action === 'enrich_formato') {
    // Atualiza o campo tipo_processo (Físico/Eletrônico) nos processos e no Freshsales
    try {
      const bodyRaw = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
      const batchSize = Number((bodyRaw as Record<string, unknown>).batch_size ?? url.searchParams.get('batch_size') ?? 50);
      const { data: processos, error } = await db
        .from('processos')
        .select('id, numero_cnj, account_id_freshsales, raw_datajud')
        .is('tipo_processo', null)
        .not('raw_datajud', 'is', null)
        .not('account_id_freshsales', 'is', null)
        .limit(batchSize);
      if (error) return new Response(JSON.stringify({ ok: false, erro: error.message }), { headers: { 'Content-Type': 'application/json' } });
      if (!processos || processos.length === 0) {
        return new Response(JSON.stringify({ ok: true, atualizados: 0, mensagem: 'Nenhum processo pendente de enriquecimento de formato' }), { headers: { 'Content-Type': 'application/json' } });
      }
      let atualizados = 0; let fisicos = 0; let eletronicos = 0; let erros = 0;
      for (const proc of processos) {
        try {
          const raw = proc.raw_datajud as Record<string, unknown> | null;
          const sistemaRaw = raw?.sistema ?? raw?.classeProcessual?.sistema ?? '';
          const sistema = String(typeof sistemaRaw === 'object' ? JSON.stringify(sistemaRaw) : sistemaRaw).toLowerCase();
          let tipo: string | null = null;
          if (sistema.includes('eletronico') || sistema.includes('eletrônico') || sistema.includes('pje') || sistema.includes('esaj') || sistema.includes('eproc')) {
            tipo = 'Eletrônico';
          } else if (sistema.includes('fisico') || sistema.includes('físico')) {
            tipo = 'Físico';
          }
          if (tipo) {
            await db.from('processos').update({ tipo_processo: tipo }).eq('id', proc.id);
            if (proc.account_id_freshsales) {
              await fsPut(`accounts/${proc.account_id_freshsales}`, { account: { cf_tipo_processo: tipo } }).catch(() => {});
            }
            atualizados++;
            if (tipo === 'Eletrônico') eletronicos++; else fisicos++;
          }
        } catch { erros++; }
        await sleep(100);
      }
      return new Response(JSON.stringify({ ok: true, atualizados, fisicos, eletronicos, erros, total_candidatos: processos.length }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, erro: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Rate limit: ~5 chamadas FS por item (GET account + POST activity + PUT processo + GET datajud + POST nota)
  const rlWorker = await checkRateLimit(db, 'datajud-worker', 5 * 5);
  if (!rlWorker.ok) {
    return new Response(JSON.stringify({ ok: false, motivo: 'rate_limit_global', slots_avail: rlWorker.slots_avail, total_used: rlWorker.total_used }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Auto-libera jobs travados há mais de 8 minutos
  await db.from('monitoramento_queue')
    .update({ status: 'pendente', ultimo_erro: 'auto_reset_timeout' })
    .eq('status', 'processando')
    .lt('executado_em', new Date(Date.now() - 8 * 60_000).toISOString());

  const { data: filas } = await db
    .from('monitoramento_queue')
    .select('*')
    .eq('status', 'pendente')
    .in('tipo', ['fs_webhook_sync', 'processo'])
    .not('account_id_freshsales', 'is', null) // só processa se tiver account_id
    .order('prioridade', { ascending: true })
    .order('proxima_execucao', { ascending: true })
    .limit(5);

  if (!filas || filas.length === 0) {
    // Verifica se há filas sem account_id cujo processo agora tem
    const { count } = await db.from('monitoramento_queue')
      .select('*', { count:'exact', head:true })
      .eq('status', 'pendente')
      .is('account_id_freshsales', null);
    return new Response(JSON.stringify({
      msg: 'fila vazia (com account_id)',
      fila_sem_account: count ?? 0,
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const resultados: unknown[] = [];
  for (const fila of filas) {
    await db.from('monitoramento_queue').update({
      status: 'processando', executado_em: new Date().toISOString(),
    }).eq('id', fila.id);

    let resultado: Record<string,unknown>;
    try {
      resultado = await processarItem(fila as Record<string,unknown>);
    } catch(e) {
      const msg = e instanceof Error ? e.message : String(e);
      resultado = { ok: false, erro: msg };
      const accId  = String(fila.account_id_freshsales ?? fila.payload?.account_id ?? '');
      const cnjRaw = String(fila.payload?.numero_cnj ?? '');
      const fmt    = normCNJ(cnjRaw) ? cnj20toFmt(normCNJ(cnjRaw)!) : (cnjRaw || '?');
      if (accId) await registrarActivityConsulta(
        accId, fmt, false,
        { ok:false, processoId:null, hits:0, hitSource:{} },
        null, null, 0, 0, msg
      ).catch(()=>{});
    }

    const novoStatus = resultado!.ok ? 'processado' : 'erro';
    await db.from('monitoramento_queue').update({
      status:         novoStatus,
      tentativas:     (fila.tentativas ?? 0) + 1,
      ultimo_erro:    resultado!.ok ? null : String(resultado!.erro ?? ''),
      resultado_sync: resultado!,
    }).eq('id', fila.id);

    log(resultado!.ok ? 'info' : 'warn', `item_${novoStatus}`,
      { fila_id: fila.id, tipo: fila.tipo, cnj: fila.payload?.numero_cnj, ok: resultado!.ok });

    resultados.push({ fila_id: fila.id, ...resultado! });
    await sleep(300);
  }

  // Notificar Slack se processou itens
  const okCount = resultados.filter((r: Record<string,unknown>) => r.ok).length;
  const errCount = resultados.filter((r: Record<string,unknown>) => !r.ok).length;
  if (resultados.length > 0) {
    fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/dotobot-slack`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'notify_cron_status',
        job: 'datajud-worker',
        status: errCount === 0 ? 'ok' : 'aviso',
        inseridas: okCount,
        erros: errCount,
        detalhes: `${resultados.length} item(s) da fila processados`,
      }),
      signal: AbortSignal.timeout(8_000),
    }).catch((e: unknown) => console.warn('dotobot-slack:', String(e)));
  }

  return new Response(JSON.stringify({ processados: resultados.length, resultados }),
    { headers: { 'Content-Type': 'application/json' } });
});
