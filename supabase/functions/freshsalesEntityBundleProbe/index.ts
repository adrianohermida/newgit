import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BASE_URL = "https://hmadv-7b725ea101eff55.freshsales.io";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

type EntityName = "contacts" | "sales_accounts" | "deals" | "leads";

type FieldChoice = {
  id?: number | string;
  value?: string;
  [key: string]: unknown;
};

type FieldRecord = {
  id?: number | string;
  label?: string;
  name?: string;
  type?: string;
  required?: boolean;
  visible?: boolean;
  default?: boolean;
  base_model?: string;
  choices?: FieldChoice[];
  multiple?: boolean;
  actionable?: boolean;
  [key: string]: unknown;
};

type FilterRecord = {
  id?: number | string;
  name?: string;
  display_name?: string;
  is_default?: boolean;
  [key: string]: unknown;
};

type FreshsalesPayload = Record<string, unknown>;

const ENTITY_CONFIG: Record<EntityName, {
  schemaPath: string;
  filtersPath: string;
  viewPath: string;
  recordKey: string;
  primaryDisplayFields: string[];
}> = {
  contacts: {
    schemaPath: "/api/settings/contacts/fields",
    filtersPath: "/api/contacts/filters",
    viewPath: "/api/contacts/view",
    recordKey: "contacts",
    primaryDisplayFields: ["display_name", "first_name", "last_name", "email"],
  },
  sales_accounts: {
    schemaPath: "/api/settings/sales_accounts/fields",
    filtersPath: "/api/sales_accounts/filters",
    viewPath: "/api/sales_accounts/view",
    recordKey: "sales_accounts",
    primaryDisplayFields: ["name", "city", "state"],
  },
  deals: {
    schemaPath: "/api/settings/deals/fields",
    filtersPath: "/api/deals/filters",
    viewPath: "/api/deals/view",
    recordKey: "deals",
    primaryDisplayFields: ["name", "amount", "expected_close"],
  },
  leads: {
    schemaPath: "/api/settings/leads/fields",
    filtersPath: "/api/leads/filters",
    viewPath: "/api/leads/view",
    recordKey: "leads",
    primaryDisplayFields: ["display_name", "first_name", "last_name", "email"],
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

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function asPositiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeEntity(value: unknown): EntityName | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized in ENTITY_CONFIG ? normalized as EntityName : null;
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
    data: (data ?? {}) as FreshsalesPayload,
  };
}

function pickPreferredFilter(filters: FilterRecord[]) {
  const preferredByName = filters.find((filter) => {
    const name = String(filter?.name ?? filter?.display_name ?? "").toLowerCase();
    return name.includes("todos") || name.includes("all") || name.includes("aberto") || name.includes("ativos") || name.includes("open");
  });

  if (preferredByName) return preferredByName;

  const defaultFilter = filters.find((filter) => filter?.is_default);
  if (defaultFilter) return defaultFilter;

  return filters[0] ?? null;
}

function buildChoiceMap(fields: FieldRecord[]) {
  const fieldMap = new Map<string, FieldRecord>();
  const choiceMap = new Map<string, Map<string, string>>();

  for (const field of fields) {
    const name = String(field.name ?? "");
    if (!name) continue;

    fieldMap.set(name, field);

    const choices = toArray<FieldChoice>(field.choices);
    if (choices.length) {
      choiceMap.set(
        name,
        new Map(
          choices.map((choice) => [String(choice.id ?? choice.value ?? ""), String(choice.value ?? choice.id ?? "")]),
        ),
      );
    }
  }

  return { fieldMap, choiceMap };
}

function resolveDisplayValue(value: unknown, field: FieldRecord | undefined, choiceMap: Map<string, string> | undefined) {
  if (value == null) return null;

  if (!field) return value;

  if (choiceMap) {
    if (Array.isArray(value)) {
      return value.map((item) => {
        if (item && typeof item === "object" && "value" in item) {
          return (item as Record<string, unknown>).value ?? item;
        }
        return choiceMap.get(String(item)) ?? item;
      });
    }

    return choiceMap.get(String(value)) ?? value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (item && typeof item === "object" && "value" in item) {
        return (item as Record<string, unknown>).value ?? item;
      }
      return item;
    });
  }

  return value;
}

function mapRecordFields(record: Record<string, unknown>, fields: FieldRecord[]) {
  const { fieldMap, choiceMap } = buildChoiceMap(fields);
  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key === "custom_field" && value && typeof value === "object") {
      const customEntries = Object.entries(value as Record<string, unknown>).map(([customKey, customValue]) => {
        const field = fieldMap.get(customKey);
        const choices = choiceMap.get(customKey);

        return [
          customKey,
          {
            label: field?.label ?? customKey,
            type: field?.type ?? null,
            base_model: field?.base_model ?? null,
            required: Boolean(field?.required),
            visible: Boolean(field?.visible),
            is_custom: true,
            value: customValue,
            display_value: resolveDisplayValue(customValue, field, choices),
          },
        ];
      });

      mapped.custom_field = Object.fromEntries(customEntries);
      continue;
    }

    const field = fieldMap.get(key);
    const choices = choiceMap.get(key);
    mapped[key] = {
      label: field?.label ?? key,
      type: field?.type ?? null,
      base_model: field?.base_model ?? null,
      required: Boolean(field?.required),
      visible: Boolean(field?.visible),
      is_custom: key.startsWith("cf_"),
      value,
      display_value: resolveDisplayValue(value, field, choices),
    };
  }

  return mapped;
}

function summarizeSchema(fields: FieldRecord[]) {
  return {
    total_fields: fields.length,
    custom_fields: fields.filter((field) => String(field.name ?? "").startsWith("cf_")).length,
    required_fields: fields.filter((field) => Boolean(field.required)).length,
    visible_fields: fields.filter((field) => Boolean(field.visible)).length,
    fields_with_choices: fields.filter((field) => toArray(field.choices).length > 0).length,
  };
}

function buildRecordSummary(entity: EntityName, record: Record<string, unknown>) {
  const config = ENTITY_CONFIG[entity];
  const summary: Record<string, unknown> = {
    id: record.id ?? null,
    owner_id: record.owner_id ?? null,
    created_at: record.created_at ?? null,
    updated_at: record.updated_at ?? null,
  };

  for (const field of config.primaryDisplayFields) {
    summary[field] = record[field] ?? null;
  }

  if (entity === "sales_accounts" && record.custom_field && typeof record.custom_field === "object") {
    const custom = record.custom_field as Record<string, unknown>;
    summary.cf_processo = custom.cf_processo ?? null;
    summary.cf_status = custom.cf_status ?? null;
    summary.tags = record.tags ?? [];
  }

  if (entity === "deals") {
    summary.deal_stage_id = record.deal_stage_id ?? null;
    summary.probability = record.probability ?? null;
  }

  return summary;
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
    const entity = normalizeEntity(body?.entity);
    const requestedFilterId = firstNonEmpty([body?.filter_id]);
    const page = asPositiveInt(body?.page, DEFAULT_PAGE);
    const limit = Math.min(asPositiveInt(body?.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const includeMappedFields = body?.include_mapped_fields !== false;
    const includeRaw = body?.include_raw === true;

    if (!apiKey || !entity) {
      return jsonResponse(
        {
          success: false,
          error: "Informe api_key/token e entity válidos",
          allowed_entities: Object.keys(ENTITY_CONFIG),
        },
        400,
      );
    }

    const config = ENTITY_CONFIG[entity];
    const [schemaResponse, filtersResponse] = await Promise.all([
      fetchJson(baseUrl, config.schemaPath, apiKey),
      fetchJson(baseUrl, config.filtersPath, apiKey),
    ]);

    const schemaFields = toArray<FieldRecord>(schemaResponse.data.fields);
    const filters = toArray<FilterRecord>(filtersResponse.data.filters);
    const selectedFilter = requestedFilterId
      ? filters.find((filter) => String(filter.id) === requestedFilterId) ?? { id: requestedFilterId, name: null }
      : pickPreferredFilter(filters);

    if (!selectedFilter?.id) {
      return jsonResponse({
        success: false,
        entity,
        base_url: baseUrl,
        schema_ok: schemaResponse.ok,
        filters_ok: filtersResponse.ok,
        error: "Nenhum filtro disponível para a entidade",
      }, 404);
    }

    const recordsResponse = await fetchJson(
      baseUrl,
      `${config.viewPath}/${encodeURIComponent(String(selectedFilter.id))}?page=${encodeURIComponent(String(page))}`,
      apiKey,
    );

    const records = toArray<Record<string, unknown>>(recordsResponse.data[config.recordKey]).slice(0, limit);
    const meta = typeof recordsResponse.data.meta === "object" && recordsResponse.data.meta
      ? recordsResponse.data.meta as Record<string, unknown>
      : {};

    const items = records.map((record) => ({
      summary: buildRecordSummary(entity, record),
      fields: includeMappedFields ? mapRecordFields(record, schemaFields) : undefined,
      raw: includeRaw ? record : undefined,
    }));

    return jsonResponse({
      success: recordsResponse.ok,
      status: recordsResponse.status,
      base_url: baseUrl,
      entity,
      schema: {
        ok: schemaResponse.ok,
        status: schemaResponse.status,
        path: schemaResponse.url,
        summary: summarizeSchema(schemaFields),
      },
      filters: {
        ok: filtersResponse.ok,
        status: filtersResponse.status,
        path: filtersResponse.url,
        selected_filter: {
          id: selectedFilter.id ?? null,
          name: selectedFilter.name ?? selectedFilter.display_name ?? null,
        },
        preview: filters.slice(0, 10).map((filter) => ({
          id: filter.id ?? null,
          name: filter.name ?? filter.display_name ?? null,
          is_default: Boolean(filter.is_default),
        })),
      },
      records: {
        ok: recordsResponse.ok,
        status: recordsResponse.status,
        path: recordsResponse.url,
        total: meta.total ?? null,
        page: meta.page ?? page,
        limit,
        items,
      },
      error_body: recordsResponse.ok ? null : recordsResponse.data,
    }, recordsResponse.ok ? 200 : recordsResponse.status);
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
