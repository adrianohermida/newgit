import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { checkRateLimit, createPublicClient, safeBatchSize } from '../_shared/rate-limit.ts';
/**
 * datajud-andamentos-sync  v2
 *
 * Busca movimentos/andamentos processuais do DataJud e:
 *   1. Persiste em judiciario.andamentos
 *   2. Cria notas no Freshsales vinculadas ao Account do processo
 *   3. Registra em public.freshsales_notes_registry para evitar duplicidade
 *
 * Actions:
 *   sync_batch   (default) — sincroniza andamentos dos últimos N processos com account no FS
 *   sync_cnj     — sincroniza andamentos de um CNJ específico (?cnj=XXXX)
 *   status       — retorna estatísticas de andamentos sincronizados
 *
 * Secrets necessárias:
 *   DATAJUD_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   FRESHSALES_DOMAIN, FRESHSALES_API_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
// ─── Env ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DATAJUD_KEY   = Deno.env.get('DATAJUD_API_KEY') ?? '';
const FS_DOMAIN_RAW = Deno.env.get('FRESHSALES_DOMAIN') ?? '';
const FS_API_KEY    = Deno.env.get('FRESHSALES_API_KEY') ?? '';
const DATAJUD_BASE  = 'https://api-publica.datajud.cnj.jus.br';
const BATCH_SIZE    = Number(Deno.env.get('ANDAMENTOS_BATCH_SIZE') ?? '20');
// Cliente schema public (para rate limit)
const db = createPublicClient(SUPABASE_URL, SVC_KEY);
// Cliente schema judiciario (para dados processuais)
const dbJ = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: 'judiciario' } });
const FS_BASE = `https://${FS_DOMAIN_RAW.replace(/^https?:\/\//, '')}/crm/sales/api`;
const log = (n: 'info'|'warn'|'error', m: string, e: Record<string,unknown>={}) =>
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
// ─── Helpers Freshsales ───────────────────────────────────────────────────────
async function fsRequest(path: string, method = 'GET', body?: unknown) {
  const resp = await fetch(`${FS_BASE}${path}`, {
    method,
    headers: {
      'Authorization': `Token token=${FS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`FS ${method} ${path} → ${resp.status}: ${txt.slice(0, 200)}`);
  }
  return resp.json();
}

/**
 * Cria nota no Freshsales vinculada a um Account (processo judicial).
 * Usa targetable_type: 'SalesAccount' pois cada processo é uma Account no FS.
 */
async function criarNotaFreshsales(accountId: string, conteudo: string): Promise<number | null> {
  try {
    const resp = await fsRequest('/notes', 'POST', {
      note: {
        description: conteudo,
        targetable_type: 'SalesAccount',
        targetable_id: Number(accountId),
      }
    });
    return resp?.note?.id ?? null;
  } catch (e) {
    log('warn', 'Erro ao criar nota no Freshsales', { accountId, error: String(e) });
    return null;
  }
}
// ─── Buscar andamentos do DataJud ─────────────────────────────────────────────
async function buscarAndamentosDatajud(cnj: string, tribunal: string): Promise<unknown[]> {
  if (!DATAJUD_KEY) {
    log('warn', 'DATAJUD_API_KEY não configurada — usando movimentacoes existentes');
    return [];
  }
  // Determinar índice do tribunal
  const indice = tribunal ? `api_publica_${tribunal.toLowerCase()}` : 'api_publica_tjsp';
  try {
    const resp = await fetch(`${DATAJUD_BASE}/${indice}/_search`, {
      method: 'POST',
      headers: {
        'Authorization': `APIKey ${DATAJUD_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: { match: { numeroProcesso: cnj } },
        size: 1,
        _source: ['movimentos', 'numeroProcesso', 'tribunal'],
      }),
    });
    if (!resp.ok) return [];
    const data = await resp.json() as Record<string, unknown>;
    const hits = (data?.hits as Record<string, unknown>)?.hits as unknown[];
    if (!hits?.length) return [];
    const source = (hits[0] as Record<string, unknown>)?._source as Record<string, unknown>;
    return (source?.movimentos as unknown[]) ?? [];
  } catch (e) {
    log('warn', 'Erro ao buscar DataJud', { cnj, error: String(e) });
    return [];
  }
}
// ─── Processar andamentos de um processo ──────────────────────────────────────
async function processarAndamentosProcesso(processo: Record<string, unknown>): Promise<{
  inseridos: number; notas_criadas: number; erros: number;
}> {
  const cnj = processo.cnj as string;
  const processoId = processo.id as string;
  // CORRIGIDO: usar account_id_freshsales (não fs_deal_id que não existe)
  const fsAccountId = processo.account_id_freshsales as string | null;
  const tribunal = (processo.tribunal_sigla ?? processo.tribunal ?? '') as string;
  const movimentos = await buscarAndamentosDatajud(cnj, tribunal);
  // Também buscar movimentações já salvas no Supabase que ainda não foram sincronizadas
  const { data: movsSuap } = await dbJ
    .from('movimentacoes')
    .select('*')
    .eq('processo_id', processoId)
    .is('fs_synced_at', null)
    .limit(50);
  let inseridos = 0;
  let notas_criadas = 0;
  let erros = 0;
  // Processar movimentos do DataJud
  for (const mov of movimentos as Record<string, unknown>[]) {
    const datajudId = `${cnj}_${mov.dataHora ?? mov.codigo ?? Math.random()}`;
    const dataAndamento = mov.dataHora ? new Date(mov.dataHora as string) : new Date();
    const tipoNome = (mov.nome ?? mov.descricao ?? 'Movimento') as string;
    const complemento = mov.complementosTabelados
      ? JSON.stringify(mov.complementosTabelados)
      : null;
    // Verificar se já existe
    const { data: existing } = await dbJ
      .from('andamentos')
      .select('id')
      .eq('datajud_id', datajudId)
      .single();
    if (existing) continue;
    // Inserir andamento
    const { data: inserted, error: insErr } = await dbJ
      .from('andamentos')
      .insert({
        processo_id: processoId,
        cnj,
        datajud_id: datajudId,
        data_andamento: dataAndamento.toISOString(),
        tipo_movimento_nome: tipoNome,
        complemento,
        conteudo: `${tipoNome}${complemento ? ` — ${complemento}` : ''}`,
        raw_payload: mov,
      })
      .select('id')
      .single();
    if (insErr) { erros++; continue; }
    inseridos++;
    // Criar nota no Freshsales vinculada ao Account do processo
    if (fsAccountId && inserted) {
      const conteudoNota = [
        `📋 **Andamento Processual** — ${cnj}`,
        `📅 Data: ${dataAndamento.toLocaleDateString('pt-BR')}`,
        `⚖️ Tipo: ${tipoNome}`,
        complemento ? `📝 Complemento: ${complemento}` : '',
        `🔗 Fonte: DataJud`,
      ].filter(Boolean).join('\n');
      const fsNoteId = await criarNotaFreshsales(fsAccountId, conteudoNota);
      if (fsNoteId) {
        await dbJ.from('andamentos').update({
          freshsales_activity_id: String(fsNoteId),
          fs_activity_id: fsNoteId,
          fs_synced_at: new Date().toISOString()
        }).eq('id', inserted.id);
        await db.from('freshsales_notes_registry').insert({
          fs_note_id: fsNoteId,
          entity_type: 'account',
          entity_id: Number(fsAccountId),
          conteudo: conteudoNota,
          tipo: 'andamento',
          origem_id: inserted.id,
        }).on('conflict', 'fs_note_id').ignore();
        notas_criadas++;
      }
    }
  }
  // Processar movimentações do Supabase ainda não sincronizadas
  for (const mov of (movsSuap ?? []) as Record<string, unknown>[]) {
    if (fsAccountId) {
      const conteudoNota = [
        `📋 **Movimentação Processual** — ${cnj}`,
        `📅 Data: ${mov.data_movimentacao ?? mov.created_at}`,
        `⚖️ Tipo: ${mov.tipo ?? mov.descricao ?? 'Movimentação'}`,
        mov.conteudo ? `📝 ${String(mov.conteudo).slice(0, 500)}` : '',
      ].filter(Boolean).join('\n');
      const fsNoteId = await criarNotaFreshsales(fsAccountId, conteudoNota);
      if (fsNoteId) {
        await dbJ.from('movimentacoes').update({ fs_synced_at: new Date().toISOString() }).eq('id', mov.id);
        notas_criadas++;
      }
    }
  }
  return { inseridos, notas_criadas, erros };
}
// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'sync_batch';
  const cnj = url.searchParams.get('cnj');
  if (action === 'status') {
    const { count: total } = await dbJ.from('andamentos').select('*', { count: 'exact', head: true });
    const { count: pendentes } = await dbJ.from('andamentos').select('*', { count: 'exact', head: true }).is('fs_synced_at', null);
    const { count: movsPendentes } = await dbJ.from('movimentacoes').select('*', { count: 'exact', head: true }).is('fs_synced_at', null);
    // Contar movimentos pendentes (tabela principal usada pelo orquestrador)
    const { count: movimentosPendentes } = await dbJ.from('movimentos').select('*', { count: 'exact', head: true }).is('freshsales_activity_id', null);
    return Response.json({
      total_andamentos: total,
      pendentes_sync: pendentes,
      movimentacoes_pendentes: movsPendentes,
      movimentos_pendentes: movimentosPendentes,
    });
  }
  if (action === 'sync_cnj' && cnj) {
    // CORRIGIDO: selecionar account_id_freshsales (não fs_deal_id)
    const { data: processo } = await dbJ
      .from('processos')
      .select('id, cnj, account_id_freshsales, tribunal_sigla')
      .eq('cnj', cnj)
      .single();
    if (!processo) return Response.json({ error: 'Processo não encontrado' }, { status: 404 });
    const resultado = await processarAndamentosProcesso(processo as Record<string, unknown>);
    return Response.json({ cnj, ...resultado });
  }
  // sync_batch: processar os N processos com account_id_freshsales e sem sync recente
  // Rate limit: ~3 chamadas FS por processo (POST nota + GET account + PUT account)
  const rlAndamentos = await checkRateLimit(db, 'datajud-andamentos-sync', BATCH_SIZE * 3);
  if (!rlAndamentos.ok) {
    return Response.json({ ok: false, motivo: 'rate_limit_global', slots_avail: rlAndamentos.slots_avail });
  }
  const safeBatchAndamentos = safeBatchSize(rlAndamentos.slots_avail, 3, BATCH_SIZE);
  // CORRIGIDO: filtrar por account_id_freshsales (não fs_deal_id)
  const { data: processos } = await dbJ
    .from('processos')
    .select('id, cnj, account_id_freshsales, tribunal_sigla')
    .not('account_id_freshsales', 'is', null)
    .neq('account_id_freshsales', '')
    .order('updated_at', { ascending: true })
    .limit(safeBatchAndamentos);
  if (!processos?.length) {
    return Response.json({ ok: true, message: 'Nenhum processo com account para sincronizar', batch: 0 });
  }
  let totalInseridos = 0;
  let totalNotas = 0;
  let totalErros = 0;
  for (const processo of processos) {
    const r = await processarAndamentosProcesso(processo as Record<string, unknown>);
    totalInseridos += r.inseridos;
    totalNotas += r.notas_criadas;
    totalErros += r.erros;
    // Atualizar updated_at para rotacionar o batch
    await dbJ.from('processos').update({ updated_at: new Date().toISOString() }).eq('id', processo.id);
  }
  log('info', 'datajud-andamentos-sync concluído', {
    processos: processos.length,
    andamentos_inseridos: totalInseridos,
    notas_criadas: totalNotas,
    erros: totalErros,
  });
  return Response.json({
    ok: true,
    processos_processados: processos.length,
    andamentos_inseridos: totalInseridos,
    notas_freshsales_criadas: totalNotas,
    processados: totalNotas,
    erros: totalErros,
  });
});
