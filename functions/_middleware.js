// functions/_middleware.js
// Cloudflare Pages Middleware — valida variáveis de ambiente obrigatórias para /api/*
// Executa antes de qualquer função em functions/api/

const VARS_OBRIGATORIAS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_OAUTH_REFRESH_TOKEN',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
];

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Aplica validação apenas em /api/*
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  const ausentes = VARS_OBRIGATORIAS.filter(v => !env[v]);
  if (ausentes.length > 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Configuração incompleta no servidor. Variáveis de ambiente ausentes.',
        ausentes,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return next();
}
