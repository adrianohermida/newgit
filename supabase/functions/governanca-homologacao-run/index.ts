// Supabase Edge Runtime
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const executionId = crypto.randomUUID();

  try {
    /* ===============================
       1. Cliente Supabase (Service)
    =============================== */
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    /* ===============================
       2. Payload de Entrada
    =============================== */
    const body = await req.json();
    const { plano_id, usuario_email } = body;

    if (!plano_id) {
      return new Response(
        JSON.stringify({ error: "plano_id é obrigatório." }),
        { status: 400 }
      );
    }

    /* ===============================
       3. Registrar Execução (INÍCIO)
    =============================== */
    await supabase.from("governanca.devstudio_execution_ledger").insert({
      execution_id: executionId,
      modulo: "governanca",
      etapa: "homologacao_tecnica",
      executado_por: "ia",
      usuario_email,
      status: "em_execucao",
      progresso: 10,
      input_payload: body,
      started_at: new Date().toISOString(),
    });

    /* ===============================
       4. Buscar Plano Estrutural
    =============================== */
    const { data: plano, error: planoError } = await supabase
      .from("governanca.planos_estruturais")
      .select("*")
      .eq("id", plano_id)
      .single();

    if (planoError || !plano) throw planoError ?? new Error("Plano não encontrado.");

    /* ===============================
       5. Avaliação Técnica Assistida
       (NÃO decisória)
    =============================== */

    // Critérios mínimos objetivos (determinísticos)
    const divergencias: any[] = [];
    const riscos: any[] = [];

    if (!plano.schema_snapshot) {
      divergencias.push("Plano sem schema_snapshot.");
    }

    if (plano.status !== "em_validacao") {
      riscos.push("Plano não está em status 'em_validacao'.");
    }

    const resultado =
      divergencias.length === 0
        ? "aderente"
        : divergencias.length <= 2
        ? "parcial"
        : "divergente";

    /* ===============================
       6. Registrar Homologação Técnica
    =============================== */
    await supabase.from("governanca.execucoes_homologacao").insert({
      plano_id: plano.id,
      resultado,
      divergencias,
      riscos,
      parecer_ia: `Homologação técnica preliminar executada. Resultado: ${resultado}.`,
      validado_por: null,
    });

    /* ===============================
       7. Atualizar Ledger (SUCESSO)
    =============================== */
    await supabase
      .from("governanca.devstudio_execution_ledger")
      .update({
        status: "concluido",
        progresso: 100,
        output_payload: {
          plano_id: plano.id,
          resultado,
        },
        finished_at: new Date().toISOString(),
      })
      .eq("execution_id", executionId);

    /* ===============================
       8. Resposta Final
    =============================== */
    return new Response(
      JSON.stringify({
        success: true,
        execution_id: executionId,
        plano_id: plano.id,
        resultado,
        observacao:
          "Homologação técnica registrada. Decisão final depende de validação humana.",
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err: any) {
    /* ===============================
       ERRO → Ledger + Resposta
    =============================== */
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await supabase
      .from("governanca.devstudio_execution_ledger")
      .update({
        status: "falhou",
        progresso: 0,
        logs: err?.message ?? "Erro desconhecido",
        finished_at: new Date().toISOString(),
      })
      .eq("execution_id", executionId);

    return new Response(
      JSON.stringify({ error: err?.message ?? "Erro interno" }),
      { status: 500 }
    );
  }
});
