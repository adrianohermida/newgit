
// Função simples para gerar uuidv4-like (suficiente para ambiente Cloudflare)
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
    if (!tokenResp.ok) throw new Error('Erro ao obter access token do Google');
    const tokenData = await tokenResp.json();
    accessToken = tokenData.access_token;
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Erro ao obter access token do Google.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
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


  // Envio de e-mail de confirmação (MailChannels, Resend, etc)
  // Exemplo: MailChannels (Cloudflare)
  const siteUrl = env.SITE_URL || 'https://hermidamaia.adv.br';
  const linkConfirmacao = `${siteUrl}/api/confirmar?token=${tokenConfirmacao}`;
  const emailBody = `Olá, ${nome}!\n\nRecebemos seu pedido de agendamento para ${data} às ${hora}.\n\nPara confirmar, clique no link: ${linkConfirmacao}\n\nSe não foi você, ignore este e-mail.`;
  const suporteBody = `Novo agendamento:\nNome: ${nome}\nE-mail: ${email}\nTelefone: ${telefone}\nÁrea: ${area}\nData: ${data}\nHora: ${hora}\nToken: ${tokenConfirmacao}`;

  // Enviar para usuário
  await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }], dkim_domain: '', dkim_selector: '', dkim_private_key: '' }],
      from: { email: 'nao-responda@hermidamaia.com.br', name: 'Hermida Maia' },
      subject: 'Confirme seu agendamento',
      content: [{ type: 'text/plain', value: emailBody }],
    })
  });
  // Enviar para suporte
  await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: 'contato@hermidamaia.com.br' }] }],
      from: { email: 'nao-responda@hermidamaia.com.br', name: 'Hermida Maia' },
      subject: 'Novo agendamento recebido',
      content: [{ type: 'text/plain', value: suporteBody }],
    })
  });

  return new Response(JSON.stringify({ ok: true, eventId: eventData.id, agendamentoId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
