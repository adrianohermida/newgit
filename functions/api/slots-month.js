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
  try {
    const params =
      'client_id=' + encodeURIComponent(env.GOOGLE_CLIENT_ID) +
      '&client_secret=' + encodeURIComponent(env.GOOGLE_CLIENT_SECRET) +
      '&refresh_token=' + encodeURIComponent(env.GOOGLE_OAUTH_REFRESH_TOKEN) +
      '&grant_type=refresh_token';
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!tokenResp.ok) {
      const errBody = await tokenResp.json().catch(() => ({}));
      throw new Error(errBody.error_description || errBody.error || `HTTP ${tokenResp.status}`);
    }
    const tokenData = await tokenResp.json();
    accessToken = tokenData.access_token;
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

  // Converte ISO string para hora e data no fuso fixo de Brasília (UTC-3, sem DST)
  function toSPTime(isoString) {
    const d = new Date(isoString);
    const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    const hh = String(sp.getUTCHours()).padStart(2, '0');
    const mm = String(sp.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  function toSPDate(isoString) {
    const d = new Date(isoString);
    const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    const yyyy = sp.getUTCFullYear();
    const mm = String(sp.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(sp.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  // Agrupar eventos ocupados por data
  const ocupadosPorDia = {};
  for (const ev of eventsData.items || []) {
    const start = ev.start.dateTime || ev.start.date;
    if (!start) continue;
    // Eventos de dia inteiro (start.date, sem hora) não bloqueam slots
    if (!ev.start.dateTime) continue;
    const dia = toSPDate(start);
    const hora = toSPTime(start);
    if (!ocupadosPorDia[dia]) ocupadosPorDia[dia] = [];
    ocupadosPorDia[dia].push(hora);
  }

  // Calcular slots disponíveis por dia
  const horariosPossiveis = ['09:00', '10:30', '14:00', '15:30', '17:00'];
  const slotsPorDia = {};
  for (let d = 1; d <= ultimoDia; d++) {
    const dia = `${mes}-${String(d).padStart(2, '0')}`;
    const diaSemana = new Date(ano, numMes - 1, d).getDay();
    if (diaSemana === 0 || diaSemana === 6) continue; // ignorar fins de semana
    const ocupados = ocupadosPorDia[dia] || [];
    slotsPorDia[dia] = horariosPossiveis.filter(h => !ocupados.includes(h));
  }

  return new Response(JSON.stringify({ ok: true, slots: slotsPorDia }), {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
