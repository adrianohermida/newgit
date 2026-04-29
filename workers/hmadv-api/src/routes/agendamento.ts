/**
 * Handler de agendamento pÃºblico.
 * Porta as Pages Functions: slots, slots2, slots-month, agendar, confirmar, cancelar, remarcar.
 *
 * As libs originais em functions/lib/ sÃ£o importadas via alias configurado no tsconfig.
 * O wrangler bundla tudo em um Ãºnico script, entÃ£o os imports relativos funcionam.
 */

import type { Env } from '../env.d';
import { jsonError, methodNotAllowed } from '../lib/response';
import { getSupabaseBaseUrl, getSupabaseServiceKey, missingEnvResponse } from '../lib/env';

// Adapta o contexto de Pages Function para o padrÃ£o do Worker
function makeContext(request: Request, env: Env) {
  return { request, env, params: {}, next: async () => new Response('not found', { status: 404 }) };
}

export async function handleAgendamento(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const method = request.method;

  // â”€â”€ GET /api/slots â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (pathname === '/api/slots') {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (method !== 'GET') return methodNotAllowed(method);
    const { onRequestGet } = await import('../../../../functions/api/slots.js');
    return onRequestGet(makeContext(request, env));
  }

  // â”€â”€ GET /api/slots2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (pathname === '/api/slots2') {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (method !== 'GET') return methodNotAllowed(method);
    const { onRequestGet } = await import('../../../../functions/api/slots2.js');
    return onRequestGet(makeContext(request, env));
  }

  // â”€â”€ GET /api/slots-month â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (pathname === '/api/slots-month') {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (method !== 'GET') return methodNotAllowed(method);
    const { onRequestGet } = await import('../../../../functions/api/slots-month.js');
    return onRequestGet(makeContext(request, env));
  }

  // â”€â”€ POST /api/agendar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (pathname === '/api/agendar') {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (method !== 'POST' && method !== 'GET') return methodNotAllowed(method);
    const missing: string[] = [];
    if (!getSupabaseBaseUrl(env)) missing.push('SUPABASE_URL');
    if (!getSupabaseServiceKey(env)) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
    if (missing.length) return missingEnvResponse(missing, pathname);
    const { onRequestPost } = await import('../../../../functions/api/agendar.js');
    return onRequestPost(makeContext(request, env));
  }

  // â”€â”€ POST /api/confirmar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (pathname === '/api/confirmar') {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (method !== 'POST' && method !== 'GET') return methodNotAllowed(method);
    const missing: string[] = [];
    if (!getSupabaseBaseUrl(env)) missing.push('SUPABASE_URL');
    if (!getSupabaseServiceKey(env)) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
    if (missing.length) return missingEnvResponse(missing, pathname);
    const { onRequestPost } = await import('../../../../functions/api/confirmar.js');
    return onRequestPost(makeContext(request, env));
  }

  // â”€â”€ POST /api/cancelar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (pathname === '/api/cancelar') {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (method !== 'POST' && method !== 'GET') return methodNotAllowed(method);
    const missing: string[] = [];
    if (!getSupabaseBaseUrl(env)) missing.push('SUPABASE_URL');
    if (!getSupabaseServiceKey(env)) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
    if (missing.length) return missingEnvResponse(missing, pathname);
    const { onRequestPost } = await import('../../../../functions/api/cancelar.js');
    return onRequestPost(makeContext(request, env));
  }

  // â”€â”€ POST /api/remarcar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (pathname === '/api/remarcar') {
    if (method === 'OPTIONS') return new Response(null, { status: 204 });
    if (method !== 'POST' && method !== 'GET') return methodNotAllowed(method);
    const missing: string[] = [];
    if (!getSupabaseBaseUrl(env)) missing.push('SUPABASE_URL');
    if (!getSupabaseServiceKey(env)) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
    if (missing.length) return missingEnvResponse(missing, pathname);
    const { onRequestPost } = await import('../../../../functions/api/remarcar.js');
    return onRequestPost(makeContext(request, env));
  }

  return jsonError('Rota de agendamento nÃ£o encontrada', 404);
}


