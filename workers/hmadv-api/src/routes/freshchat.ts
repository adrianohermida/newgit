/**
 * Handler de rotas do Freshchat.
 * Porta as Pages Functions: freshchat-jwt, freshchat-widget-event.
 */

import type { Env } from '../env.d';
import { jsonError, methodNotAllowed } from '../lib/response';

function makeContext(request: Request, env: Env) {
  return { request, env, params: {}, next: async () => new Response('not found', { status: 404 }) };
}

export async function handleFreshchat(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  if (pathname === '/api/freshchat-jwt') {
    const { onRequestPost } = await import('../../../../functions/api/freshchat-jwt.js');
    if (method !== 'POST') return methodNotAllowed(method);
    return onRequestPost(makeContext(request, env));
  }

  if (pathname === '/api/freshchat-widget-event') {
    const { onRequestPost } = await import('../../../../functions/api/freshchat-widget-event.js');
    if (method !== 'POST') return methodNotAllowed(method);
    return onRequestPost(makeContext(request, env));
  }

  return jsonError(`Rota Freshchat não encontrada: ${pathname}`, 404);
}
