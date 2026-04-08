/**
 * fc-ingest-conversations  v1
 *
 * Ingere conversas do Freshchat v2 no Supabase, alimentando:
 *   - agentlab_conversation_threads  → histórico visível em /interno/agentlab/conversations
 *   - agentlab_conversation_messages → mensagens por thread
 *   - dotobot_memory_embeddings      → memória RAG semântica (gte-small 384d)
 *   - agentlab_source_states         → cursor de paginação para sync incremental
 *   - agentlab_source_sync_runs      → auditoria de cada execução
 *
 * Modos de uso:
 *   POST /                        → webhook Freshchat (message_create / conversation_update)
 *   GET  ?action=sync             → sync paginado (puxa conversas da API)
 *   GET  ?action=sync&limit=50    → sync com limite customizado (máx 100)
 *   GET  ?action=status           → estado do cursor / última sync
 *
 * Autenticação Freshchat:
 *   Prioridade 1 → Bearer token da tabela freshsales_oauth_tokens (auto-refresh)
 *   Prioridade 2 → FRESHCHAT_API_KEY (token administrativo legado)
 *
 * Validação de webhook:
 *   Usa FRESHCHAT_WEBHOOK_SECRET ou FREDDY_ACTION_SHARED_SECRET para verificar
 *   X-FreshChat-Signature (HMAC-SHA256). Se ausente, aceita mas loga aviso.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FC_DOMAIN        = (Deno.env.get('FRESHCHAT_DOMAIN') ?? 'https://hmadv-org-7b725ea101eff5516788608.freshchat.com').replace(/\/+$/, '');
const FC_API_KEY_ENV   = Deno.env.get('FRESHCHAT_API_KEY') ?? Deno.env.get('FRESHCHAT_ACCESS_TOKEN') ?? '';
const WEBHOOK_SECRET   = Deno.env.get('FRESHCHAT_WEBHOOK_SECRET') ?? Deno.env.get('FREDDY_ACTION_SHARED_SECRET') ?? '';
const ORG_DOMAIN       = 'hmadv-org.myfreshworks.com';
const OAUTH_PROVIDER   = 'freshsales';
const SOURCE_NAME      = 'freshchat_conversations';

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function log(level: 'info' | 'warn' | 'error', msg: string, extra: Record<string, unknown> = {}) {
  console[level](JSON.stringify({ ts: new Date().toISOString(), fn: 'fc-ingest-conversations', msg, ...extra }));
}

function extractText(messageParts: unknown[]): string {
  if (!Array.isArray(messageParts)) return '';
  return messageParts
    .map((p: unknown) => {
      const part = p as Record<string, unknown>;
      const text = (part?.text as Record<string, unknown>)?.content;
      const image = (part?.image as Record<string, unknown>)?.url;
      return text ?? (image ? '[imagem]' : '');
    })
    .filter(Boolean)
    .join(' ')
    .trim();
}

// ─── HMAC validation ─────────────────────────────────────────────────────────

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature || !WEBHOOK_SECRET) return true; // permissivo se não configurado
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sigBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
    const computed  = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
    return computed === signature || `sha256=${computed}` === signature;
  } catch {
    return false;
  }
}

// ─── Token retrieval ─────────────────────────────────────────────────────────

async function getAuthHeader(): Promise<string> {
  // Tenta OAuth da tabela primeiro
  try {
    const { data } = await db
      .from('freshsales_oauth_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('provider', OAUTH_PROVIDER)
      .maybeSingle();

    if (data) {
      const expired = Date.now() >= new Date(data.expires_at).getTime() - 60_000;
      if (!expired) return `Bearer ${data.access_token}`;
      if (data.refresh_token) {
        const newToken = await refreshOAuthToken(data.refresh_token);
        return `Bearer ${newToken}`;
      }
    }
  } catch { /* fallthrough */ }

  // Fallback para API key administrativa
  if (FC_API_KEY_ENV) return `Bearer ${FC_API_KEY_ENV}`;
  throw new Error('Nenhuma credencial Freshchat disponível. Configure freshsales_oauth_tokens ou FRESHCHAT_API_KEY.');
}

async function refreshOAuthToken(refreshTk: string): Promise<string> {
  const clientId     = Deno.env.get('FRESHSALES_OAUTH_CLIENT_ID')!;
  const clientSecret = Deno.env.get('FRESHSALES_OAUTH_CLIENT_SECRET')!;

  const res = await fetch(`https://${ORG_DOMAIN}/crm/sales/oauth/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshTk,
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  `${SUPABASE_URL}/functions/v1/oauth`,
    }),
  });

  const payload = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Refresh falhou: ${JSON.stringify(payload)}`);

  const accessTok = payload.access_token as string;
  const expiresIn = Number(payload.expires_in ?? 1799);

  await db.from('freshsales_oauth_tokens').upsert({
    provider:      OAUTH_PROVIDER,
    access_token:  accessTok,
    refresh_token: (payload.refresh_token as string) ?? refreshTk,
    expires_at:    new Date(Date.now() + expiresIn * 1000).toISOString(),
    token_type:    'Bearer',
    updated_at:    new Date().toISOString(),
  }, { onConflict: 'provider' });

  return accessTok;
}

// ─── Freshchat API ────────────────────────────────────────────────────────────

async function fcGet(path: string, authHeader: string): Promise<Record<string, unknown>> {
  const url = `${FC_DOMAIN}/v2${path}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Freshchat GET ${path} → ${res.status}: ${body}`);
  }
  return res.json();
}

// ─── Embedding (Supabase built-in gte-small, 384d) ───────────────────────────

async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text?.trim()) return null;
  try {
    // @ts-ignore — Supabase Edge Runtime AI
    const session = new Supabase.ai.Session('gte-small');
    const output = await session.run(text.slice(0, 8000), { mean_pool: true, normalize: true });
    return Array.from(output.data as Float32Array);
  } catch (err) {
    log('warn', 'embedding_skip', { error: String(err) });
    return null;
  }
}

// ─── Upsert helpers ──────────────────────────────────────────────────────────

interface FcConversation {
  id: string;
  status?: string;
  channel_id?: string;
  subject?: string;
  created_time?: string;
  updated_time?: string;
  messages?: FcMessage[];
  assigned_agent?: { id: string };
  meta?: Record<string, unknown>;
  [k: string]: unknown;
}

interface FcMessage {
  id: string;
  conversation_id?: string;
  actor_type?: string;
  actor_id?: string;
  user_id?: string;
  message_type?: string;
  message_parts?: unknown[];
  created_time?: string;
  [k: string]: unknown;
}

async function upsertThread(conv: FcConversation): Promise<string | null> {
  const payload = {
    source_system:          'freshchat',
    source_conversation_id: conv.id,
    channel:                'freshchat',
    status:                 conv.status ?? 'open',
    subject:                conv.subject ?? null,
    started_at:             conv.created_time ?? null,
    last_message_at:        conv.updated_time ?? null,
    metadata: {
      channel_id:        conv.channel_id ?? null,
      assigned_agent_id: conv.assigned_agent?.id ?? null,
      assigned_group_id: (conv.meta as Record<string, unknown>)?.assigned_group_id ?? null,
    },
    raw_payload: conv,
    updated_at:  new Date().toISOString(),
  };

  const { data, error } = await db
    .from('agentlab_conversation_threads')
    .upsert(payload, { onConflict: 'source_system,source_conversation_id' })
    .select('id')
    .maybeSingle();

  if (error) {
    log('error', 'upsert_thread_failed', { conv_id: conv.id, error: error.message });
    return null;
  }
  return data?.id ?? null;
}

async function upsertMessage(threadId: string | null, convId: string, msg: FcMessage): Promise<void> {
  const bodyText = extractText((msg.message_parts as unknown[]) ?? []);
  if (!bodyText) return;

  const actorType = msg.actor_type ?? 'unknown';
  const actorId   = msg.actor_id ?? msg.user_id ?? null;

  const payload = {
    thread_id:              threadId,
    source_system:          'freshchat',
    source_conversation_id: convId,
    source_message_id:      msg.id,
    actor_type:             actorType,
    actor_id:               actorId,
    message_type:           msg.message_type ?? 'normal',
    body_text:              bodyText,
    created_at_source:      msg.created_time ?? null,
    metadata: {
      raw_parts: msg.message_parts ?? [],
    },
    updated_at: new Date().toISOString(),
  };

  const { error } = await db
    .from('agentlab_conversation_messages')
    .upsert(payload, { onConflict: 'source_system,source_conversation_id,source_message_id' });

  if (error) {
    log('warn', 'upsert_message_failed', { msg_id: msg.id, error: error.message });
    return;
  }

  // RAG: gera embedding e salva em dotobot_memory_embeddings
  const embedding = await generateEmbedding(bodyText);
  if (embedding) {
    const sourceKey = `fc:${convId}:${msg.id}`;
    const isUser    = actorType === 'user';
    const ragPayload = {
      source_key:           sourceKey,
      session_id:           `fc:${actorId ?? convId}`,
      route:                '/interno/agentlab/conversations',
      role:                 isUser ? 'user' : 'agent',
      query:                isUser ? bodyText : '',
      response_text:        isUser ? '' : bodyText,
      status:               'ok',
      steps_count:          0,
      embedding_model:      'supabase/gte-small',
      embedding_dimensions: 384,
      metadata: {
        source:          'freshchat',
        conversation_id: convId,
        message_id:      msg.id,
        actor_type:      actorType,
        thread_id:       threadId,
      },
      embedding:   embedding,
      updated_at:  new Date().toISOString(),
    };

    const { error: ragErr } = await db
      .from('dotobot_memory_embeddings')
      .upsert(ragPayload, { onConflict: 'source_key' });

    if (ragErr) {
      log('warn', 'rag_upsert_failed', { source_key: sourceKey, error: ragErr.message });
    }
  }
}

// ─── Source state ─────────────────────────────────────────────────────────────

async function getState(): Promise<{ cursor: string | null; page: number }> {
  const { data } = await db
    .from('agentlab_source_states')
    .select('cursor, page')
    .eq('source_name', SOURCE_NAME)
    .maybeSingle();
  return { cursor: data?.cursor ?? null, page: data?.page ?? 1 };
}

async function saveState(page: number, lastId: string | null): Promise<void> {
  await db.from('agentlab_source_states').upsert({
    source_name:    SOURCE_NAME,
    cursor:         lastId,
    page,
    last_synced_at: new Date().toISOString(),
    updated_at:     new Date().toISOString(),
  }, { onConflict: 'source_name' });
}

async function logSyncRun(status: string, records: number, notes: string): Promise<void> {
  await db.from('agentlab_source_sync_runs').insert({
    source_name:    SOURCE_NAME,
    sync_scope:     'conversations',
    status,
    records_synced: records,
    notes,
    created_at:     new Date().toISOString(),
  });
}

// ─── Sync paginado ────────────────────────────────────────────────────────────

async function runSync(limitParam: number): Promise<Record<string, unknown>> {
  const limit  = Math.min(Math.max(1, limitParam), 100);
  const state  = await getState();
  const auth   = await getAuthHeader();
  let   synced = 0;

  try {
    const path = `/conversations?page=${state.page}&items_per_page=${limit}&sort_key=updated_time&sort_order=desc`;
    const data = await fcGet(path, auth);
    const conversations = (data.conversations ?? []) as FcConversation[];

    if (!conversations.length) {
      await saveState(1, null); // reset paginação
      await logSyncRun('completed', 0, 'Sem novas conversas. Cursor resetado.');
      return { ok: true, synced: 0, page: 1, message: 'Nenhuma conversa nova. Cursor resetado.' };
    }

    for (const conv of conversations) {
      const threadId = await upsertThread(conv);

      // Busca mensagens da conversa
      try {
        const msgData = await fcGet(`/conversations/${conv.id}/messages`, auth);
        const messages = (msgData.messages ?? []) as FcMessage[];
        for (const msg of messages) {
          await upsertMessage(threadId, conv.id, msg);
        }
        synced++;
      } catch (msgErr) {
        log('warn', 'fetch_messages_failed', { conv_id: conv.id, error: String(msgErr) });
        synced++;
      }
    }

    const lastId = conversations[conversations.length - 1]?.id ?? null;
    await saveState(state.page + 1, lastId);
    await logSyncRun('completed', synced, `Página ${state.page}, ${synced} conversas ingeridas.`);

    return { ok: true, synced, page: state.page, next_page: state.page + 1, last_id: lastId };
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    await logSyncRun('failed', synced, msg);
    throw err;
  }
}

// ─── Webhook handler ──────────────────────────────────────────────────────────

async function handleWebhook(rawBody: string, sig: string | null): Promise<Response> {
  const valid = await verifySignature(rawBody, sig);
  if (!valid) {
    log('warn', 'webhook_signature_invalid');
    return json({ error: 'assinatura_invalida' }, 401);
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'payload_invalido' }, 400);
  }

  const action = String(event.action ?? event.event ?? '');
  const msgData  = (event.data as Record<string, unknown>)?.message as FcMessage | undefined;
  const convData = (event.data as Record<string, unknown>)?.conversation as FcConversation | undefined;

  // Atualiza thread se há dados de conversa
  if (convData?.id) {
    await upsertThread(convData);
  }

  // Ingere mensagem se há dados de mensagem
  if (msgData?.id && msgData?.conversation_id) {
    const threadId = await upsertThread(
      convData ?? { id: msgData.conversation_id }
    );
    await upsertMessage(threadId, msgData.conversation_id, msgData);
    log('info', 'webhook_message_ingested', { action, msg_id: msgData.id, conv_id: msgData.conversation_id });
  } else {
    log('info', 'webhook_received', { action, conv_id: convData?.id });
  }

  return json({ ok: true, action });
}

// ─── Main ────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-FreshChat-Signature',
      },
    });
  }

  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? '';

  try {
    // ── Webhook (POST sem action ou com action=webhook) ───────────────────────
    if (req.method === 'POST' && (!action || action === 'webhook')) {
      const rawBody = await req.text();
      const sig     = req.headers.get('X-FreshChat-Signature') ?? req.headers.get('x-freshchat-signature');
      return handleWebhook(rawBody, sig);
    }

    // ── Sync paginado ─────────────────────────────────────────────────────────
    if (action === 'sync' && req.method === 'GET') {
      const limit  = parseInt(url.searchParams.get('limit') ?? '20', 10);
      const result = await runSync(limit);
      return json(result);
    }

    // ── Status do cursor ──────────────────────────────────────────────────────
    if (action === 'status' || (!action && req.method === 'GET')) {
      const { data: state } = await db
        .from('agentlab_source_states')
        .select('*')
        .eq('source_name', SOURCE_NAME)
        .maybeSingle();

      const { count: threads } = await db
        .from('agentlab_conversation_threads')
        .select('id', { count: 'exact', head: true })
        .eq('source_system', 'freshchat');

      const { count: messages } = await db
        .from('agentlab_conversation_messages')
        .select('id', { count: 'exact', head: true })
        .eq('source_system', 'freshchat');

      const { count: embeddings } = await db
        .from('dotobot_memory_embeddings')
        .select('id', { count: 'exact', head: true })
        .like('source_key', 'fc:%');

      return json({
        ok:              true,
        source_name:     SOURCE_NAME,
        last_synced_at:  state?.last_synced_at ?? null,
        current_page:    state?.page ?? 1,
        last_cursor:     state?.cursor ?? null,
        threads_stored:  threads ?? 0,
        messages_stored: messages ?? 0,
        embeddings_rag:  embeddings ?? 0,
        webhook_url:     `${SUPABASE_URL}/functions/v1/fc-ingest-conversations`,
        actions:         ['sync', 'status', 'webhook (POST)'],
      });
    }

    return json({ error: 'acao_desconhecida', actions: ['sync', 'status', 'webhook (POST)'] }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', 'handler_error', { error: msg });
    return json({ error: msg }, 500);
  }
});
