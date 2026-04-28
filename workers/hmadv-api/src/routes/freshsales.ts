/**
 * Handler de rotas do Freshsales.
 * Porta as Pages Functions: freshsales-fields-catalog, admin-freshsales-*.
 */

import type { Env } from '../env.d';
import { jsonError, methodNotAllowed } from '../lib/response';

function makeContext(request: Request, env: Env) {
  return { request, env, params: {}, next: async () => new Response('not found', { status: 404 }) };
}

export async function handleFreshsales(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  if (pathname === '/api/freshsales-fields-catalog') {
    const mod = await import('../../../../functions/api/freshsales-fields-catalog.js');
    const ctx = makeContext(request, env);
    if (method === 'GET' && mod.onRequestGet) return mod.onRequestGet(ctx);
    if (mod.onRequest) return mod.onRequest(ctx);
    return methodNotAllowed(method);
  }

  if (pathname === '/api/admin-freshsales-catalog') {
    const mod = await import('../../../../functions/api/admin-freshsales-catalog.js');
    const ctx = makeContext(request, env);
    if (method === 'GET' && mod.onRequestGet) return mod.onRequestGet(ctx);
    if (mod.onRequest) return mod.onRequest(ctx);
    return methodNotAllowed(method);
  }

  if (pathname === '/api/admin-freshsales-deal-fields') {
    const mod = await import('../../../../functions/api/admin-freshsales-deal-fields.js');
    const ctx = makeContext(request, env);
    if (method === 'GET' && mod.onRequestGet) return mod.onRequestGet(ctx);
    if (mod.onRequest) return mod.onRequest(ctx);
    return methodNotAllowed(method);
  }

  return jsonError(`Rota Freshsales não encontrada: ${pathname}`, 404);
}
