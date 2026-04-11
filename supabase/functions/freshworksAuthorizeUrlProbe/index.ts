import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  buildFreshworksAuthorizeUrl,
  buildFreshworksConfigDiagnostics,
} from "../_shared/freshworks.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!["GET", "POST"].includes(req.method)) {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const clientId =
      typeof body?.client_id === "string" ? body.client_id : url.searchParams.get("client_id");
    const authorizeUrl =
      typeof body?.authorize_url === "string"
        ? body.authorize_url
        : url.searchParams.get("authorize_url");
    const redirectUri =
      typeof body?.redirect_uri === "string" ? body.redirect_uri : url.searchParams.get("redirect_uri");
    const scopes = typeof body?.scopes === "string" ? body.scopes : url.searchParams.get("scopes");
    const state = typeof body?.state === "string" ? body.state : url.searchParams.get("state");
    const responseType =
      typeof body?.response_type === "string" ? body.response_type : url.searchParams.get("response_type");

    const payload = buildFreshworksAuthorizeUrl({
      clientId,
      authorizeUrl,
      redirectUri,
      scopes,
      state,
      responseType,
    });

    return jsonResponse({
      success: true,
      authorize_url: payload.authorizeUrl,
      state: payload.state,
      redirect_uri: payload.redirectUri,
      response_type: payload.responseType,
      scopes: payload.scopes,
      client_id: payload.clientId,
      authorize_base_url: payload.authorizeBaseUrl,
      org_base_url: payload.config.orgBaseUrl,
      source_summary: payload.config.sourceSummary,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
        diagnostics: buildFreshworksConfigDiagnostics(),
      },
      500,
    );
  }
});
