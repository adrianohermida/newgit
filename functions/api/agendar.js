import { getGoogleAccessToken } from '../lib/google-auth.js';
import { MINIMUM_LEAD_HOURS, isSlotBookable } from '../lib/slot-policy.js';
import { getSupabaseBaseUrl, getSupabaseServerKey, inspectSupabaseKey } from '../lib/env.js';
import { buildActionLinks, formatAgendamentoDate, INTERNAL_RECIPIENTS, sendTransactionalEmail, getSiteUrl } from '../lib/agendamento-helpers.js';
import { runAgendamentoBookedIntegrations } from '../lib/agendamento-integrations.js';

// FunÃ§Ã£o simples para gerar uuidv4-like (suficiente para ambiente Cloudflare)
// FunÃ§Ã£o para gerar uuidv4 (Cloudflare)
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

  // ValidaÃ§Ã£o de campos obrigatÃ³rios
  const camposFaltando = [];
  if (!nome) camposFaltando.push('Nome');
  if (!email) camposFaltando.push('E-mail');
  if (!telefone) camposFaltando.push('Telefone');
  if (!area) camposFaltando.push('Ãrea de interesse');
  if (!data) camposFaltando.push('Data');
  if (!hora) camposFaltando.push('Hora');
  if (camposFaltando.length > 0) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Por favor, preencha os seguintes campos obrigatÃ³rios: ${camposFaltando.join(', ')}.`
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // Checar se o slot estÃ¡ realmente disponÃ­vel no Google Calendar
  const slotStart = `${data}T${hora}:00-03:00`;
  const slotEndHour = String(Number(hora.split(':')[0]) + 1).padStart(2, '0');
  const slotEnd = `${data}T${slotEndHour}:${hora.split(':')[1]}:00-03:00`;
  const slotStartDate = new Date(slotStart);
  if (!isSlotBookable(slotStartDate)) {
    return new Response(JSON.stringify({
      ok: false,
      error: `Agendamentos devem respeitar antecedencia minima de ${MINIMUM_LEAD_HOURS} horas.`,
      stage: 'minimum_lead_time',
      minimumLeadHours: MINIMUM_LEAD_HOURS,
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  // 1. Obter access token usando refresh token
  let accessToken;
  let authMeta;
  try {
    authMeta = await getGoogleAccessToken(env);
    accessToken = authMeta.accessToken;
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
    return new Response(JSON.stringify({ ok: false, error: 'HorÃ¡rio jÃ¡ estÃ¡ ocupado. Escolha outro.' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  }

  // Gerar ID Ãºnico e token de confirmaÃ§Ã£o
  const agendamentoId = uuidv4();
  const tokenConfirmacao = uuidv4();
  const tokenCancelamento = uuidv4();
  const tokenRemarcacao = uuidv4();
  const adminTokenConfirmacao = uuidv4();
  const adminTokenCancelamento = uuidv4();
  const adminTokenRemarcacao = uuidv4();

  // Persistir no Supabase (inclui token de confirmaÃ§Ã£o)
  const supabaseUrl = getSupabaseBaseUrl(env);
  const supabaseKey = getSupabaseServerKey(env);
  const supabaseKeyMeta = inspectSupabaseKey(supabaseKey);
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Configuracao incompleta do sistema de agendamento.',
      stage: 'supabase_config',
      detail: 'SUPABASE_SERVICE_ROLE_KEY ausente.',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  if (supabaseKeyMeta.format === 'malformed_jwt') {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Chave do Supabase com formato invalido no ambiente.',
      stage: 'supabase_config',
      detail: `Formato detectado: ${supabaseKeyMeta.format} (dots=${supabaseKeyMeta.dotCount})`,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const nowIso = new Date().toISOString();
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
      observacoes: observacoes || null,
      status: 'pendente',
      token_confirmacao: tokenConfirmacao,
      token_cancelamento: tokenCancelamento,
      token_remarcacao: tokenRemarcacao,
      admin_token_confirmacao: adminTokenConfirmacao,
      admin_token_cancelamento: adminTokenCancelamento,
      admin_token_remarcacao: adminTokenRemarcacao,
      created_at: nowIso,
      updated_at: nowIso,
    })
  });
  if (!insertResp.ok) {
    const errorDetail = await insertResp.text().catch(() => '');
    console.error('Supabase insert error:', errorDetail || insertResp.status);
    const migrationHint = errorDetail.includes("admin_token_cancelamento")
      ? 'Execute a migration 003_add_agendamento_action_tokens.sql no Supabase.'
      : undefined;
    return new Response(JSON.stringify({
      ok: false,
      error: 'Erro ao salvar agendamento.',
      detail: errorDetail || `HTTP ${insertResp.status}`,
      stage: 'supabase_insert',
      migrationHint,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Criar evento no Google Calendar
  const eventResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `Consulta JurÃ­dica - ${area}`,
      description: `Cliente: ${nome} (${email})\nTelefone: ${telefone}\nObservaÃ§Ãµes: ${observacoes}`,
      start: { dateTime: slotStart, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: slotEnd, timeZone: 'America/Sao_Paulo' },
      attendees: [{ email }],
    })
  });
  if (!eventResp.ok) {
    const errorDetail = await eventResp.text().catch(() => '');
    console.error('Google Calendar create event error:', errorDetail || eventResp.status);

    // CompensaÃ§Ã£o: nÃ£o deixar registro pendente Ã³rfÃ£o se o evento nÃ£o foi criado.
    const rollbackResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamentoId}`, {
      method: 'DELETE',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
      },
    });
    if (!rollbackResp.ok) {
      const rollbackDetail = await rollbackResp.text().catch(() => '');
      console.error('Supabase rollback error:', rollbackDetail || rollbackResp.status);
    }

    return new Response(JSON.stringify({
      ok: false,
      error: 'Erro ao criar evento no Google Calendar.',
      detail: errorDetail || `HTTP ${eventResp.status}`,
      stage: 'google_calendar_create',
      rollbackOk: rollbackResp.ok,
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
  const eventData = await eventResp.json();
  const googleEventId = eventData.id || null;
  const integrationWarnings = [];
  const siteUrl = getSiteUrl(env);
  const actionLinks = buildActionLinks(siteUrl, {
    token_confirmacao: tokenConfirmacao,
    token_cancelamento: tokenCancelamento,
    token_remarcacao: tokenRemarcacao,
    admin_token_confirmacao: adminTokenConfirmacao,
    admin_token_cancelamento: adminTokenCancelamento,
    admin_token_remarcacao: adminTokenRemarcacao,
  });

  // Atualizar registro no Supabase com o ID do evento do Google Calendar
  if (googleEventId) {
    const updateResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamentoId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ google_event_id: googleEventId, updated_at: new Date().toISOString() }),
    });
    if (!updateResp.ok) {
      const updateDetail = await updateResp.text().catch(() => '');
      console.error('Supabase update google_event_id error:', updateDetail || updateResp.status);

      // CompensaÃ§Ã£o: remover o evento criado para nÃ£o deixar estado parcial entre Google e Supabase.
      const deleteEventResp = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      if (!deleteEventResp.ok) {
        const deleteEventDetail = await deleteEventResp.text().catch(() => '');
        console.error('Google Calendar rollback error:', deleteEventDetail || deleteEventResp.status);
      }

      const rollbackResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamentoId}`, {
        method: 'DELETE',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
        },
      });
      if (!rollbackResp.ok) {
        const rollbackDetail = await rollbackResp.text().catch(() => '');
        console.error('Supabase rollback after update failure error:', rollbackDetail || rollbackResp.status);
      }

      return new Response(JSON.stringify({
        ok: false,
        error: 'Evento criado no Google Calendar, mas falha ao atualizar o Supabase.',
        detail: updateDetail || `HTTP ${updateResp.status}`,
        stage: 'supabase_update_google_event_id',
        eventId: googleEventId,
        agendamentoId,
        googleRollbackOk: deleteEventResp.ok,
        supabaseRollbackOk: rollbackResp.ok,
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  context.waitUntil((async () => {\n    try {\n  let zoomSnapshot = null;
  if (googleEventId) {
    const integrationResult = await runAgendamentoBookedIntegrations(
      env,
      { supabaseUrl, supabaseKey },
      {
        id: agendamentoId,
        nome,
        email,
        telefone,
        area,
        data,
        hora,
        observacoes: observacoes || null,
        status: 'pendente',
        google_event_id: googleEventId,
      },
      { actionLinks }
    );
    zoomSnapshot = integrationResult.zoomSnapshot;
    integrationWarnings.push(...integrationResult.warnings);
  }

  // Envio de e-mail via Resend (https://resend.com)
  const dataFormatada = formatAgendamentoDate(data, hora);

  const emailClienteHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
  <h2 style="color:#C5A059;margin-top:0">Pedido de Agendamento Recebido</h2>
  <p>OlÃ¡, <strong>${nome}</strong>!</p>
  <p>Recebemos seu pedido de consulta jurÃ­dica. Use os links abaixo para confirmar, cancelar ou remarcar seu horÃ¡rio com seguranÃ§a.</p>
  <table style="width:100%;border-collapse:collapse;margin:24px 0">
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Ãrea</td><td style="padding:8px">${area}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Data</td><td style="padding:8px">${dataFormatada}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">HorÃ¡rio</td><td style="padding:8px">${hora}</td></tr>
    ${zoomSnapshot?.zoom_join_url ? `<tr><td style="padding:8px;color:#C5A059;font-weight:bold">Sala virtual</td><td style="padding:8px"><a href="${zoomSnapshot.zoom_join_url}" style="color:#C5A059">Acessar reuniÃ£o no Zoom</a></td></tr>` : ''}
  </table>
  <div style="margin:20px 0">
    <a href="${actionLinks.cliente.confirmar}" style="display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 8px 8px 0">Confirmar</a>
    <a href="${actionLinks.cliente.remarcar}" style="display:inline-block;background:#111827;color:#F4F1EA;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 8px 8px 0;border:1px solid #C5A059">Remarcar</a>
    <a href="${actionLinks.cliente.cancelar}" style="display:inline-block;background:#7f1d1d;color:#F4F1EA;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 0">Cancelar</a>
  </div>
  <p style="font-size:12px;color:#888;margin-top:24px">
    Os links sÃ£o protegidos e vinculados ao seu agendamento. Se nÃ£o foi vocÃª, ignore este e-mail.
  </p>
</div>`;

  const emailInternoHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Novo Agendamento â€” ${area}</h2>
  <p>Use os links abaixo para confirmar, cancelar ou remarcar este agendamento em nome do escritÃ³rio.</p>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px;font-weight:bold">Nome</td><td style="padding:6px">${nome}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">E-mail</td><td style="padding:6px">${email}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Telefone</td><td style="padding:6px">${telefone}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Data</td><td style="padding:6px">${data}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Hora</td><td style="padding:6px">${hora}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">ObservaÃ§Ãµes</td><td style="padding:6px">${observacoes || 'â€”'}</td></tr>
    ${zoomSnapshot?.zoom_join_url ? `<tr><td style="padding:6px;font-weight:bold">Zoom</td><td style="padding:6px"><a href="${zoomSnapshot.zoom_join_url}">${zoomSnapshot.zoom_join_url}</a></td></tr>` : ''}
  </table>
  <div style="margin:20px 0">
    <a href="${actionLinks.advogado.confirmar}" style="display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 8px 8px 0">Confirmar</a>
    <a href="${actionLinks.advogado.remarcar}" style="display:inline-block;background:#111827;color:#F4F1EA;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 8px 8px 0;border:1px solid #C5A059">Remarcar</a>
    <a href="${actionLinks.advogado.cancelar}" style="display:inline-block;background:#7f1d1d;color:#F4F1EA;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 0">Cancelar</a>
  </div>
</div>`;

  // Disparar ambos os e-mails em paralelo (nÃ£o bloqueia retorno ao cliente)
  await Promise.all([
    sendTransactionalEmail(env, email, 'Seu agendamento foi recebido', emailClienteHtml),
    sendTransactionalEmail(env, INTERNAL_RECIPIENTS, 'Novo agendamento recebido', emailInternoHtml),
  ]);\n    } catch (err) { console.error(err); }\n  })());

  return new Response(JSON.stringify({
    ok: true,
    eventId: eventData.id,
    agendamentoId,
    zoomMeetingId: zoomSnapshot?.zoom_meeting_id || null,
    zoomJoinUrl: zoomSnapshot?.zoom_join_url || null,
    authSource: authMeta?.source,
    warning: authMeta?.warning || undefined,
    integrationWarnings: integrationWarnings.length ? integrationWarnings : undefined,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}


