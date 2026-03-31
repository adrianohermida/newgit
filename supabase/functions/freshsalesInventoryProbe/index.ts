import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_BASE_URL = "https://hmadv-7b725ea101eff55.freshsales.io";
const DEFAULT_MODELS = ["contacts", "sales_accounts", "deals"] as const;
const MAX_PREVIEW_ITEMS = 5;

type ModelName = typeof DEFAULT_MODELS[number];

type FilterRecord = {
  id?: number | string;
  name?: string;
  display_name?: string;
  is_default?: boolean;
  position?: number;
  [key: string]: unknown;
};

type FreshsalesListResponse = {
  [key: string]: unknown;
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

function normalizeModels(input: unknown): ModelName[] {
  if (!Array.isArray(input) || !input.length) {
    return [...DEFAULT_MODELS];
  }

  const valid = new Set(DEFAULT_MODELS);
  const models = input
    .map((value) => String(value).trim().toLowerCase())
    .filter((value): value is ModelName => valid.has(value as ModelName));

  return models.length ? Array.from(new Set(models)) : [...DEFAULT_MODELS];
}

function extractFilters(payload: FreshsalesListResponse) {
  return toArray<FilterRecord>(payload?.filters);
}

function extractRecords(model: ModelName, payload: FreshsalesListResponse) {
  if (model === "contacts") return toArray<Record<string, unknown>>(payload?.contacts);
  if (model === "sales_accounts") return toArray<Record<string, unknown>>(payload?.sales_accounts);
  return toArray<Record<string, unknown>>(payload?.deals);
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

function summarizeRecord(model: ModelName, record: Record<string, unknown>) {
  if (model === "contacts") {
    return {
      id: record.id ?? null,
      display_name: record.display_name ?? null,
      first_name: record.first_name ?? null,
      last_name: record.last_name ?? null,
      email: record.email ?? null,
      mobile_number: record.mobile_number ?? null,
      job_title: record.job_title ?? null,
      owner_id: record.owner_id ?? null,
      updated_at: record.updated_at ?? null,
    };
  }

  if (model === "sales_accounts") {
    return {
      id: record.id ?? null,
      name: record.name ?? null,
      city: record.city ?? null,
      state: record.state ?? null,
      country: record.country ?? null,
      owner_id: record.owner_id ?? null,
      health_score: record.health_score ?? null,
      updated_at: record.updated_at ?? null,
    };
  }

  return {
    id: record.id ?? null,
    name: record.name ?? null,
    amount: record.amount ?? null,
    expected_close: record.expected_close ?? null,
    deal_stage_id: record.deal_stage_id ?? null,
    probability: record.probability ?? null,
    owner_id: record.owner_id ?? null,
    updated_at: record.updated_at ?? null,
  };
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
    const models = normalizeModels(body?.models);
    const includeActivities = body?.include_activities !== false;
    const includeOwners = body?.include_owners !== false;

    if (!apiKey) {
      return jsonResponse(
        {
          success: false,
          error: "Informe api_key/token",
        },
        400,
      );
    }

    const results: Record<string, unknown> = {};

    if (includeOwners) {
      const owners = await fetchJson(baseUrl, "/api/selector/owners", apiKey);
      results.owners = {
        ok: owners.ok,
        status: owners.status,
        count: toArray<Record<string, unknown>>((owners.data as FreshsalesListResponse)?.users).length,
        preview: toArray<Record<string, unknown>>((owners.data as FreshsalesListResponse)?.users)
          .slice(0, MAX_PREVIEW_ITEMS)
          .map((item) => ({
            id: item.id ?? null,
            display_name: item.display_name ?? item.name ?? null,
            email: item.email ?? null,
          })),
      };
    }

    if (includeActivities) {
      const [activityTypes, activities] = await Promise.all([
        fetchJson(baseUrl, "/api/selector/sales_activity_types", apiKey),
        fetchJson(baseUrl, "/api/sales_activities", apiKey),
      ]);

      results.sales_activities = {
        types: {
          ok: activityTypes.ok,
          status: activityTypes.status,
          count: toArray<Record<string, unknown>>((activityTypes.data as FreshsalesListResponse)?.sales_activity_types).length,
          preview: toArray<Record<string, unknown>>((activityTypes.data as FreshsalesListResponse)?.sales_activity_types)
            .slice(0, MAX_PREVIEW_ITEMS)
            .map((item) => ({
              id: item.id ?? null,
              name: item.name ?? null,
            })),
        },
        recent: {
          ok: activities.ok,
          status: activities.status,
          count: toArray<Record<string, unknown>>((activities.data as FreshsalesListResponse)?.sales_activities).length,
          preview: toArray<Record<string, unknown>>((activities.data as FreshsalesListResponse)?.sales_activities)
            .slice(0, MAX_PREVIEW_ITEMS)
            .map((item) => ({
              id: item.id ?? null,
              title: item.title ?? null,
              sales_activity_type_id: item.sales_activity_type_id ?? null,
              targetable_type: item.targetable_type ?? null,
              targetable_id: item.targetable_id ?? null,
              start_date: item.start_date ?? null,
              owner_id: item.owner_id ?? null,
            })),
        },
      };
    }

    for (const model of models) {
      const filtersResponse = await fetchJson(baseUrl, `/api/${model}/filters`, apiKey);
      const filtersPayload = (filtersResponse.data ?? {}) as FreshsalesListResponse;
      const filters = extractFilters(filtersPayload);
      const chosenFilter = pickPreferredFilter(filters);

      let viewSummary: Record<string, unknown> | null = null;
      if (filtersResponse.ok && chosenFilter?.id) {
        const viewResponse = await fetchJson(baseUrl, `/api/${model}/view/${encodeURIComponent(String(chosenFilter.id))}?page=1`, apiKey);
        const viewPayload = (viewResponse.data ?? {}) as FreshsalesListResponse;
        const records = extractRecords(model, viewPayload);

        viewSummary = {
          ok: viewResponse.ok,
          status: viewResponse.status,
          filter_id: chosenFilter.id ?? null,
          filter_name: chosenFilter.name ?? chosenFilter.display_name ?? null,
          total: viewPayload.meta && typeof viewPayload.meta === "object"
            ? (viewPayload.meta as Record<string, unknown>).total ?? null
            : null,
          page: viewPayload.meta && typeof viewPayload.meta === "object"
            ? (viewPayload.meta as Record<string, unknown>).page ?? 1
            : 1,
          preview_count: records.length,
          preview: records.slice(0, MAX_PREVIEW_ITEMS).map((record) => summarizeRecord(model, record)),
        };
      }

      results[model] = {
        filters: {
          ok: filtersResponse.ok,
          status: filtersResponse.status,
          count: filters.length,
          preview: filters.slice(0, MAX_PREVIEW_ITEMS).map((filter) => ({
            id: filter.id ?? null,
            name: filter.name ?? filter.display_name ?? null,
            is_default: Boolean(filter.is_default),
          })),
        },
        chosen_filter: chosenFilter
          ? {
            id: chosenFilter.id ?? null,
            name: chosenFilter.name ?? chosenFilter.display_name ?? null,
          }
          : null,
        view: viewSummary,
      };
    }

    return jsonResponse({
      success: true,
      base_url: baseUrl,
      models,
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
