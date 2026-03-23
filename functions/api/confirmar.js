// Cloudflare Pages Function para confirmação de agendamento via link seguro
// Endpoint: /functions/api/confirmar.js

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) {
    return new Response('Token de confirmação ausente.', { status: 400 });
  }

  // Buscar agendamento no Supabase pelo token (id ou campo token_confirmacao)
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const resp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?token_confirmacao=eq.${token}`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!resp.ok) {
    return new Response('Erro ao consultar agendamento.', { status: 500 });
  }
  const agendamentos = await resp.json();
  if (!agendamentos.length) {
    return new Response('Token inválido ou agendamento não encontrado.', { status: 404 });
  }
  const agendamento = agendamentos[0];
  if (agendamento.status === 'confirmado') {
    const htmlJaConfirmado = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Já Confirmado | Hermida Maia</title><style>body{margin:0;font-family:sans-serif;background:#050706;color:#F4F1EA;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.card{background:#111;border:1px solid #2D2E2E;border-radius:12px;padding:48px 32px;max-width:480px}.icon{font-size:48px;margin-bottom:16px}.title{color:#C5A059;font-size:24px;font-weight:bold;margin-bottom:12px}.btn{display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:16px}</style></head><body><div class="card"><div class="icon">ℹ️</div><div class="title">Agendamento já confirmado</div><p>Este agendamento já foi confirmado anteriormente.</p><a class="btn" href="https://hermidamaia.adv.br">Voltar ao site</a></div></body></html>`;
    return new Response(htmlJaConfirmado, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  }
  // Expiração do token: 24h após criação
  const criadoEm = new Date(agendamento.created_at);
  const agora = new Date();
  const expirado = (agora - criadoEm) > 24 * 60 * 60 * 1000;
  if (expirado) {
    const htmlExpirado = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Link Expirado | Hermida Maia</title><style>body{margin:0;font-family:sans-serif;background:#050706;color:#F4F1EA;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.card{background:#111;border:1px solid #2D2E2E;border-radius:12px;padding:48px 32px;max-width:480px}.icon{font-size:48px;margin-bottom:16px}.title{color:#C5A059;font-size:24px;font-weight:bold;margin-bottom:12px}.btn{display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;margin-top:16px}</style></head><body><div class="card"><div class="icon">⏰</div><div class="title">Link expirado</div><p>Este link de confirmação expirou (válido por 24h). Faça um novo agendamento.</p><a class="btn" href="https://hermidamaia.adv.br/agendamento">Agendar novamente</a></div></body></html>`;
    return new Response(htmlExpirado, { status: 410, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
  }

  // Atualizar status para confirmado
  const updateResp = await fetch(`${supabaseUrl}/rest/v1/agendamentos?id=eq.${agendamento.id}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ status: 'confirmado', updated_at: new Date().toISOString() })
  });
  if (!updateResp.ok) {
    return new Response('Erro ao confirmar agendamento.', { status: 500 });
  }

  // Página de sucesso
  const htmlSucesso = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Agendamento Confirmado | Hermida Maia</title><style>body{margin:0;font-family:sans-serif;background:#050706;color:#F4F1EA;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}.card{background:#111;border:1px solid #2D2E2E;border-radius:12px;padding:48px 32px;max-width:480px}.icon{font-size:48px;margin-bottom:16px}.title{color:#C5A059;font-size:24px;font-weight:bold;margin-bottom:12px}.sub{color:#F4F1EA;opacity:.8;margin-bottom:24px}.btn{display:inline-block;background:#C5A059;color:#050706;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none}</style></head><body><div class="card"><div class="icon">✅</div><div class="title">Agendamento Confirmado!</div><p class="sub">Sua consulta está agendada. Entraremos em contato para mais detalhes.</p><a class="btn" href="https://hermidamaia.adv.br">Voltar ao site</a></div></body></html>`;
  return new Response(htmlSucesso, { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
}
