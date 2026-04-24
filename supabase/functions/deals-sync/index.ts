import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/**
 * deals-sync  v1
 *
 * Wrapper de sincronização de Deals do Freshsales.
 *
 * Responsabilidades:
 *   1. Delegar o processamento da fila billing_import_queue para billing-import.
 *   2. Expor status consolidado de deals pendentes e sincronizados.
 *   3. Permitir reprocessamento de deals com erro (retry_errors).
 *
 * Actions:
 *   sync_batch     — Aciona billing-import para processar lote da fila (padrão)
 *   status         — Retorna resumo de deals pendentes, sincronizados e com erro
 *   retry_errors   — Recoloca deals com erro de volta na fila para reprocessamento
 *
 * Retorno do sync_batch:
 *   { processados, criados, atualizados, erros, restantes }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Env ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

// ─── Invocar billing-import ───────────────────────────────────────────────────
async function invocarBillingImport(batchSize: number): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/billing-import`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
          "apikey": SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({ batch_size: batchSize }),
        signal: AbortSignal.timeout(55_000),
      },
    );
    if (!res.ok) {
      const txt = await res.text();
      return { error: `billing-import retornou HTTP ${res.status}: ${txt}` };
    }
    return await res.json() as Record<string, unknown>;
  } catch (e) {
    return { error: String(e) };
  }
}

// ─── Action: status ──────────────────────────────────────────────────────────
async function actionStatus(db: ReturnType<typeof createClient>): Promise<Response> {
  const [queueTotal, queuePendente, dealsTotal, dealsSincronizados, dealsErro] = await Promise.all([
    db.from("billing_import_queue").select("id", { count: "exact", head: true }),
    db.from("billing_import_queue").select("id", { count: "exact", head: true })
      .in("status", ["aberto", "pago", "faturar"]),
    db.from("freshsales_deals_registry").select("id", { count: "exact", head: true }),
    db.from("freshsales_deals_registry").select("id", { count: "exact", head: true })
      .not("freshsales_deal_id", "like", "pending-%")
      .eq("last_sync_status", "ok"),
    db.from("freshsales_deals_registry").select("id", { count: "exact", head: true })
      .eq("last_sync_status", "error"),
  ]);

  return Response.json({
    fila_total: queueTotal.count ?? 0,
    fila_pendente: queuePendente.count ?? 0,
    deals_total: dealsTotal.count ?? 0,
    deals_sincronizados: dealsSincronizados.count ?? 0,
    deals_com_erro: dealsErro.count ?? 0,
  });
}

// ─── Action: sync_batch ───────────────────────────────────────────────────────
async function actionSyncBatch(
  db: ReturnType<typeof createClient>,
  batchSize: number,
): Promise<Response> {
  const resultado = await invocarBillingImport(batchSize);

  // Contar restantes na fila
  const { count: restantes } = await db
    .from("billing_import_queue")
    .select("id", { count: "exact", head: true })
    .in("status", ["aberto", "pago", "faturar"]);

  return Response.json({
    ...resultado,
    restantes: restantes ?? 0,
    fonte: "billing-import",
  });
}

// ─── Action: retry_errors ─────────────────────────────────────────────────────
async function actionRetryErrors(db: ReturnType<typeof createClient>): Promise<Response> {
  // Buscar deals com erro no registry
  const { data: dealsErro, error: errFetch } = await db
    .from("freshsales_deals_registry")
    .select("id, billing_receivable_id, last_sync_error")
    .eq("last_sync_status", "error")
    .limit(100);

  if (errFetch) return Response.json({ error: errFetch.message }, { status: 500 });

  let recolocados = 0;
  for (const deal of (dealsErro ?? [])) {
    if (!deal.billing_receivable_id) continue;
    // Resetar o status do deal para tentar novamente
    const { error: errUpdate } = await db
      .from("freshsales_deals_registry")
      .update({
        last_sync_status: "pending",
        last_sync_error: null,
        freshsales_deal_id: `pending-${deal.billing_receivable_id}`,
      })
      .eq("id", deal.id);
    if (!errUpdate) recolocados++;
  }

  return Response.json({
    recolocados,
    total_com_erro: dealsErro?.length ?? 0,
  });
}

// ─── Handler principal ───────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const action = String(body.action ?? url.searchParams.get("action") ?? "sync_batch");
    const batchSize = Number(body.batch_size ?? url.searchParams.get("batch_size") ?? 50);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (action === "status") return await actionStatus(db);
    if (action === "sync_batch") return await actionSyncBatch(db, batchSize);
    if (action === "retry_errors") return await actionRetryErrors(db);

    return Response.json({
      error: "Ação inválida",
      actions: ["sync_batch", "status", "retry_errors"],
    }, { status: 400 });

  } catch (e) {
    console.error("deals-sync error:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
