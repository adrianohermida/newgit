/**
 * Handler de rotas administrativas (interno).
 * Porta as Pages Functions: admin-*.
 */

import type { Env } from '../env.d';
import { jsonError, methodNotAllowed } from '../lib/response';
import { getSupabaseBaseUrl, getSupabaseServiceKey, missingEnvResponse } from '../lib/env';

function makeContext(request: Request, env: Env) {
  return { request, env, params: {}, next: async () => new Response('not found', { status: 404 }) };
}

const ADMIN_ROUTES: Record<string, string> = {
  '/api/admin-agendamentos':           '../../../../functions/api/admin-agendamentos.js',
  '/api/admin-agentlab':               '../../../../functions/api/admin-agentlab.js',
  '/api/admin-agentlab-governance':    '../../../../functions/api/admin-agentlab-governance.js',
  '/api/admin-agentlab-intelligence':  '../../../../functions/api/admin-agentlab-intelligence.js',
  '/api/admin-agentlab-sync':          '../../../../functions/api/admin-agentlab-sync.js',
  '/api/admin-agentlab-training':      '../../../../functions/api/admin-agentlab-training.js',
  '/api/admin-client-profile-requests':'../../../../functions/api/admin-client-profile-requests.js',
  '/api/admin-cloudflare-docs':        '../../../../functions/api/admin-cloudflare-docs.js',
  '/api/admin-copilot-attachments':    '../../../../functions/api/admin-copilot-attachments.js',
  '/api/admin-copilot-conversations':  '../../../../functions/api/admin-copilot-conversations.js',
  '/api/admin-dotobot-chat':           '../../../../functions/api/admin-dotobot-chat.js',
  '/api/admin-dotobot-rag-health':     '../../../../functions/api/admin-dotobot-rag-health.js',
  '/api/admin-freshsales-catalog':     '../../../../functions/api/admin-freshsales-catalog.js',
  '/api/admin-freshsales-deal-fields': '../../../../functions/api/admin-freshsales-deal-fields.js',
  '/api/admin-hmadv-contacts':         '../../../../functions/api/admin-hmadv-contacts.js',
  '/api/admin-hmadv-filas':            '../../../../functions/api/admin-hmadv-filas.js',
  '/api/admin-hmadv-financeiro':       '../../../../functions/api/admin-hmadv-financeiro.js',
  '/api/admin-hmadv-processos':        '../../../../functions/api/admin-hmadv-processos.js',
  '/api/admin-hmadv-publicacoes':      '../../../../functions/api/admin-hmadv-publicacoes.js',
  '/api/admin-hmadv-runner':           '../../../../functions/api/admin-hmadv-runner.js',
  '/api/admin-jobs':                   '../../../../functions/api/admin-jobs.js',
  '/api/admin-lawdesk-chat':           '../../../../functions/api/admin-lawdesk-chat.js',
  '/api/admin-lawdesk-providers':      '../../../../functions/api/admin-lawdesk-providers.js',
  '/api/admin-leads':                  '../../../../functions/api/admin-leads.js',
  '/api/admin-market-ads':             '../../../../functions/api/admin-market-ads.js',
  '/api/admin-portal-audit':           '../../../../functions/api/admin-portal-audit.js',
  '/api/admin-posts':                  '../../../../functions/api/admin-posts.js',
};

// Rotas que NÃO precisam de Supabase
const NO_SUPABASE_ROUTES = new Set([
  '/api/admin-cloudflare-docs',
  '/api/admin-copilot-conversations',
  '/api/admin-copilot-attachments',
  '/api/admin-dotobot-chat',
  '/api/admin-dotobot-rag-health',
  '/api/admin-lawdesk-chat',
  '/api/admin-lawdesk-providers',
  '/api/admin-agentlab',
  '/api/admin-agentlab-governance',
  '/api/admin-agentlab-intelligence',
  '/api/admin-agentlab-sync',
  '/api/admin-agentlab-training',
]);

export async function handleAdmin(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null, { status: 204 });

  const modulePath = ADMIN_ROUTES[pathname];
  if (!modulePath) return jsonError(`Rota administrativa não encontrada: ${pathname}`, 404);

  // Verificar Supabase para rotas que precisam
  if (!NO_SUPABASE_ROUTES.has(pathname)) {
    const missing: string[] = [];
    if (!getSupabaseBaseUrl(env)) missing.push('SUPABASE_URL');
    if (!getSupabaseServiceKey(env)) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (missing.length) return missingEnvResponse(missing, pathname);
  }

  try {
    const mod = await import(modulePath);
    const ctx = makeContext(request, env);
    if (method === 'GET' && mod.onRequestGet) return mod.onRequestGet(ctx);
    if (method === 'POST' && mod.onRequestPost) return mod.onRequestPost(ctx);
    if (method === 'PUT' && mod.onRequestPut) return mod.onRequestPut(ctx);
    if (method === 'PATCH' && mod.onRequestPatch) return mod.onRequestPatch(ctx);
    if (method === 'DELETE' && mod.onRequestDelete) return mod.onRequestDelete(ctx);
    if (mod.onRequest) return mod.onRequest(ctx);
    return methodNotAllowed(method);
  } catch (err: any) {
    return jsonError(err?.message || 'Erro interno na rota administrativa.', 500);
  }
}
