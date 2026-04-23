/**
 * agendamentos-sync  v2
 *
 * Edge function central para sincronização de agendamentos com:
 *   - Google Calendar (criar/atualizar/deletar eventos)
 *   - Zoom (criar/atualizar/deletar meetings)
 *   - Freshsales (criar/atualizar/deletar appointments + contacts + activities)
 *
 * Estratégia de secrets (híbrida):
 *   - Project Secrets (Deno.env.get): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
 *     GOOGLE_OAUTH_REFRESH_TOKEN, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET, ZOOM_SECRET_TOKEN,
 *     FRESHSALES_API_KEY, FRESHSALES_DOMAIN, FRESHSALES_OWNER_ID
 *   - Vault SQL (consulta dinâmica): GOOGLE_CALENDAR_ID, ZOOM_ACCOUNT_ID,
 *     FRESHSALES_ACTIVITY_TYPE_BY_EVENT, FRESHSALES_APPOINTMENT_FIELD_MAP,
 *     FRESHSALES_STAGE_VALUE_MAP
 *
 * Modos de operação (POST body):
 *   { action: "booked",      agendamento_id: "uuid" }  → novo agendamento
 *   { action: "confirmed",   agendamento_id: "uuid" }  → confirmação pelo cliente
 *   { action: "rescheduled", agendamento_id: "uuid" }  → remarcação
 *   { action: "cancelled",   agendamento_id: "uuid" }  → cancelamento
 *   { action: "backfill" }                              → sincroniza pendentes (sem Zoom/FS)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Cache de secrets do vault ────────────────────────────────────────────────
let _vaultCache: Record<string, string> | null = null;

async function loadVaultSecrets(): Promise<Record<string, string>> {
  if (_vaultCache) return _vaultCache;

  const vaultKeys = [
    "GOOGLE_CALENDAR_ID",
    "ZOOM_ACCOUNT_ID",
    "FRESHSALES_ACTIVITY_TYPE_BY_EVENT",
    "FRESHSALES_APPOINTMENT_FIELD_MAP",
    "FRESHSALES_STAGE_VALUE_MAP",
  ];

  const { data, error } = await db.rpc("exec_sql_text", {
    sql: `SELECT name, decrypted_secret FROM vault.decrypted_secrets WHERE name = ANY($1::text[])`,
    params: [vaultKeys],
  }).single().catch(() => ({ data: null, error: "rpc_not_available" }));

  // Fallback: usar execute direto via REST
  if (error || !data) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql_text`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sql: `SELECT name, decrypted_secret FROM vault.decrypted_secrets WHERE name = ANY(ARRAY[${vaultKeys.map(k => `'${k}'`).join(",")}])`,
      }),
    }).catch(() => null);

    if (resp?.ok) {
      const rows = await resp.json().catch(() => []);
      _vaultCache = {};
      for (const row of (Array.isArray(rows) ? rows : [])) {
        if (row.name && row.decrypted_secret) {
          _vaultCache[row.name] = row.decrypted_secret;
        }
      }
      return _vaultCache;
    }
  }

  // Fallback final: consulta SQL direta via Supabase client
  try {
    const { data: rows } = await db
      .from("vault_secrets_view")
      .select("name, decrypted_secret")
      .in("name", vaultKeys);

    _vaultCache = {};
    for (const row of (rows || [])) {
      if (row.name && row.decrypted_secret) {
        _vaultCache[row.name] = row.decrypted_secret;
      }
    }
  } catch {
    _vaultCache = {};
  }

  return _vaultCache!;
}

// ─── Resolver secret (Project Secrets primeiro, vault como fallback) ──────────
async function getSecret(key: string, fallback = ""): Promise<string> {
  // 1. Tentar Project Secrets (Deno.env)
  const envVal = Deno.env.get(key);
  if (envVal && envVal.trim()) return envVal.trim();

  // 2. Tentar vault SQL
  const vault = await loadVaultSecrets();
  if (vault[key] && vault[key].trim()) return vault[key].trim();

  return fallback;
}

// ─── Logger ───────────────────────────────────────────────────────────────────
function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ ts: new Date().toISOString(), msg, ...extra }));
}

// ─── Google Calendar ──────────────────────────────────────────────────────────
async function getGoogleAccessToken(): Promise<string> {
  const clientId = await getSecret("GOOGLE_CLIENT_ID");
  const clientSecret = await getSecret("GOOGLE_CLIENT_SECRET");
  const refreshToken = await getSecret("GOOGLE_OAUTH_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Credenciais Google Calendar não configuradas.");
  }

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error(`Google OAuth falhou: ${data.error_description || data.error || resp.status}`);
  }
  return data.access_token;
}

async function createGoogleCalendarEvent(agendamento: Record<string, unknown>): Promise<string | null> {
  const calendarId = await getSecret("GOOGLE_CALENDAR_ID", "primary");
  const token = await getGoogleAccessToken();

  const startIso = new Date(`${agendamento.data}T${agendamento.hora}-03:00`).toISOString();
  const endIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();

  const event = {
    summary: `Consulta Jurídica - ${agendamento.area}`,
    description: [
      `Cliente: ${agendamento.nome}`,
      `E-mail: ${agendamento.email}`,
      `Telefone: ${agendamento.telefone}`,
      `Área: ${agendamento.area}`,
      agendamento.observacoes ? `Obs: ${agendamento.observacoes}` : null,
    ].filter(Boolean).join("\n"),
    start: { dateTime: startIso, timeZone: "America/Sao_Paulo" },
    end: { dateTime: endIso, timeZone: "America/Sao_Paulo" },
    attendees: [{ email: String(agendamento.email) }],
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 1440 },
        { method: "popup", minutes: 60 },
      ],
    },
  };

  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }
  );

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Google Calendar create falhou: ${data.error?.message || resp.status}`);
  return data.id || null;
}

async function updateGoogleCalendarEvent(eventId: string, agendamento: Record<string, unknown>): Promise<void> {
  const calendarId = await getSecret("GOOGLE_CALENDAR_ID", "primary");
  const token = await getGoogleAccessToken();

  const startIso = new Date(`${agendamento.data}T${agendamento.hora}-03:00`).toISOString();
  const endIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();

  const event = {
    summary: `Consulta Jurídica - ${agendamento.area}`,
    description: [
      `Cliente: ${agendamento.nome}`,
      `E-mail: ${agendamento.email}`,
      `Telefone: ${agendamento.telefone}`,
      `Área: ${agendamento.area}`,
      agendamento.observacoes ? `Obs: ${agendamento.observacoes}` : null,
    ].filter(Boolean).join("\n"),
    start: { dateTime: startIso, timeZone: "America/Sao_Paulo" },
    end: { dateTime: endIso, timeZone: "America/Sao_Paulo" },
  };

  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }
  );

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(`Google Calendar update falhou: ${data.error?.message || resp.status}`);
  }
}

async function deleteGoogleCalendarEvent(eventId: string): Promise<void> {
  const calendarId = await getSecret("GOOGLE_CALENDAR_ID", "primary");
  const token = await getGoogleAccessToken();

  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
  );

  if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
    throw new Error(`Google Calendar delete falhou: ${resp.status}`);
  }
}

// ─── Zoom ─────────────────────────────────────────────────────────────────────
async function getZoomAccessToken(): Promise<string> {
  const accountId = await getSecret("ZOOM_ACCOUNT_ID");
  const clientId = await getSecret("ZOOM_CLIENT_ID");
  const clientSecret = await getSecret("ZOOM_CLIENT_SECRET");

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Credenciais Zoom não configuradas.");
  }

  const basic = btoa(`${clientId}:${clientSecret}`);
  const resp = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` } }
  );

  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error(`Zoom auth falhou: ${data.reason || data.error || resp.status}`);
  }
  return data.access_token;
}

async function createZoomMeeting(agendamento: Record<string, unknown>): Promise<Record<string, unknown>> {
  const token = await getZoomAccessToken();
  const startIso = new Date(`${agendamento.data}T${agendamento.hora}-03:00`).toISOString();

  const payload = {
    topic: `Consulta Jurídica - ${agendamento.area}`,
    agenda: `Cliente: ${agendamento.nome}\nE-mail: ${agendamento.email}\nTelefone: ${agendamento.telefone}`,
    type: 2,
    start_time: startIso,
    duration: 60,
    timezone: "America/Sao_Paulo",
    settings: {
      join_before_host: false,
      waiting_room: true,
      participant_video: true,
      host_video: true,
      email_notification: true,
    },
  };

  const resp = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(`Zoom create meeting falhou: ${data.message || resp.status}`);
  return data;
}

async function updateZoomMeeting(meetingId: string, agendamento: Record<string, unknown>): Promise<void> {
  const token = await getZoomAccessToken();
  const startIso = new Date(`${agendamento.data}T${agendamento.hora}-03:00`).toISOString();

  const resp = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: `Consulta Jurídica - ${agendamento.area}`,
      start_time: startIso,
      duration: 60,
      timezone: "America/Sao_Paulo",
    }),
  });

  if (!resp.ok && resp.status !== 204) {
    const data = await resp.json().catch(() => ({}));
    throw new Error(`Zoom update meeting falhou: ${data.message || resp.status}`);
  }
}

async function deleteZoomMeeting(meetingId: string): Promise<void> {
  const token = await getZoomAccessToken();
  const resp = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Zoom delete meeting falhou: ${resp.status}`);
  }
}

// ─── Freshsales ───────────────────────────────────────────────────────────────
async function getFreshsalesHeaders(): Promise<Record<string, string>> {
  const apiKey = await getSecret("FRESHSALES_API_KEY");
  return {
    Authorization: `Token token=${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function getFreshsalesDomain(): Promise<string> {
  const domain = await getSecret("FRESHSALES_DOMAIN", "hmadv-org.myfreshworks.com");
  return domain.includes("myfreshworks.com") ? domain : `${domain}.myfreshworks.com`;
}

async function upsertFreshsalesContact(agendamento: Record<string, unknown>): Promise<string | null> {
  const domain = await getFreshsalesDomain();
  const headers = await getFreshsalesHeaders();
  const email = String(agendamento.email || "");
  if (!email) return null;

  // Buscar contato existente por e-mail
  const searchResp = await fetch(
    `https://${domain}/crm/sales/api/contacts/search?q=${encodeURIComponent(email)}&include=owner`,
    { headers }
  );

  if (searchResp.ok) {
    const searchData = await searchResp.json();
    const contacts = searchData.contacts || [];
    if (contacts.length > 0) return String(contacts[0].id);
  }

  // Criar novo contato
  const nameParts = String(agendamento.nome || "Cliente").trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || "Site";
  const ownerId = await getSecret("FRESHSALES_OWNER_ID");

  const createResp = await fetch(`https://${domain}/crm/sales/api/contacts`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      contact: {
        first_name: firstName,
        last_name: lastName,
        email,
        mobile_number: String(agendamento.telefone || ""),
        owner_id: ownerId || undefined,
      },
    }),
  });

  const createData = await createResp.json();
  if (!createResp.ok) {
    log("warn", "freshsales_contact_create_failed", { status: createResp.status });
    return null;
  }
  return String(createData.contact?.id || "");
}

async function createFreshsalesAppointment(
  agendamento: Record<string, unknown>,
  contactId: string | null,
  zoomJoinUrl: string | null
): Promise<string | null> {
  const domain = await getFreshsalesDomain();
  const headers = await getFreshsalesHeaders();
  const ownerId = await getSecret("FRESHSALES_OWNER_ID");

  const startIso = new Date(`${agendamento.data}T${agendamento.hora}-03:00`).toISOString();
  const endIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();

  const appointmentPayload: Record<string, unknown> = {
    appointment: {
      title: `Consulta Jurídica - ${agendamento.area}`,
      from_date: startIso,
      end_date: endIso,
      description: [
        `Cliente: ${agendamento.nome}`,
        `E-mail: ${agendamento.email}`,
        `Telefone: ${agendamento.telefone}`,
        `Área: ${agendamento.area}`,
        zoomJoinUrl ? `Zoom: ${zoomJoinUrl}` : null,
      ].filter(Boolean).join("\n"),
      location: zoomJoinUrl || "Sala virtual a definir",
      owner_id: ownerId || undefined,
      external_id: String(agendamento.id),
    },
  };

  if (contactId) {
    const appt = appointmentPayload.appointment as Record<string, unknown>;
    appt.targetable_type = "Contact";
    appt.targetable_id = String(contactId);
    appt.appointment_attendees_attributes = [
      { targetable_type: "Contact", targetable_id: String(contactId) },
    ];
  }

  // Campos customizados via mapeamento do vault
  const fieldMapRaw = await getSecret("FRESHSALES_APPOINTMENT_FIELD_MAP", "{}");
  try {
    const fieldMap = JSON.parse(fieldMapRaw);
    if (Object.keys(fieldMap).length > 0) {
      const customFields: Record<string, unknown> = {};
      if (fieldMap.crm_event_source) customFields[fieldMap.crm_event_source] = "agendamento_online";
      if (fieldMap.crm_event_status) customFields[fieldMap.crm_event_status] = "booked";
      if (fieldMap.zoom_join_url && zoomJoinUrl) customFields[fieldMap.zoom_join_url] = zoomJoinUrl;
      if (Object.keys(customFields).length > 0) {
        (appointmentPayload.appointment as Record<string, unknown>).custom_field = customFields;
      }
    }
  } catch { /* ignora erro de parse */ }

  const resp = await fetch(`https://${domain}/crm/sales/api/appointments`, {
    method: "POST",
    headers,
    body: JSON.stringify(appointmentPayload),
  });

  const data = await resp.json();
  if (!resp.ok) {
    log("warn", "freshsales_appointment_create_failed", { status: resp.status });
    return null;
  }
  return String(data.appointment?.id || "");
}

async function updateFreshsalesAppointment(
  appointmentId: string,
  agendamento: Record<string, unknown>,
  zoomJoinUrl: string | null,
  eventStatus: string
): Promise<void> {
  const domain = await getFreshsalesDomain();
  const headers = await getFreshsalesHeaders();

  const startIso = new Date(`${agendamento.data}T${agendamento.hora}-03:00`).toISOString();
  const endIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();

  const appointmentPayload: Record<string, unknown> = {
    appointment: {
      title: `Consulta Jurídica - ${agendamento.area}`,
      from_date: startIso,
      end_date: endIso,
      location: zoomJoinUrl || "Sala virtual a definir",
    },
  };

  const fieldMapRaw = await getSecret("FRESHSALES_APPOINTMENT_FIELD_MAP", "{}");
  try {
    const fieldMap = JSON.parse(fieldMapRaw);
    if (Object.keys(fieldMap).length > 0) {
      const customFields: Record<string, unknown> = {};
      if (fieldMap.crm_event_status) customFields[fieldMap.crm_event_status] = eventStatus;
      if (fieldMap.zoom_join_url && zoomJoinUrl) customFields[fieldMap.zoom_join_url] = zoomJoinUrl;
      if (Object.keys(customFields).length > 0) {
        (appointmentPayload.appointment as Record<string, unknown>).custom_field = customFields;
      }
    }
  } catch { /* ignora */ }

  const resp = await fetch(`https://${domain}/crm/sales/api/appointments/${appointmentId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(appointmentPayload),
  });

  if (!resp.ok) {
    const data = await resp.json().catch(() => ({}));
    log("warn", "freshsales_appointment_update_failed", { status: resp.status, data });
  }
}

async function deleteFreshsalesAppointment(appointmentId: string): Promise<void> {
  const domain = await getFreshsalesDomain();
  const headers = await getFreshsalesHeaders();

  const resp = await fetch(`https://${domain}/crm/sales/api/appointments/${appointmentId}`, {
    method: "DELETE",
    headers,
  });

  if (!resp.ok && resp.status !== 404) {
    log("warn", "freshsales_appointment_delete_failed", { status: resp.status });
  }
}

// ─── Processar agendamento individual ─────────────────────────────────────────
async function processAgendamento(
  agendamentoId: string,
  action: string
): Promise<Record<string, unknown>> {
  const { data: agendamento, error } = await db
    .from("agendamentos")
    .select("*")
    .eq("id", agendamentoId)
    .single();

  if (error || !agendamento) {
    return { ok: false, error: `Agendamento ${agendamentoId} não encontrado` };
  }

  const warnings: string[] = [];
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // ── Google Calendar ────────────────────────────────────────────────────────
  try {
    if (action === "cancelled" && agendamento.google_event_id) {
      await deleteGoogleCalendarEvent(agendamento.google_event_id);
      updates.google_event_id = null;
    } else if (action === "rescheduled" && agendamento.google_event_id) {
      await updateGoogleCalendarEvent(agendamento.google_event_id, agendamento);
    } else if (!agendamento.google_event_id && action !== "cancelled") {
      const eventId = await createGoogleCalendarEvent(agendamento);
      if (eventId) updates.google_event_id = eventId;
    }
  } catch (e) {
    warnings.push(`google_calendar: ${(e as Error).message}`);
    log("warn", "google_calendar_error", { agendamento_id: agendamentoId, error: (e as Error).message });
  }

  // ── Zoom ───────────────────────────────────────────────────────────────────
  let zoomJoinUrl = agendamento.zoom_join_url as string | null;
  try {
    if (action === "cancelled" && agendamento.zoom_meeting_id) {
      await deleteZoomMeeting(agendamento.zoom_meeting_id);
      updates.zoom_meeting_id = null;
      updates.zoom_join_url = null;
      updates.zoom_start_url = null;
      updates.zoom_password = null;
      zoomJoinUrl = null;
    } else if (action === "rescheduled" && agendamento.zoom_meeting_id) {
      await updateZoomMeeting(agendamento.zoom_meeting_id, agendamento);
    } else if (!agendamento.zoom_meeting_id && action !== "cancelled") {
      const meeting = await createZoomMeeting(agendamento);
      zoomJoinUrl = String(meeting.join_url || "");
      updates.zoom_meeting_id = String(meeting.id || "");
      updates.zoom_uuid = String(meeting.uuid || "");
      updates.zoom_join_url = zoomJoinUrl;
      updates.zoom_start_url = String(meeting.start_url || "");
      updates.zoom_password = String(meeting.password || "");
      updates.zoom_host_email = String(meeting.host_email || "");
      updates.zoom_timezone = String(meeting.timezone || "America/Sao_Paulo");
      updates.zoom_topic = String(meeting.topic || "");
      updates.zoom_status = String(meeting.status || "waiting");
      updates.zoom_payload = meeting;
    }
  } catch (e) {
    warnings.push(`zoom: ${(e as Error).message}`);
    log("warn", "zoom_error", { agendamento_id: agendamentoId, error: (e as Error).message });
  }

  // ── Freshsales ─────────────────────────────────────────────────────────────
  try {
    const contactId = await upsertFreshsalesContact(agendamento);
    if (contactId) updates.freshsales_contact_id = contactId;

    if (action === "cancelled" && agendamento.freshsales_appointment_id) {
      await deleteFreshsalesAppointment(agendamento.freshsales_appointment_id);
      updates.freshsales_appointment_id = null;
      updates.freshsales_sync_status = "cancelled";
    } else if (agendamento.freshsales_appointment_id) {
      await updateFreshsalesAppointment(
        agendamento.freshsales_appointment_id,
        agendamento,
        zoomJoinUrl,
        action
      );
      updates.freshsales_sync_status = action;
    } else if (action !== "cancelled") {
      const appointmentId = await createFreshsalesAppointment(
        agendamento,
        contactId,
        zoomJoinUrl
      );
      if (appointmentId) {
        updates.freshsales_appointment_id = appointmentId;
        updates.freshsales_sync_status = "booked";
      }
    }
  } catch (e) {
    warnings.push(`freshsales: ${(e as Error).message}`);
    updates.freshsales_sync_error = (e as Error).message;
    log("warn", "freshsales_error", { agendamento_id: agendamentoId, error: (e as Error).message });
  }

  // ── Persistir no Supabase ──────────────────────────────────────────────────
  const { error: updateError } = await db
    .from("agendamentos")
    .update(updates)
    .eq("id", agendamentoId);

  if (updateError) {
    warnings.push(`supabase_update: ${updateError.message}`);
  }

  return {
    ok: true,
    agendamento_id: agendamentoId,
    action,
    updates_applied: Object.keys(updates),
    warnings,
  };
}

// ─── Handler principal ────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const action = String(body.action || "booked");

  // ── Modo backfill ──────────────────────────────────────────────────────────
  if (action === "backfill") {
    log("info", "Iniciando backfill de agendamentos sem Zoom/Freshsales");

    const { data: pending, error } = await db
      .from("agendamentos")
      .select("id")
      .is("zoom_meeting_id", null)
      .neq("status", "cancelado")
      .gte("data", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0])
      .order("data", { ascending: true })
      .limit(50);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const row of (pending || [])) {
      const result = await processAgendamento(row.id, "booked");
      results.push(result);
      await new Promise(r => setTimeout(r, 600)); // Rate limiting
    }

    return new Response(
      JSON.stringify({ ok: true, action: "backfill", processed: results.length, results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Modo individual ────────────────────────────────────────────────────────
  const agendamentoId = String(body.agendamento_id || body.id || "");
  if (!agendamentoId) {
    return new Response(JSON.stringify({ error: "agendamento_id é obrigatório" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validActions = ["booked", "confirmed", "rescheduled", "cancelled"];
  if (!validActions.includes(action)) {
    return new Response(
      JSON.stringify({ error: `action inválida. Use: ${validActions.join(", ")}` }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  log("info", `Processando agendamento ${agendamentoId} action=${action}`);
  const result = await processAgendamento(agendamentoId, action);

  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
});
