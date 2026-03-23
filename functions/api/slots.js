export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const data = url.searchParams.get('data'); 
  if (!data) {
    return new Response(JSON.stringify({ ok: false, error: 'Data não informada.' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  let accessToken = env.GOOGLE_ACCESS_TOKEN;
  try {
    const params =
      "client_id=" + encodeURIComponent(env.GOOGLE_CLIENT_ID) +
      "&client_secret=" + encodeURIComponent(env.GOOGLE_CLIENT_SECRET) +
      "&refresh_token=" + encodeURIComponent(env.GOOGLE_OAUTH_REFRESH_TOKEN) +
      "&grant_type=refresh_token";
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });
    if (!tokenResp.ok) {
      throw new Error('Erro ao obter access token do Google');
    }
    const tokenData = await tokenResp.json();
    accessToken = tokenData.access_token;
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Erro ao obter access token do Google.' }),
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
  // Conversão determinística UTC-3 (Brasília, sem DST).
  // Evita Intl.DateTimeFormat que pode gerar separadores inconsistentes
  // (ex: "09h00" vs "09:00") dependendo da runtime do Cloudflare Workers.
  function toSPTime(iso) {
    const d = new Date(iso);
    const sp = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    return String(sp.getUTCHours()).padStart(2, '0') + ':' + String(sp.getUTCMinutes()).padStart(2, '0');
  }
  const ocupados = (eventsData.items || []).map(ev => {
    const start = ev.start.dateTime;
    if (!start) return null; // eventos de dia inteiro não bloqueiam slots
    return toSPTime(start);
  }).filter(Boolean);

  const disponiveis = horariosPossiveis.filter(h => !ocupados.includes(h));

  return new Response(
    JSON.stringify({ ok: true, slots: disponiveis }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
