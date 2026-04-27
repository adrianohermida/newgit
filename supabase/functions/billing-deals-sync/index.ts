import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { checkRateLimit, safeBatchSize, createPublicClient } from '../_shared/rate-limit.ts';
/**
 * billing-deals-sync  v1
 *
 * Sincroniza registros de billing_receivables como Deals no Freshsales.
 * Associa faturas a contatos existentes e processos (via CNJ).
 * Respeita o limite global de 990 req/h via módulo compartilhado de rate limit.
 *
 * Actions:
 *   sync_batch  (default) — sincroniza N receivables sem freshsales_deal_id
 *   sync_one    (?id=UUID) — sincroniza um receivable específico
 *   status               — retorna estatísticas de sincronização
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *          FRESHSALES_DOMAIN, FRESHSALES_API_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_DOMAIN_RAW = Deno.env.get('FRESHSALES_DOMAIN') ?? '';
const FS_API_KEY    = Deno.env.get('FRESHSALES_API_KEY') ?? '';
const BATCH_SIZE    = Number(Deno.env.get('BILLING_BATCH_SIZE') ?? '15');
const FS_BASE       = `https://${FS_DOMAIN_RAW.replace(/^https?:\/\//, '')}/crm/sales/api`;

// Usar createPublicClient para todas as operações (schema public)
const db = createPublicClient();

const log = (n: 'info'|'warn'|'error', m: string, e: Record<string,unknown>={}) =>
  console[n](JSON.stringify({ ts: new Date().toISOString(), fn: 'billing-deals-sync', msg: m, ...e }));

// ─── Contador local de chamadas (para log) ────────────────────────────────────
let fsCallsThisRun = 0;

async function fsRequest(path: string, method = 'GET', body?: unknown) {
  fsCallsThisRun++;
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
    throw new Error(`FS ${method} ${path} → ${resp.status}: ${txt.slice(0, 300)}`);
  }
  return resp.json();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatarValor(valor: number | null): string {
  if (!valor) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);
}

function determinarStageDeal(receivable: Record<string, unknown>): string {
  const status = receivable.status as string;
  const diasVencidos = receivable.days_overdue as number ?? 0;
  if (status === 'pago' || status === 'paid') return 'Pago';
  if (diasVencidos > 90) return 'Inadimplente';
  if (diasVencidos > 30) return 'Em Atraso';
  if (status === 'pending' || status === 'pendente') return 'Aguardando Pagamento';
  return 'Em Aberto';
}

function nomeDeal(receivable: Record<string, unknown>, nomeContato = ''): string {
  const tipo = receivable.receivable_type as string;
  const numero = receivable.invoice_number as string;
  const tipoLabel: Record<string, string> = {
    assinatura: 'Assinatura',
    despesa: 'Despesa',
    fatura_avulsa: 'Fatura',
    fatura: 'Fatura',
    consulta: 'Consulta',
    reembolso: 'Reembolso',
  };
  const tipoStr = tipoLabel[tipo] ?? tipo;
  const sufixo = nomeContato ? ` — ${nomeContato.slice(0, 40)}` : '';
  return `${tipoStr} ${numero ?? ''}${sufixo}`.trim();
}

// ─── Buscar contato e account vinculada no Freshsales ────────────────────────
async function resolverContatoFS(contactId: string | null): Promise<{
  fsContactId: number | null;
  fsAccountId: number | null;
  nomeContato: string;
}> {
  if (!contactId) return { fsContactId: null, fsAccountId: null, nomeContato: 'Cliente' };

  // Verificar em freshsales_contacts (coluna correta: freshsales_contact_id)
  const { data: fc } = await db
    .from('freshsales_contacts')
    .select('freshsales_contact_id, name')
    .eq('id', contactId)
    .single();

  if (!fc?.freshsales_contact_id) {
    return { fsContactId: null, fsAccountId: null, nomeContato: 'Cliente' };
  }

  const fsContactId = Number(fc.freshsales_contact_id);
  const nomeContato = (fc.name as string) ?? 'Cliente';

  // Buscar a account vinculada ao contato via API do Freshsales
  let fsAccountId: number | null = null;
  try {
    const contactData = await fsRequest(`/contacts/${fsContactId}?include=sales_accounts`) as Record<string, unknown>;
    const contact = contactData?.contact as Record<string, unknown>;
    const accounts = contact?.sales_accounts as Array<Record<string, unknown>>;
    if (accounts?.length > 0) {
      fsAccountId = Number(accounts[0].id);
    }
  } catch (e) {
    log('warn', 'Erro ao buscar account do contato', { fsContactId, error: String(e) });
  }

  return { fsContactId, fsAccountId, nomeContato };
}

// ─── Criar Deal no Freshsales ─────────────────────────────────────────────────
async function criarDealFS(receivable: Record<string, unknown>): Promise<number | null> {
  const { fsContactId, fsAccountId, nomeContato } = await resolverContatoFS(
    receivable.contact_id as string | null
  );

  const nome = nomeDeal(receivable, nomeContato);
  const valor = Number(
    receivable.balance_due_corrected ?? receivable.balance_due ?? receivable.amount_original ?? 0
  );
  const stage = determinarStageDeal(receivable);
  const vencimento = receivable.due_date as string;

  // Buscar fs_product_id pelo tipo
  const { data: produto } = await db
    .from('fs_product_map')
    .select('fs_product_id')
    .eq('receivable_type', receivable.receivable_type)
    .single();

  const dealPayload: Record<string, unknown> = {
    deal: {
      name: nome,
      amount: valor,
      close_date: vencimento,
      deal_stage: { label: stage },
      // Vincular ao contato (obrigatório para associar ao cliente)
      ...(fsContactId ? { contacts_added_list: [{ id: fsContactId }] } : {}),
      // Vincular à account (obrigatório no Freshsales para criar deal)
      ...(fsAccountId ? { sales_account: { id: fsAccountId } } : {}),
      // Produto
      ...(produto?.fs_product_id ? {
        deal_product: { id: produto.fs_product_id, quantity: 1, price: valor }
      } : {}),
      custom_field: {
        cf_numero_fatura: receivable.invoice_number,
        cf_tipo_cobranca: receivable.receivable_type,
        cf_valor_original: formatarValor(receivable.amount_original as number),
        cf_valor_corrigido: formatarValor(receivable.balance_due_corrected as number),
        cf_dias_vencidos: receivable.days_overdue ?? 0,
        cf_indice_correcao: receivable.correction_index_name ?? '',
      },
    }
  };

  try {
    const resp = await fsRequest('/deals', 'POST', dealPayload) as Record<string, unknown>;
    const dealId = (resp?.deal as Record<string, unknown>)?.id as number ?? null;
    if (!dealId) {
      log('warn', 'Deal criado mas sem ID na resposta', { nome, resp: JSON.stringify(resp).slice(0, 200) });
    }
    return dealId;
  } catch (e) {
    log('warn', 'Erro ao criar deal', { invoice: receivable.invoice_number, error: String(e) });
    return null;
  }
}

// ─── Processar um receivable ──────────────────────────────────────────────────
async function processarReceivable(rec: Record<string, unknown>): Promise<boolean> {
  // Verificar se já tem deal
  if (rec.freshsales_deal_id) return true;

  const dealId = await criarDealFS(rec);
  if (!dealId) return false;

  // Atualizar billing_receivables com o deal_id
  const { error } = await db
    .from('billing_receivables')
    .update({
      freshsales_deal_id: String(dealId),
      updated_at: new Date().toISOString(),
    })
    .eq('id', rec.id);

  if (error) {
    log('error', 'Erro ao atualizar billing_receivables', { id: rec.id, error: error.message });
    return false;
  }

  // Registrar no freshsales_deals_registry
  await db.from('freshsales_deals_registry').upsert({
    fs_deal_id: dealId,
    nome: nomeDeal(rec, ''),  // nome sem contato para o registry
    valor: rec.balance_due_corrected ?? rec.amount_original,
    status: determinarStageDeal(rec),
    receivable_id: rec.id,
    contact_id: rec.contact_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'fs_deal_id' }).catch(() => null);

  log('info', 'Deal criado', { invoice: rec.invoice_number, dealId, valor: rec.balance_due_corrected });
  return true;
}

// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? 'sync_batch';
  const id = url.searchParams.get('id');

  if (action === 'status') {
    const { count: total } = await db.from('billing_receivables').select('*', { count: 'exact', head: true });
    const { count: semDeal } = await db.from('billing_receivables').select('*', { count: 'exact', head: true }).is('freshsales_deal_id', null);
    const { count: comDeal } = await db.from('billing_receivables').select('*', { count: 'exact', head: true }).not('freshsales_deal_id', 'is', null);
    return Response.json({ total_receivables: total, sem_deal: semDeal, com_deal: comDeal });
  }

  if (action === 'sync_one' && id) {
    const { data: rec } = await db.from('billing_receivables').select('*').eq('id', id).single();
    if (!rec) return Response.json({ error: 'Receivable não encontrado' }, { status: 404 });
    const ok = await processarReceivable(rec as Record<string, unknown>);
    return Response.json({ id, sincronizado: ok });
  }

  // sync_batch: verificar rate limit global antes de processar
  // Cada receivable gera ~2 chamadas ao FS (POST deal + GET contact)
  // Cada receivable gera ~3 chamadas ao FS (GET contact+accounts + POST deal)
  const rl = await checkRateLimit(db, 'billing-deals-sync', BATCH_SIZE * 3);
  if (!rl.ok) {
    log('warn', 'Rate limit global atingido', { slots_avail: rl.slots_avail });
    return Response.json({ ok: false, motivo: 'rate_limit_global', slots_avail: rl.slots_avail }, { status: 429 });
  }
  const safeBatch = safeBatchSize(rl.slots_avail, 3, BATCH_SIZE);

  const { data: receivables } = await db
    .from('billing_receivables')
    .select('*')
    .is('freshsales_deal_id', null)
    .not('status', 'eq', 'cancelled')
    .order('due_date', { ascending: true })
    .limit(safeBatch);

  if (!receivables?.length) {
    return Response.json({ ok: true, message: 'Todos os receivables já têm deal no Freshsales', processados: 0 });
  }

  let sincronizados = 0;
  let erros = 0;

  for (const rec of receivables) {
    const ok = await processarReceivable(rec as Record<string, unknown>);
    if (ok) sincronizados++;
    else erros++;
  }

  log('info', 'billing-deals-sync batch concluído', {
    processados: receivables.length,
    sincronizados,
    erros,
    fs_calls: fsCallsThisRun,
  });

  return Response.json({
    ok: true,
    processados: receivables.length,
    deals_criados: sincronizados,
    erros,
    fs_calls_usados: fsCallsThisRun,
  });
});
