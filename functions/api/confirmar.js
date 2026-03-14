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
    return new Response('Agendamento já confirmado.', { status: 200 });
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

  // Mensagem de sucesso
  return new Response('Agendamento confirmado com sucesso!');
}
