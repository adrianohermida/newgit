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
  displayFields: string[];
  emailFields: string[];
  phoneFields: string[];
}> = {
  contacts: {
    schemaPath: "/api/settings/contacts/fields",
    filtersPath: "/api/contacts/filters",
    viewPath: "/api/contacts/view",
    recordKey: "contacts",
    displayFields: ["display_name", "first_name", "last_name", "email"],
    emailFields: ["email", "emails"],
    phoneFields: ["mobile_number", "work_number", "phone_numbers"],
  },
  sales_accounts: {
    schemaPath: "/api/settings/sales_accounts/fields",
    filtersPath: "/api/sales_accounts/filters",
    viewPath: "/api/sales_accounts/view",
    recordKey: "sales_accounts",
    displayFields: ["name", "city", "state"],
    emailFields: [],
    phoneFields: ["phone"],
  },
  deals: {
    schemaPath: "/api/settings/deals/fields",
    filtersPath: "/api/deals/filters",
    viewPath: "/api/deals/view",
    recordKey: "deals",
    displayFields: ["name", "amount", "expected_close"],
    emailFields: [],
    phoneFields: [],
  },
  leads: {
    schemaPath: "/api/settings/leads/fields",
    filtersPath: "/api/leads/filters",
    viewPath: "/api/leads/view",
    recordKey: "leads",
    displayFields: ["display_name", "first_name", "last_name", "email"],
    emailFields: ["email", "emails"],
    phoneFields: ["mobile_number", "work_number", "phone_numbers"],
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
        new Map(choices.map((choice) => [String(choice.id ?? choice.value ?? ""), String(choice.value ?? choice.id ?? "")])),
      );
    }
  }

  return { fieldMap, choiceMap };
}

function resolveDisplayValue(value: unknown, choiceMap: Map<string, string> | undefined) {
  if (value == null) return null;
  if (!choiceMap) return value;

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

function collectEmails(record: Record<string, unknown>, config: typeof ENTITY_CONFIG[EntityName]) {
  const emails: string[] = [];

  for (const key of config.emailFields) {
    const value = record[key];
    if (!value) continue;

    if (typeof value === "string") {
      emails.push(value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") {
          const emailValue = (item as Record<string, unknown>).value;
          if (typeof emailValue === "string" && emailValue.trim()) emails.push(emailValue.trim());
        }
      }
    }
  }

  return Array.from(new Set(emails));
}

function collectPhones(record: Record<string, unknown>, config: typeof ENTITY_CONFIG[EntityName]) {
  const phones: string[] = [];

  for (const key of config.phoneFields) {
    const value = record[key];
    if (!value) continue;

    if (typeof value === "string") {
      phones.push(value);
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") {
          const phoneValue = (item as Record<string, unknown>).value;
          if (typeof phoneValue === "string" && phoneValue.trim()) phones.push(phoneValue.trim());
        }
      }
    }
  }

  return Array.from(new Set(phones));
}

function deriveDisplayName(entity: EntityName, record: Record<string, unknown>) {
  if (entity === "contacts" || entity === "leads") {
    return record.display_name ?? ([record.first_name, record.last_name].filter(Boolean).join(" ").trim() || null);
  }
  return record.name ?? null;
}

function deriveStatus(entity: EntityName, record: Record<string, unknown>) {
  if (entity === "sales_accounts" && record.custom_field && typeof record.custom_field === "object") {
    return (record.custom_field as Record<string, unknown>).cf_status ?? null;
  }
  if (entity === "deals") return record.deal_stage_id ?? null;
  if (entity === "leads") return record.lead_stage_id ?? null;
  if (entity === "contacts") return record.contact_status_id ?? null;
  return null;
}

function mapAttributes(record: Record<string, unknown>, fields: FieldRecord[]) {
  const { fieldMap, choiceMap } = buildChoiceMap(fields);
  const attributes: Record<string, unknown> = {};
  const customAttributes: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (key === "custom_field" && value && typeof value === "object") {
      for (const [customKey, customValue] of Object.entries(value as Record<string, unknown>)) {
        const field = fieldMap.get(customKey);
        customAttributes[customKey] = {
          label: field?.label ?? customKey,
          type: field?.type ?? null,
          required: Boolean(field?.required),
          visible: Boolean(field?.visible),
          value: customValue,
          display_value: resolveDisplayValue(customValue, choiceMap.get(customKey)),
        };
      }
      continue;
    }

    const field = fieldMap.get(key);
    attributes[key] = {
      label: field?.label ?? key,
      type: field?.type ?? null,
      required: Boolean(field?.required),
      visible: Boolean(field?.visible),
      value,
      display_value: resolveDisplayValue(value, choiceMap.get(key)),
    };
  }

  return { attributes, custom_attributes: customAttributes };
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
    const includeAttributes = body?.include_attributes !== false;
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

    const items = records.map((record) => {
      const mapped = includeAttributes ? mapAttributes(record, schemaFields) : { attributes: undefined, custom_attributes: undefined };

      return {
        source: "freshsales",
        entity,
        source_id: record.id ?? null,
        external_id: record.external_id ?? null,
        display_name: deriveDisplayName(entity, record),
        owner_id: record.owner_id ?? null,
        status: deriveStatus(entity, record),
        emails: collectEmails(record, config),
        phones: collectPhones(record, config),
        tags: toArray<string>(record.tags),
        timestamps: {
          created_at: record.created_at ?? null,
          updated_at: record.updated_at ?? null,
          last_contacted: record.last_contacted ?? null,
        },
        relationships: {
          sales_account_id: record.sales_account_id ?? null,
          deal_stage_id: record.deal_stage_id ?? null,
          lead_stage_id: record.lead_stage_id ?? null,
          targetable_type: record.targetable_type ?? null,
          targetable_id: record.targetable_id ?? null,
        },
        summary: Object.fromEntries(
          config.displayFields.map((field) => [field, record[field] ?? null]),
        ),
        attributes: mapped.attributes,
        custom_attributes: mapped.custom_attributes,
        raw: includeRaw ? record : undefined,
      };
    });

    return jsonResponse({
      success: recordsResponse.ok,
      status: recordsResponse.status,
      base_url: baseUrl,
      entity,
      filter: {
        id: selectedFilter.id ?? null,
        name: selectedFilter.name ?? selectedFilter.display_name ?? null,
      },
      schema: {
        total_fields: schemaFields.length,
        custom_fields: schemaFields.filter((field) => String(field.name ?? "").startsWith("cf_")).length,
      },
      page: meta.page ?? page,
      total: meta.total ?? null,
      limit,
      items,
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
