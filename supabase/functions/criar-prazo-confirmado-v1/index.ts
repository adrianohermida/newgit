import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

/* =========================
   CORS
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

  const {
    workspace_id,
    publicacao_id,
    processo_id,
    descricao,
    data_inicio,
    data_vencimento,
    fundamento_legal,
    usuario_email,
  } = body || {};

  /* =========================
     2️⃣ Validação humana explícita
     ========================= */
  if (
    !workspace_id ||
    !publicacao_id ||
    !processo_id ||
    !descricao ||
    !data_inicio ||
    !data_vencimento ||
    !fundamento_legal ||
    !usuario_email
  ) {
    return response(400, {
      error: "Todos os campos são obrigatórios para criação do prazo.",
    });
  }

  /* =========================
     3️⃣ Env vars
     ========================= */
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return response(500, { error: "Variáveis de ambiente ausentes" });
  }

  /* =========================
     4️⃣ Criar prazo (REST)
     ========================= */
  const prazoRes = await fetch(
    `${supabaseUrl}/rest/v1/agenda.prazos`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        workspace_id,
        processo_id,
        publicacao_id,
        descricao,
        data_inicio,
        data_vencimento,
        fundamento_legal,
        criado_por: usuario_email,
      }),
    }
  );

  if (!prazoRes.ok) {
    const err = await prazoRes.text();
    return response(500, {
      error: "Erro ao criar prazo",
      detail: err,
    });
  }

  const prazoData = await prazoRes.json();
  const prazoId = prazoData?.[0]?.id;

  if (!prazoId) {
    return response(500, { error: "Prazo criado sem ID" });
  }

  /* =========================
     5️⃣ Atualizar publicação (REST)
     ========================= */
  await fetch(
    `${supabaseUrl}/rest/v1/publicacoes.publicacoes` +
      `?id=eq.${publicacao_id}&workspace_id=eq.${workspace_id}`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        prazo_id: prazoId,
        status_pipeline: "Prazo Criado",
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
      acao: "prazo_criado_confirmacao_humana",
      origem: "usuario",
      usuario_email,
      dados_depois: {
        prazo_id: prazoId,
        data_inicio,
        data_vencimento,
        fundamento_legal,
      },
    }),
  });

  /* =========================
     7️⃣ Retorno
     ========================= */
  return response(201, {
    ok: true,
    prazo_id: prazoId,
    message: "Prazo criado com sucesso após confirmação humana.",
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
