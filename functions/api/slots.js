// Cloudflare Pages Function para retornar slots disponíveis reais do Google Calendar
// Adaptado para rodar em ambiente serverless (sem dependências Node.js exclusivas)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const data = url.searchParams.get('data');
  if (!data) {
    return new Response(JSON.stringify({ ok: false, error: 'Data não informada.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Dependendo do ambiente, você pode usar fetch para acessar a API do Google Calendar diretamente
  // Aqui, um exemplo de fetch para a API REST do Google Calendar (usando OAuth2 token já obtido)
  // Você deve armazenar o access_token do Google em uma variável de ambiente (env.GOOGLE_ACCESS_TOKEN)

  const horariosPossiveis = ["09:00", "10:30", "14:00", "15:30", "17:00"];
  const dateStart = `${data}T00:00:00-03:00`;
  const dateEnd = `${data}T23:59:59-03:00`;

  try {
    const calendarId = 'primary';
    const urlApi = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?timeMin=${encodeURIComponent(dateStart)}&timeMax=${encodeURIComponent(dateEnd)}&singleEvents=true&orderBy=startTime`;
    const resp = await fetch(urlApi, {
      headers: {
        'Authorization': `Bearer ${env.GOOGLE_ACCESS_TOKEN}`,
      },
    });
    if (!resp.ok) throw new Error('Erro ao consultar Google Calendar');
    const events = await resp.json();
    const ocupados = (events.items || []).map(ev => {
      const start = ev.start.dateTime || ev.start.date;
      return start ? start.substring(11, 16) : null;
    }).filter(Boolean);
    const disponiveis = horariosPossiveis.filter(h => !ocupados.includes(h));
    return new Response(JSON.stringify({ ok: true, slots: disponiveis }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: 'Erro ao consultar Google Calendar.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
