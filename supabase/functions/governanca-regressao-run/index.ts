// Supabase Edge Runtime
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type CatalogTable = {
  table_schema: string;
  table_name: string;
};

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
      modulo,
      dominio,
      blueprint_versao,
      plano_estrutural_id,
      usuario_email,
    } = body;

    if (!modulo || !dominio || !blueprint_versao || !plano_estrutural_id) {
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
      modulo,
      etapa: "regressao_estrutural_v2",
      executado_por: "ia",
      usuario_email,
      status: "em_execucao",
      progresso: 5,
      input_payload: body,
      started_at: new Date().toISOString(),
    });

    /* ===============================
       4. Buscar Plano Estrutural
    =============================== */
    const { data: plano, error: planoError } = await supabase
      .from("governanca.planos_estruturais")
      .select("schema_snapshot")
      .eq("id", plano_estrutural_id)
      .single();

    if (planoError || !plano) {
      throw planoError ?? new Error("Plano estrutural não encontrado.");
    }

    const esperado = plano.schema_snapshot ?? {};
    const schemasEsperados: string[] = esperado.schemas ?? [];
    const tabelasEsperadas: string[] = esperado.tabelas ?? [];

    /* ===============================
       5. Leitura REAL do Banco
       (information_schema)
    =============================== */
    const { data: catalogo, error: catalogoError } = await supabase.rpc(
      "sql",
      {
        query: `
          select table_schema, table_name
          from information_schema.tables
          where table_schema not in ('pg_catalog','information_schema')
        `,
      }
    );

    if (catalogoError) throw catalogoError;

    const catalogoTabelas = (catalogo as CatalogTable[]).map(
      (t) => `${t.table_schema}.${t.table_name}`
    );

    /* ===============================
       6. Comparação Estrutural REAL
    =============================== */
    const alteracoes_detectadas: any[] = [];

    for (const tabela of tabelasEsperadas) {
      if (!catalogoTabelas.includes(tabela)) {
        alteracoes_detectadas.push({
          tipo: "tabela_ausente",
          elemento: tabela,
          esperado: true,
          encontrado: false,
        });
      }
    }

    for (const tabela of catalogoTabelas) {
      if (!tabelasEsperadas.includes(tabela)) {
        alteracoes_detectadas.push({
          tipo: "tabela_nao_homologada",
          elemento: tabela,
          esperado: false,
          encontrado: true,
        });
      }
    }

    const nivel =
      alteracoes_detectadas.length === 0
        ? "informativa"
        : alteracoes_detectadas.length <= 2
        ? "atencao"
        : "critica";

    const tipo_evento =
      alteracoes_detectadas.length === 0
        ? "regressao_estrutural"
        : "mudanca_nao_homologada";

    /* ===============================
       7. Registrar Regressão
    =============================== */
    await supabase.from("governanca.regressoes_estruturais").insert({
      modulo,
      dominio,
      blueprint_versao,
      plano_estrutural_id,
      tipo_evento,
      nivel,
      alteracoes_detectadas,
      impacto_tecnico:
        alteracoes_detectadas.length > 0
          ? "Divergência estrutural real detectada no banco de dados."
          : "Estrutura aderente ao blueprint.",
      impacto_juridico:
        alteracoes_detectadas.length > 0
          ? "Risco de quebra de homologação institucional."
          : "Sem impacto jurídico.",
      homologacao_afetada: alteracoes_detectadas.length > 0,
      requer_acao_humana: alteracoes_detectadas.length > 0,
    });

    /* ===============================
       8. Finalizar Ledger
    =============================== */
    await supabase
      .from("governanca.devstudio_execution_ledger")
      .update({
        status: "concluido",
        progresso: 100,
        output_payload: {
          nivel,
          alteracoes_detectadas,
          fonte: "information_schema",
        },
        finished_at: new Date().toISOString(),
      })
      .eq("execution_id", executionId);

    /* ===============================
       9. Resposta Final
    =============================== */
    return new Response(
      JSON.stringify({
        success: true,
        execution_id: executionId,
        nivel,
        alteracoes_detectadas,
        fonte: "information_schema",
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
