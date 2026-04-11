/**
 * fs-webhook  v1
 *
 * Receptor ultrarrápido de webhooks do Freshsales Suite.
 * Responsabilidade ÚNICA: validar + enfileirar + responder 200 em <100ms.
 * TODO o enriquecimento acontece de forma assíncrona no Supabase.
 *
 * Fluxo:
 *   Freshsales dispara POST → fs-webhook responde 200 imediatamente
 *   → insere na monitoramento_queue (tipo='fs_webhook_sync')
 *   → datajud-worker processa a fila a cada 5 min
 *   → resultado é enviado de volta ao Sales Account via fsPut
 *
 * Payload esperado do Freshsales (enviado pelo workflow):
 *   { "numeroProcesso": "{{sales_account.cf_processo}}",
 *     "account_id":    "{{sales_account.id}}" }
 *
 * Actions:
 *   POST / (sem action) → enqueue padrão
 *   GET  ?action=status&account_id=XXX → checa se o job foi processado
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FS_API_KEY   = Deno.env.get('FRESHSALES_API_KEY') ?? '';
const FS_DOMAIN_RAW = Deno.env.get('FRESHSALES_DOMAIN') ?? '';
const FS_OWNER_ID  = Number(Deno.env.get('FS_OWNER_ID') ?? '31000147944');
const FS_TYPE_CONSULTA = Number(Deno.env.get('FRESHSALES_ACTIVITY_TYPE_CONSULTA') ?? '31001147694');

const db = createClient(SUPABASE_URL, SVC_KEY, { db: { schema: 'judiciario' } });

function normCNJ(r: string): string | null {
  const d = (r ?? '').replace(/[^0-9]/g, '');
  return d.length === 20 ? d : null;
}
function cnj20toFmt(c: string): string {
  return `${c.slice(0,7)}-${c.slice(7,9)}.${c.slice(9,13)}.${c.slice(13,14)}.${c.slice(14,16)}.${c.slice(16)}`;
}
function log(n: 'info'|'warn', m: string, e: Record<string,unknown> = {}) {
  console[n](JSON.stringify({ ts: new Date().toISOString(), msg: m, ...e }));
}

const DOMAIN_MAP: Record<string, string> = {
  'hmadv-7b725ea101eff55.freshsales.io': 'hmadv-org.myfreshworks.com',
};
function fsDomain() {
  const d = (FS_DOMAIN_RAW ?? '').trim();
  return d.includes('myfreshworks.com') ? d : (DOMAIN_MAP[d] ?? d.replace(/\.freshsales\.io$/, '.myfreshworks.com'));
}
function authHdr() {
  const k = String(FS_API_KEY ?? '').trim()
    .replace(/^Token token=/i, '')
    .replace(/^Bearer /i, '')
    .trim();
  return `Token token=${k}`;
}
async function fsPost(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  try {
    const r = await fetch(`https://${fsDomain()}/crm/sales/api/${path}`, {
      method: 'POST',
      headers: { Authorization: authHdr(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    return { status: r.status, data: await r.json().catch(() => ({})) };
  } catch (e) {
    log('warn', 'fs_post_exc', { path, erro: String(e) });
    return { status: 500, data: {} };
  }
}

function containsDatajudTag(body: Record<string, unknown>): boolean {
  const tagCandidates: string[] = [];
  const raw = [
    body.tag,
    body.tag_name,
    body.added_tag,
    body.removed_tag,
    body.tags,
    (body.sales_account as Record<string, unknown> | undefined)?.tags,
  ];
  for (const item of raw) {
    if (Array.isArray(item)) {
      for (const v of item) tagCandidates.push(String(v ?? '').trim());
    } else if (item != null) {
      tagCandidates.push(String(item).trim());
    }
  }
  if (tagCandidates.length === 0) return true;
  return tagCandidates.some((tag) => /^datajud$/i.test(tag));
}

async function registrarConsultaSolicitada(accountId: string, cnjFmt: string, jobId: string | number | null): Promise<void> {
  if (!accountId || !FS_API_KEY || !FS_DOMAIN_RAW) return;
  const agora = new Date();
  const toDate = (d: Date) => d.toISOString().split('T')[0];
  const fim = new Date(agora);
  fim.setDate(agora.getDate() + 1);
  const notes = [
    'Sincronização com o CNJ solicitada.',
    `Processo: ${cnjFmt}`,
    jobId ? `Fila: ${jobId}` : null,
    `Data/Hora: ${agora.toLocaleString('pt-BR')}`,
  ].filter(Boolean).join('\n');
  const { status } = await fsPost('sales_activities', {
    sales_activity: {
      targetable_type: 'SalesAccount',
      targetable_id: Number(accountId),
      owner_id: FS_OWNER_ID,
      sales_activity_type_id: FS_TYPE_CONSULTA,
      title: `Sincronização com o CNJ solicitada - ${cnjFmt}`,
      start_date: `${toDate(agora)}T${agora.toISOString().slice(11, 19)}Z`,
      end_date: `${toDate(fim)}T${fim.toISOString().slice(11, 19)}Z`,
      notes,
    },
  });
  log(status === 200 || status === 201 ? 'info' : 'warn', 'consulta_solicitada', { accountId, cnjFmt, status, jobId });
}

// Extrai CNJ e account_id de qualquer formato de payload do FS
function extrairPayload(body: Record<string,unknown>): {
  cnj: string | null;
  accountId: string | null;
  raw: string;
} {
  const sa  = (body.sales_account ?? {}) as Record<string,unknown>;
  const cf  = (sa.custom_fields ?? sa.custom_field ?? {}) as Record<string,unknown>;

  const rawCNJ = String(
    cf.cf_processo ??
    body.cf_processo ??
    body.numeroProcesso ??
    body.numero_processo ??
    body.numero_cnj ?? ''
  ).trim();

  const rawAccount = String(
    sa.id ?? body.account_id ?? body.sales_account_id ?? ''
  ).trim();

  return {
    cnj:       normCNJ(rawCNJ.replace(/[^0-9]/g, '')),
    accountId: rawAccount || null,
    raw:       rawCNJ,
  };
}

function extrairContatoPayload(body: Record<string, unknown>): {
  contactId: string | null;
  accountId: string | null;
  email: string | null;
} {
  const contact = (body.contact ?? {}) as Record<string, unknown>;
  const salesAccount = (body.sales_account ?? {}) as Record<string, unknown>;
  const rawEmail = String(
    contact.email ??
    body.email ??
    body.contact_email ??
    ''
  ).trim().toLowerCase();
  return {
    contactId: String(
      contact.id ??
      body.contact_id ??
      body.id ??
      ''
    ).trim() || null,
    accountId: String(
      contact.sales_account_id ??
      contact.account_id ??
      body.account_id ??
      body.sales_account_id ??
      salesAccount.id ??
      ''
    ).trim() || null,
    email: rawEmail || null,
  };
}

Deno.serve(async (req: Request) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? '';

  // ── GET status: permite que o FS consulte se o job foi concluído ────────
  if (req.method === 'GET' && action === 'status') {
    const accountId = url.searchParams.get('account_id');
    if (!accountId) {
      return new Response(JSON.stringify({ error: 'account_id obrigatório' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const { data } = await db.from('monitoramento_queue')
      .select('status, resultado_sync, executado_em, ultimo_erro')
      .eq('account_id_freshsales', accountId)
      .eq('tipo', 'fs_webhook_sync')
      .order('criado_em', { ascending: false })
      .limit(1)
      .maybeSingle();
    return new Response(JSON.stringify(data ?? { status: 'nao_encontrado' }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  // ── POST: recebe webhook, enfileira, responde imediatamente ────────────
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não suportado' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } });
  }

  let body: Record<string,unknown> = {};
  try { body = await req.json(); } catch { /* payload vazio ou inválido */ }

  const { contactId, accountId: contactAccountId, email: contactEmail } = extrairContatoPayload(body);
  if (contactId) {
    try {
      const { data: existingContactJob } = await db.from('operacao_jobs')
        .select('id,status')
        .eq('modulo', 'contacts')
        .eq('acao', 'sync_contacts')
        .in('status', ['pending', 'running'])
        .contains('payload', { contactId })
        .maybeSingle();

      if (existingContactJob) {
        return new Response(
          JSON.stringify({
            ok: true,
            enfileirado: false,
            tipo: 'contact_sync',
            motivo: 'job já pendente ou processando',
            contact_id: contactId,
            account_id: contactAccountId,
            job_id: existingContactJob.id,
            job_status: existingContactJob.status,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const { data: contactJob, error: contactJobError } = await db.from('operacao_jobs').insert({
        modulo: 'contacts',
        acao: 'sync_contacts',
        status: 'pending',
        payload: {
          action: 'sync_contacts',
          contactId,
          dryRun: false,
          fetchAll: false,
          reflectToPortal: true,
          limit: 1,
          clientEmail: contactEmail,
          account_id: contactAccountId,
          origem: 'freshsales_contact_webhook',
          jobControl: {
            source: 'interno',
            priority: 2,
            rateLimitKey: 'freshsales_contacts_webhook',
            visibleToPortal: false,
          },
        },
        requested_count: 1,
        processed_count: 0,
        success_count: 0,
        error_count: 0,
        result_summary: {},
        result_sample: [],
        last_error: null,
        started_at: null,
        finished_at: null,
      }).select('id').single();

      if (contactJobError) throw contactJobError;

      log('info', 'webhook_contato_enfileirado', {
        contact_id: contactId,
        account_id: contactAccountId,
        email: contactEmail,
        job_id: contactJob?.id,
      });
      return new Response(
        JSON.stringify({
          ok: true,
          enfileirado: true,
          tipo: 'contact_sync',
          contact_id: contactId,
          account_id: contactAccountId,
          email: contactEmail,
          job_id: contactJob?.id,
          mensagem: 'Sincronização do contato agendada para espelho local e portal.',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('warn', 'webhook_contato_fila_erro', { contactId, erro: msg });
      return new Response(
        JSON.stringify({ ok: false, enfileirado: false, tipo: 'contact_sync', erro: msg, contact_id: contactId }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  if (!containsDatajudTag(body)) {
    return new Response(
      JSON.stringify({ ok: true, enfileirado: false, motivo: 'tag diferente de Datajud/datajud' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { cnj, accountId, raw } = extrairPayload(body);

  // Rejeita se não tem CNJ
  if (!cnj) {
    log('warn', 'webhook_sem_cnj', { raw, keys: Object.keys(body) });
    // Retorna 200 mesmo assim para o FS não ficar reemitindo
    return new Response(
      JSON.stringify({ ok: false, enfileirado: false, motivo: 'cf_processo ausente ou inválido', raw }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const cnjFmt = cnj20toFmt(cnj);

  try {
    // Verifica se já existe processo no Supabase (para vincular)
    const { data: proc } = await db.from('processos')
      .select('id')
      .or(`numero_cnj.eq.${cnj},numero_processo.eq.${cnj}`)
      .maybeSingle();

    // Evita duplicatas: se já existe job pendente/processando para este CNJ, skipa
    const { data: jobExist } = await db.from('monitoramento_queue')
      .select('id, status')
      .eq('tipo', 'fs_webhook_sync')
      .in('status', ['pendente', 'processando'])
      .contains('payload', { numero_cnj: cnj })
      .maybeSingle();

    if (jobExist) {
      log('info', 'webhook_job_ja_existe', { cnj, job_id: jobExist.id, status: jobExist.status });
      if (accountId) await registrarConsultaSolicitada(accountId, cnjFmt, jobExist.id).catch(() => {});
      return new Response(
        JSON.stringify({
          ok:           true,
          enfileirado:  false,
          motivo:       'job já pendente ou processando',
          cnj:          cnjFmt,
          job_id:       jobExist.id,
          job_status:   jobExist.status,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Insere na fila com alta prioridade (1 = máxima)
    const { data: job, error: qErr } = await db.from('monitoramento_queue').insert({
      processo_id:          proc?.id ?? null,   // null se processo ainda não existe
      fonte:                'freshsales_webhook',
      tipo:                 'fs_webhook_sync',
      status:               'pendente',
      prioridade:           1,                  // máxima prioridade
      proxima_execucao:     new Date().toISOString(),
      account_id_freshsales: accountId,
      payload: {
        numero_cnj:  cnj,
        cnj_fmt:     cnjFmt,
        account_id:  accountId,
        origem:      'freshsales_workflow',
      },
    }).select('id').single();

    if (qErr) throw qErr;

    log('info', 'webhook_enfileirado', { cnj: cnjFmt, account_id: accountId, job_id: job?.id });
    if (accountId) await registrarConsultaSolicitada(accountId, cnjFmt, job?.id ?? null).catch(() => {});

    // Responde 200 imediatamente — FS não espera mais
    return new Response(
      JSON.stringify({
        ok:          true,
        enfileirado: true,
        cnj:         cnjFmt,
        account_id:  accountId,
        job_id:      job?.id,
        mensagem:    'Enriquecimento agendado. O Sales Account será atualizado em instantes.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('warn', 'webhook_fila_erro', { cnj, erro: msg });
    // Retorna 200 mesmo em erro de fila para não acumular retentativas do FS
    return new Response(
      JSON.stringify({ ok: false, enfileirado: false, erro: msg }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
