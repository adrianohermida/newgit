// Endpoint para retornar slots disponíveis reais do Google Calendar
import { google } from 'googleapis';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const { data } = req.query; // data no formato YYYY-MM-DD
  if (!data) return res.status(400).json({ ok: false, error: 'Data não informada.' });

    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_CALENDAR_REDIRECT_URI
    );
  // Sempre obter novo access token via refresh token
  let accessToken = null;
  try {
    const { token } = await oAuth2Client.getAccessToken();
    accessToken = token;
    oAuth2Client.setCredentials({ access_token: accessToken, refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Erro ao obter access token do Google.' });
  }
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  // Defina os horários fixos possíveis
  const horariosPossiveis = ["09:00", "10:30", "14:00", "15:30", "17:00"];
  const dateStart = `${data}T00:00:00-03:00`;
  const dateEnd = `${data}T23:59:59-03:00`;

  try {
    const events = await calendar.events.list({
      calendarId: 'primary',
      timeMin: dateStart,
      timeMax: dateEnd,
      singleEvents: true,
      orderBy: 'startTime',
    });
    const ocupados = events.data.items.map(ev => {
      const start = ev.start.dateTime || ev.start.date;
      return start ? start.substring(11, 16) : null;
    }).filter(Boolean);
    const disponiveis = horariosPossiveis.filter(h => !ocupados.includes(h));
    return res.status(200).json({ ok: true, slots: disponiveis });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'Erro ao consultar Google Calendar.' });
  }
}
