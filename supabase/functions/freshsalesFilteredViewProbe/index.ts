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

const MODEL_PATHS: Record<string, string> = {
  contacts: "contacts",
  contact: "contacts",
  deals: "deals",
  deal: "deals",
  sales_accounts: "sales_accounts",
  sales_account: "sales_accounts",
  accounts: "sales_accounts",
  account: "sales_accounts",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const baseUrl = firstNonEmpty([body?.base_url], "https://hmadv-7b725ea101eff55.freshsales.io");
    const apiKey = firstNonEmpty([body?.api_key, body?.token]);
    const modelInput = firstNonEmpty([body?.model]).toLowerCase();
    const filterId = firstNonEmpty([body?.filter_id]);
    const page = firstNonEmpty([body?.page ? String(body.page) : null], "1");

    if (!apiKey || !modelInput || !filterId) {
      return jsonResponse(
        {
          success: false,
          error: "Informe api_key/token, model e filter_id",
        },
        400,
      );
    }

    const modelPath = MODEL_PATHS[modelInput];
    if (!modelPath) {
      return jsonResponse(
        {
          success: false,
          error: `Model inválido: ${modelInput}`,
          allowed_models: Object.keys(MODEL_PATHS),
        },
        400,
      );
    }

    const url = `${ensureHttps(baseUrl)}/api/${modelPath}/view/${encodeURIComponent(filterId)}?page=${encodeURIComponent(page)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Token token=${apiKey}`,
        Accept: "application/json",
      },
    });

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    return jsonResponse({
      success: response.ok,
      status: response.status,
      url,
      model: modelPath,
      filter_id: filterId,
      page,
      data: payload,
    }, response.ok ? 200 : response.status);
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
