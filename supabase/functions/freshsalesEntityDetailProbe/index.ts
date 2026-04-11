import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BASE_URL = "https://hmadv-7b725ea101eff55.freshsales.io";

type DetailModelName = "contact" | "contacts" | "sales_account" | "sales_accounts" | "deal" | "deals";

const DETAIL_CONFIG: Record<DetailModelName, {
  pathPrefix: string;
  payloadKey: string;
  canonicalModel: "contacts" | "sales_accounts" | "deals";
}> = {
  contact: {
    pathPrefix: "/api/contacts",
    payloadKey: "contact",
    canonicalModel: "contacts",
  },
  contacts: {
    pathPrefix: "/api/contacts",
    payloadKey: "contact",
    canonicalModel: "contacts",
  },
  sales_account: {
    pathPrefix: "/api/sales_accounts",
    payloadKey: "sales_account",
    canonicalModel: "sales_accounts",
  },
  sales_accounts: {
    pathPrefix: "/api/sales_accounts",
    payloadKey: "sales_account",
    canonicalModel: "sales_accounts",
  },
  deal: {
    pathPrefix: "/api/deals",
    payloadKey: "deal",
    canonicalModel: "deals",
  },
  deals: {
    pathPrefix: "/api/deals",
    payloadKey: "deal",
    canonicalModel: "deals",
  },
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

function normalizeModel(value: unknown): DetailModelName | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized in DETAIL_CONFIG ? normalized as DetailModelName : null;
}

async function fetchJson(baseUrl: string, path: string, apiKey: string) {
  const url = `${baseUrl}${path}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Token token=${apiKey}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    url,
    data,
  };
}

function normalizeEntity(model: "contacts" | "sales_accounts" | "deals", entity: Record<string, unknown>) {
  if (model === "contacts") {
    return {
      id: entity.id ?? null,
      display_name: entity.display_name ?? null,
      first_name: entity.first_name ?? null,
      last_name: entity.last_name ?? null,
      email: entity.email ?? null,
      mobile_number: entity.mobile_number ?? null,
      work_number: entity.work_number ?? null,
      lead_score: entity.lead_score ?? null,
      owner_id: entity.owner_id ?? null,
      subscription_status: entity.subscription_status ?? null,
      whatsapp_subscription_status: entity.whatsapp_subscription_status ?? null,
      external_id: entity.external_id ?? null,
      created_at: entity.created_at ?? null,
      updated_at: entity.updated_at ?? null,
      tags: entity.tags ?? [],
      system_tags: entity.system_tags ?? [],
      custom_field: entity.custom_field ?? {},
      links: entity.links ?? {},
    };
  }

  if (model === "sales_accounts") {
    return {
      id: entity.id ?? null,
      name: entity.name ?? null,
      city: entity.city ?? null,
      state: entity.state ?? null,
      country: entity.country ?? null,
      owner_id: entity.owner_id ?? null,
      phone: entity.phone ?? null,
      open_deals_amount: entity.open_deals_amount ?? null,
      open_deals_count: entity.open_deals_count ?? null,
      won_deals_amount: entity.won_deals_amount ?? null,
      won_deals_count: entity.won_deals_count ?? null,
      last_contacted: entity.last_contacted ?? null,
      health_score: entity.health_score ?? null,
      tags: entity.tags ?? [],
      created_at: entity.created_at ?? null,
      updated_at: entity.updated_at ?? null,
      custom_field: entity.custom_field ?? {},
      links: entity.links ?? {},
    };
  }

  return {
    id: entity.id ?? null,
    name: entity.name ?? null,
    amount: entity.amount ?? null,
    expected_close: entity.expected_close ?? null,
    deal_stage_id: entity.deal_stage_id ?? null,
    probability: entity.probability ?? null,
    owner_id: entity.owner_id ?? null,
    created_at: entity.created_at ?? null,
    updated_at: entity.updated_at ?? null,
    links: entity.links ?? {},
    custom_field: entity.custom_field ?? {},
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
    const apiKey = firstNonEmpty([body?.api_key, body?.token]);
    const baseUrl = ensureHttps(firstNonEmpty([body?.base_url], DEFAULT_BASE_URL));
    const model = normalizeModel(body?.model);
    const entityId = firstNonEmpty([body?.id, body?.entity_id ? String(body.entity_id) : null]);
    const includeRaw = body?.include_raw === true;

    if (!apiKey || !model || !entityId) {
      return jsonResponse(
        {
          success: false,
          error: "Informe api_key/token, model e id",
          allowed_models: Object.keys(DETAIL_CONFIG),
        },
        400,
      );
    }

    const config = DETAIL_CONFIG[model];
    const response = await fetchJson(baseUrl, `${config.pathPrefix}/${encodeURIComponent(entityId)}`, apiKey);
    const payload = response.data && typeof response.data === "object" ? response.data as Record<string, unknown> : {};
    const entity = payload[config.payloadKey] && typeof payload[config.payloadKey] === "object"
      ? payload[config.payloadKey] as Record<string, unknown>
      : null;

    const normalized = entity ? normalizeEntity(config.canonicalModel, entity) : null;

    return jsonResponse({
      success: response.ok,
      status: response.status,
      base_url: baseUrl,
      model: config.canonicalModel,
      id: entityId,
      path: response.url,
      entity: includeRaw && entity
        ? {
          ...normalized,
          raw: entity,
        }
        : normalized,
      meta: payload.meta ?? null,
      error_body: response.ok ? null : response.data,
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
