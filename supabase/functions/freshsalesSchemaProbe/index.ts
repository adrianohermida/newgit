import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BASE_URL = "https://hmadv-7b725ea101eff55.freshsales.io";
const DEFAULT_ENTITIES = ["contacts", "sales_accounts", "deals", "sales_activities", "leads"] as const;

type EntityName = typeof DEFAULT_ENTITIES[number] | "tasks";

type FieldChoice = {
  id?: number | string;
  value?: string;
  position?: number;
  [key: string]: unknown;
};

type FieldRecord = {
  id?: number | string;
  label?: string;
  name?: string;
  type?: string;
  default?: boolean;
  actionable?: boolean;
  position?: number;
  base_model?: string;
  required?: boolean;
  quick_add_position?: number | null;
  visible?: boolean;
  choices?: FieldChoice[];
  multiple?: boolean;
  creatable?: boolean;
  auto_suggest_url?: string;
  [key: string]: unknown;
};

const ENTITY_PATHS: Record<EntityName, string> = {
  contacts: "/api/settings/contacts/fields",
  sales_accounts: "/api/settings/sales_accounts/fields",
  deals: "/api/settings/deals/fields",
  sales_activities: "/api/settings/sales_activities/fields",
  leads: "/api/settings/leads/fields",
  tasks: "/api/settings/tasks/fields",
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

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function normalizeEntities(input: unknown): EntityName[] {
  const valid = new Set(Object.keys(ENTITY_PATHS) as EntityName[]);
  if (!Array.isArray(input) || !input.length) return [...DEFAULT_ENTITIES];

  const entities = input
    .map((value) => String(value).trim().toLowerCase())
    .filter((value): value is EntityName => valid.has(value as EntityName));

  return entities.length ? Array.from(new Set(entities)) : [...DEFAULT_ENTITIES];
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

function summarizeField(field: FieldRecord) {
  const choices = toArray<FieldChoice>(field.choices);
  return {
    id: field.id ?? null,
    name: field.name ?? null,
    label: field.label ?? null,
    type: field.type ?? null,
    base_model: field.base_model ?? null,
    required: Boolean(field.required),
    visible: Boolean(field.visible),
    default: Boolean(field.default),
    actionable: Boolean(field.actionable),
    multiple: Boolean(field.multiple),
    creatable: Boolean(field.creatable),
    is_custom: typeof field.name === "string" ? field.name.startsWith("cf_") : false,
    has_choices: choices.length > 0,
    choice_count: choices.length,
    choices_preview: choices.slice(0, 10).map((choice) => ({
      id: choice.id ?? null,
      value: choice.value ?? null,
    })),
    auto_suggest_url: field.auto_suggest_url ?? null,
    quick_add_position: field.quick_add_position ?? null,
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
    const entities = normalizeEntities(body?.entities);
    const includeRaw = body?.include_raw === true;

    if (!apiKey) {
      return jsonResponse(
        {
          success: false,
          error: "Informe api_key/token",
        },
        400,
      );
    }

    const results = await Promise.all(
      entities.map(async (entity) => {
        const response = await fetchJson(baseUrl, ENTITY_PATHS[entity], apiKey);
        const payload = response.data && typeof response.data === "object"
          ? response.data as Record<string, unknown>
          : {};
        const fields = toArray<FieldRecord>(payload.fields);
        const summarizedFields = fields.map(summarizeField);

        return {
          entity,
          ok: response.ok,
          status: response.status,
          path: response.url,
          summary: {
            total_fields: fields.length,
            custom_fields: summarizedFields.filter((field) => field.is_custom).length,
            required_fields: summarizedFields.filter((field) => field.required).length,
            visible_fields: summarizedFields.filter((field) => field.visible).length,
            fields_with_choices: summarizedFields.filter((field) => field.has_choices).length,
          },
          fields: summarizedFields,
          raw_fields: includeRaw ? fields : undefined,
          error_body: response.ok ? null : response.data,
        };
      }),
    );

    return jsonResponse({
      success: true,
      base_url: baseUrl,
      entities,
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
