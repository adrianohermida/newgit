import {
  INTERNAL_RECIPIENTS,
  patchAgendamento,
  formatAgendamentoDate,
  getSupabaseContext,
  fetchAgendamentoByToken,
  jsonResponse,
  sendTransactionalEmail,
  deleteGoogleEvent,
} from '../lib/agendamento-helpers.js';
import { getGoogleAccessToken } from '../lib/google-auth.js';

const TOKEN_MAPPINGS = [
  { field: 'token_cancelamento', actor: 'cliente' },
  { field: 'admin_token_cancelamento', actor: 'advogado' },
];

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim();
  const wantsJson = url.searchParams.get('mode') === 'json' || (request.headers.get('accept') || '').includes('application/json');

  if (!token) {
    return jsonResponse(400, { ok: false, status: 'erro', message: 'Token de cancelamento ausente.' });
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
      status: row.status === 'cancelado' ? 'ja_cancelado' : 'pronto_para_cancelar',
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
      message: row.status === 'cancelado'
        ? 'Este agendamento já foi cancelado anteriormente.'
        : 'Confirme o cancelamento para liberar o horário.',
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao carregar dados do cancelamento.', detail: error.message });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { token } = await request.json().catch(() => ({}));
  if (!token) {
    return jsonResponse(400, { ok: false, status: 'erro', message: 'Token de cancelamento ausente.' });
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
    return jsonResponse(200, { ok: true, status: 'ja_cancelado', message: 'Este agendamento já estava cancelado.' });
  }

  try {
    const { accessToken } = await getGoogleAccessToken(env);
    const deleteResult = await deleteGoogleEvent(accessToken, row.google_event_id);
    if (!deleteResult.ok) {
      return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao cancelar evento no Google Calendar.', detail: deleteResult.detail });
    }
  } catch (error) {
    return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao autenticar com Google Calendar.', detail: error.message });
  }

  const cancelledAt = new Date().toISOString();
  let updated;
  try {
    updated = await patchAgendamento(supabase.supabaseUrl, supabase.supabaseKey, row.id, {
      status: 'cancelado',
      cancelled_at: cancelledAt,
      cancelled_by: actor,
      updated_at: cancelledAt,
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao cancelar agendamento.', detail: error.message });
  }

  const dataFormatada = formatAgendamentoDate(updated.data, '12:00');
  const emailClienteHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
  <h2 style="color:#C5A059;margin-top:0">Agendamento Cancelado</h2>
  <p>Olá, <strong>${updated.nome}</strong>!</p>
  <p>Seu agendamento em ${dataFormatada}, às ${updated.hora}, foi cancelado com sucesso.</p>
  <p style="font-size:13px;color:#aaa">Se precisar, você pode solicitar um novo horário em hermidamaia.adv.br/agendamento.</p>
</div>`;

  const emailInternoHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Agendamento Cancelado — ${updated.nome}</h2>
  <p>Ação realizada por: <strong>${actor}</strong>.</p>
  <p>${updated.area} | ${updated.data} | ${updated.hora}</p>
</div>`;

  await Promise.all([
    sendTransactionalEmail(env, updated.email, 'Seu agendamento foi cancelado - Hermida Maia Advocacia', emailClienteHtml),
    sendTransactionalEmail(env, INTERNAL_RECIPIENTS, `Agendamento cancelado — ${updated.nome}`, emailInternoHtml),
  ]);

  return jsonResponse(200, { ok: true, status: 'cancelado', message: 'Agendamento cancelado com sucesso.' });
}
