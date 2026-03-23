// functions/_middleware.js
// Cloudflare Pages Middleware — valida variáveis de ambiente obrigatórias para /api/*
// Executa antes de qualquer função em functions/api/

const VARS_POR_ROTA = {
  '/api/slots': [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_OAUTH_REFRESH_TOKEN',
  ],
  '/api/slots-month': [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_OAUTH_REFRESH_TOKEN',
  ],
  '/api/agendar': [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_OAUTH_REFRESH_TOKEN',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RESEND_API_KEY',
  ],
  '/api/confirmar': [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'RESEND_API_KEY',
  ],
};

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Aplica validação apenas em /api/*
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  const varsObrigatorias = VARS_POR_ROTA[url.pathname] || [];
  const ausentes = varsObrigatorias.filter(v => !env[v]);
  if (ausentes.length > 0) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Configuração incompleta no servidor. Variáveis de ambiente ausentes.',
        ausentes,
        route: url.pathname,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  return next();
}
