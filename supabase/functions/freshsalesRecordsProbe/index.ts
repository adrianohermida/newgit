import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BASE_URL = "https://hmadv-7b725ea101eff55.freshsales.io";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type ViewModelName = "contacts" | "sales_accounts" | "deals";
type DirectModelName = "sales_activities" | "tasks" | "owners" | "sales_activity_types";
type ModelName = ViewModelName | DirectModelName;

type FilterRecord = {
  id?: number | string;
  name?: string;
  display_name?: string;
  is_default?: boolean;
  [key: string]: unknown;
};

type FreshsalesPayload = Record<string, unknown>;

const MODEL_CONFIG: Record<ModelName, {
  mode: "view" | "direct";
  listPath?: string;
  filtersPath?: string;
  viewPath?: string;
  extract: (payload: FreshsalesPayload) => Record<string, unknown>[];
}> = {
  contacts: {
    mode: "view",
    filtersPath: "/api/contacts/filters",
    viewPath: "/api/contacts/view",
    extract: (payload) => toArray<Record<string, unknown>>(payload.contacts),
  },
  sales_accounts: {
    mode: "view",
    filtersPath: "/api/sales_accounts/filters",
    viewPath: "/api/sales_accounts/view",
    extract: (payload) => toArray<Record<string, unknown>>(payload.sales_accounts),
  },
  deals: {
    mode: "view",
    filtersPath: "/api/deals/filters",
    viewPath: "/api/deals/view",
    extract: (payload) => toArray<Record<string, unknown>>(payload.deals),
  },
  sales_activities: {
    mode: "direct",
    listPath: "/api/sales_activities",
    extract: (payload) => toArray<Record<string, unknown>>(payload.sales_activities),
  },
  tasks: {
    mode: "direct",
    listPath: "/api/tasks",
    extract: (payload) => toArray<Record<string, unknown>>(payload.tasks),
  },
  owners: {
    mode: "direct",
    listPath: "/api/selector/owners",
    extract: (payload) => toArray<Record<string, unknown>>(payload.users),
  },
  sales_activity_types: {
    mode: "direct",
    listPath: "/api/selector/sales_activity_types",
    extract: (payload) => toArray<Record<string, unknown>>(payload.sales_activity_types),
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

function normalizeModel(value: unknown): ModelName | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized in MODEL_CONFIG ? normalized as ModelName : null;
}

function extractFilters(payload: FreshsalesPayload) {
  return toArray<FilterRecord>(payload.filters);
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

function normalizeRecord(model: ModelName, record: Record<string, unknown>) {
  if (model === "contacts") {
    return {
      id: record.id ?? null,
      display_name: record.display_name ?? null,
      first_name: record.first_name ?? null,
      last_name: record.last_name ?? null,
      email: record.email ?? null,
      mobile_number: record.mobile_number ?? null,
      owner_id: record.owner_id ?? null,
      updated_at: record.updated_at ?? null,
      raw: record,
    };
  }

  if (model === "sales_accounts") {
    return {
      id: record.id ?? null,
      name: record.name ?? null,
      city: record.city ?? null,
      state: record.state ?? null,
      owner_id: record.owner_id ?? null,
      updated_at: record.updated_at ?? null,
      raw: record,
    };
  }

  if (model === "deals") {
    return {
      id: record.id ?? null,
      name: record.name ?? null,
      amount: record.amount ?? null,
      deal_stage_id: record.deal_stage_id ?? null,
      probability: record.probability ?? null,
      owner_id: record.owner_id ?? null,
      updated_at: record.updated_at ?? null,
      raw: record,
    };
  }

  if (model === "sales_activities") {
    return {
      id: record.id ?? null,
      title: record.title ?? null,
      sales_activity_type_id: record.sales_activity_type_id ?? null,
      targetable_type: record.targetable_type ?? null,
      targetable_id: record.targetable_id ?? null,
      start_date: record.start_date ?? null,
      owner_id: record.owner_id ?? null,
      raw: record,
    };
  }

  if (model === "tasks") {
    return {
      id: record.id ?? null,
      title: record.title ?? null,
      status: record.status ?? null,
      due_date: record.due_date ?? null,
      owner_id: record.owner_id ?? null,
      raw: record,
    };
  }

  if (model === "owners") {
    return {
      id: record.id ?? null,
      display_name: record.display_name ?? record.name ?? null,
      email: record.email ?? null,
      raw: record,
    };
  }

  return {
    id: record.id ?? null,
    name: record.name ?? null,
    raw: record,
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
    const requestedFilterId = firstNonEmpty([body?.filter_id]);
    const page = asPositiveInt(body?.page, DEFAULT_PAGE);
    const limit = Math.min(asPositiveInt(body?.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const includeRaw = body?.include_raw === true;

    if (!apiKey || !model) {
      return jsonResponse(
        {
          success: false,
          error: "Informe api_key/token e model válidos",
          allowed_models: Object.keys(MODEL_CONFIG),
        },
        400,
      );
    }

    const config = MODEL_CONFIG[model];

    if (config.mode === "direct") {
      const response = await fetchJson(baseUrl, `${config.listPath}?page=${encodeURIComponent(String(page))}`, apiKey);
      const records = config.extract(response.data);
      const items = records.slice(0, limit).map((record) => {
        const normalized = normalizeRecord(model, record);
        if (!includeRaw) delete normalized.raw;
        return normalized;
      });

      return jsonResponse({
        success: response.ok,
        status: response.status,
        base_url: baseUrl,
        model,
        source: {
          mode: "direct",
          path: response.url,
        },
        total_available_on_page: records.length,
        page,
        limit,
        items,
      }, response.ok ? 200 : response.status);
    }

    const filtersResponse = await fetchJson(baseUrl, config.filtersPath!, apiKey);
    const filters = extractFilters(filtersResponse.data);
    const selectedFilter = requestedFilterId
      ? filters.find((filter) => String(filter.id) === requestedFilterId) ?? { id: requestedFilterId, name: null }
      : pickPreferredFilter(filters);

    if (!selectedFilter?.id) {
      return jsonResponse({
        success: false,
        status: filtersResponse.status,
        base_url: baseUrl,
        model,
        error: "Nenhum filtro disponível para esta entidade",
        filters_status: filtersResponse.status,
        filters_count: filters.length,
      }, 404);
    }

    const viewResponse = await fetchJson(
      baseUrl,
      `${config.viewPath}/${encodeURIComponent(String(selectedFilter.id))}?page=${encodeURIComponent(String(page))}`,
      apiKey,
    );

    const records = config.extract(viewResponse.data);
    const items = records.slice(0, limit).map((record) => {
      const normalized = normalizeRecord(model, record);
      if (!includeRaw) delete normalized.raw;
      return normalized;
    });

    const meta = typeof viewResponse.data.meta === "object" && viewResponse.data.meta
      ? viewResponse.data.meta as Record<string, unknown>
      : {};

    return jsonResponse({
      success: viewResponse.ok,
      status: viewResponse.status,
      base_url: baseUrl,
      model,
      source: {
        mode: "view",
        filters_path: filtersResponse.url,
        view_path: viewResponse.url,
      },
      selected_filter: {
        id: selectedFilter.id ?? null,
        name: selectedFilter.name ?? selectedFilter.display_name ?? null,
      },
      filters_preview: filters.slice(0, 10).map((filter) => ({
        id: filter.id ?? null,
        name: filter.name ?? filter.display_name ?? null,
        is_default: Boolean(filter.is_default),
      })),
      page: Number(meta.page ?? page),
      total: meta.total ?? null,
      limit,
      items,
    }, viewResponse.ok ? 200 : viewResponse.status);
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
