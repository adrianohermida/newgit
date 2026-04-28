/**
 * Router principal do Worker hmadv-api.
 *
 * Todas as rotas /api/* que antes eram Pages Functions agora são tratadas
 * diretamente aqui, com acesso completo aos bindings (D1, KV, R2, AI).
 *
 * Padrão de despacho:
 *   - Cada grupo de rotas delega para um handler dedicado
 *   - Handlers importam as libs de functions/ via caminho relativo ao repositório
 *     (o wrangler resolve os imports ESM corretamente)
 *   - Rotas desconhecidas retornam 404 JSON
 */

import type { Env } from '../env.d';
import { jsonNotFound, methodNotAllowed } from '../lib/response';
import { handleAgendamento } from './agendamento';
import { handlePublicConfig } from './public-config';
import { handleAdmin } from './admin';
import { handleClient } from './client';
import { handleFreddy } from './freddy';
import { handleFreshchat } from './freshchat';
import { handleFreshsales } from './freshsales';
import { handleSlack } from './slack';
import { handleCron } from './cron';

export async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const { pathname, method } = Object.assign(url, { method: request.method });

  // ── Agendamento público ──────────────────────────────────────────────────
  if (
    pathname === '/api/slots' ||
    pathname === '/api/slots2' ||
    pathname === '/api/slots-month' ||
    pathname === '/api/agendar' ||
    pathname === '/api/confirmar' ||
    pathname === '/api/cancelar' ||
    pathname === '/api/remarcar'
  ) {
    return handleAgendamento(request, env, pathname);
  }

  // ── Configuração pública ─────────────────────────────────────────────────
  if (
    pathname === '/api/public-chat-config' ||
    pathname === '/api/admin-auth-config'
  ) {
    return handlePublicConfig(request, env, pathname);
  }

  // ── Freshchat ────────────────────────────────────────────────────────────
  if (
    pathname === '/api/freshchat-jwt' ||
    pathname === '/api/freshchat-widget-event'
  ) {
    return handleFreshchat(request, env, pathname);
  }

  // ── Freshsales ───────────────────────────────────────────────────────────
  if (
    pathname === '/api/freshsales-fields-catalog' ||
    pathname === '/api/admin-freshsales-catalog' ||
    pathname === '/api/admin-freshsales-deal-fields'
  ) {
    return handleFreshsales(request, env, pathname);
  }

  // ── Freddy (memória e ações) ─────────────────────────────────────────────
  if (pathname.startsWith('/api/freddy-')) {
    return handleFreddy(request, env, pathname);
  }

  // ── Slack ────────────────────────────────────────────────────────────────
  if (pathname === '/api/slack-events') {
    return handleSlack(request, env);
  }

  // ── Rotas de cliente (portal) ────────────────────────────────────────────
  if (pathname.startsWith('/api/client-')) {
    return handleClient(request, env, pathname);
  }

  // ── Rotas administrativas (interno) ─────────────────────────────────────
  if (pathname.startsWith('/api/admin-') || pathname === '/api/admin-jobs') {
    return handleAdmin(request, env, pathname);
  }

  // ── Freshdesk ────────────────────────────────────────────────────────────
  if (pathname === '/api/freshdesk-ticket') {
    const { handleFreshdesk } = await import('./freshdesk');
    return handleFreshdesk(request, env);
  }

  // ── Health check ─────────────────────────────────────────────────────────
  if (pathname === '/api/health' || pathname === '/') {
    return new Response(
      JSON.stringify({ ok: true, worker: 'hmadv-api', ts: new Date().toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return jsonNotFound(pathname);
}
