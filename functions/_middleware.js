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
      'SUPABASE_URL',
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
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'RESEND_API_KEY',
    ],
    oneOf: [],
  },
  '/api/cancelar': {
    required: [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'RESEND_API_KEY',
    ],
    oneOf: [
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN'],
      ['GOOGLE_ACCESS_TOKEN'],
    ],
  },
  '/api/remarcar': {
    required: [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'RESEND_API_KEY',
    ],
    oneOf: [
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_OAUTH_REFRESH_TOKEN'],
      ['GOOGLE_ACCESS_TOKEN'],
    ],
  },
  '/api/freshdesk-ticket': {
    required: [
      'FRESHDESK_DOMAIN',
      'FRESHDESK_BASIC_TOKEN',
    ],
    oneOf: [],
  },
  '/api/admin-agendamentos': {
    required: [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
    oneOf: [
      ['SUPABASE_ANON_KEY'],
      ['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    ],
  },
  '/api/admin-posts': {
    required: [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
    oneOf: [
      ['SUPABASE_ANON_KEY'],
      ['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    ],
  },
  '/api/admin-leads': {
    required: [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'FRESHDESK_DOMAIN',
      'FRESHDESK_BASIC_TOKEN',
    ],
    oneOf: [
      ['SUPABASE_ANON_KEY'],
      ['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    ],
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
