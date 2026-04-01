import { getCleanEnvValue } from "./env.js";

function getZoomConfig(env) {
  const accountId = getCleanEnvValue(env.ZOOM_ACCOUNT_ID);
  const clientId = getCleanEnvValue(env.ZOOM_CLIENT_ID);
  const clientSecret = getCleanEnvValue(env.ZOOM_CLIENT_SECRET);
  const userId = getCleanEnvValue(env.ZOOM_USER_ID) || "me";
  const timezone = getCleanEnvValue(env.ZOOM_DEFAULT_TIMEZONE) || "America/Sao_Paulo";

  return {
    accountId,
    clientId,
    clientSecret,
    userId,
    timezone,
  };
}

function ensureZoomConfig(config) {
  if (!config.accountId || !config.clientId || !config.clientSecret) {
    throw new Error("Credenciais do Zoom ausentes no ambiente.");
  }
}

export async function getZoomAccessToken(env) {
  const config = getZoomConfig(env);
  ensureZoomConfig(config);

  const basic = btoa(`${config.clientId}:${config.clientSecret}`);
  const params = new URLSearchParams({
    grant_type: "account_credentials",
    account_id: config.accountId,
  });

  const response = await fetch(`https://zoom.us/oauth/token?${params.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.reason || payload.error || `Zoom auth failed with status ${response.status}`);
  }

  return {
    accessToken: payload.access_token,
    expiresIn: payload.expires_in || null,
    config,
  };
}

function buildMeetingPayload(agendamento, overrides = {}, timezone = "America/Sao_Paulo") {
  const startIso = overrides.startIso || `${agendamento.data}T${agendamento.hora}:00-03:00`;
  const durationMinutes = Number(overrides.duration_minutes || agendamento.duration_minutes || 60);

  return {
    topic: overrides.topic || `Consulta Jurídica - ${agendamento.area}`,
    agenda:
      overrides.agenda ||
      `Cliente: ${agendamento.nome}\nE-mail: ${agendamento.email}\nTelefone: ${agendamento.telefone}\nObservações: ${agendamento.observacoes || "—"}`,
    type: 2,
    start_time: new Date(startIso).toISOString(),
    duration: durationMinutes,
    timezone,
    settings: {
      join_before_host: false,
      waiting_room: true,
      participant_video: true,
      host_video: true,
      approval_type: 2,
      registration_type: 1,
      email_notification: true,
      ...((overrides.settings && typeof overrides.settings === "object") ? overrides.settings : {}),
    },
    ...(overrides.password ? { password: overrides.password } : {}),
  };
}

async function zoomRequest(accessToken, path, init = {}) {
  const response = await fetch(`https://api.zoom.us/v2${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || `Zoom request failed with status ${response.status}`);
  }

  return payload;
}

export async function createZoomMeeting(env, agendamento, overrides = {}) {
  const { accessToken, config } = await getZoomAccessToken(env);
  const payload = buildMeetingPayload(agendamento, overrides, config.timezone);

  return zoomRequest(accessToken, `/users/${encodeURIComponent(config.userId)}/meetings`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateZoomMeeting(env, meetingId, agendamento, overrides = {}) {
  const { accessToken, config } = await getZoomAccessToken(env);
  const payload = buildMeetingPayload(agendamento, overrides, config.timezone);

  await zoomRequest(accessToken, `/meetings/${encodeURIComponent(meetingId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });

  return getZoomMeeting(env, meetingId);
}

export async function getZoomMeeting(env, meetingId) {
  const { accessToken } = await getZoomAccessToken(env);
  return zoomRequest(accessToken, `/meetings/${encodeURIComponent(meetingId)}`, {
    method: "GET",
  });
}

export async function listZoomMeetingParticipants(env, meetingId) {
  const { accessToken } = await getZoomAccessToken(env);
  return zoomRequest(accessToken, `/past_meetings/${encodeURIComponent(meetingId)}/participants?page_size=100`, {
    method: "GET",
  });
}

export async function deleteZoomMeeting(env, meetingId) {
  const { accessToken } = await getZoomAccessToken(env);
  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Zoom delete failed with status ${response.status}`);
  }

  return { ok: true };
}

export function extractZoomMeetingSnapshot(meeting) {
  if (!meeting) return null;
  return {
    zoom_meeting_id: String(meeting.id || ""),
    zoom_uuid: meeting.uuid || null,
    zoom_join_url: meeting.join_url || null,
    zoom_start_url: meeting.start_url || null,
    zoom_password: meeting.password || null,
    zoom_host_email: meeting.host_email || null,
    zoom_timezone: meeting.timezone || null,
    zoom_topic: meeting.topic || null,
    zoom_status: meeting.status || null,
    zoom_occurrence_id: meeting.occurrence_id || null,
    zoom_payload: meeting,
  };
}
