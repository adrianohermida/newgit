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

    const {
      modulo_id,
      versao,
      novo_schema_snapshot,
      rls_snapshot,
      views_snapshot,
      funcoes_snapshot,
      usuario_email,
      observacoes,
    } = body;

    if (!modulo_id || !versao || !novo_schema_snapshot) {
      return new Response(
        JSON.stringify({ error: "Campos obrigatórios ausentes." }),
        { status: 400 }
      );
    }

    /* ===============================
       3. Registrar Execução (INÍCIO)
    =============================== */
    await supabase.from("governanca.devstudio_execution_ledger").insert({
      execution_id: executionId,
      modulo: modulo_id,
      etapa: "update_blueprint",
      executado_por: "ia",
      usuario_email,
      status: "em_execucao",
      progresso: 10,
      input_payload: body,
      started_at: new Date().toISOString(),
    });

    /* ===============================
       4. Criar Novo Plano Estrutural
       (versionamento, NÃO update)
    =============================== */
    const { error: planoError } = await supabase
      .from("governanca.planos_estruturais")
      .insert({
        modulo_id,
        versao,
        schema_snapshot: novo_schema_snapshot,
        rls_snapshot,
        views_snapshot,
        funcoes_snapshot,
        status: "em_validacao",
        observacoes: observacoes ?? "Atualização de blueprint via DevStudio",
      });

    if (planoError) throw planoError;

    /* ===============================
       5. Atualizar Status do Módulo
    =============================== */
    await supabase
      .from("governanca.modulos")
      .update({
        status_geral: "em_validacao",
      })
      .eq("id", modulo_id);

    /* ===============================
       6. Atualizar Ledger (SUCESSO)
    =============================== */
    await supabase
      .from("governanca.devstudio_execution_ledger")
      .update({
        status: "concluido",
        progresso: 100,
        output_payload: {
          modulo_id,
          versao,
        },
        finished_at: new Date().toISOString(),
      })
      .eq("execution_id", executionId);

    /* ===============================
       7. Resposta Final
    =============================== */
    return new Response(
      JSON.stringify({
        success: true,
        execution_id: executionId,
        modulo_id,
        nova_versao: versao,
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
