/**
 * fs-account-enricher  v1
 *
 * Centraliza todas as regras de negócio de enriquecimento do módulo Accounts
 * do Freshsales Suite a partir dos dados do Supabase (schema judiciario).
 *
 * Responsabilidades:
 *   1. Sincronizar todos os campos do processo no Account (sem campos órfãos)
 *   2. Gerenciar tags: garantir "Datajud" em processos do Dr. Adriano;
 *      remover "Datajud" quando publicação não menciona o nome dele
 *   3. Definir cf_status padrão "Ativo" quando em branco (nunca sobrescrever
 *      "Suspenso" ou "Baixado" definidos pelo usuário)
 *   4. Associar o contato cliente (parte com cliente_hmadv=true) ao Account
 *   5. Criar Note automática a cada atualização de processo
 *   6. Corrigir activities de consulta/andamento: marcar como concluídas
 *      (completed_date) quando sucesso; manter em aberto com detalhe de erro
 *
 * Ações disponíveis (via POST body ou query param ?action=):
 *   - enrich_account   : enriquece um Account específico (processo_id ou account_id)
 *   - mark_activity    : marca uma activity como concluída ou com erro
 *   - create_note      : cria uma Note no Account
 *   - associate_contact: associa o contato cliente ao Account
 *   - batch            : processa N processos em lote
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_API_KEY    = Deno.env.get('FRESHSALES_API_KEY')!;
const FS_DOMAIN_RAW = Deno.env.get('FRESHSALES_DOMAIN')!;
const FS_OWNER_ID   = Number(Deno.env.get('FS_OWNER_ID') ?? '31000147944');

// Nome do Dr. Adriano para verificação nas publicações
const NOME_ADRIANO_PATTERNS = [
  /adriano\s+menezes\s+hermida\s+maia/i,
  /adriano\s+hermida\s+maia/i,
  /adriano\s+m\.?\s*hermida/i,
  /hermida\s+maia/i,
  /oab.*8894.*am/i,
  /oab.*476963.*sp/i,
];

// Status que NÃO devem ser sobrescritos automaticamente
const STATUS_PROTEGIDOS = ['suspenso', 'baixado', 'arquivado', 'encerrado'];

const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: 'judiciario' } });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function log(n: 'info'|'warn'|'error', m: string, e: Record<string,unknown> = {}) {
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
}

// ─── Freshsales helpers ────────────────────────────────────────────────────────
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
        signal: AbortSignal.timeout(15_000) });
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
      body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
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
      body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
    });
    const data = await r.json().catch(() => ({}));
    if (r.status === 429 && i < 3) { await sleep(2000 * i); continue; }
    if (r.status >= 500  && i < 3) { await sleep(1000 * i); continue; }
    return { status: r.status, data };
  }
  return { status: 500, data: {} };
}

// ─── Helpers de dados ─────────────────────────────────────────────────────────
function cnj20toFmt(c: string): string {
  const d = c.replace(/[^0-9]/g,'');
  if (d.length !== 20) return c;
  return `${d.slice(0,7)}-${d.slice(7,9)}.${d.slice(9,13)}.${d.slice(13,14)}.${d.slice(14,16)}.${d.slice(16)}`;
}

function fmtDataBr(v: string | null | undefined): string {
  if (!v) return '';
  try { return new Date(v).toLocaleDateString('pt-BR'); } catch { return String(v); }
}

function fmtTs(): string {
  const now = new Date();
  return now.toLocaleDateString('pt-BR') + ' ' +
         now.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
}

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Verifica se o conteúdo da publicação menciona o Dr. Adriano */
function publicacaoMencaoAdriano(conteudo: string | null | undefined): boolean {
  if (!conteudo) return false;
  return NOME_ADRIANO_PATTERNS.some(p => p.test(conteudo));
}

/** Normaliza o status: nunca sobrescreve status protegidos do usuário */
function resolverStatus(
  statusAtualFS: string | null | undefined,
  statusDatajud: string | null | undefined,
): string {
  const fsLower = (statusAtualFS ?? '').toLowerCase().trim();
  // Se o usuário definiu um status protegido, respeita
  if (STATUS_PROTEGIDOS.some(s => fsLower.includes(s))) {
    return statusAtualFS!;
  }
  // Se o DataJud retornou um status, usa ele
  if (statusDatajud && statusDatajud.trim()) return statusDatajud.trim();
  // Padrão: Ativo
  return 'Ativo';
}

/** Determina se a tag Datajud deve ser adicionada ou removida */
function resolverTagsDatajud(
  tagsAtuais: string[],
  publicacaoConteudo: string | null | undefined,
  forcarAdicionar: boolean,
  forcarRemover: boolean,
): { tags: string[]; adicionou: boolean; removeu: boolean } {
  const temDatajud = tagsAtuais.some(t => t.toLowerCase() === 'datajud');
  let adicionou = false;
  let removeu = false;

  if (forcarRemover && !forcarAdicionar) {
    // Remove a tag Datajud
    const tags = tagsAtuais.filter(t => t.toLowerCase() !== 'datajud');
    removeu = temDatajud;
    return { tags, adicionou, removeu };
  }

  if (forcarAdicionar) {
    // Garante que a tag Datajud existe
    const tags = temDatajud ? tagsAtuais : [...tagsAtuais, 'Datajud'];
    adicionou = !temDatajud;
    return { tags, adicionou, removeu };
  }

  // Lógica automática baseada no conteúdo da publicação
  if (publicacaoConteudo !== undefined) {
    const menciona = publicacaoMencaoAdriano(publicacaoConteudo);
    if (menciona) {
      // Publicação menciona o Dr. Adriano: garante tag Datajud
      const tags = temDatajud ? tagsAtuais : [...tagsAtuais, 'Datajud'];
      adicionou = !temDatajud;
      return { tags, adicionou, removeu };
    } else if (publicacaoConteudo !== null) {
      // Publicação existe mas NÃO menciona o Dr. Adriano: remove tag Datajud
      const tags = tagsAtuais.filter(t => t.toLowerCase() !== 'datajud');
      removeu = temDatajud;
      return { tags, adicionou, removeu };
    }
  }

  // Sem publicação para analisar: mantém as tags atuais
  return { tags: tagsAtuais, adicionou, removeu };
}

// ─── Inferência de campos do processo ─────────────────────────────────────────
function inferirInstancia(proc: Record<string,unknown>): string | null {
  const inst = String(proc.instancia ?? '').trim();
  if (inst) return inst;
  const grau = Number(proc.grau ?? 0);
  if (grau === 1) return '1ª Instância';
  if (grau === 2) return '2ª Instância';
  if (grau === 3) return 'Superior';
  return null;
}

function inferirNumeroJuizo(proc: Record<string,unknown>): string | null {
  const cnj = String(proc.numero_cnj ?? proc.numero_processo ?? '').replace(/[^0-9]/g,'');
  if (cnj.length === 20) {
    const foro = cnj.slice(16,20);
    const vara = cnj.slice(14,16);
    return `${foro}-${vara}`;
  }
  return null;
}

function inferirAreaProcessual(proc: Record<string,unknown>): string | null {
  const ramo = String(proc.ramo ?? '').toLowerCase();
  if (ramo.includes('trabalhista') || ramo.includes('trabalho')) return 'Trabalhista';
  if (ramo.includes('criminal') || ramo.includes('penal')) return 'Criminal';
  if (ramo.includes('federal')) return 'Federal';
  if (ramo.includes('estadual') || ramo.includes('civil')) return 'Cível';
  const classe = String(proc.classe ?? '').toLowerCase();
  if (classe.includes('trabalhista') || classe.includes('reclamação')) return 'Trabalhista';
  return null;
}

// ─── Criar Note no Account ─────────────────────────────────────────────────────
async function criarNote(accountId: string, conteudo: string): Promise<string | null> {
  try {
    const { status, data } = await fsPost('notes', {
      note: {
        description: conteudo,
        notable_type: 'SalesAccount',
        notable_id: Number(accountId),
        owner_id: FS_OWNER_ID,
      },
    });
    if (status === 200 || status === 201) {
      const noteId = String((data as Record<string,Record<string,unknown>>).note?.id ?? '');
      log('info', 'note_criada', { accountId, noteId });
      return noteId;
    }
    log('warn', 'note_falhou', { accountId, status });
    return null;
  } catch(e) {
    log('warn', 'note_exc', { accountId, erro: String(e) });
    return null;
  }
}

// ─── Associar contato cliente ao Account ──────────────────────────────────────
async function associarContatoCliente(
  accountId: string,
  processoId: string,
): Promise<{ contactId: string | null; associado: boolean }> {
  try {
    // Buscar a parte que é cliente do escritório
    const { data: partes } = await db.from('partes')
      .select('contato_freshsales_id, contact_id_freshsales, nome, polo')
      .eq('processo_id', processoId)
      .or('cliente_hmadv.eq.true,representada_pelo_escritorio.eq.true')
      .order('principal_no_account', { ascending: false })
      .limit(1);

    const parte = (partes ?? [])[0] as Record<string,unknown> | undefined;
    if (!parte) return { contactId: null, associado: false };

    const contactId = String(parte.contato_freshsales_id ?? parte.contact_id_freshsales ?? '');
    if (!contactId) return { contactId: null, associado: false };

    // Verificar se já está associado
    try {
      const current = await fsGet(`sales_accounts/${accountId}/contacts`);
      const contacts = (current.contacts ?? []) as Record<string,unknown>[];
      const jaAssociado = contacts.some(c => String(c.id) === contactId);
      if (jaAssociado) return { contactId, associado: false };
    } catch { /* ignora erro de verificação */ }

    // Associar o contato ao Account
    const { status } = await fsPost(`sales_accounts/${accountId}/contacts`, {
      contact_id: Number(contactId),
    });
    const associado = status === 200 || status === 201 || status === 204;
    log(associado ? 'info' : 'warn', 'contato_associado', {
      accountId, contactId, status, nome: parte.nome,
    });
    return { contactId, associado };
  } catch(e) {
    log('warn', 'contato_associar_exc', { accountId, processoId, erro: String(e) });
    return { contactId: null, associado: false };
  }
}

// ─── Marcar activity como concluída ou com erro ───────────────────────────────
async function marcarActivity(
  activityId: string,
  sucesso: boolean,
  erroMsg?: string,
): Promise<boolean> {
  if (!activityId) return false;
  try {
    const agora = new Date();
    const payload: Record<string,unknown> = sucesso
      ? {
          // Sucesso: marca como concluída com a data atual
          completed_date: agora.toISOString(),
          end_date: `${toISODate(agora)}T${agora.toISOString().slice(11,19)}Z`,
        }
      : {
          // Erro: mantém em aberto, atualiza o título com o erro
          notes: `⚠️ ERRO — ${fmtTs()}\n\n${erroMsg ?? 'Erro desconhecido'}\n\nO sistema tentará novamente automaticamente.`,
        };
    const status = await fsPut(`sales_activities/${activityId}`, {
      sales_activity: payload,
    });
    return status === 200 || status === 201;
  } catch(e) {
    log('warn', 'marcar_activity_exc', { activityId, erro: String(e) });
    return false;
  }
}

// ─── Enriquecimento completo do Account ───────────────────────────────────────
async function enrichAccount(input: {
  processoId?: string | null;
  accountId?: string | null;
  publicacaoConteudo?: string | null;
  forcarTagDatajud?: boolean;
  removerTagDatajud?: boolean;
  criarNoteAtualizacao?: boolean;
  noteConteudo?: string | null;
  statusOverride?: string | null;
}): Promise<Record<string,unknown>> {
  const { processoId, publicacaoConteudo, forcarTagDatajud, removerTagDatajud,
          criarNoteAtualizacao, noteConteudo, statusOverride } = input;

  // Resolver o processo
  let processo: Record<string,unknown> | null = null;
  let accountId = input.accountId ?? null;

  if (processoId) {
    const { data } = await db.from('processos')
      .select('*')
      .eq('id', processoId)
      .maybeSingle();
    processo = (data as Record<string,unknown> | null) ?? null;
    if (processo && !accountId) {
      accountId = String(processo.account_id_freshsales ?? '');
    }
  }

  if (!accountId) throw new Error('account_id_freshsales não encontrado');
  if (!processo && processoId) throw new Error(`Processo ${processoId} não encontrado`);

  const pid = processoId ?? String(processo?.id ?? '');

  // Buscar dados complementares em paralelo
  const [{ data: partes }, { data: mov }, { data: pub }] = await Promise.all([
    db.from('partes').select('nome,polo').eq('processo_id', pid),
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

  const proc = processo ?? {};
  const partesArr = (partes ?? []) as Array<{nome:string;polo:string}>;
  const movRec = (mov as Record<string,unknown> | null) ?? null;
  const pubRec = (pub as Record<string,unknown> | null) ?? null;

  // Montar título
  const cnj20 = String(proc.numero_cnj ?? proc.numero_processo ?? '').replace(/[^0-9]/g,'');
  const cnjFmt = cnj20.length === 20 ? cnj20toFmt(cnj20) : String(proc.numero_cnj ?? proc.numero_processo ?? '');
  const ativo   = partesArr.filter(p => p.polo?.toLowerCase() === 'ativo').map(p => p.nome.trim()).filter(Boolean);
  const passivo = partesArr.filter(p => p.polo?.toLowerCase() === 'passivo').map(p => p.nome.trim()).filter(Boolean);
  const nomeAtivo   = ativo.length  > 0 ? (ativo.length  === 1 ? ativo[0]  : `${ativo[0]} e outros`)  : String(proc.polo_ativo ?? '');
  const nomePassivo = passivo.length > 0 ? (passivo.length === 1 ? passivo[0] : `${passivo[0]} e outros`) : String(proc.polo_passivo ?? '');
  const titulo = nomeAtivo && nomePassivo ? `${cnjFmt} (${nomeAtivo} x ${nomePassivo})` : cnjFmt;

  // Determinar último evento (publicação ou movimento)
  const movData = movRec?.data_movimento ? new Date(String(movRec.data_movimento)).getTime() : -1;
  const pubData = pubRec?.data_publicacao ? new Date(String(pubRec.data_publicacao)).getTime() : -1;
  let ultimaDataEvento: string | null = null;
  let ultimaDescricaoEvento: string | null = null;

  if (pubData >= movData && pubData > 0) {
    ultimaDataEvento = String(pubRec!.data_publicacao);
    ultimaDescricaoEvento = fmtDataBr(ultimaDataEvento)
      ? `Publicação disponibilizada em ${fmtDataBr(ultimaDataEvento)}`
      : 'Publicação disponibilizada';
  } else if (movData > 0) {
    ultimaDataEvento = String(movRec!.data_movimento);
    ultimaDescricaoEvento = movRec?.descricao ? String(movRec.descricao) : null;
  } else {
    ultimaDataEvento = String(proc.data_ultima_movimentacao ?? '') || null;
  }

  // Buscar estado atual do Account no Freshsales
  let currentTags: string[] = [];
  let currentStatusFS: string | null = null;
  try {
    const fsAcc = await fsGet(`sales_accounts/${accountId}`);
    const sa = (fsAcc.sales_account ?? {}) as Record<string,unknown>;
    currentTags = Array.isArray(sa.tags) ? sa.tags.map(t => String(t)) : [];
    const cf = (sa.custom_fields ?? sa.custom_field ?? {}) as Record<string,unknown>;
    currentStatusFS = String(cf.cf_status ?? '').trim() || null;
  } catch(e) {
    log('warn', 'fs_get_account', { accountId, erro: String(e) });
  }

  // Resolver tags Datajud
  const conteudoParaAnalise = publicacaoConteudo !== undefined
    ? publicacaoConteudo
    : (pubRec?.conteudo ? String(pubRec.conteudo) : undefined);

  const { tags, adicionou: tagAdicionada, removeu: tagRemovida } = resolverTagsDatajud(
    currentTags,
    conteudoParaAnalise,
    forcarTagDatajud ?? false,
    removerTagDatajud ?? false,
  );

  // Resolver status
  const statusFinal = statusOverride ?? resolverStatus(
    currentStatusFS,
    String(proc.status_atual_processo ?? '').trim() || null,
  );

  // Montar payload de campos custom
  const cf: Record<string,unknown> = { cf_processo: cnjFmt };
  const std: Record<string,unknown> = {};
  const set = (k: string, v: unknown) => { if (v != null && v !== '') cf[k] = v; };
  const setStd = (k: string, v: unknown) => { if (v != null && v !== '') std[k] = v; };

  setStd('city',           proc.comarca);
  setStd('annual_revenue', proc.valor_causa);
  setStd('website',        proc.link_externo_processo);

  set('cf_tribunal',                  String(proc.tribunal ?? '').toUpperCase() || null);
  set('cf_vara',                      proc.orgao_julgador);
  set('cf_numero_do_juizo',           inferirNumeroJuizo(proc));
  set('cf_classe',                    proc.classe);
  set('cf_assunto',                   proc.assunto_principal ?? proc.assunto);
  set('cf_instancia',                 inferirInstancia(proc));
  set('cf_polo_ativo',                nomeAtivo || proc.polo_ativo);
  set('cf_parte_adversa',             nomePassivo || proc.polo_passivo);
  set('cf_status',                    statusFinal);
  set('cf_data_de_distribuio',        proc.data_ajuizamento);
  set('cf_data_ultimo_movimento',     ultimaDataEvento);
  set('cf_descricao_ultimo_movimento',ultimaDescricaoEvento);
  set('cf_area',                      inferirAreaProcessual(proc));
  if (proc.segredo_justica != null) set('cf_segredo_de_justica', proc.segredo_justica);
  // Campos de publicação (sempre da publicação mais recente)
  if (pubRec) {
    set('cf_DJ',                pubRec.nome_diario);
    set('cf_publicacao_em',     pubRec.data_publicacao);
    set('cf_contedo_publicacao', pubRec.conteudo
      ? String(pubRec.conteudo).slice(0, 65000) : null);
    set('cf_prazo_fim',         pubRec.prazo_data);
  }

  // PUT no Account
  const putStatus = await fsPut(`sales_accounts/${accountId}`, {
    sales_account: {
      name: titulo,
      tags,
      ...std,
      custom_field: cf,
      custom_fields: cf,
    },
  });

  const putOk = putStatus === 200 || putStatus === 201;
  log(putOk ? 'info' : 'warn', 'account_enriquecido', {
    accountId, cnjFmt, putStatus, tagAdicionada, tagRemovida, statusFinal,
    campos: Object.keys(cf),
  });

  // Atualizar o Supabase com o timestamp de sync
  if (putOk && pid) {
    await db.from('processos').update({
      titulo,
      fs_sync_at: new Date().toISOString(),
    }).eq('id', pid).catch(() => {});
  }

  // Associar contato cliente
  let contatoResult = { contactId: null as string|null, associado: false };
  if (pid) {
    contatoResult = await associarContatoCliente(accountId, pid);
  }

  // Criar Note de atualização
  let noteId: string | null = null;
  if (criarNoteAtualizacao !== false && putOk) {
    const conteudoNote = noteConteudo ?? buildNoteAtualizacao({
      cnjFmt, titulo, statusFinal, ultimaDataEvento, ultimaDescricaoEvento,
      tagAdicionada, tagRemovida, pubRec, movRec,
    });
    noteId = await criarNote(accountId, conteudoNote);
  }

  return {
    ok: putOk,
    account_id: accountId,
    processo_id: pid,
    cnj: cnjFmt,
    titulo,
    put_status: putStatus,
    status_final: statusFinal,
    tag_adicionada: tagAdicionada,
    tag_removida: tagRemovida,
    tags_finais: tags,
    contato: contatoResult,
    note_id: noteId,
    campos_enviados: Object.keys(cf),
  };
}

/** Monta o conteúdo da Note de atualização */
function buildNoteAtualizacao(data: {
  cnjFmt: string;
  titulo: string;
  statusFinal: string;
  ultimaDataEvento: string | null;
  ultimaDescricaoEvento: string | null;
  tagAdicionada: boolean;
  tagRemovida: boolean;
  pubRec: Record<string,unknown> | null;
  movRec: Record<string,unknown> | null;
}): string {
  const { cnjFmt, statusFinal, ultimaDataEvento, ultimaDescricaoEvento,
          tagAdicionada, tagRemovida, pubRec, movRec } = data;
  const linhas: string[] = [
    '╔═══════════════════════════════════════════╗',
    '║   ATUALIZAÇÃO AUTOMÁTICA DO PROCESSO     ║',
    '╚═══════════════════════════════════════════╝',
    `📅 Atualizado em   : ${fmtTs()}`,
    `⚖️  Processo        : ${cnjFmt}`,
    `🟡 Status          : ${statusFinal}`,
    '',
    '── ÚLTIMO EVENTO ───────────────────────────',
  ];
  if (ultimaDataEvento) {
    linhas.push(`📆 Data            : ${fmtDataBr(ultimaDataEvento)}`);
  }
  if (ultimaDescricaoEvento) {
    linhas.push(`📝 Descrição       : ${ultimaDescricaoEvento.slice(0, 200)}`);
  }
  if (pubRec) {
    linhas.push('');
    linhas.push('── PUBLICAÇÃO MAIS RECENTE ─────────────────');
    if (pubRec.data_publicacao) linhas.push(`📰 Data pub.       : ${fmtDataBr(String(pubRec.data_publicacao))}`);
    if (pubRec.nome_diario)     linhas.push(`📋 Diário          : ${String(pubRec.nome_diario).slice(0, 80)}`);
    if (pubRec.conteudo)        linhas.push(`📄 Conteúdo (trecho): ${String(pubRec.conteudo).slice(0, 300)}...`);
  }
  if (movRec) {
    linhas.push('');
    linhas.push('── ÚLTIMO MOVIMENTO (DataJud) ───────────────');
    if (movRec.data_movimento) linhas.push(`📆 Data mov.       : ${fmtDataBr(String(movRec.data_movimento))}`);
    if (movRec.descricao)      linhas.push(`📝 Descrição       : ${String(movRec.descricao).slice(0, 200)}`);
  }
  if (tagAdicionada) {
    linhas.push('');
    linhas.push('🏷️  Tag "Datajud" adicionada — processo incluído na lista de monitoramento.');
  }
  if (tagRemovida) {
    linhas.push('');
    linhas.push('⚠️  Tag "Datajud" removida — publicação não menciona o Dr. Adriano Hermida Maia.');
  }
  linhas.push('');
  linhas.push('────────────────────────────────────────────');
  linhas.push('   Gerado automaticamente — Supabase/DataJud');
  return linhas.join('\n');
}

// ─── Ação: marcar activity ─────────────────────────────────────────────────────
async function actionMarkActivity(body: Record<string,unknown>): Promise<Record<string,unknown>> {
  const activityId = String(body.activity_id ?? '').trim();
  const sucesso    = body.sucesso !== false && body.sucesso !== 'false';
  const erroMsg    = body.erro_msg ? String(body.erro_msg) : undefined;

  if (!activityId) throw new Error('activity_id obrigatório');
  const ok = await marcarActivity(activityId, sucesso, erroMsg);
  return { ok, activity_id: activityId, marcado_como: sucesso ? 'concluido' : 'erro' };
}

// ─── Ação: criar note ──────────────────────────────────────────────────────────
async function actionCreateNote(body: Record<string,unknown>): Promise<Record<string,unknown>> {
  const accountId = String(body.account_id ?? '').trim();
  const conteudo  = String(body.conteudo ?? '').trim();
  if (!accountId) throw new Error('account_id obrigatório');
  if (!conteudo)  throw new Error('conteudo obrigatório');
  const noteId = await criarNote(accountId, conteudo);
  return { ok: !!noteId, account_id: accountId, note_id: noteId };
}

// ─── Ação: batch ──────────────────────────────────────────────────────────────
async function actionBatch(body: Record<string,unknown>): Promise<Record<string,unknown>> {
  const limit  = Math.min(Math.max(Number(body.limit ?? 10), 1), 50);
  const offset = Math.max(Number(body.offset ?? 0), 0);
  const criarNote = body.criar_note !== false;

  const { data: processos } = await db.from('processos')
    .select('id,numero_cnj,numero_processo,account_id_freshsales')
    .not('account_id_freshsales', 'is', null)
    .order('fs_sync_at', { ascending: true, nullsFirst: true })
    .range(offset, offset + limit - 1);

  const results: Record<string,unknown>[] = [];
  let ok = 0, erro = 0;

  for (const item of processos ?? []) {
    try {
      const result = await enrichAccount({
        processoId: String(item.id),
        accountId: String(item.account_id_freshsales ?? ''),
        criarNoteAtualizacao: criarNote,
      });
      results.push({ processo_id: item.id, cnj: item.numero_cnj ?? item.numero_processo, ...result });
      if (result.ok) ok++; else erro++;
    } catch(e) {
      erro++;
      results.push({
        processo_id: item.id,
        cnj: item.numero_cnj ?? item.numero_processo,
        ok: false,
        erro: String(e),
      });
    }
    await sleep(300); // Respeitar rate limit do Freshsales
  }

  return { ok: erro === 0, total: results.length, ok_count: ok, erro_count: erro, results };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'enrich_account';
  let body: Record<string,unknown> = {};
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { /**/ }
  }
  // Permite parâmetros via query string também
  for (const [k, v] of url.searchParams.entries()) {
    if (k !== 'action' && !(k in body)) body[k] = v;
  }

  try {
    let result: unknown;
    switch (action) {
      case 'enrich_account':
        result = await enrichAccount({
          processoId:          String(body.processo_id ?? body.processoId ?? '').trim() || null,
          accountId:           String(body.account_id  ?? body.accountId  ?? '').trim() || null,
          publicacaoConteudo:  body.publicacao_conteudo !== undefined
                                 ? String(body.publicacao_conteudo) : undefined,
          forcarTagDatajud:    body.forcar_tag_datajud === true || body.forcar_tag_datajud === 'true',
          removerTagDatajud:   body.remover_tag_datajud === true || body.remover_tag_datajud === 'true',
          criarNoteAtualizacao: body.criar_note !== false && body.criar_note !== 'false',
          noteConteudo:        body.note_conteudo ? String(body.note_conteudo) : null,
          statusOverride:      body.status_override ? String(body.status_override) : null,
        });
        break;
      case 'mark_activity':
        result = await actionMarkActivity(body);
        break;
      case 'create_note':
        result = await actionCreateNote(body);
        break;
      case 'associate_contact':
        result = await associarContatoCliente(
          String(body.account_id ?? '').trim(),
          String(body.processo_id ?? '').trim(),
        );
        break;
      case 'batch':
        result = await actionBatch(body);
        break;
      default:
        return new Response(
          JSON.stringify({ error: `Ação desconhecida: "${action}". Use: enrich_account | mark_activity | create_note | associate_contact | batch` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
    }
    return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
  } catch(err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', 'erro_fatal', { action, erro: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
