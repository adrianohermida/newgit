/**
 * Handler de configuração pública.
 * Porta as Pages Functions: public-chat-config, admin-auth-config.
 */

import type { Env } from '../env.d';
import { jsonOk, jsonError, JSON_CACHE_HEADERS } from '../lib/response';
import { getSupabaseBaseUrl, getSupabaseAnonKey } from '../lib/env';

function makeContext(request: Request, env: Env) {
  return { request, env, params: {}, next: async () => new Response('not found', { status: 404 }) };
}

export async function handlePublicConfig(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204 });
  if (method !== 'GET') {
    return new Response(JSON.stringify({ ok: false, error: `Método não permitido: ${method}` }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── GET /api/public-chat-config ──────────────────────────────────────────
  if (pathname === '/api/public-chat-config') {
    try {
      const { onRequestGet } = await import('../../../../functions/api/public-chat-config.js');
      return onRequestGet(makeContext(request, env));
    } catch (err: any) {
      return jsonError(err?.message || 'Falha ao montar configuração pública do Freshchat.', 500);
    }
  }

  // ── GET /api/admin-auth-config ───────────────────────────────────────────
  if (pathname === '/api/admin-auth-config') {
    try {
      const url = getSupabaseBaseUrl(env);
      const anonKey = getSupabaseAnonKey(env);
      if (!url || !anonKey) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'Configuração pública do Supabase ausente no ambiente.',
            hasUrl: Boolean(url),
            hasAnonKey: Boolean(anonKey),
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ ok: true, url, anonKey }),
        { status: 200, headers: JSON_CACHE_HEADERS }
      );
    } catch (err: any) {
      return jsonError(err?.message || 'Falha ao montar configuração de autenticação.', 500);
    }
  }

  return jsonError('Rota de configuração não encontrada', 404);
}
