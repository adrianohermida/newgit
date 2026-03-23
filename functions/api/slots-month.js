import { getGoogleAccessToken } from '../lib/google-auth.js';
import { MINIMUM_LEAD_HOURS, isSlotBookable } from '../lib/slot-policy.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

// Retorna todos os slots disponíveis de um mês inteiro em uma única chamada
// GET /api/slots-month?mes=YYYY-MM
export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const mes = url.searchParams.get('mes'); // ex: "2026-03"
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return new Response(JSON.stringify({ ok: false, error: 'Parâmetro "mes" inválido. Use o formato YYYY-MM.' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Obter access token via refresh token
  let accessToken;
  let authMeta;
  try {
    authMeta = await getGoogleAccessToken(env);
    accessToken = authMeta.accessToken;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Erro ao autenticar com Google Calendar.', detail: e.message }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // Intervalo: primeiro e último dia do mês
  const [ano, numMes] = mes.split('-').map(Number);
  const inicio = `${mes}-01T00:00:00-03:00`;
  const ultimoDia = new Date(ano, numMes, 0).getDate(); // último dia do mês
  const fim = `${mes}-${String(ultimoDia).padStart(2, '0')}T23:59:59-03:00`;

  // Buscar todos os eventos do mês em uma única chamada
  const eventsResp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(inicio)}&timeMax=${encodeURIComponent(fim)}&singleEvents=true&orderBy=startTime&maxResults=250`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  if (!eventsResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Erro ao consultar eventos do Google Calendar.' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const eventsData = await eventsResp.json();
  const SLOT_DURATION_MINUTES = 60;
  const horariosPossiveis = ['09:00', '10:30', '14:00', '15:30', '17:00'];

  function buildSlotInterval(dia, horario) {
    const [hh, mm] = horario.split(':').map(Number);
    const start = new Date(`${dia}T${horario}:00-03:00`);
    const end = new Date(start.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
    if (Number.isNaN(hh) || Number.isNaN(mm) || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
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

  // Calcular slots disponíveis por dia
  const slotsPorDia = {};
  for (let d = 1; d <= ultimoDia; d++) {
    const dia = `${mes}-${String(d).padStart(2, '0')}`;
    const diaSemana = new Date(ano, numMes - 1, d).getDay();
    if (diaSemana === 0 || diaSemana === 6) continue; // ignorar fins de semana
    slotsPorDia[dia] = horariosPossiveis.filter((horario) => {
      const slotInterval = buildSlotInterval(dia, horario);
      if (!slotInterval) return false;
      if (!isSlotBookable(slotInterval.start)) return false;
      return !eventosOcupados.some((evento) => hasOverlap(slotInterval, evento));
    });
  }

  return new Response(JSON.stringify({
    ok: true,
    slots: slotsPorDia,
    minimumLeadHours: MINIMUM_LEAD_HOURS,
    authSource: authMeta?.source,
    warning: authMeta?.warning || undefined,
  }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
