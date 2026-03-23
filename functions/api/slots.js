import { getGoogleAccessToken } from '../lib/google-auth.js';
import { MINIMUM_LEAD_HOURS, isSlotBookable } from '../lib/slot-policy.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const data = url.searchParams.get('data'); 
  if (!data) {
    return new Response(JSON.stringify({ ok: false, error: 'Data não informada.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let accessToken;
  let authMeta;
  try {
    authMeta = await getGoogleAccessToken(env);
    accessToken = authMeta.accessToken;
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Erro ao obter access token do Google.', detail: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const horariosPossiveis = ["09:00", "10:30", "14:00", "15:30", "17:00"];
  const dateStart = `${data}T00:00:00-03:00`;
  const dateEnd = `${data}T23:59:59-03:00`;

  const eventsResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${dateStart}&timeMax=${dateEnd}&singleEvents=true&orderBy=startTime`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  if (!eventsResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Erro ao consultar eventos.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const eventsData = await eventsResp.json();
  const SLOT_DURATION_MINUTES = 60;

  function buildSlotInterval(horario) {
    const start = new Date(`${data}T${horario}:00-03:00`);
    const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    return { start, end };
  }

  function hasOverlap(intervalA, intervalB) {
    return intervalA.start < intervalB.end && intervalB.start < intervalA.end;
  }

  const eventosOcupados = (eventsData.items || [])
    .map((ev) => {
      if (!ev.start?.dateTime || !ev.end?.dateTime) {
        return null;
      }
      const start = new Date(ev.start.dateTime);
      const end = new Date(ev.end.dateTime);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
      }
      return { start, end };
    })
    .filter(Boolean);

  const disponiveis = horariosPossiveis.filter((horario) => {
    const slotInterval = buildSlotInterval(horario);
    if (!slotInterval) return false;
    if (!isSlotBookable(slotInterval.start)) return false;
    return !eventosOcupados.some((evento) => hasOverlap(slotInterval, evento));
  });

  return new Response(
    JSON.stringify({ ok: true, slots: disponiveis, minimumLeadHours: MINIMUM_LEAD_HOURS }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
