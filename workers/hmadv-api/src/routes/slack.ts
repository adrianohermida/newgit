/**
 * Handler de rotas do Slack.
 * Porta a Pages Function: slack-events.
 */

import type { Env } from '../env.d';
import { methodNotAllowed } from '../lib/response';

function makeContext(request: Request, env: Env) {
  return { request, env, params: {}, next: async () => new Response('not found', { status: 404 }) };
}

export async function handleSlack(request: Request, env: Env): Promise<Response> {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204 });
  if (method !== 'POST') return methodNotAllowed(method);

  const { onRequestPost } = await import('../../../../functions/api/slack-events.js');
  return onRequestPost(makeContext(request, env));
}
