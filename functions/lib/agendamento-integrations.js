import {
  createZoomMeeting,
  deleteZoomMeeting,
  extractZoomMeetingSnapshot,
  updateZoomMeeting,
} from "./zoom-admin.js";
import { syncAgendamentoToFreshsales } from "./freshsales-crm.js";
import { patchAgendamento } from "./agendamento-helpers.js";

function isMissingColumnError(error) {
  const message = String(error?.message || "");
  return message.includes("Could not find the") || message.includes("column") || message.includes("schema cache");
}

function buildCurrentZoomSnapshot(agendamento) {
  if (!agendamento?.zoom_meeting_id) {
    return null;
  }

  return {
    zoom_meeting_id: agendamento.zoom_meeting_id || null,
    zoom_uuid: agendamento.zoom_uuid || null,
    zoom_join_url: agendamento.zoom_join_url || null,
    zoom_start_url: agendamento.zoom_start_url || null,
    zoom_password: agendamento.zoom_password || null,
    zoom_host_email: agendamento.zoom_host_email || null,
    zoom_timezone: agendamento.zoom_timezone || null,
    zoom_topic: agendamento.zoom_topic || null,
    zoom_status: agendamento.zoom_status || null,
    zoom_occurrence_id: agendamento.zoom_occurrence_id || null,
    zoom_payload: agendamento.zoom_payload || null,
  };
}

async function safeOptionalPatchAgendamento(supabaseUrl, supabaseKey, id, patch, warnings, source) {
  try {
    return await patchAgendamento(supabaseUrl, supabaseKey, id, patch);
  } catch (error) {
    const warning = isMissingColumnError(error)
      ? `${source}: colunas de integração ainda não disponíveis na tabela agendamentos.`
      : `${source}: ${error.message}`;
    warnings.push(warning);
    return null;
  }
}

export async function runAgendamentoBookedIntegrations(env, supabase, agendamento) {
  const warnings = [];
  let zoomSnapshot = null;

  try {
    const meeting = await createZoomMeeting(env, agendamento);
    zoomSnapshot = extractZoomMeetingSnapshot(meeting);
    await safeOptionalPatchAgendamento(
      supabase.supabaseUrl,
      supabase.supabaseKey,
      agendamento.id,
      {
        ...zoomSnapshot,
        updated_at: new Date().toISOString(),
      },
      warnings,
      "zoom_patch"
    );
  } catch (error) {
    warnings.push(`zoom_create: ${error.message}`);
  }

  try {
    const freshsales = await syncAgendamentoToFreshsales(env, { ...agendamento, ...zoomSnapshot }, "booked", zoomSnapshot);
    await safeOptionalPatchAgendamento(
      supabase.supabaseUrl,
      supabase.supabaseKey,
      agendamento.id,
      {
        freshsales_contact_id: freshsales.contactId,
        freshsales_appointment_id: freshsales.appointmentId,
        freshsales_external_id: agendamento.id,
        freshsales_sync_status: "booked",
        freshsales_sync_error: null,
        freshsales_payload: freshsales.payload,
        updated_at: new Date().toISOString(),
      },
      warnings,
      "freshsales_patch"
    );
    return { warnings, zoomSnapshot, freshsales };
  } catch (error) {
    await safeOptionalPatchAgendamento(
      supabase.supabaseUrl,
      supabase.supabaseKey,
      agendamento.id,
      {
        freshsales_sync_status: "error",
        freshsales_sync_error: error.message,
        updated_at: new Date().toISOString(),
      },
      warnings,
      "freshsales_error_patch"
    );
    warnings.push(`freshsales_booked: ${error.message}`);
    return { warnings, zoomSnapshot, freshsales: null };
  }
}

export async function runAgendamentoStatusIntegrations(env, supabase, agendamento, eventType) {
  const warnings = [];
  let zoomSnapshot = buildCurrentZoomSnapshot(agendamento);

  try {
    if (eventType === "rescheduled") {
      const meeting = agendamento.zoom_meeting_id
        ? await updateZoomMeeting(env, agendamento.zoom_meeting_id, agendamento)
        : await createZoomMeeting(env, agendamento);
      zoomSnapshot = extractZoomMeetingSnapshot(meeting);
      await safeOptionalPatchAgendamento(
        supabase.supabaseUrl,
        supabase.supabaseKey,
        agendamento.id,
        {
          ...zoomSnapshot,
          updated_at: new Date().toISOString(),
        },
        warnings,
        "zoom_patch"
      );
    } else if (eventType === "confirmed" && !agendamento.zoom_meeting_id) {
      const meeting = await createZoomMeeting(env, agendamento);
      zoomSnapshot = extractZoomMeetingSnapshot(meeting);
      await safeOptionalPatchAgendamento(
        supabase.supabaseUrl,
        supabase.supabaseKey,
        agendamento.id,
        {
          ...zoomSnapshot,
          updated_at: new Date().toISOString(),
        },
        warnings,
        "zoom_patch"
      );
    } else if (eventType === "cancelled" && agendamento.zoom_meeting_id) {
      await deleteZoomMeeting(env, agendamento.zoom_meeting_id);
    }
  } catch (error) {
    warnings.push(`zoom_${eventType}: ${error.message}`);
  }

  try {
    const freshsales = await syncAgendamentoToFreshsales(env, { ...agendamento, ...zoomSnapshot }, eventType, zoomSnapshot);
    await safeOptionalPatchAgendamento(
      supabase.supabaseUrl,
      supabase.supabaseKey,
      agendamento.id,
      {
        freshsales_contact_id: freshsales.contactId,
        freshsales_appointment_id: freshsales.appointmentId,
        freshsales_external_id: agendamento.id,
        freshsales_sync_status: eventType,
        freshsales_sync_error: null,
        freshsales_payload: freshsales.payload,
        updated_at: new Date().toISOString(),
      },
      warnings,
      "freshsales_patch"
    );
    return { warnings, zoomSnapshot, freshsales };
  } catch (error) {
    await safeOptionalPatchAgendamento(
      supabase.supabaseUrl,
      supabase.supabaseKey,
      agendamento.id,
      {
        freshsales_sync_status: "error",
        freshsales_sync_error: error.message,
        updated_at: new Date().toISOString(),
      },
      warnings,
      "freshsales_error_patch"
    );
    warnings.push(`freshsales_${eventType}: ${error.message}`);
    return { warnings, zoomSnapshot, freshsales: null };
  }
}
