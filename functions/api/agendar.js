// Cloudflare Pages Function para agendamento
// Adaptado para rodar em ambiente serverless (sem dependências Node.js exclusivas)
import { v4 as uuidv4 } from 'uuid';

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await request.json();
  const { nome, email, telefone, observacoes, area, data, hora } = body;

  // Validação de campos obrigatórios
  const camposFaltando = [];
  if (!nome) camposFaltando.push('Nome');
  if (!email) camposFaltando.push('E-mail');
  if (!telefone) camposFaltando.push('Telefone');
  if (!area) camposFaltando.push('Área de interesse');
  if (!data) camposFaltando.push('Data');
  if (!hora) camposFaltando.push('Hora');
  if (camposFaltando.length > 0) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Por favor, preencha os seguintes campos obrigatórios: ${camposFaltando.join(', ')}.`
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Checar se o slot está realmente disponível no Google Calendar
  const slotStart = `${data}T${hora}:00-03:00`;
  const slotEndHour = String(Number(hora.split(':')[0]) + 1).padStart(2, '0');
  const slotEnd = `${data}T${slotEndHour}:${hora.split(':')[1]}:00-03:00`;
  // Consulta FreeBusy via REST API
  const freebusyResp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GOOGLE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: slotStart,
      timeMax: slotEnd,
      timeZone: 'America/Sao_Paulo',
      items: [{ id: 'primary' }],
    })
  });
  if (!freebusyResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Erro ao consultar disponibilidade.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const freebusy = await freebusyResp.json();
  const isBusy = freebusy.calendars['primary'].busy.length > 0;
  if (isBusy) {
    return new Response(JSON.stringify({ ok: false, error: 'Horário já está ocupado. Escolha outro.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  // Gerar ID único para o agendamento
  const agendamentoId = uuidv4();

  // Persistir no Supabase
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const insertResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      id: agendamentoId,
      nome,
      email,
      telefone,
      area,
      data,
      hora,
      status: 'pendente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  });
  if (!insertResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Erro ao salvar agendamento.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Criar evento no Google Calendar
  const eventResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.GOOGLE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `Consulta Jurídica - ${area}`,
      description: `Cliente: ${nome} (${email})\nTelefone: ${telefone}\nObservações: ${observacoes}`,
      start: { dateTime: slotStart, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: slotEnd, timeZone: 'America/Sao_Paulo' },
      attendees: [{ email }],
    })
  });
  if (!eventResp.ok) {
    return new Response(JSON.stringify({ ok: false, error: 'Erro ao criar evento no Google Calendar.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const eventData = await eventResp.json();

  // Envio de e-mail: use um serviço externo (MailChannels, Resend, etc) ou SMTP se disponível
  // Aqui apenas simula sucesso

  return new Response(JSON.stringify({ ok: true, eventId: eventData.id, agendamentoId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
