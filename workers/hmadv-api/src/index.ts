/**
 * Worker hmadv-api — ponto de entrada principal.
 *
 * Serve todas as rotas /api/* do domínio api.hermidamaia.adv.br.
 * Anteriormente essas rotas eram Pages Functions em functions/api/.
 * Agora são tratadas diretamente aqui, com acesso aos bindings do Worker
 * (D1, KV, R2, AI) e sem as limitações de tamanho das Pages Functions.
 *
 * Arquitetura:
 *   src/routes/index.ts   — router principal
 *   src/routes/*.ts       — handlers por domínio (agendamento, admin, client, etc.)
 *   src/lib/*.ts          — utilitários compartilhados
 *   src/middleware/*.ts   — CORS, auth
 */

import type { Env } from './env.d';
import { handleRequest } from './routes/index';
import { handleCron } from './routes/cron';
import { handleOptions, withCors } from './middleware/cors';

export default {
  /**
   * Handler de requisições HTTP.
   * Aplica CORS e delega para o router principal.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Preflight CORS
    const preflight = handleOptions(request);
    if (preflight) return preflight;

    try {
      const response = await handleRequest(request, env, ctx);
      return withCors(response, request);
    } catch (err: any) {
      console.error('[hmadv-api] erro não tratado:', err?.message || err);
      return new Response(
        JSON.stringify({ ok: false, error: 'Erro interno no servidor.' }),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }
  },

  /**
   * Handler de cron jobs.
   * Configurado em wrangler.toml [triggers].crons.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(handleCron(event, env, ctx));
  },
};
