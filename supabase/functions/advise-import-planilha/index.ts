import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/**
 * advise-import-planilha  v1
 *
 * Responsabilidades:
 *   Processar publicações importadas via planilha exportada do Advise que ainda não foram
 *   vinculadas a processos no Supabase. Essas publicações têm raw_payload do tipo string
 *   com fonte="planilha_exportada" e processo_id=NULL.
 *
 *   O fluxo é:
 *   1. Buscar publicações sem processo_id cujo raw_payload contém fonte="planilha_exportada".
 *   2. Extrair o número do processo do campo raw_payload.processo.
 *   3. Tentar vincular ao processo existente pelo numero_cnj ou numero_processo.
 *   4. Se não encontrar, criar o processo na tabela judiciario.processos.
 *   5. Atualizar processo_id na publicação.
 *   6. Retornar { inseridas, ignoradas, errors }.
 *
 * Actions:
 *   import_batch   — Processa lote de publicações de planilha sem processo vinculado
 *   status         — Retorna contagens de publicações de planilha pendentes
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ─── Env ─────────────────────────────────────────────────────────────────────
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Normalizar número de processo ───────────────────────────────────────────
function normalizarNumero(num: string): string {
  if (!num) return "";
  // Remove espaços e caracteres especiais, mantém apenas dígitos e pontos/hífens
  return num.replace(/\s+/g, "").trim();
}

// ─── Extrair payload da publicação ───────────────────────────────────────────
function extrairPayload(rawPayload: unknown): Record<string, unknown> | null {
  if (!rawPayload) return null;
  try {
    if (typeof rawPayload === "object") return rawPayload as Record<string, unknown>;
    if (typeof rawPayload === "string") {
      const parsed = JSON.parse(rawPayload);
      if (typeof parsed === "string") return JSON.parse(parsed);
      return parsed as Record<string, unknown>;
    }
  } catch { /* ignorar */ }
  return null;
}

// ─── Action: status ──────────────────────────────────────────────────────────
async function actionStatus(db: ReturnType<typeof createClient>): Promise<Response> {
  const [semProcesso, total] = await Promise.all([
    db.schema("judiciario").from("publicacoes")
      .select("id", { count: "exact", head: true })
      .is("processo_id", null)
      .not("raw_payload", "is", null),
    db.schema("judiciario").from("publicacoes")
      .select("id", { count: "exact", head: true })
      .not("raw_payload", "is", null),
  ]);
  return Response.json({
    publicacoes_total: total.count ?? 0,
    publicacoes_sem_processo: semProcesso.count ?? 0,
  });
}

// ─── Action: import_batch ─────────────────────────────────────────────────────
async function actionImportBatch(
  db: ReturnType<typeof createClient>,
  batchSize: number,
): Promise<Response> {
  let inseridas = 0;
  let ignoradas = 0;
  let erros = 0;

  // Buscar publicações de planilha sem processo_id
  const { data: pubs, error: pubErr } = await db
    .schema("judiciario")
    .from("publicacoes")
    .select("id, raw_payload, numero_processo_api")
    .is("processo_id", null)
    .not("raw_payload", "is", null)
    .limit(batchSize);

  if (pubErr) {
    return Response.json({ error: pubErr.message }, { status: 500 });
  }

  for (const pub of (pubs ?? [])) {
    const payload = extrairPayload(pub.raw_payload);
    if (!payload) { ignoradas++; continue; }

    // Verificar se é planilha_exportada
    const fonte = String(payload.fonte ?? "");
    if (fonte !== "planilha_exportada") { ignoradas++; continue; }

    // Extrair número do processo
    const numProcesso = normalizarNumero(
      String(payload.processo ?? pub.numero_processo_api ?? "")
    );
    if (!numProcesso) { ignoradas++; continue; }

    // Tentar encontrar processo existente
    const { data: processoExistente } = await db
      .schema("judiciario")
      .from("processos")
      .select("id")
      .or(`numero_cnj.eq.${numProcesso},numero_processo.eq.${numProcesso}`)
      .limit(1)
      .single();

    let processoId: string | null = processoExistente?.id ?? null;

    // Se não encontrou, criar o processo
    if (!processoId) {
      const comarca = String(payload.comarca ?? "");
      const vara = String(payload.vara ?? "");
      const { data: novoProcesso, error: errCreate } = await db
        .schema("judiciario")
        .from("processos")
        .insert({
          numero_processo: numProcesso,
          numero_cnj: numProcesso,
          comarca: comarca || null,
          vara: vara || null,
          fonte_criacao: "planilha_exportada",
          status_fonte: "importado",
        })
        .select("id")
        .single();

      if (errCreate || !novoProcesso) {
        erros++;
        continue;
      }
      processoId = novoProcesso.id;
    }

    // Vincular publicação ao processo
    const { error: errUpdate } = await db
      .schema("judiciario")
      .from("publicacoes")
      .update({ processo_id: processoId })
      .eq("id", pub.id);

    if (errUpdate) {
      erros++;
    } else {
      inseridas++;
    }
    await sleep(30);
  }

  // Contar restantes
  const { count: restantes } = await db
    .schema("judiciario")
    .from("publicacoes")
    .select("id", { count: "exact", head: true })
    .is("processo_id", null)
    .not("raw_payload", "is", null);

  return Response.json({
    inseridas,
    ignoradas,
    errors: erros,
    restantes: restantes ?? 0,
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
    const action = String(body.action ?? url.searchParams.get("action") ?? "import_batch");
    const batchSize = Number(body.batch_size ?? url.searchParams.get("batch_size") ?? 200);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    if (action === "status") return await actionStatus(db);
    if (action === "import_batch") return await actionImportBatch(db, batchSize);

    return Response.json({
      error: "Ação inválida",
      actions: ["import_batch", "status"],
    }, { status: 400 });

  } catch (e) {
    console.error("advise-import-planilha error:", e);
    return Response.json({ error: String(e) }, { status: 500 });
  }
});
