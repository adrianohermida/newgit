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

type ActivityRecord = Record<string, unknown>;
type OwnerRecord = Record<string, unknown>;
type ActivityTypeRecord = Record<string, unknown>;
type DetailModel = "contacts" | "sales_accounts" | "deals";

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

function resolveDetailConfig(targetableType: unknown): { model: DetailModel; pathPrefix: string; payloadKey: string } | null {
  const value = String(targetableType ?? "").trim().toLowerCase();
  if (value === "contact") {
    return { model: "contacts", pathPrefix: "/api/contacts", payloadKey: "contact" };
  }
  if (value === "salesaccount" || value === "sales_account") {
    return { model: "sales_accounts", pathPrefix: "/api/sales_accounts", payloadKey: "sales_account" };
  }
  if (value === "deal") {
    return { model: "deals", pathPrefix: "/api/deals", payloadKey: "deal" };
  }
  return null;
}

function normalizeTarget(model: DetailModel, entity: Record<string, unknown>) {
  if (model === "contacts") {
    return {
      model,
      id: entity.id ?? null,
      display_name: entity.display_name ?? null,
      email: entity.email ?? null,
      mobile_number: entity.mobile_number ?? null,
      owner_id: entity.owner_id ?? null,
      updated_at: entity.updated_at ?? null,
      tags: entity.tags ?? [],
    };
  }

  if (model === "sales_accounts") {
    return {
      model,
      id: entity.id ?? null,
      name: entity.name ?? null,
      owner_id: entity.owner_id ?? null,
      city: entity.city ?? null,
      state: entity.state ?? null,
      updated_at: entity.updated_at ?? null,
      tags: entity.tags ?? [],
      custom_field: entity.custom_field ?? {},
    };
  }

  return {
    model,
    id: entity.id ?? null,
    name: entity.name ?? null,
    amount: entity.amount ?? null,
    owner_id: entity.owner_id ?? null,
    updated_at: entity.updated_at ?? null,
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
    const page = asPositiveInt(body?.page, DEFAULT_PAGE);
    const limit = Math.min(asPositiveInt(body?.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const includeTargetDetails = body?.include_target_details !== false;

    if (!apiKey) {
      return jsonResponse(
        {
          success: false,
          error: "Informe api_key/token",
        },
        400,
      );
    }

    const [activitiesResponse, ownersResponse, activityTypesResponse] = await Promise.all([
      fetchJson(baseUrl, `/api/sales_activities?page=${encodeURIComponent(String(page))}`, apiKey),
      fetchJson(baseUrl, "/api/selector/owners", apiKey),
      fetchJson(baseUrl, "/api/selector/sales_activity_types", apiKey),
    ]);

    const activityRows = toArray<ActivityRecord>((activitiesResponse.data as Record<string, unknown>)?.sales_activities).slice(0, limit);
    const owners = toArray<OwnerRecord>((ownersResponse.data as Record<string, unknown>)?.users);
    const activityTypes = toArray<ActivityTypeRecord>((activityTypesResponse.data as Record<string, unknown>)?.sales_activity_types);

    const ownerById = new Map(owners.map((owner) => [String(owner.id), owner]));
    const activityTypeById = new Map(activityTypes.map((type) => [String(type.id), type]));

    const targetCache = new Map<string, unknown>();

    const items = await Promise.all(
      activityRows.map(async (activity) => {
        const owner = ownerById.get(String(activity.owner_id ?? ""));
        const activityType = activityTypeById.get(String(activity.sales_activity_type_id ?? ""));

        let target: unknown = null;
        if (includeTargetDetails && activity.targetable_type && activity.targetable_id) {
          const detailConfig = resolveDetailConfig(activity.targetable_type);
          if (detailConfig) {
            const cacheKey = `${detailConfig.model}:${String(activity.targetable_id)}`;
            if (targetCache.has(cacheKey)) {
              target = targetCache.get(cacheKey) ?? null;
            } else {
              const detailResponse = await fetchJson(
                baseUrl,
                `${detailConfig.pathPrefix}/${encodeURIComponent(String(activity.targetable_id))}`,
                apiKey,
              );
              const payload = detailResponse.data && typeof detailResponse.data === "object"
                ? detailResponse.data as Record<string, unknown>
                : {};
              const entity = payload[detailConfig.payloadKey] && typeof payload[detailConfig.payloadKey] === "object"
                ? payload[detailConfig.payloadKey] as Record<string, unknown>
                : null;

              target = detailResponse.ok && entity
                ? normalizeTarget(detailConfig.model, entity)
                : {
                  model: detailConfig.model,
                  id: activity.targetable_id ?? null,
                  lookup_ok: detailResponse.ok,
                  lookup_status: detailResponse.status,
                  error_body: detailResponse.ok ? null : detailResponse.data,
                };
              targetCache.set(cacheKey, target);
            }
          } else {
            target = {
              model: String(activity.targetable_type),
              id: activity.targetable_id ?? null,
              unsupported_target_type: true,
            };
          }
        }

        return {
          id: activity.id ?? null,
          title: activity.title ?? null,
          sales_activity_type_id: activity.sales_activity_type_id ?? null,
          sales_activity_type_name: activityType?.name ?? null,
          owner_id: activity.owner_id ?? null,
          owner_name: owner?.display_name ?? owner?.name ?? null,
          status: activity.status ?? null,
          start_date: activity.start_date ?? null,
          end_date: activity.end_date ?? null,
          completed_date: activity.completed_date ?? null,
          targetable_type: activity.targetable_type ?? null,
          targetable_id: activity.targetable_id ?? null,
          target,
        };
      }),
    );

    return jsonResponse({
      success: activitiesResponse.ok,
      status: activitiesResponse.status,
      base_url: baseUrl,
      page,
      limit,
      sources: {
        activities: activitiesResponse.url,
        owners: ownersResponse.url,
        activity_types: activityTypesResponse.url,
      },
      lookups: {
        owners_count: owners.length,
        activity_types_count: activityTypes.length,
        activities_on_page: toArray<ActivityRecord>((activitiesResponse.data as Record<string, unknown>)?.sales_activities).length,
      },
      items,
    }, activitiesResponse.ok ? 200 : activitiesResponse.status);
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
