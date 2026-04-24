import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/**
 * agentlab-runner  v1
 *
 * Orquestrador simplificado de tarefas do AgentLab.
 * Processa a fila public.agentlab_tasks com suporte a:
 *   - crm_action     → executa operação no Freshsales via workspace-ops
 *   - enrich_contact → enriquece contato com dados do Supabase/DataJud
 *   - sync_deal      → sincroniza fatura/deal no Freshsales
 *   - notify_slack   → envia notificação via dotobot-slack
 *   - llm_task       → executa tarefa de IA via ai-core Worker
 *
 * Actions:
 *   run_batch  (default) — processa N tarefas pendentes
 *   enqueue    (POST)    — adiciona nova tarefa à fila
 *   status               — retorna estatísticas da fila
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AI_CORE_URL   = Deno.env.get('AI_CORE_URL') ?? 'https://ai.aetherlab.com.br';
const HMADV_SECRET  = Deno.env.get('HMADV_GATEWAY_SECRET') ?? '';
const SLACK_WEBHOOK = Deno.env.get('SLACK_WEBHOOK_URL') ?? '';
const BATCH_SIZE    = Number(Deno.env.get('AGENTLAB_BATCH_SIZE') ?? '10');

const db = createClient(SUPABASE_URL, SVC_KEY);

const log = (n: 'info'|'warn'|'error', m: string, e: Record<string,unknown>={}) =>
  console[n](JSON.stringify({ ts: new Date().toISOString(), fn: 'agentlab-runner', msg: m, ...e }));

// ─── Executores por tipo ──────────────────────────────────────────────────────

async function executarCrmAction(payload: Record<string, unknown>): Promise<unknown> {
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/workspace-ops`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SVC_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ operation: payload.operation, params: payload.params }),
  });
  if (!resp.ok) throw new Error(`workspace-ops error: ${resp.status}`);
  return resp.json();
}

async function executarLlmTask(payload: Record<string, unknown>): Promise<unknown> {
  const resp = await fetch(`${AI_CORE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'x-hmadv-secret': HMADV_SECRET,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: payload.model ?? 'auto',
      messages: payload.messages,
      system: payload.system ?? 'Você é um assistente jurídico especializado do escritório Hermida Maia Advocacia.',
      max_tokens: payload.max_tokens ?? 1024,
    }),
  });
  if (!resp.ok) throw new Error(`ai-core error: ${resp.status}`);
  const data = await resp.json() as Record<string, unknown>;
  return data;
}

async function executarNotifySlack(payload: Record<string, unknown>): Promise<unknown> {
  if (!SLACK_WEBHOOK) {
    log('warn', 'SLACK_WEBHOOK_URL não configurado');
    return { skipped: true };
  }
  const resp = await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: payload.message ?? payload.text ?? 'Notificação do AgentLab' }),
  });
  return { ok: resp.ok, status: resp.status };
}

async function executarEnrichContact(payload: Record<string, unknown>): Promise<unknown> {
  // Buscar dados do contato no Supabase e enriquecer via workspace-ops
  const cnj = payload.cnj as string;
  const contactId = payload.fs_contact_id as number;

  if (!cnj && !contactId) throw new Error('enrich_contact requer cnj ou fs_contact_id');

  // Buscar partes do processo
  const query = cnj
    ? db.from('partes').select('*').eq('cnj', cnj).limit(10)
    : db.from('partes').select('*').limit(5);
  const { data: partes } = await query;

  return { partes_encontradas: partes?.length ?? 0, cnj, contactId };
}

// ─── Processar uma tarefa ─────────────────────────────────────────────────────
async function processarTarefa(tarefa: Record<string, unknown>): Promise<{ ok: boolean; resultado?: unknown; erro?: string }> {
  const tipo = tarefa.tipo as string;
  const payload = (tarefa.payload ?? {}) as Record<string, unknown>;

  try {
    let resultado: unknown;
    switch (tipo) {
      case 'crm_action':     resultado = await executarCrmAction(payload); break;
      case 'llm_task':       resultado = await executarLlmTask(payload); break;
      case 'notify_slack':   resultado = await executarNotifySlack(payload); break;
      case 'enrich_contact': resultado = await executarEnrichContact(payload); break;
      case 'sync_deal':
        resultado = await executarCrmAction({ operation: 'create_deal', params: payload });
        break;
      default:
        throw new Error(`Tipo de tarefa desconhecido: ${tipo}`);
    }
    return { ok: true, resultado };
  } catch (e) {
    return { ok: false, erro: String(e) };
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'run_batch';

  // Status da fila
  if (action === 'status') {
    const { data: stats } = await db.rpc('execute_sql', {
      sql: `SELECT status, COUNT(*) as total FROM public.agentlab_tasks GROUP BY status ORDER BY status`
    }).catch(() => ({ data: null }));

    const { count: pending } = await db.from('agentlab_tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending');
    const { count: done } = await db.from('agentlab_tasks').select('*', { count: 'exact', head: true }).eq('status', 'done');
    const { count: failed } = await db.from('agentlab_tasks').select('*', { count: 'exact', head: true }).eq('status', 'failed');

    return Response.json({ pending, done, failed, stats });
  }

  // Enqueue: adicionar nova tarefa
  if (action === 'enqueue' && req.method === 'POST') {
    const body = await req.json() as Record<string, unknown>;
    const { data, error } = await db.from('agentlab_tasks').insert({
      tipo: body.tipo,
      payload: body.payload ?? {},
      agendado_para: body.agendado_para ?? new Date().toISOString(),
    }).select('id').single();

    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ enqueued: true, task_id: data?.id });
  }

  // run_batch: processar tarefas pendentes
  const agora = new Date().toISOString();
  const { data: tarefas } = await db
    .from('agentlab_tasks')
    .select('*')
    .eq('status', 'pending')
    .lte('agendado_para', agora)
    .order('agendado_para', { ascending: true })
    .limit(BATCH_SIZE);

  if (!tarefas?.length) {
    return Response.json({ message: 'Nenhuma tarefa pendente', processadas: 0 });
  }

  let sucesso = 0;
  let falhas = 0;

  for (const tarefa of tarefas) {
    // Marcar como running
    await db.from('agentlab_tasks').update({
      status: 'running',
      iniciado_em: new Date().toISOString(),
      tentativas: (tarefa.tentativas ?? 0) + 1,
    }).eq('id', tarefa.id);

    const { ok, resultado, erro } = await processarTarefa(tarefa as Record<string, unknown>);

    if (ok) {
      await db.from('agentlab_tasks').update({
        status: 'done',
        resultado,
        concluido_em: new Date().toISOString(),
      }).eq('id', tarefa.id);
      sucesso++;
    } else {
      const tentativas = (tarefa.tentativas ?? 0) + 1;
      const novoStatus = tentativas >= (tarefa.max_tentativas ?? 3) ? 'failed' : 'pending';
      const proximaTentativa = new Date(Date.now() + tentativas * 60_000).toISOString();
      await db.from('agentlab_tasks').update({
        status: novoStatus,
        erro,
        tentativas,
        agendado_para: novoStatus === 'pending' ? proximaTentativa : undefined,
      }).eq('id', tarefa.id);
      falhas++;
      log('warn', 'Tarefa falhou', { id: tarefa.id, tipo: tarefa.tipo, erro, tentativas });
    }
  }

  log('info', 'agentlab-runner batch concluído', { processadas: tarefas.length, sucesso, falhas });

  return Response.json({
    processadas: tarefas.length,
    sucesso,
    falhas,
  });
});
