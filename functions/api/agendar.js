

// Função simples para gerar uuidv4-like (suficiente para ambiente Cloudflare)
// Função para gerar uuidv4 (Cloudflare)
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

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

  // 1. Obter access token usando refresh token
  let accessToken = env.GOOGLE_ACCESS_TOKEN;
  try {
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      })
    });
    if (!tokenResp.ok) {
      const errBody = await tokenResp.json().catch(() => ({}));
      throw new Error(errBody.error_description || errBody.error || `HTTP ${tokenResp.status}`);
    }
    const tokenData = await tokenResp.json();
    accessToken = tokenData.access_token;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Erro ao obter access token do Google.', detail: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // 2. Consulta FreeBusy via REST API
  const freebusyResp = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
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

  // Gerar ID único e token de confirmação
  const agendamentoId = uuidv4();
  const tokenConfirmacao = uuidv4();

  // Persistir no Supabase (inclui token de confirmação)
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
      token_confirmacao: tokenConfirmacao,
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
      'Authorization': `Bearer ${accessToken}`,
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
  const googleEventId = eventData.id || null;

  // Atualizar registro no Supabase com o ID do evento do Google Calendar
  if (googleEventId) {
    await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamentoId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ google_event_id: googleEventId, updated_at: new Date().toISOString() }),
    });
  }

  // Envio de e-mail via Resend (https://resend.com)
  const siteUrl = env.SITE_URL || 'https://hermidamaia.adv.br';
  const linkConfirmacao = `${siteUrl}/api/confirmar?token=${tokenConfirmacao}`;

  const dataFormatada = new Date(`${data}T${hora}:00-03:00`).toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo'
  });

  const emailClienteHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
  <h2 style="color:#C5A059;margin-top:0">Pedido de Agendamento Recebido</h2>
  <p>Olá, <strong>${nome}</strong>!</p>
  <p>Recebemos seu pedido de consulta jurídica. Confirme pelo link abaixo para garantir o horário.</p>
  <table style="width:100%;border-collapse:collapse;margin:24px 0">
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Área</td><td style="padding:8px">${area}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Data</td><td style="padding:8px">${dataFormatada}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Horário</td><td style="padding:8px">${hora}</td></tr>
  </table>
  <a href="${linkConfirmacao}" style="display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 0">
    Confirmar Agendamento
  </a>
  <p style="font-size:12px;color:#888;margin-top:24px">
    O link expira em 24 horas. Se não foi você, ignore este e-mail.
  </p>
</div>`;

  const emailSuporteHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Novo Agendamento — ${area}</h2>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px;font-weight:bold">Nome</td><td style="padding:6px">${nome}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">E-mail</td><td style="padding:6px">${email}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Telefone</td><td style="padding:6px">${telefone}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Data</td><td style="padding:6px">${data}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Hora</td><td style="padding:6px">${hora}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Observações</td><td style="padding:6px">${observacoes || '—'}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Token</td><td style="padding:6px;font-size:12px">${tokenConfirmacao}</td></tr>
  </table>
</div>`;

  // Envia e-mail via Resend (https://api.resend.com).
  // Falha silenciosa: agendamento já está salvo no Supabase e no Google Calendar.
  async function enviarEmail(to, subject, html) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Hermida Maia Advocacia <contato@hermidamaia.com.br>',
          to: [to],
          subject,
          html,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        console.error(`Resend error para ${to}:`, err.message || err.name || resp.status);
      }
    } catch (e) {
      console.error(`Resend exception para ${to}:`, e.message);
    }
  }

  // Disparar ambos os e-mails em paralelo (não bloqueia retorno ao cliente)
  await Promise.all([
    enviarEmail(email, 'Confirme seu agendamento', emailClienteHtml),
    enviarEmail('contato@hermidamaia.com.br', 'Novo agendamento recebido', emailSuporteHtml),
  ]);

  return new Response(JSON.stringify({ ok: true, eventId: eventData.id, agendamentoId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
