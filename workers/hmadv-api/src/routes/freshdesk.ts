/**
 * Handler de rotas do Freshdesk.
 * Porta a Pages Function: freshdesk-ticket.
 */

import type { Env } from '../env.d';
import { methodNotAllowed } from '../lib/response';
import { missingEnvResponse } from '../lib/env';

function makeContext(request: Request, env: Env) {
  return { request, env, params: {}, next: async () => new Response('not found', { status: 404 }) };
}

export async function handleFreshdesk(request: Request, env: Env): Promise<Response> {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204 });
  if (method !== 'POST') return methodNotAllowed(method);

  const missing: string[] = [];
  if (!env.FRESHDESK_DOMAIN) missing.push('FRESHDESK_DOMAIN');
  if (!env.FRESHDESK_BASIC_TOKEN) missing.push('FRESHDESK_BASIC_TOKEN');
  if (missing.length) return missingEnvResponse(missing, '/api/freshdesk-ticket');

  const { onRequestPost } = await import('../../../../functions/api/freshdesk-ticket.js');
  return onRequestPost(makeContext(request, env));
}
