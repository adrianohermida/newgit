import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/**
 * contact-hygiene-job  v1
 *
 * Job periódico para higienização de contatos no Supabase/Freshsales:
 *   1. Identifica contatos duplicados (por e-mail, CPF/CNPJ ou telefone)
 *   2. Atualiza o ciclo de vida (lifecycle_stage) para "cliente" baseado em publicações
 *   3. Enfileira tarefas no agentlab_tasks para mesclagem ou enriquecimento
 *
 * Actions:
 *   run_batch  (default) — analisa os próximos N contatos
 *   status               — retorna estatísticas de higienização
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BATCH_SIZE    = Number(Deno.env.get('HYGIENE_BATCH_SIZE') ?? '50');

const db = createClient(SUPABASE_URL, SVC_KEY);

const log = (n: 'info'|'warn'|'error', m: string, e: Record<string,unknown>={}) =>
  console[n](JSON.stringify({ ts: new Date().toISOString(), fn: 'contact-hygiene-job', msg: m, ...e }));

// ─── Atualizar Ciclo de Vida ──────────────────────────────────────────────────
async function atualizarCicloDeVida(contato: Record<string, unknown>): Promise<boolean> {
  const contactId = contato.id as string;
  const fsContactId = contato.fs_contact_id as number;
  const stageAtual = contato.lifecycle_stage_id as number;

  // 1002926726 = ID do estágio "Cliente" no Freshsales (exemplo genérico, ajustar se necessário)
  const STAGE_CLIENTE_ID = 1002926726;

  if (stageAtual === STAGE_CLIENTE_ID) return false; // Já é cliente

  // Verificar se o contato é parte em algum processo onde o Dr. Adriano atua
  const { data: partes } = await db
    .from('partes')
    .select('processo_id')
    .eq('fs_contact_id', fsContactId)
    .limit(1);

  if (!partes?.length) return false;

  // Verificar se a conta/processo tem a tag "Renúncia"
  const processoId = partes[0].processo_id;
  const { data: processo } = await db
    .from('processos')
    .select('tags')
    .eq('id', processoId)
    .single();

  const tags = (processo?.tags as string[]) ?? [];
  if (tags.includes('Renúncia')) return false;

  // Enfileirar tarefa para atualizar no Freshsales
  await db.from('agentlab_tasks').insert({
    tipo: 'crm_action',
    payload: {
      operation: 'update_contact',
      params: {
        id: fsContactId,
        lifecycle_stage_id: STAGE_CLIENTE_ID,
      }
    }
  });

  return true;
}

// ─── Identificar Duplicidades ─────────────────────────────────────────────────
async function identificarDuplicidades(contato: Record<string, unknown>): Promise<boolean> {
  const email = contato.email as string;
  const cpfCnpj = contato.cpf_cnpj as string;
  const id = contato.id as string;

  if (!email && !cpfCnpj) return false;

  let query = db.from('freshsales_contacts').select('id, fs_contact_id').neq('id', id);
  
  if (email && cpfCnpj) {
    query = query.or(`email.eq.${email},cpf_cnpj.eq.${cpfCnpj}`);
  } else if (email) {
    query = query.eq('email', email);
  } else if (cpfCnpj) {
    query = query.eq('cpf_cnpj', cpfCnpj);
  }

  const { data: duplicados } = await query.limit(5);

  if (!duplicados?.length) return false;

  // Enfileirar notificação ou tarefa de merge
  await db.from('agentlab_tasks').insert({
    tipo: 'notify_slack',
    payload: {
      message: `⚠️ *Possível duplicidade de contato detectada*\nPrincipal: ${contato.nome} (${email ?? cpfCnpj})\nDuplicados: ${duplicados.map(d => d.fs_contact_id).join(', ')}`
    }
  });

  return true;
}

// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'run_batch';

  if (action === 'status') {
    const { count: total } = await db.from('freshsales_contacts').select('*', { count: 'exact', head: true });
    return Response.json({ total_contatos: total });
  }

  // run_batch: processar contatos ordenados pelo último update
  const { data: contatos } = await db
    .from('freshsales_contacts')
    .select('*')
    .order('updated_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (!contatos?.length) {
    return Response.json({ message: 'Nenhum contato para higienizar', processados: 0 });
  }

  let lifecycleUpdates = 0;
  let duplicidades = 0;

  for (const contato of contatos) {
    const lUpd = await atualizarCicloDeVida(contato as Record<string, unknown>);
    if (lUpd) lifecycleUpdates++;

    const dup = await identificarDuplicidades(contato as Record<string, unknown>);
    if (dup) duplicidades++;

    // Atualizar timestamp para rotacionar o batch
    await db.from('freshsales_contacts').update({ updated_at: new Date().toISOString() }).eq('id', contato.id);
  }

  log('info', 'contact-hygiene-job concluído', {
    processados: contatos.length,
    lifecycle_updates_queued: lifecycleUpdates,
    duplicidades_detectadas: duplicidades,
  });

  return Response.json({
    processados: contatos.length,
    lifecycle_updates_queued: lifecycleUpdates,
    duplicidades_detectadas: duplicidades,
  });
});
