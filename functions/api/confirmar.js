import { getSupabaseBaseUrl, getSupabaseServerKey, inspectSupabaseKey } from '../lib/env.js';
import { INTERNAL_RECIPIENTS, buildActionLinks, formatAgendamentoDate, getSiteUrl, sendTransactionalEmail } from '../lib/agendamento-helpers.js';
import { runAgendamentoStatusIntegrations } from '../lib/agendamento-integrations.js';

// Cloudflare Pages Function para confirma├º├úo de agendamento via link seguro
// Endpoint: /functions/api/confirmar.js

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token')?.trim();
  const mode = url.searchParams.get('mode')?.trim();
  const wantsJson = mode === 'json' || (request.headers.get('accept') || '').includes('application/json');

  function jsonResponse(status, payload) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!token) {
    if (wantsJson) {
      return jsonResponse(400, { ok: false, status: 'erro', message: 'Token de confirma├º├úo ausente.' });
    }
    return new Response('Token de confirma├º├úo ausente.', { status: 400 });
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) {
    if (wantsJson) {
      return jsonResponse(400, { ok: false, status: 'erro', message: 'Token de confirma├º├úo inv├ílido.' });
    }
    return new Response('Token de confirma├º├úo inv├ílido.', { status: 400 });
  }

  // Buscar agendamento no Supabase pelo token (id ou campo token_confirmacao)
  const supabaseUrl = getSupabaseBaseUrl(env);
  const supabaseKey = getSupabaseServerKey(env);
  const supabaseKeyMeta = inspectSupabaseKey(supabaseKey);
  if (!supabaseUrl || !supabaseKey || supabaseKeyMeta.format === 'malformed_jwt') {
    console.error('Confirmar: configuracao invalida do Supabase.', supabaseKeyMeta);
    if (wantsJson) {
      return jsonResponse(500, { ok: false, status: 'erro', message: 'Configuracao interna invalida para confirmacao.' });
    }
    return new Response('Configuracao interna invalida para confirmacao.', { status: 500 });
  }
  const resp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?or=(${encodeURIComponent(`token_confirmacao.eq.${token},admin_token_confirmacao.eq.${token}`)})&select=*`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    console.error('Confirmar: erro ao consultar agendamento no Supabase:', detail || resp.status);
    if (wantsJson) {
      return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao consultar agendamento.' });
    }
    return new Response('Erro ao consultar agendamento.', { status: 500 });
  }
  const agendamentos = await resp.json();
  if (!agendamentos.length) {
    if (wantsJson) {
      return jsonResponse(404, { ok: false, status: 'erro', message: 'Token inv├ílido ou agendamento n├úo encontrado.' });
    }
    return new Response('Token inv├ílido ou agendamento n├úo encontrado.', { status: 404 });
  }
  const agendamento = agendamentos[0];
  const actor = agendamento.token_confirmacao === token ? 'cliente' : 'advogado';
  const siteUrl = getSiteUrl(env);
  const actionLinks = buildActionLinks(siteUrl, agendamento);
  if (agendamento.status === 'confirmado') {
    const confirmedLabel = agendamento.confirmed_at
      ? new Date(agendamento.confirmed_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : null;
    if (wantsJson) {
      return jsonResponse(200, {
        ok: true,
        status: 'ja_confirmado',
        message: 'Este agendamento j├í foi confirmado anteriormente.',
        confirmedAt: agendamento.confirmed_at || null,
        confirmedLabel,
      });
    }
    const htmlJaConfirmado = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>J├í Confirmado | Hermida Maia</title><style>body{margin:0;font-family:sans-serif;background:#050706;color:#F4F1EA;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.card{background:#111;border:1px solid #2D2E2E;border-radius:12px;padding:48px 32px;max-width:480px}.icon{font-size:48px;margin-bottom:16px}.title{color:#C5A059;font-size:24px;font-weight:bold;margin-bottom:12px}.btn{display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:16px}.meta{font-size:13px;color:#aaa;margin-top:12px}</style></head><body><div class="card"><div class="icon">Ôä╣´©Å</div><div class="title">Agendamento j├í confirmado</div><p>Este agendamento j├í foi confirmado anteriormente.</p>${confirmedLabel ? `<p class="meta">Confirmado em ${confirmedLabel}</p>` : ''}<a class="btn" href="https://hermidamaia.adv.br">Voltar ao site</a></div></body></html>`;
    return new Response(htmlJaConfirmado, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  }
  // Expira├º├úo do token: 24h ap├│s cria├º├úo
  const criadoEm = new Date(agendamento.created_at);
  const agora = new Date();
  const expirado = (agora - criadoEm) > 24 * 60 * 60 * 1000;
  if (expirado) {
    if (wantsJson) {
      return jsonResponse(410, { ok: false, status: 'expirado', message: 'Este link de confirma├º├úo expirou. Fa├ºa um novo agendamento.' });
    }
    const htmlExpirado = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Link Expirado | Hermida Maia</title><style>body{margin:0;font-family:sans-serif;background:#050706;color:#F4F1EA;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.card{background:#111;border:1px solid #2D2E2E;border-radius:12px;padding:48px 32px;max-width:480px}.icon{font-size:48px;margin-bottom:16px}.title{color:#C5A059;font-size:24px;font-weight:bold;margin-bottom:12px}.btn{display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:16px}</style></head><body><div class="card"><div class="icon">ÔÅ░</div><div class="title">Link expirado</div><p>Este link de confirma├º├úo expirou (v├ílido por 24h). Fa├ºa um novo agendamento.</p><a class="btn" href="https://hermidamaia.adv.br/agendamento">Agendar novamente</a></div></body></html>`;
    return new Response(htmlExpirado, { status: 410, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  }

  // Atualizar status para confirmado
  const confirmedAt = new Date().toISOString();
  const updateResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamento.id}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ status: 'confirmado', confirmed_at: confirmedAt, updated_at: confirmedAt })
  });
  if (!updateResp.ok) {
    const detail = await updateResp.text().catch(() => '');
    console.error('Confirmar: erro ao atualizar status no Supabase:', detail || updateResp.status);
    if (wantsJson) {
      return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao confirmar agendamento.' });
    }
    return new Response('Erro ao confirmar agendamento.', { status: 500 });
  }
  const updatedRows = await updateResp.json().catch(() => []);
  if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
    console.error('Confirmar: atualiza├º├úo sem linhas retornadas para o token:', token);
    if (wantsJson) {
      return jsonResponse(500, { ok: false, status: 'erro', message: 'Erro ao confirmar agendamento.' });
    }
    return new Response('Erro ao confirmar agendamento.', { status: 500 });
  }
  let agendamentoConfirmado = updatedRows[0];
  let integrationWarnings = [];
  const integrationResult = await runAgendamentoStatusIntegrations(
    env,
    { supabaseUrl, supabaseKey },
    { ...agendamentoConfirmado, confirmation_clicked_at: confirmedAt },
    'confirmed',
    { actionLinks }
  );
  integrationWarnings = integrationResult.warnings;
  if (integrationResult.zoomSnapshot) {
    agendamentoConfirmado = { ...agendamentoConfirmado, ...integrationResult.zoomSnapshot };
  }

  // Montar e-mails de confirma├º├úo
  const dataFormatada = formatAgendamentoDate(agendamento.data, '12:00');

  const emailClienteHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#050706;color:#F4F1EA;padding:32px;border-radius:12px">
  <h2 style="color:#C5A059;margin-top:0">Consulta Confirmada!</h2>
  <p>Ol├í, <strong>${agendamento.nome}</strong>!</p>
  <p>Sua consulta jur├¡dica foi confirmada com sucesso. Aguardamos voc├¬ no dia e hor├írio abaixo.</p>
  <table style="width:100%;border-collapse:collapse;margin:24px 0">
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">├ürea</td><td style="padding:8px">${agendamento.area}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Data</td><td style="padding:8px">${dataFormatada}</td></tr>
    <tr><td style="padding:8px;color:#C5A059;font-weight:bold">Hor├írio</td><td style="padding:8px">${agendamento.hora}</td></tr>
    ${agendamentoConfirmado.zoom_join_url ? `<tr><td style="padding:8px;color:#C5A059;font-weight:bold">Sala virtual</td><td style="padding:8px"><a href="${agendamentoConfirmado.zoom_join_url}" style="color:#C5A059">Entrar na reuni├úo do Zoom</a></td></tr>` : ''}
  </table>
  <div style="margin:20px 0">
    <a href="${actionLinks.cliente.remarcar}" style="display:inline-block;background:#111827;color:#F4F1EA;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 8px 8px 0;border:1px solid #C5A059">Remarcar</a>
    <a href="${actionLinks.cliente.cancelar}" style="display:inline-block;background:#7f1d1d;color:#F4F1EA;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;margin:8px 0">Cancelar</a>
  </div>
  <p style="font-size:13px;color:#aaa">Em caso de d├║vidas, acesse <a href="https://hermidamaia.adv.br" style="color:#C5A059">hermidamaia.adv.br</a> ou entre em contato conosco.</p>
</div>`;

  const emailEscritorioHtml = `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
  <h2>Agendamento Confirmado pelo Cliente ÔÇö ${agendamento.area}</h2>
  <table style="border-collapse:collapse;width:100%">
    <tr><td style="padding:6px;font-weight:bold">Nome</td><td style="padding:6px">${agendamento.nome}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">E-mail</td><td style="padding:6px">${agendamento.email}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Telefone</td><td style="padding:6px">${agendamento.telefone}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">├ürea</td><td style="padding:6px">${agendamento.area}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Data</td><td style="padding:6px">${agendamento.data}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Hora</td><td style="padding:6px">${agendamento.hora}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Observa├º├Áes</td><td style="padding:6px">${agendamento.observacoes || 'ÔÇö'}</td></tr>
    <tr><td style="padding:6px;font-weight:bold">Google Event ID</td><td style="padding:6px;font-size:12px">${agendamento.google_event_id || 'ÔÇö'}</td></tr>
    ${agendamentoConfirmado.zoom_join_url ? `<tr><td style="padding:6px;font-weight:bold">Zoom</td><td style="padding:6px"><a href="${agendamentoConfirmado.zoom_join_url}">${agendamentoConfirmado.zoom_join_url}</a></td></tr>` : ''}
  </table>
</div>`;

  await Promise.all([
    sendTransactionalEmail(env, agendamentoConfirmado.email, 'Sua consulta est├í confirmada - Hermida Maia Advocacia', emailClienteHtml),
    sendTransactionalEmail(env, INTERNAL_RECIPIENTS, `Agendamento confirmado ÔÇö ${agendamentoConfirmado.nome}`, `${emailEscritorioHtml}<p style="font-family:sans-serif">A├º├úo realizada por: <strong>${actor}</strong>.</p>`),
  ]);

  if (wantsJson) {
    return jsonResponse(200, {
      ok: true,
      status: 'confirmado',
      message: 'Sua consulta foi confirmada com sucesso.',
      confirmedAt,
      integrationWarnings: integrationWarnings.length ? integrationWarnings : undefined,
    });
  }

  // P├ígina de sucesso
  const htmlSucesso = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agendamento Confirmado | Hermida Maia</title><style>body{margin:0;font-family:sans-serif;background:#050706;color:#F4F1EA;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.card{background:#111;border:1px solid #2D2E2E;border-radius:12px;padding:48px 32px;max-width:480px}.icon{font-size:48px;margin-bottom:16px}.title{color:#C5A059;font-size:24px;font-weight:bold;margin-bottom:12px}.sub{color:#F4F1EA;opacity:.8;margin-bottom:24px}.btn{display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none}</style></head><body><div class="card"><div class="icon">Ô£à</div><div class="title">Agendamento Confirmado!</div><p class="sub">Sua consulta est├í agendada. Entraremos em contato para mais detalhes.</p><a class="btn" href="https://hermidamaia.adv.br">Voltar ao site</a></div></body></html>`;
  return new Response(htmlSucesso, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}
