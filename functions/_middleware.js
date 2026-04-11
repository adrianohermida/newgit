// functions/_middleware.js
// Cloudflare Pages Middleware - valida variaveis de ambiente obrigatorias para /api/*
// Executa antes de qualquer funcao em functions/api/

const VARS_POR_ROTA = {
  "/api/slots": {
    required: [],
    requiredAny: [],
    oneOf: [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"],
      ["GOOGLE_ACCESS_TOKEN"],
    ],
  },
  "/api/slots-month": {
    required: [],
    requiredAny: [],
    oneOf: [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"],
      ["GOOGLE_ACCESS_TOKEN"],
    ],
  },
  "/api/agendar": {
    required: ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"],
    requiredAny: [["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]],
    oneOf: [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"],
      ["GOOGLE_ACCESS_TOKEN"],
    ],
  },
  "/api/confirmar": {
    required: ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"],
    requiredAny: [["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]],
    oneOf: [],
  },
  "/api/cancelar": {
    required: ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"],
    requiredAny: [["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]],
    oneOf: [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"],
      ["GOOGLE_ACCESS_TOKEN"],
    ],
  },
  "/api/remarcar": {
    required: ["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY"],
    requiredAny: [["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]],
    oneOf: [
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"],
      ["GOOGLE_ACCESS_TOKEN"],
    ],
  },
  "/api/freshdesk-ticket": {
    required: ["FRESHDESK_DOMAIN", "FRESHDESK_BASIC_TOKEN"],
    requiredAny: [],
    oneOf: [],
  },
  "/api/admin-agendamentos": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/admin-posts": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/admin-leads": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/admin-auth-config": {
    required: [],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/admin-portal-audit": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/client-profile": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/client-summary": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/client-consultas": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/client-processos": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/client-processo": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/client-publicacoes": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/client-documentos": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/client-financeiro": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
  "/api/client-tickets": {
    required: ["SUPABASE_SERVICE_ROLE_KEY"],
    requiredAny: [
      ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"],
      ["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    ],
    oneOf: [],
  },
};

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (!url.pathname.startsWith("/api/")) {
    return next();
  }

  const routeConfig = VARS_POR_ROTA[url.pathname] || {
    required: [],
    requiredAny: [],
    oneOf: [],
  };

  const ausentes = routeConfig.required.filter((variable) => !env[variable]);
  const ausentesAny = (routeConfig.requiredAny || [])
    .filter((group) => !group.some((variable) => !!env[variable]))
    .map((group) => group.join(" ou "));

  const oneOfSatisfied =
    routeConfig.oneOf.length === 0 ||
    routeConfig.oneOf.some((group) => group.every((variable) => !!env[variable]));

  if (ausentes.length > 0 || ausentesAny.length > 0 || !oneOfSatisfied) {
    const alternativas = !oneOfSatisfied
      ? routeConfig.oneOf.map((group) => group.join(" + "))
      : [];

    return new Response(
      JSON.stringify({
        ok: false,
        error: "Configuracao incompleta no servidor. Variaveis de ambiente ausentes.",
        ausentes,
        ausentes_any: ausentesAny,
        alternativas,
        route: url.pathname,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return next();
}
