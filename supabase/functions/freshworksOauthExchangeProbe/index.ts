import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function firstNonEmpty(values: Array<string | null | undefined>, fallback = "") {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));

    const code = firstNonEmpty([body?.code]);
    const clientId = firstNonEmpty([
      body?.client_id,
      Deno.env.get("FRESHWORKS_OAUTH_CLIENT_ID"),
      Deno.env.get("FRESHSALES_OAUTH_CLIENT_ID"),
      Deno.env.get("FRESHCHAT_OAUTH_CLIENT_ID"),
      Deno.env.get("FRESHWORKS_CLIENT_ID"),
      Deno.env.get("FRESHSALES_CLIENT_ID"),
      Deno.env.get("FRESHCHAT_CLIENT_ID"),
    ]);
    const clientSecret = firstNonEmpty([
      body?.client_secret,
      Deno.env.get("FRESHWORKS_OAUTH_CLIENT_SECRET"),
      Deno.env.get("FRESHSALES_OAUTH_CLIENT_SECRET"),
      Deno.env.get("FRESHCHAT_OAUTH_CLIENT_SECRET"),
      Deno.env.get("FRESHWORKS_CLIENT_SECRET"),
      Deno.env.get("FRESHSALES_CLIENT_SECRET"),
      Deno.env.get("FRESHCHAT_CLIENT_SECRET"),
    ]);
    const redirectUri = firstNonEmpty([
      body?.redirect_uri,
      Deno.env.get("FRESHWORKS_REDIRECT_URI"),
      Deno.env.get("FRESHSALES_REDIRECT_URI"),
      Deno.env.get("FRESHCHAT_REDIRECT_URI"),
      Deno.env.get("REDIRECT_URI"),
      Deno.env.get("OAUTH_CALLBACK_URL"),
    ]);
    const tokenUrl = firstNonEmpty([
      body?.token_url,
      Deno.env.get("FRESHWORKS_OAUTH_TOKEN_URL"),
      Deno.env.get("FRESHSALES_OAUTH_TOKEN_URL"),
      Deno.env.get("FRESHCHAT_OAUTH_TOKEN_URL"),
      Deno.env.get("ACCESS_TOKEN_URL"),
      "https://hmadv-org.myfreshworks.com/org/oauth/v2/token",
    ]);

    if (!code || !clientId || !clientSecret || !redirectUri || !tokenUrl) {
      return jsonResponse(
        {
          success: false,
          error: "Parametros insuficientes para trocar o code por token",
          diagnostics: {
            has_code: Boolean(code),
            has_client_id: Boolean(clientId),
            has_client_secret: Boolean(clientSecret),
            has_redirect_uri: Boolean(redirectUri),
            has_token_url: Boolean(tokenUrl),
          },
        },
        400,
      );
    }

    const basic = btoa(`${clientId}:${clientSecret}`);
    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const raw = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { raw };
    }

    if (!response.ok) {
      return jsonResponse(
        {
          success: false,
          status: response.status,
          token_url: tokenUrl,
          error: payload,
        },
        response.status,
      );
    }

    return jsonResponse({
      success: true,
      token_url: tokenUrl,
      token_type: payload.token_type ?? null,
      expires_in: payload.expires_in ?? null,
      access_token: payload.access_token ?? null,
      refresh_token: payload.refresh_token ?? null,
      scope: payload.scope ?? null,
      raw: payload,
    });
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500,
    );
  }
});
