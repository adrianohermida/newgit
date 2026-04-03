import { v4 as uuidv4 } from "uuid";

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

async function ensureWidgetIncident(baseUrl, apiKey, eventPayload) {
  const isFailureEvent =
    eventPayload.success === false ||
    ["widget_auth_failed", "widget_error"].includes(eventPayload.event_name);
  if (!isFailureEvent) return;

  const category =
    eventPayload.event_name === "widget_auth_failed" ? "widget_auth_failure" : "widget_runtime_failure";

  const existingResponse = await fetch(
    `${baseUrl}/rest/v1/agentlab_incidents?select=id,status&category=eq.${encodeURIComponent(category)}&status=eq.open&limit=1`,
    {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    }
  );

  const existing = existingResponse.ok ? await existingResponse.json().catch(() => []) : [];
  if (Array.isArray(existing) && existing[0]?.id) return;

  const nowIso = new Date().toISOString();
  const incident = {
    id: uuidv4(),
    source_system: "freshchat-widget",
    category,
    severity: "media",
    status: "open",
    title:
      category === "widget_auth_failure"
        ? "Falha de autenticacao no Freshchat Web Messenger"
        : "Falha operacional no Freshchat Web Messenger",
    description:
      category === "widget_auth_failure"
        ? "O widget registrou falha de autenticacao JWT ou identificacao do usuario."
        : "O widget registrou erro em runtime no carregamento ou operacao do chat.",
    agent_ref: "dotobot-chatbot",
    conversation_id: null,
    metadata: {
      event_name: eventPayload.event_name,
      route_path: eventPayload.route_path || "/",
      identity_mode: eventPayload.identity_mode || "visitor",
      reference_id: eventPayload.reference_id || null,
      widget_state: eventPayload.widget_state || null,
      widget_event_id: eventPayload.id,
      details: eventPayload.metadata || {},
    },
    occurred_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };

  await fetch(`${baseUrl}/rest/v1/agentlab_incidents`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(incident),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const eventName = clean(body.event_name || body.eventName);

    if (!eventName || !ALLOWED_EVENTS.has(eventName)) {
      return res.status(400).json({ ok: false, error: "Evento do widget invalido." });
    }

    const baseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!baseUrl || !apiKey) {
      return res.status(500).json({ ok: false, error: "Configuracao do Supabase incompleta para telemetria do Freshchat." });
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
      if (detail.includes("PGRST205") || detail.includes("agentlab_widget_events")) {
        return res.status(409).json({
          ok: false,
          code: "schema_missing",
          error: "Tabela agentlab_widget_events ausente. Aplique a migration 023_create_agentlab_widget_events.sql.",
        });
      }
      return res.status(500).json({ ok: false, error: detail || "Falha ao salvar telemetria do widget." });
    }

    await ensureWidgetIncident(baseUrl, apiKey, payload);

    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Falha ao registrar telemetria do widget Freshchat.",
    });
  }
}
