import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function asPositiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ success: false, error: "Supabase env ausente para leitura" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const body = await req.json().catch(() => ({}));
    const entity = body?.entity ? String(body.entity).trim().toLowerCase() : null;
    const sourceId = body?.source_id ? String(body.source_id).trim() : null;
    const search = body?.search ? String(body.search).trim() : null;
    const limit = Math.min(asPositiveInt(body?.limit, DEFAULT_LIMIT), MAX_LIMIT);

    let query = supabase
      .from("freshsales_sync_snapshots")
      .select("id, sync_run_id, entity, source_id, external_id, display_name, owner_id, status, emails, phones, tags, summary, attributes, custom_attributes, relationships, timestamps, source_base_url, source_filter_id, source_filter_name, synced_at, updated_at")
      .order("synced_at", { ascending: false })
      .limit(limit);

    if (entity) query = query.eq("entity", entity);
    if (sourceId) query = query.eq("source_id", sourceId);
    if (search) query = query.ilike("display_name", `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;

    const { data: runs, error: runsError } = await supabase
      .from("freshsales_sync_runs")
      .select("id, entity, status, filter_name, started_at, completed_at, records_synced")
      .order("started_at", { ascending: false })
      .limit(20);

    if (runsError) throw runsError;

    return jsonResponse({
      success: true,
      filters: {
        entity,
        source_id: sourceId,
        search,
        limit,
      },
      snapshots: data ?? [],
      recent_runs: runs ?? [],
    });
  } catch (error) {
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : "Erro interno" },
      500,
    );
  }
});
