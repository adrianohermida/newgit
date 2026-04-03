import { v4 as uuidv4 } from "uuid";
import { getSupabaseBaseUrl, getSupabaseServerKey } from "../lib/env.js";

const JSON_HEADERS = { "Content-Type": "application/json" };
const ALLOWED_EVENTS = new Set([
  "widget_script_loaded",
  "widget_init_started",
  "widget_initialized",
  "widget_opened",
  "widget_closed",
  "widget_user_created",
  "widget_user_authenticated",
  "widget_not_authenticated",
  "widget_auth_requested",
  "widget_auth_failed",
  "widget_uuid_received",
  "widget_error",
]);

function clean(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed || null;
}

function truncate(value, max = 2000) {
  const normalized = String(value || "");
  return normalized.length > max ? normalized.slice(0, max) : normalized;
}

async function insertWidgetEvent(env, payload) {
  const baseUrl = getSupabaseBaseUrl(env);
  const apiKey = getSupabaseServerKey(env);
  if (!baseUrl || !apiKey) {
    throw new Error("Configuracao do Supabase incompleta para telemetria do Freshchat.");
  }

  const response = await fetch(`${baseUrl}/rest/v1/agentlab_widget_events`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Falha ao salvar telemetria do widget (${response.status}).`);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json().catch(() => ({}));
    const eventName = clean(body.event_name || body.eventName);

    if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
      return new Response(JSON.stringify({ ok: false, error: "Evento do widget invalido." }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const payload = {
      id: uuidv4(),
      source: "freshchat_web",
      event_name: eventName,
      route_path: truncate(clean(body.route_path || body.routePath) || "/"),
      identity_mode: truncate(clean(body.identity_mode || body.identityMode) || "visitor", 120),
      reference_id: truncate(clean(body.reference_id || body.referenceId) || null, 255),
      success: typeof body.success === "boolean" ? body.success : null,
      widget_state: truncate(clean(body.widget_state || body.widgetState) || null, 120),
      metadata: {
        message: truncate(clean(body.message) || null, 500),
        details: body.details && typeof body.details === "object" ? body.details : {},
      },
      created_at: new Date().toISOString(),
    };

    await insertWidgetEvent(env, payload);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("PGRST205") || message.includes("agentlab_widget_events")) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "schema_missing",
          error: "Tabela agentlab_widget_events ausente. Aplique a migration 023_create_agentlab_widget_events.sql.",
        }),
        {
          status: 409,
          headers: JSON_HEADERS,
        }
      );
    }

    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Falha ao registrar telemetria do widget Freshchat.",
      }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
}
