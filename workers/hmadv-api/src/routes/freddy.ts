/**
 * Handler de rotas do Freddy (memória e ações CRM).
 * Porta as Pages Functions: freddy-*.
 */

import type { Env } from '../env.d';
import { jsonError, methodNotAllowed } from '../lib/response';

function makeContext(request: Request, env: Env) {
  return { request, env, params: {}, next: async () => new Response('not found', { status: 404 }) };
}

const FREDDY_ROUTES: Record<string, string> = {
  '/api/freddy-get-contact-360': '../../../../functions/api/freddy-get-contact-360.js',
  '/api/freddy-save-memory':     '../../../../functions/api/freddy-save-memory.js',
  '/api/freddy-save-outcome':    '../../../../functions/api/freddy-save-outcome.js',
  '/api/freddy-search-memory':   '../../../../functions/api/freddy-search-memory.js',
};

export async function handleFreddy(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  const modulePath = FREDDY_ROUTES[pathname];
  if (!modulePath) return jsonError(`Rota Freddy não encontrada: ${pathname}`, 404);

  try {
    const mod = await import(modulePath);
    const ctx = makeContext(request, env);
    if (method === 'GET' && mod.onRequestGet) return mod.onRequestGet(ctx);
    if (method === 'POST' && mod.onRequestPost) return mod.onRequestPost(ctx);
    if (mod.onRequest) return mod.onRequest(ctx);
    return methodNotAllowed(method);
  } catch (err: any) {
    return jsonError(err?.message || 'Erro interno na rota Freddy.', 500);
  }
}
