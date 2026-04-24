import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 1️⃣ Buscar módulos
  const { data: modulos } = await supabase
    .from("governanca.modulos")
    .select("id, nome");

  for (const modulo of modulos ?? []) {
    /* ============================
       A) RLS
    ============================ */
    const { data: engineDb } = await supabase
      .from("governanca.modulo_engine_db")
      .select("schema_nome, tabela_nome, rls_ativo")
      .eq("modulo_id", modulo.id);

    for (const tbl of engineDb ?? []) {
      if (!tbl.rls_ativo) {
        await supabase.from("governanca.devstudio_sprint_tasks").insert({
          modulo_id: modulo.id,
          titulo: `Ativar RLS em ${tbl.schema_nome}.${tbl.tabela_nome}`,
          tipo: "seguranca",
          status: "backlog",
          bloqueia_homologacao: true,
          edge_function: "governanca-homologacao-run"
        });
      }
    }

    /* ============================
       B) EDGE FUNCTIONS
    ============================ */
    const { data: edges } = await supabase
      .from("governanca.modulo_edge_functions")
      .select("id")
      .eq("modulo_id", modulo.id);

    if (!edges || edges.length === 0) {
      await supabase.from("governanca.devstudio_sprint_tasks").insert({
        modulo_id: modulo.id,
        titulo: "Registrar Edge Functions do módulo",
        tipo: "edge",
        status: "backlog",
        bloqueia_homologacao: true,
        edge_function: "devstudio-update-blueprint"
      });
    }

    /* ============================
       C) IA CONTROL
    ============================ */
    const { data: ia } = await supabase
      .from("governanca.modulo_ai_control")
      .select("id")
      .eq("modulo_id", modulo.id);

    if (!ia || ia.length === 0) {
      await supabase.from("governanca.devstudio_sprint_tasks").insert({
        modulo_id: modulo.id,
        titulo: "Definir contrato de IA (AI Control)",
        tipo: "ia",
        status: "backlog",
        bloqueia_homologacao: true,
        edge_function: "ia-audit"
      });
    }

    /* ============================
       D) UX / UI
    ============================ */
    const { data: ux } = await supabase
      .from("governanca.modulo_design_contract")
      .select("permite_css_livre")
      .eq("modulo_id", modulo.id)
      .maybeSingle();

    if (!ux) {
      await supabase.from("governanca.devstudio_sprint_tasks").insert({
        modulo_id: modulo.id,
        titulo: "Definir contrato de Design System (UX/UI)",
        tipo: "ux",
        status: "backlog",
        bloqueia_homologacao: false,
        edge_function: "devstudio-update-blueprint"
      });
    } else if (ux.permite_css_livre) {
      await supabase.from("governanca.devstudio_sprint_tasks").insert({
        modulo_id: modulo.id,
        titulo: "Bloquear CSS livre e aplicar tokens oficiais",
        tipo: "ux",
        status: "backlog",
        bloqueia_homologacao: false,
        edge_function: "devstudio-update-blueprint"
      });
    }
  }

  return new Response(
    JSON.stringify({ status: "Sprint Board avançado gerado com sucesso" }),
    { headers: { "Content-Type": "application/json" } }
  );
});
