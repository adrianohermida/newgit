// functions/_middleware.js
// Cloudflare Pages Middleware — valida variáveis de ambiente obrigatórias para /api/*
// Executa antes de qualquer função em functions/api/

const VARS_POR_ROTA = {
  '/api/slots': {
    required: [],
    oneOf: [
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN'],
      ['GOOGLE_ACCESS_TOKEN'],
    ],
  },
  '/api/slots-month': {
    required: [],
    oneOf: [
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN'],
      ['GOOGLE_ACCESS_TOKEN'],
    ],
  },
  '/api/agendar': {
    required: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'RESEND_API_KEY',
    ],
    oneOf: [
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN'],
      ['GOOGLE_ACCESS_TOKEN'],
    ],
  },
  '/api/confirmar': {
    required: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'RESEND_API_KEY',
    ],
    oneOf: [],
  },
  '/api/freshdesk-ticket': {
    required: [
      'FRESHDESK_DOMAIN',
      'FRESHDESK_BASIC_TOKEN',
    ],
    oneOf: [],
  },
};

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Aplica validação apenas em /api/*
  if (!url.pathname.startsWith('/api/')) {
    return next();
  }

  const routeConfig = VARS_POR_ROTA[url.pathname] || { required: [], oneOf: [] };
  const ausentes = routeConfig.required.filter(v => !env[v]);
  const oneOfSatisfied = routeConfig.oneOf.length === 0 || routeConfig.oneOf.some(
    (group) => group.every((variable) => !!env[variable])
  );

  if (ausentes.length > 0 || !oneOfSatisfied) {
    const alternativas = !oneOfSatisfied
      ? routeConfig.oneOf.map((group) => group.join(' + '))
      : [];
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Configuração incompleta no servidor. Variáveis de ambiente ausentes.',
        ausentes,
        alternativas,
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
