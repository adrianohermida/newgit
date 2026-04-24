import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

/* =========================
   CORS (OBRIGATÓRIO)
   ========================= */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/* =========================
   EDGE FUNCTION
   ========================= */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  /* =========================
     1️⃣ Body seguro
     ========================= */
  let body: any = null;
  try {
    if (req.headers.get("content-type")?.includes("application/json")) {
      body = await req.json();
    }
  } catch {}

  const { publicacao_id, workspace_id, usuario_email } = body || {};

  if (!publicacao_id || !workspace_id) {
    return response(400, {
      error: "publicacao_id e workspace_id são obrigatórios",
    });
  }

  /* =========================
     2️⃣ Env vars
     ========================= */
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return response(500, { error: "Variáveis de ambiente ausentes" });
  }

  /* =========================
     3️⃣ Buscar publicação (REST)
     ========================= */
  const pubUrl =
    `${supabaseUrl}/rest/v1/publicacoes.publicacoes` +
    `?id=eq.${publicacao_id}` +
    `&workspace_id=eq.${workspace_id}` +
    `&select=id,conteudo,processo_id,status_pipeline`;

  const pubRes = await fetch(pubUrl, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!pubRes.ok) {
    return response(404, { error: "Publicação não encontrada" });
  }

  const pubs = await pubRes.json();
  if (!Array.isArray(pubs) || pubs.length === 0) {
    return response(404, { error: "Publicação não encontrada" });
  }

  const pub = pubs[0];

  /* =========================
     4️⃣ Classificação jurídica (EDGE-SAFE)
     ========================= */
  const texto = (pub.conteudo || "").toLowerCase();

  let tipo_evento = "outro";
  if (texto.includes("intima")) tipo_evento = "intimacao";
  else if (texto.includes("citacao")) tipo_evento = "citacao";
  else if (texto.includes("sentenca")) tipo_evento = "sentenca";
  else if (texto.includes("decisao")) tipo_evento = "decisao";
  else if (texto.includes("despacho")) tipo_evento = "despacho";

  const gera_obrigacao =
    tipo_evento === "intimacao" ||
    tipo_evento === "citacao" ||
    tipo_evento === "decisao" ||
    tipo_evento === "sentenca";

  let grau_risco: "baixo" | "medio" | "alto" | "critico" = "baixo";
  if (gera_obrigacao) grau_risco = "medio";
  if (tipo_evento === "decisao") grau_risco = "alto";
  if (tipo_evento === "sentenca") grau_risco = "critico";

  let prazo_sugerido: any = null;
  if (tipo_evento === "intimacao") {
    prazo_sugerido = { dias: 15, fundamento: "Art. 231, CPC" };
  }
  if (tipo_evento === "citacao") {
    prazo_sugerido = { dias: 15, fundamento: "Art. 335, CPC" };
  }

  const resultado = {
    tipo_evento,
    gera_obrigacao,
    exige_manifestacao: gera_obrigacao,
    grau_risco,
    prioridade: grau_risco === "critico" ? "urgente" : "media",
    prazo_sugerido,
    resumo: `Evento classificado como ${tipo_evento}`,
    confianca: "media",
  };

  /* =========================
     5️⃣ Salvar sugestão da IA (REST)
     ========================= */
  await fetch(
    `${supabaseUrl}/rest/v1/publicacoes.publicacoes_ia_sugestoes`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        publicacao_id,
        workspace_id,
        sugestao: resultado,
        confianca: resultado.confianca,
        modelo_ia: "edge-governed",
      }),
    }
  );

  /* =========================
     6️⃣ Auditoria jurídica (REST)
     ========================= */
  await fetch(`${supabaseUrl}/rest/v1/publicacoes.audit_log`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      workspace_id,
      publicacao_id,
      acao: "analise_juridica_edge",
      origem: "ia",
      usuario_email: usuario_email || null,
      dados_depois: resultado,
    }),
  });

  /* =========================
     7️⃣ Retorno
     ========================= */
  return response(200, {
    ok: true,
    resultado,
  });
});

/* =========================
   Helper
   ========================= */
function response(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
