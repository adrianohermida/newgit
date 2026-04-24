import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: modulos } = await supabase
    .from("governanca.modulos")
    .select("id, nome");

  for (const modulo of modulos ?? []) {
    const { data: engineDb } = await supabase
      .from("governanca.modulo_engine_db")
      .select("schema_nome, tabela_nome")
      .eq("modulo_id", modulo.id);

    for (const item of engineDb ?? []) {
      const { data: existe } = await supabase.rpc("sql", {
        query: `
          select 1
          from information_schema.tables
          where table_schema = '${item.schema_nome}'
            and table_name = '${item.tabela_nome}'
        `
      });

      if (!existe || existe.length === 0) {
        await supabase
          .from("governanca.devstudio_sprint_tasks")
          .insert({
            modulo_id: modulo.id,
            titulo: `Criar tabela ${item.schema_nome}.${item.tabela_nome}`,
            tipo: "estrutura",
            status: "backlog",
            bloqueia_homologacao: true,
            edge_function: "devstudio-update-blueprint"
          });
      }
    }
  }

  return new Response(
    JSON.stringify({ status: "Sprint Board gerado com sucesso" }),
    { headers: { "Content-Type": "application/json" } }
  );
});
