/**
 * fc-update-conversation  v1
 *
 * Atualiza uma conversa do Freshchat v2:
 *   - status     : open | pending | resolved | closed
 *   - group_id   : UUID do grupo responsável
 *   - agent_id   : UUID do agente responsável
 *   - priority   : low | medium | high | urgent
 *
 * Autenticação: Bearer token recuperado da tabela freshsales_oauth_tokens
 * (gerenciada pela Edge Function `oauth`). Auto-refresh transparente.
 *
 * Request:
 *   POST {
 *     "conversation_id": "<uuid>",         -- obrigatório
 *     "status":          "open",            -- opcional
 *     "group_id":        "<uuid>",          -- opcional
 *     "agent_id":        "<uuid>",          -- opcional
 *     "priority":        "medium"           -- opcional
 *   }
 *
 * Response 200:
 *   { "ok": true, "conversation_id": "...", "applied": { ... } }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORG_DOMAIN       = 'hmadv-org.myfreshworks.com';
const FC_BASE          = `https://${ORG_DOMAIN}/freshchat/v2`;
const PROVIDER         = 'freshsales';

const VALID_STATUSES   = new Set(['open', 'pending', 'resolved', 'closed']);
const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function str(v: unknown): string {
  return String(v ?? '').trim();
}

// ─── Token ───────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  const { data, error } = await db
    .from('freshsales_oauth_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('provider', PROVIDER)
    .maybeSingle();

  if (error || !data) {
    throw new Error('Token OAuth não encontrado. Execute POST /oauth?action=seed ou ?action=authorize.');
  }

  const expiresAt = new Date(data.expires_at).getTime();
  const isExpired = Date.now() >= expiresAt - 60_000;

  if (!isExpired) return data.access_token;
  if (!data.refresh_token) throw new Error('Token expirado e refresh_token ausente.');

  return refreshToken(data.refresh_token);
}

async function refreshToken(refreshTk: string): Promise<string> {
  const clientId     = Deno.env.get('FRESHSALES_OAUTH_CLIENT_ID')!;
  const clientSecret = Deno.env.get('FRESHSALES_OAUTH_CLIENT_SECRET')!;
  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshTk,
    client_id:     clientId,
    client_secret: clientSecret,
    redirect_uri:  `${supabaseUrl}/functions/v1/oauth`,
  });

  const res = await fetch(`https://${ORG_DOMAIN}/crm/sales/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Refresh falhou (${res.status}): ${JSON.stringify(payload)}`);

  const expiresIn  = Number(payload.expires_in ?? 1799);
  const expiresAt  = new Date(Date.now() + expiresIn * 1000).toISOString();
  const accessTok  = payload.access_token as string;
  const newRefresh = (payload.refresh_token as string | undefined) ?? refreshTk;

  await db.from('freshsales_oauth_tokens').upsert(
    {
      provider:      PROVIDER,
      access_token:  accessTok,
      refresh_token: newRefresh,
      expires_at:    expiresAt,
      token_type:    (payload.token_type as string) ?? 'Bearer',
      updated_at:    new Date().toISOString(),
    },
    { onConflict: 'provider' },
  );

  return accessTok;
}

// ─── Freshchat ────────────────────────────────────────────────────────────────

interface UpdatePayload {
  status?:  string;
  priority?: string;
  assigned_agent?: { id: string };
  meta?: {
    assigned_group_id?: string;
    [k: string]: unknown;
  };
}

async function updateConversation(
  conversationId: string,
  updates: UpdatePayload,
  token: string,
): Promise<Record<string, unknown>> {
  const url = `${FC_BASE}/conversations/${encodeURIComponent(conversationId)}`;

  const res = await fetch(url, {
    method:  'PUT',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (res.status === 404) throw new Error(`Conversa ${conversationId} não encontrada no Freshchat.`);

  const payload = await res.json().catch(() => ({})) as Record<string, unknown>;

  if (!res.ok) {
    throw new Error(`Freshchat API erro (${res.status}): ${JSON.stringify(payload)}`);
  }

  return payload;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido. Use POST.' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    // ── Validar conversation_id ──────────────────────────────────────────────
    const conversationId = str(body.conversation_id);
    if (!conversationId) {
      return json({ error: 'conversation_id_ausente' }, 400);
    }

    // ── Validar e construir payload de atualização ───────────────────────────
    const errors: string[] = [];
    const updates: UpdatePayload = {};
    const applied: Record<string, string> = {};

    const status = str(body.status).toLowerCase();
    if (status) {
      if (!VALID_STATUSES.has(status)) {
        errors.push(`status inválido: "${status}". Válidos: ${[...VALID_STATUSES].join(', ')}`);
      } else {
        updates.status = status;
        applied.status = status;
      }
    }

    const priority = str(body.priority).toLowerCase();
    if (priority) {
      if (!VALID_PRIORITIES.has(priority)) {
        errors.push(`priority inválida: "${priority}". Válidas: ${[...VALID_PRIORITIES].join(', ')}`);
      } else {
        updates.priority = priority;
        applied.priority = priority;
      }
    }

    const agentId = str(body.agent_id);
    if (agentId) {
      updates.assigned_agent = { id: agentId };
      applied.agent_id = agentId;
    }

    const groupId = str(body.group_id);
    if (groupId) {
      updates.meta = { ...updates.meta, assigned_group_id: groupId };
      applied.group_id = groupId;
    }

    if (errors.length) {
      return json({ error: 'validacao_falhou', details: errors }, 400);
    }

    if (!Object.keys(updates).length) {
      return json({
        error: 'nenhum_campo_fornecido',
        hint:  'Forneça ao menos um de: status, priority, agent_id, group_id',
      }, 400);
    }

    // ── Executar ─────────────────────────────────────────────────────────────
    const token  = await getAccessToken();
    const result = await updateConversation(conversationId, updates, token);

    return json({
      ok:              true,
      conversation_id: conversationId,
      applied,
      freshchat:       result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('fc-update-conversation error:', msg);
    const status = msg.includes('não encontrada') ? 404 : 500;
    return json({ error: msg }, status);
  }
});
