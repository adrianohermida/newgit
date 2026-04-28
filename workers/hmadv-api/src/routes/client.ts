/**
 * Handler de rotas de cliente (portal).
 * Porta as Pages Functions: client-*.
 */

import type { Env } from '../env.d';
import { jsonError, methodNotAllowed } from '../lib/response';
import { getSupabaseBaseUrl, getSupabaseServiceKey, missingEnvResponse } from '../lib/env';

function makeContext(request: Request, env: Env) {
  return { request, env, params: {}, next: async () => new Response('not found', { status: 404 }) };
}

const CLIENT_ROUTES: Record<string, string> = {
  '/api/client-consultas':    '../../../../functions/api/client-consultas.js',
  '/api/client-documentos':   '../../../../functions/api/client-documentos.js',
  '/api/client-financeiro':   '../../../../functions/api/client-financeiro.js',
  '/api/client-jobs':         '../../../../functions/api/client-jobs.js',
  '/api/client-processo':     '../../../../functions/api/client-processo.js',
  '/api/client-processos':    '../../../../functions/api/client-processos.js',
  '/api/client-profile':      '../../../../functions/api/client-profile.js',
  '/api/client-publicacoes':  '../../../../functions/api/client-publicacoes.js',
  '/api/client-summary':      '../../../../functions/api/client-summary.js',
  '/api/client-tickets':      '../../../../functions/api/client-tickets.js',
};

export async function handleClient(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  const modulePath = CLIENT_ROUTES[pathname];
  if (!modulePath) return jsonError(`Rota de cliente não encontrada: ${pathname}`, 404);

  // Todas as rotas de cliente exigem Supabase
  const missing: string[] = [];
  if (!getSupabaseBaseUrl(env)) missing.push('SUPABASE_URL');
  if (!getSupabaseServiceKey(env)) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) return missingEnvResponse(missing, pathname);

  try {
    const mod = await import(modulePath);
    const ctx = makeContext(request, env);
    if (method === 'GET' && mod.onRequestGet) return mod.onRequestGet(ctx);
    if (method === 'POST' && mod.onRequestPost) return mod.onRequestPost(ctx);
    if (method === 'PUT' && mod.onRequestPut) return mod.onRequestPut(ctx);
    if (method === 'PATCH' && mod.onRequestPatch) return mod.onRequestPatch(ctx);
    if (method === 'DELETE' && mod.onRequestDelete) return mod.onRequestDelete(ctx);
    // Fallback: tenta onRequest genérico
    if (mod.onRequest) return mod.onRequest(ctx);
    return methodNotAllowed(method);
  } catch (err: any) {
    return jsonError(err?.message || 'Erro interno na rota de cliente.', 500);
  }
}
