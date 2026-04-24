// Setup Supabase Runtime
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const executionId = crypto.randomUUID();

  try {
    /* ===============================
       1. Autorização e Cliente
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
      nome,
      dominio,
      descricao,
      blueprint_inicial,
      usuario_email,
    } = body;

    if (!nome || !dominio || !blueprint_inicial) {
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
      modulo: nome,
      etapa: "criar_modulo",
      executado_por: "ia",
      usuario_email,
      status: "em_execucao",
      progresso: 10,
      input_payload: body,
      started_at: new Date().toISOString(),
    });

    /* ===============================
       4. Criar Módulo
    =============================== */
    const { data: modulo, error: moduloError } = await supabase
      .from("governanca.modulos")
      .insert({
        nome,
        dominio,
        descricao,
        status_geral: "em_construcao",
        progresso: 20,
      })
      .select()
      .single();

    if (moduloError) throw moduloError;

    /* ===============================
       5. Criar Plano Estrutural v1.0
    =============================== */
    const { error: planoError } = await supabase
      .from("governanca.planos_estruturais")
      .insert({
        modulo_id: modulo.id,
        versao: "v1.0",
        schema_snapshot: blueprint_inicial,
        status: "em_validacao",
        observacoes: "Blueprint inicial criado pelo DevStudio",
      });

    if (planoError) throw planoError;

    /* ===============================
       6. Atualizar Ledger (SUCESSO)
    =============================== */
    await supabase
      .from("governanca.devstudio_execution_ledger")
      .update({
        status: "concluido",
        progresso: 100,
        output_payload: {
          modulo_id: modulo.id,
          versao: "v1.0",
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
        modulo_id: modulo.id,
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

    await supabase.from("governanca.devstudio_execution_ledger").update({
      status: "falhou",
      progresso: 0,
      logs: err?.message ?? "Erro desconhecido",
      finished_at: new Date().toISOString(),
    }).eq("execution_id", executionId);

    return new Response(
      JSON.stringify({ error: err?.message ?? "Erro interno" }),
      { status: 500 }
    );
  }
});
