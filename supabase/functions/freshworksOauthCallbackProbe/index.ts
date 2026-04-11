import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const expectedState = url.searchParams.get("expected_state");

  return jsonResponse({
    success: !error,
    code,
    state,
    expected_state: expectedState,
    state_matches: expectedState ? expectedState === state : null,
    error,
    error_description: errorDescription,
    callback_url: url.toString(),
    next_step: code
      ? "Trocar o code por access_token/refresh_token no endpoint /org/oauth/v2/token."
      : "Abra a authorize_url e conclua o consentimento para receber o code aqui.",
  });
});
