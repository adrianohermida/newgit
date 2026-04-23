/**
 * billing-import — Edge Function v2
 * Processa a fila billing_import_queue e sincroniza com o Freshsales Deals.
 *
 * Responsabilidades:
 * 1. Ler lote da billing_import_queue (status = 'aberto' | 'pago' | 'faturar')
 * 2. Verificar rate limit centralizado (fs_rate_limit_check)
 * 3. Buscar/criar Contact no Freshsales (via contacts/filter POST)
 * 4. Buscar Account (processo) no Freshsales por CNJ (via sales_accounts/filter POST)
 * 5. Criar/atualizar Deal no Freshsales com produto obrigatório e deal_stage_id real
 * 6. Inserir em billing_receivables + freshsales_deals_registry no Supabase
 * 7. Atualizar billing_import_queue com status = 'processado'
 *
 * Rate limit: máximo 250 req/hora para billing-import (de 1000 total)
 * Cron: a cada 2 minutos via pg_cron
 *
 * IDs reais do Freshsales (hmadv-org.myfreshworks.com):
 *   Pipeline: 31000060365
 *   Stage 'aberto'   → 31000423213
 *   Stage 'faturar'  → 31000423211
 *   Stage 'pago'     → 31000423216
 *   Stage 'cancelado'→ 31000423213 (fallback)
 *   Produto padrão   → 31002148103 (Honorários Advocatícios)
 *   Owner ID         → 31000147944 (Dr. Adriano)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Configuração ─────────────────────────────────────────────────────────────
const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY        = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FS_DOMAIN_RAW  = Deno.env.get("FRESHSALES_DOMAIN") || "";
const FS_API_KEY     = Deno.env.get("FRESHSALES_API_KEY") || "";
const FS_OWNER_ID    = Number(
  Deno.env.get("FRESHSALES_OWNER_ID") ||
  Deno.env.get("FS_OWNER_ID") ||
  "31000147944"
);

const CALLER         = "billing-import";
const QUOTA_PER_HOUR = 250;   // cota reservada para este caller
const BATCH_SIZE     = 8;     // 8 itens × ~3 req = 24 req/execução (seguro)

// IDs reais do Freshsales
const FS_PIPELINE_ID = 31000060365;
const FS_PRODUCT_ID  = 31002148103; // Honorários Advocatícios
const FS_STAGE_MAP: Record<string, number> = {
  aberto:    31000423213,
  faturar:   31000423211,
  pago:      31000423216,
  cancelado: 31000423213, // fallback = aberto
};

// Status da fila que devem ser processados
const STATUS_PROCESSAVEIS = ["aberto", "pago", "faturar"];

const DOMAIN_MAP: Record<string, string> = {
  "hmadv-7b725ea101eff55.freshsales.io": "hmadv-org.myfreshworks.com",
};

function fsDomain(): string {
  const d = FS_DOMAIN_RAW.trim();
  if (d.includes("myfreshworks.com")) return d;
  return DOMAIN_MAP[d] ?? d.replace(/\.freshsales\.io$/, ".myfreshworks.com");
}

function fsHeaders(): HeadersInit {
  return {
    "Authorization": `Token token=${FS_API_KEY.trim()}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

// ─── Supabase client ──────────────────────────────────────────────────────────
const db = createClient(SUPABASE_URL, SVC_KEY, {
  auth: { persistSession: false },
});

// ─── Rate limit ───────────────────────────────────────────────────────────────
async function checkRateLimit(needed: number): Promise<{ ok: boolean; callerUsed: number; totalUsed: number }> {
  const { data, error } = await db.rpc("fs_rate_limit_check", {
    p_caller: CALLER,
    p_needed: needed,
    p_quota:  QUOTA_PER_HOUR,
  });
  if (error) {
    console.error("Rate limit check error:", error.message);
    return { ok: false, callerUsed: 999, totalUsed: 999 };
  }
  return {
    ok:          data?.ok === true,
    callerUsed:  data?.caller_used ?? 0,
    totalUsed:   data?.total_used ?? 0,
  };
}

// ─── Freshsales: buscar contact por e-mail ou nome (via filter POST) ──────────
async function buscarOuCriarContact(
  nome: string,
  email: string | null,
): Promise<string | null> {
  const domain = fsDomain();

  // 1. Buscar por e-mail via filter
  if (email) {
    try {
      const res = await fetch(
        `https://${domain}/crm/sales/api/contacts/filter`,
        {
          method: "POST",
          headers: fsHeaders(),
          body: JSON.stringify({
            filter_rule: [{ attribute: "contact_email.email", operator: "is_in", value: email }],
            sort: "id",
            sort_type: "desc",
            page: 1,
            per_page: 1,
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const contacts = data?.contacts ?? [];
        if (contacts.length > 0) return String(contacts[0].id);
      }
    } catch (_) { /* continuar */ }
  }

  // 2. Criar novo contact (sem busca por nome para economizar req)
  const parts     = (nome || "").trim().split(" ");
  const firstName = parts[0] || nome || "Cliente";
  const lastName  = parts.slice(1).join(" ") || "-";

  const payload: Record<string, unknown> = {
    contact: {
      first_name: firstName,
      last_name:  lastName,
      owner_id:   FS_OWNER_ID,
      lifecycle_stage_id: 8, // Cliente
    },
  };
  if (email) {
    (payload.contact as Record<string, unknown>).email = email;
  }

  try {
    const res = await fetch(
      `https://${domain}/crm/sales/api/contacts`,
      { method: "POST", headers: fsHeaders(), body: JSON.stringify(payload) }
    );
    if (res.ok) {
      const data = await res.json();
      return data?.contact?.id ? String(data.contact.id) : null;
    }
    const errText = await res.text();
    console.error("Erro ao criar contact:", errText.substring(0, 200));
  } catch (e) {
    console.error("Exceção ao criar contact:", String(e));
  }
  return null;
}

// ─── Freshsales: buscar account por CNJ (via sales_accounts/filter POST) ──────
async function buscarAccountPorCNJ(cnj: string): Promise<string | null> {
  if (!cnj) return null;
  const domain = fsDomain();
  const cnjNorm = cnj.trim();

  try {
    const res = await fetch(
      `https://${domain}/crm/sales/api/sales_accounts/filter`,
      {
        method: "POST",
        headers: fsHeaders(),
        body: JSON.stringify({
          filter_rule: [{ attribute: "sales_account_name.name", operator: "contains", value: cnjNorm.substring(0, 30) }],
          sort: "id",
          sort_type: "desc",
          page: 1,
          per_page: 1,
        }),
      }
    );
    if (res.ok) {
      const data = await res.json();
      const accounts = data?.sales_accounts ?? [];
      if (accounts.length > 0) return String(accounts[0].id);
    }
  } catch (_) { /* continuar */ }
  return null;
}

// ─── Freshsales: montar payload do deal ──────────────────────────────────────
function buildDealPayload(
  item: Record<string, unknown>,
  contactId: string | null,
  accountId: string | null,
): Record<string, unknown> {
  const status        = (item.status as string) || "aberto";
  const amount        = Number(item.balance_due ?? item.amount_original ?? 0);
  const amountOriginal = Number(item.amount_original ?? 0);
  const dealStageId   = FS_STAGE_MAP[status] ?? FS_STAGE_MAP["aberto"];
  const probability   = status === "pago" ? 100 : status === "cancelado" ? 0 : 50;

  const invoiceNum  = (item.invoice_number as string) || null;
  const contactName = (item.contact_name   as string) || null;
  const processRef  = (item.process_reference as string) || null;
  const title = [
    invoiceNum  ? `Fatura ${invoiceNum}` : "Honorários",
    contactName ? `— ${contactName}`     : "",
    processRef  ? `(${processRef.substring(0, 25)})` : "",
  ].filter(Boolean).join(" ");

  const deal: Record<string, unknown> = {
    name:            title,
    amount:          amount > 0 ? amount : amountOriginal,
    deal_stage_id:   dealStageId,
    deal_pipeline_id: FS_PIPELINE_ID,
    owner_id:        FS_OWNER_ID,
    probability:     probability,
    // Produto obrigatório no Freshsales
    deal_products: [{
      id:       FS_PRODUCT_ID,
      quantity: 1,
      price:    amount > 0 ? amount : amountOriginal,
    }],
    // Campos customizados
    custom_field: {
      cf_valor_original:                  amountOriginal,
      cf_valor_corrigido:                 Number(item.amount_corrected ?? 0),
      cf_multa:                           Number(item.late_fee_amount ?? 0),
      cf_juros_mora:                      Number(item.interest_mora_amount ?? 0),
      cf_juros_compensatorios:            Number(item.interest_compensatory_amount ?? 0),
      cf_saldo_devedor:                   amount,
      cf_dias_atraso:                     Number(item.days_overdue ?? 0),
      cf_indice_correcao:                 (item.correction_index_name as string) ?? "IGPM",
      cf_numero_fatura:                   invoiceNum ?? "",
      cf_tipo_recebivel:                  (item.receivable_type as string) ?? "honorario",
      cf_status_fatura:                   status,
    },
  };

  if (contactId) deal.contacts_added = [{ id: Number(contactId) }];
  if (accountId) deal.account = { id: Number(accountId) };
  if (item.due_date) deal.expected_close = item.due_date as string;

  return { deal };
}

// ─── Freshsales: criar ou atualizar deal ─────────────────────────────────────
async function criarOuAtualizarDeal(
  item: Record<string, unknown>,
  contactId: string | null,
  accountId: string | null,
): Promise<string | null> {
  const domain  = fsDomain();
  const payload = buildDealPayload(item, contactId, accountId);
  const existingDealId = item.freshsales_deal_id as string | null;

  if (existingDealId) {
    try {
      const res = await fetch(
        `https://${domain}/crm/sales/api/deals/${existingDealId}`,
        { method: "PUT", headers: fsHeaders(), body: JSON.stringify(payload) }
      );
      if (res.ok) {
        const data = await res.json();
        return data?.deal?.id ? String(data.deal.id) : existingDealId;
      }
      console.error("Erro ao atualizar deal:", (await res.text()).substring(0, 300));
    } catch (e) {
      console.error("Exceção ao atualizar deal:", String(e));
    }
    return existingDealId; // retornar ID existente mesmo se falhar update
  }

  try {
    const res = await fetch(
      `https://${domain}/crm/sales/api/deals`,
      { method: "POST", headers: fsHeaders(), body: JSON.stringify(payload) }
    );
    if (res.ok) {
      const data = await res.json();
      return data?.deal?.id ? String(data.deal.id) : null;
    }
    const errText = await res.text();
    console.error("Erro ao criar deal:", errText.substring(0, 300));
  } catch (e) {
    console.error("Exceção ao criar deal:", String(e));
  }
  return null;
}

// ─── Processar um item da fila ────────────────────────────────────────────────
async function processarItem(item: Record<string, unknown>): Promise<{
  ok: boolean;
  dealId: string | null;
  contactId: string | null;
  accountId: string | null;
  error?: string;
}> {
  const contactName  = item.contact_name    as string | null;
  const contactEmail = item.contact_email   as string | null;
  const processRef   = item.process_reference as string | null;

  // Verificar rate limit (máx 3 req: contact + account + deal)
  const rl = await checkRateLimit(3);
  if (!rl.ok) {
    return { ok: false, dealId: null, contactId: null, accountId: null, error: "rate_limit_exceeded" };
  }

  // Buscar/criar contact
  let contactId: string | null = null;
  if (contactName || contactEmail) {
    contactId = await buscarOuCriarContact(contactName ?? "Cliente", contactEmail);
  }

  // Buscar account por CNJ
  let accountId: string | null = null;
  if (processRef) {
    accountId = await buscarAccountPorCNJ(processRef);
  }

  // Criar/atualizar deal
  const dealId = await criarOuAtualizarDeal(item, contactId, accountId);
  if (!dealId) {
    return { ok: false, dealId: null, contactId, accountId, error: "deal_creation_failed" };
  }

  return { ok: true, dealId, contactId, accountId };
}

// ─── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin":  "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  const startTime = Date.now();

  try {
    // Verificar credenciais
    if (!FS_API_KEY || !FS_DOMAIN_RAW) {
      return Response.json({
        error: "FRESHSALES_API_KEY ou FRESHSALES_DOMAIN não configurados",
      }, { status: 500 });
    }

    // Verificar rate limit disponível (sem consumir)
    const rl0 = await checkRateLimit(0);
    if (rl0.callerUsed >= QUOTA_PER_HOUR) {
      return Response.json({
        status:      "quota_exhausted",
        message:     `Cota de ${QUOTA_PER_HOUR} req/hora para ${CALLER} atingida`,
        caller_used: rl0.callerUsed,
        total_used:  rl0.totalUsed,
      });
    }
    if (rl0.totalUsed >= 950) {
      return Response.json({
        status:     "global_quota_near_limit",
        message:    "Limite global de 950 req/hora próximo do limite",
        total_used: rl0.totalUsed,
      });
    }

    // Buscar lote da fila — status 'aberto', 'pago' ou 'faturar'
    const { data: items, error: queueError } = await db
      .from("billing_import_queue")
      .select("*")
      .in("status", STATUS_PROCESSAVEIS)
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (queueError) {
      return Response.json({ error: queueError.message }, { status: 500 });
    }

    // Se não há itens processáveis, verificar erros para retry
    let fila = items ?? [];
    if (fila.length === 0) {
      const { data: errorItems } = await db
        .from("billing_import_queue")
        .select("*")
        .eq("status", "erro")
        .neq("error_msg", "rate_limit_exceeded")
        .order("created_at", { ascending: true })
        .limit(BATCH_SIZE);

      fila = errorItems ?? [];

      if (fila.length === 0) {
        // Contar totais para relatório
        const { count: totalAberto } = await db
          .from("billing_import_queue")
          .select("id", { count: "exact", head: true })
          .in("status", STATUS_PROCESSAVEIS);
        const { count: totalProcessado } = await db
          .from("billing_import_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "processado");
        const { count: totalErro } = await db
          .from("billing_import_queue")
          .select("id", { count: "exact", head: true })
          .eq("status", "erro");

        return Response.json({
          status:           "queue_empty",
          message:          "Nenhum item processável na fila",
          pendentes:        totalAberto    ?? 0,
          processados:      totalProcessado ?? 0,
          erros:            totalErro       ?? 0,
          caller_used:      rl0.callerUsed,
          total_used:       rl0.totalUsed,
        });
      }
    }

    // Processar lote
    let processados    = 0;
    let erros          = 0;
    let rateLimitHit   = false;

    for (const item of fila) {
      if (rateLimitHit) break;

      // Marcar como processando
      await db
        .from("billing_import_queue")
        .update({ status: "processando", updated_at: new Date().toISOString() })
        .eq("id", item.id);

      const result = await processarItem(item);

      if (result.error === "rate_limit_exceeded") {
        rateLimitHit = true;
        // Reverter para status original
        await db
          .from("billing_import_queue")
          .update({ status: item.status, updated_at: new Date().toISOString() })
          .eq("id", item.id);
        break;
      }

      if (result.ok && result.dealId) {
        // Buscar process_id no Supabase pelo CNJ
        let processId: string | null = null;
        if (item.process_reference) {
          const cnjDigits = String(item.process_reference).replace(/[^0-9]/g, "").substring(0, 20);
          const { data: proc } = await db
            .schema("judiciario")
            .from("processos")
            .select("id")
            .ilike("numero_cnj", `%${cnjDigits}%`)
            .limit(1)
            .maybeSingle();
          processId = proc?.id ?? null;
        }

        // Inserir em billing_receivables
        const { data: receivable } = await db
          .from("billing_receivables")
          .insert({
            receivable_type:                     item.receivable_type ?? "honorario",
            invoice_number:                      item.invoice_number,
            description:                         item.description,
            issue_date:                          item.issue_date,
            due_date:                            item.due_date,
            status:                              item.status ?? "aberto",
            currency:                            item.currency ?? "BRL",
            amount_original:                     Number(item.amount_original ?? 0),
            payment_amount:                      Number(item.payment_amount ?? 0),
            amount_principal:                    Number(item.amount_principal ?? 0),
            correction_index_name:               item.correction_index_name ?? "IGPM",
            correction_factor:                   Number(item.correction_factor ?? 0),
            correction_percent:                  Number(item.correction_percent ?? 0),
            correction_amount:                   Number(item.correction_amount ?? 0),
            amount_corrected:                    Number(item.amount_corrected ?? 0),
            late_fee_percent:                    Number(item.late_fee_percent ?? 10),
            late_fee_amount:                     Number(item.late_fee_amount ?? 0),
            interest_mora_percent_month:         Number(item.interest_mora_percent_month ?? 1),
            interest_mora_amount:                Number(item.interest_mora_amount ?? 0),
            interest_compensatory_percent_month: Number(item.interest_compensatory_percent_month ?? 1),
            interest_compensatory_amount:        Number(item.interest_compensatory_amount ?? 0),
            interest_start_date:                 item.interest_start_date,
            days_overdue:                        Number(item.days_overdue ?? 0),
            balance_due:                         Number(item.balance_due ?? item.amount_original ?? 0),
            freshsales_deal_id:                  result.dealId,
            freshsales_account_id:               result.accountId,
            process_id:                          processId,
            source_import_row_id:                item.id,
            raw_payload:                         item.raw_payload ?? {},
          })
          .select("id")
          .single();

        // Registrar no freshsales_deals_registry
        if (receivable?.id) {
          await db
            .from("freshsales_deals_registry")
            .upsert({
              freshsales_deal_id:     result.dealId,
              billing_receivable_id:  receivable.id,
              stage:                  item.status === "pago" ? "won" : "open",
              amount:                 Number(item.balance_due ?? item.amount_original ?? 0),
              updated_at:             new Date().toISOString(),
            }, { onConflict: "freshsales_deal_id" });
        }

        // Marcar como processado
        await db
          .from("billing_import_queue")
          .update({
            status:                "processado",
            freshsales_deal_id:    result.dealId,
            billing_receivable_id: receivable?.id ?? null,
            processed_at:          new Date().toISOString(),
            updated_at:            new Date().toISOString(),
          })
          .eq("id", item.id);

        processados++;
      } else {
        // Marcar como erro
        await db
          .from("billing_import_queue")
          .update({
            status:     "erro",
            error_msg:  result.error ?? "unknown_error",
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        erros++;
      }
    }

    // Contagem final
    const { count: totalPendente } = await db
      .from("billing_import_queue")
      .select("id", { count: "exact", head: true })
      .in("status", STATUS_PROCESSAVEIS);
    const { count: totalProcessado } = await db
      .from("billing_import_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "processado");

    const elapsed = Date.now() - startTime;
    return Response.json({
      status:                  "ok",
      processados,
      erros,
      rate_limit_hit:          rateLimitHit,
      pendentes_restantes:     totalPendente   ?? 0,
      total_processados:       totalProcessado ?? 0,
      caller_used_this_hour:   rl0.callerUsed + processados * 3,
      total_used_this_hour:    rl0.totalUsed  + processados * 3,
      elapsed_ms:              elapsed,
    });

  } catch (err) {
    console.error("billing-import error:", err);
    return Response.json({
      error:      String(err),
      elapsed_ms: Date.now() - startTime,
    }, { status: 500 });
  }
});
