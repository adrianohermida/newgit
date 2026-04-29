import {
  INTERNAL_RECIPIENTS,
  buildActionLinks,
  ensureSlotAvailable,
  fetchAgendamentoByToken,
  formatAgendamentoDate,
  getSiteUrl,
  getSupabaseContext,
  jsonResponse,
  patchAgendamento,
  sendTransactionalEmail,
  upsertGoogleEvent,
} from '../lib/agendamento-helpers.js';
import { runAgendamentoStatusIntegrations } from '../lib/agendamento-integrations.js';

const TOKEN_MAPPINGS = [
  { field: 'token_remarcacao', actor: 'cliente' },
  { field: 'admin_token_remarcacao', actor: 'advogado' },
];

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim();

  if (!token) {
    return jsonResponse(400, { ok: false, status: 'erro', message: 'Token de remarcação ausente.' });
  }

  const supabase = getSupabaseContext(env);
  if (!supabase.ok) {
    return supabase.response;
  }

  try {
    const result = await fetchAgendamentoByToken(supabase.supabaseUrl, supabase.supabaseKey, token, TOKEN_MAPPINGS);
    if (!result) {
      return jsonResponse(404, { ok: false, status: 'erro', message: 'Agendamento não encontrado para este link.' });
    }

    const { row, actor } = result;
    return jsonResponse(200, {
      ok: true,
      status: 'pronto_para_remarcar',
      actor,
      agendamento: {
        id: row.id,
        nome: row.nome,
        area: row.area,
        data: row.data,
        hora: row.hora,
        status: row.status,
        dataFormatada: formatAgendamentoDate(row.data, '12:00'),
      },
      message: 'Escolha um novo horário disponível para concluir a remarcação.',
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao carregar dados da remarcação.', detail: error.message });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { token, data, hora } = await request.json().catch(() => ({}));
  if (!token || !data || !hora) {
    return jsonResponse(400, { ok: false, status: 'erro', message: 'Informe token, data e hora para remarcar.' });
  }

  const supabase = getSupabaseContext(env);
  if (!supabase.ok) {
    return supabase.response;
  }

  let result;
  try {
    result = await fetchAgendamentoByToken(supabase.supabaseUrl, supabase.supabaseKey, token, TOKEN_MAPPINGS);
  } catch (error) {
    return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao localizar o agendamento.', detail: error.message });
  }

  if (!result) {
    return jsonResponse(404, { ok: false, status: 'erro', message: 'Agendamento não encontrado para este link.' });
  }

  const { row, actor } = result;
  if (row.status === 'cancelado') {
    return jsonResponse(409, { ok: false, status: 'erro', message: 'Agendamentos cancelados não podem ser remarcados.' });
  }
  if (row.data === data && row.hora === hora) {
    return jsonResponse(400, { ok: false, status: 'erro', message: 'Escolha um horário diferente do atual para remarcar.' });
  }

  const slotCheck = await ensureSlotAvailable(env, data, hora, row.google_event_id);
  if (!slotCheck.ok) {
    return slotCheck.response;
  }

  let googleEvent;
  try {
    googleEvent = await upsertGoogleEvent(slotCheck.accessToken, row, data, hora);
  } catch (error) {
    return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao atualizar evento no Google Calendar.', detail: error.message });
  }

  const nowIso = new Date().toISOString();
  let updated;
  try {
    updated = await patchAgendamento(supabase.supabaseUrl, supabase.supabaseKey, row.id, {
      original_data: row.data,
      original_hora: row.hora,
      data,
      hora,
      google_event_id: googleEvent.id || row.google_event_id,
      status: 'confirmado',
      confirmed_at: row.confirmed_at || nowIso,
      rescheduled_at: nowIso,
      rescheduled_by: actor,
      updated_at: nowIso,
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao atualizar agendamento no Supabase.', detail: error.message });
  }

  const integrationResult = await runAgendamentoStatusIntegrations(
    env,
    supabase,
    { ...updated, remarcacao_clicked_at: nowIso },
    'rescheduled',
    { actionLinks: buildActionLinks(getSiteUrl(env), updated) }
  );
  const integrationWarnings = integrationResult.warnings;
  if (integrationResult.zoomSnapshot) {
    updated = { ...updated, ...integrationResult.zoomSnapshot };
  }

  const siteUrl = getSiteUrl(env);
  const actionLinks = buildActionLinks(siteUrl, updated);
  const dataFormatada = formatAgendamentoDate(updated.data, '12:00');
  const originalDataFormatada = formatAgendamentoDate(row.data, '12:00');

  const emailClienteHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
  <h2 style="color:#C5A059;margin-top:0">Agendamento Remarcado</h2>
  <p>Olá, <strong>${updated.nome}</strong>!</p>
  <p>Seu atendimento foi remarcado com sucesso.</p>
  <table style="width:100%;border-collapse:collapse;margin:24px 0">
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Horário anterior</td><td style="padding:8px">${originalDataFormatada} às ${row.hora}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Novo horário</td><td style="padding:8px">${dataFormatada} às ${updated.hora}</td></tr>
    ${updated.zoom_join_url ? `<tr><td style="padding:8px;color:#C5A059;font-weight:bold">Sala virtual</td><td style="padding:8px"><a href="${updated.zoom_join_url}" style="color:#C5A059">Entrar na reunião do Zoom</a></td></tr>` : ''}
  </table>
  <div style="margin:20px 0">
    <a href="${actionLinks.cliente.confirmar}" style="display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 8px 8px 0">Confirmar</a>
    <a href="${actionLinks.cliente.cancelar}" style="display:inline-block;background:#7f1d1d;color:#F4F1EA;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 0">Cancelar</a>
  </div>
</div>`;

  const emailInternoHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Agendamento Remarcado — ${updated.nome}</h2>
  <p>Ação realizada por: <strong>${actor}</strong>.</p>
  <p>Anterior: ${row.data} às ${row.hora}</p>
  <p>Novo: ${updated.data} às ${updated.hora}</p>
</div>`;

  await Promise.all([
    sendTransactionalEmail(env, updated.email, 'Seu agendamento foi remarcado - Hermida Maia Advocacia', emailClienteHtml),
    sendTransactionalEmail(env, INTERNAL_RECIPIENTS, `Agendamento remarcado — ${updated.nome}`, emailInternoHtml),
  ]);

  return jsonResponse(200, {
    ok: true,
    status: 'remarcado',
    message: 'Agendamento remarcado com sucesso.',
    zoomJoinUrl: updated.zoom_join_url || null,
    integrationWarnings: integrationWarnings.length ? integrationWarnings : undefined,
  });
}
