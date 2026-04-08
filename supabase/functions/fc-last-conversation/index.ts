/**
 * fc-last-conversation  v1
 *
 * Retorna o conversation_id da última conversa (Freshchat v2) de um contato.
 *
 * Autenticação: Bearer token recuperado da tabela freshsales_oauth_tokens
 * (gerenciada pela Edge Function `oauth`). Auto-refresh transparente.
 *
 * Request:
 *   GET  ?contact_id=<freshchat_contact_uuid>
 *   POST { "contact_id": "<freshchat_contact_uuid>" }
 *
 * Response 200:
 *   {
 *     "conversation_id": "...",
 *     "status": "open" | "pending" | "resolved" | "closed",
 *     "priority": "low" | "medium" | "high" | "urgent",
 *     "created_at": "...",
 *     "updated_at": "...",
 *     "assigned_agent_id": "...",
 *     "assigned_group_id": "...",
 *     "channel_id": "..."
 *   }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORG_DOMAIN       = 'hmadv-org.myfreshworks.com';
const FC_BASE          = `https://${ORG_DOMAIN}/freshchat/v2`;
const PROVIDER         = 'freshsales';

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

  // Auto-refresh
  const refreshed = await refreshToken(data.refresh_token);
  return refreshed;
}

async function refreshToken(refreshToken: string): Promise<string> {
  const clientId     = Deno.env.get('FRESHSALES_OAUTH_CLIENT_ID')!;
  const clientSecret = Deno.env.get('FRESHSALES_OAUTH_CLIENT_SECRET')!;
  const supabaseUrl  = Deno.env.get('SUPABASE_URL')!;

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
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
  const refreshTok = (payload.refresh_token as string | undefined) ?? refreshToken;

  await db.from('freshsales_oauth_tokens').upsert(
    {
      provider:      PROVIDER,
      access_token:  accessTok,
      refresh_token: refreshTok,
      expires_at:    expiresAt,
      token_type:    (payload.token_type as string) ?? 'Bearer',
      updated_at:    new Date().toISOString(),
    },
    { onConflict: 'provider' },
  );

  return accessTok;
}

// ─── Freshchat ────────────────────────────────────────────────────────────────

interface FcConversation {
  conversation_id: string;
  status:          string;
  priority?:       string;
  created_time?:   string;
  updated_time?:   string;
  assigned_agent?: { id: string };
  channel_id?:     string;
  meta?: {
    assigned_group_id?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

async function fetchLastConversation(contactId: string, token: string): Promise<FcConversation> {
  // Busca conversas do contato, ordenadas por criação desc, página 1, tamanho 1
  const url = `${FC_BASE}/contacts/${encodeURIComponent(contactId)}/conversations` +
              `?page=1&items_per_page=1&sort_key=created_time&sort_order=desc`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/json',
    },
  });

  if (res.status === 404) throw new Error(`Contato ${contactId} não encontrado no Freshchat.`);

  const payload = await res.json().catch(() => ({})) as Record<string, unknown>;

  if (!res.ok) {
    throw new Error(`Freshchat API erro (${res.status}): ${JSON.stringify(payload)}`);
  }

  // A API Freshchat v2 retorna { conversations: [...] }
  const conversations = (payload.conversations ?? []) as FcConversation[];
  if (!conversations.length) {
    throw new Error(`Nenhuma conversa encontrada para o contato ${contactId}.`);
  }

  return conversations[0];
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  try {
    // Resolve contact_id (GET param ou corpo JSON)
    let contactId: string | null = null;

    if (req.method === 'GET') {
      contactId = new URL(req.url).searchParams.get('contact_id');
    } else if (req.method === 'POST') {
      const body = await req.json().catch(() => ({})) as Record<string, unknown>;
      contactId = String(body.contact_id ?? '').trim() || null;
    }

    if (!contactId) {
      return json({ error: 'contact_id_ausente', hint: 'Passe ?contact_id= (GET) ou { contact_id } (POST)' }, 400);
    }

    const token = await getAccessToken();
    const conv  = await fetchLastConversation(contactId, token);

    return json({
      conversation_id:   conv.conversation_id,
      status:            conv.status,
      priority:          conv.priority ?? null,
      channel_id:        conv.channel_id ?? null,
      assigned_agent_id: conv.assigned_agent?.id ?? null,
      assigned_group_id: conv.meta?.assigned_group_id ?? null,
      created_at:        conv.created_time ?? null,
      updated_at:        conv.updated_time ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('fc-last-conversation error:', msg);
    const status = msg.includes('não encontrado') || msg.includes('Nenhuma conversa') ? 404 : 500;
    return json({ error: msg }, status);
  }
});
