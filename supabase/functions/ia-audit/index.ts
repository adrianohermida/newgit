import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";
import { IAAuditRequest, IAAuditResponse } from "./types.ts";

serve(async (req) => {
  try {
    const body: IAAuditRequest = await req.json();

    // Validações mínimas
    if (!body.agente || !body.acao || !body.decisao || !body.resultado) {
      return jsonResponse({
        logged: false,
        message: "Campos obrigatórios ausentes."
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // 🔐 sempre service_role
    );

    const { data, error } = await supabase
      .from("auditoria.logs_sistema")
      .insert({
        entidade: body.alvo ?? 'sistema',
        acao: body.acao,
        payload: {
          agente: body.agente,
          decisao: body.decisao,
          justificativa: body.justificativa,
          contexto: body.contexto,
          resultado: body.resultado
        },
        origem: 'ia'
      })
      .select("id")
      .single();

    if (error) {
      return jsonResponse({
        logged: false,
        message: "Falha ao registrar auditoria."
      }, 500);
    }

    return jsonResponse({
      logged: true,
      audit_id: data.id,
      message: "Decisão da IA auditada com sucesso."
    });

  } catch (err) {
    return jsonResponse({
      logged: false,
      message: "Erro inesperado na auditoria da IA."
    }, 500);
  }
});

function jsonResponse(body: IAAuditResponse, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
