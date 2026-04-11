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

function ensureHttps(value: string) {
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, "");
  return `https://${value.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function resolveHeaders(authMode: string, token: string) {
  if (authMode === "bearer") {
    return {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
  }

  return {
    Authorization: `Token token=${token}`,
    Accept: "application/json",
  };
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
    const authMode = firstNonEmpty([body?.auth_mode], "bearer").toLowerCase();
    const token = firstNonEmpty([body?.token, body?.access_token, body?.api_key]);
    const baseUrl = firstNonEmpty([body?.base_url]);
    const endpoints = Array.isArray(body?.endpoints) && body.endpoints.length
      ? body.endpoints.map((value: unknown) => String(value))
      : [
        "/users/me",
        "/api/users/me",
        "/api/selector/owners",
        "/crm/sales/api/selector/owners",
        "/crm/sales/api/settings/contacts/fields",
      ];

    if (!token || !baseUrl) {
      return jsonResponse(
        {
          success: false,
          error: "Informe base_url e token/api_key",
          diagnostics: {
            has_base_url: Boolean(baseUrl),
            has_token: Boolean(token),
            auth_mode: authMode,
          },
        },
        400,
      );
    }

    const normalizedBaseUrl = ensureHttps(baseUrl);
    const headers = resolveHeaders(authMode, token);

    const results = await Promise.all(
      endpoints.map(async (path) => {
        const url = `${normalizedBaseUrl}${path}`;

        try {
          const response = await fetch(url, { headers });
          const text = await response.text();
          let body: unknown = null;
          try {
            body = text ? JSON.parse(text) : null;
          } catch {
            body = text;
          }

          return {
            path,
            url,
            ok: response.ok,
            status: response.status,
            content_type: response.headers.get("content-type"),
            body,
          };
        } catch (error) {
          return {
            path,
            url,
            ok: false,
            status: null,
            content_type: null,
            error: error instanceof Error ? error.message : "Erro de rede",
          };
        }
      }),
    );

    return jsonResponse({
      success: true,
      base_url: normalizedBaseUrl,
      auth_mode: authMode,
      results,
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
