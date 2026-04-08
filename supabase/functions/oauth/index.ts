/**
 * oauth  — Freshsales Suite OAuth 2.0 via Supabase Edge Function
 *
 * Endpoints (query param ?action=):
 *   GET  ?action=authorize  → redireciona para o consent do Freshworks
 *   GET  ?action=callback   → troca code por tokens (também aceita ?code=... direto)
 *   GET  ?action=token      → retorna access_token válido (auto-refresh se expirado)
 *   GET  ?action=status     → informações sobre o estado dos tokens
 *   POST ?action=refresh    → força renovação via refresh_token
 *   POST ?action=seed       → inicializa tokens a partir de env vars (bootstrap único)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const CLIENT_ID           = Deno.env.get('FRESHSALES_OAUTH_CLIENT_ID')!;
const CLIENT_SECRET       = Deno.env.get('FRESHSALES_OAUTH_CLIENT_SECRET')!;
const SCOPES              = Deno.env.get('FRESHSALES_SCOPES') ?? '';
const ORG_DOMAIN          = 'hmadv-org.myfreshworks.com';
const PROVIDER            = 'freshsales';
const REDIRECT_URI        = `${SUPABASE_URL}/functions/v1/oauth`;
const AUTHORIZE_URL       = `https://${ORG_DOMAIN}/crm/sales/oauth/authorize`;
const TOKEN_URL           = `https://${ORG_DOMAIN}/crm/sales/oauth/token`;

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

function htmlPage(title: string, body: string) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>` +
    `<style>body{font-family:sans-serif;max-width:600px;margin:80px auto;padding:0 20px}</style></head>` +
    `<body>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  );
}

// ─── Token storage ───────────────────────────────────────────────────────────

interface TokenRow {
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  token_type: string;
  scope: string | null;
  updated_at: string;
}

async function storeTokens(tokens: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}) {
  const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error } = await db
    .from('freshsales_oauth_tokens')
    .upsert(
      {
        provider:      PROVIDER,
        access_token:  tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at,
        token_type:    tokens.token_type ?? 'Bearer',
        scope:         tokens.scope ?? SCOPES,
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'provider' },
    );
  if (error) throw new Error(`Falha ao salvar tokens: ${error.message}`);
}

async function getStoredTokens(): Promise<TokenRow | null> {
  const { data, error } = await db
    .from('freshsales_oauth_tokens')
    .select('*')
    .eq('provider', PROVIDER)
    .maybeSingle();
  if (error || !data) return null;
  return data as TokenRow;
}

// ─── OAuth operations ─────────────────────────────────────────────────────────

async function exchangeCode(code: string): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
    code,
  });
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Troca de código falhou (${res.status}): ${JSON.stringify(payload)}`);
  return payload;
}

async function doRefresh(refresh_token: string): Promise<Record<string, unknown>> {
  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token,
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri:  REDIRECT_URI,
  });
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Refresh falhou (${res.status}): ${JSON.stringify(payload)}`);
  return payload;
}

async function getValidToken(): Promise<string | null> {
  const stored = await getStoredTokens();
  if (!stored) return null;

  const expiresAt = new Date(stored.expires_at).getTime();
  const isExpired  = Date.now() >= expiresAt - 60_000; // 60s de margem

  if (isExpired && stored.refresh_token) {
    const tokens = await doRefresh(stored.refresh_token);
    await storeTokens(tokens as Parameters<typeof storeTokens>[0]);
    return (tokens as { access_token: string }).access_token;
  }

  return stored.access_token;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const url    = new URL(req.url);
  const action = url.searchParams.get('action') ?? '';
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin':  '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  try {
    // ── 1. Iniciar fluxo OAuth ────────────────────────────────────────────────
    if (action === 'authorize' && method === 'GET') {
      const authUrl = new URL(AUTHORIZE_URL);
      authUrl.searchParams.set('client_id',     CLIENT_ID);
      authUrl.searchParams.set('redirect_uri',  REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state',         crypto.randomUUID());
      return Response.redirect(authUrl.toString(), 302);
    }

    // ── 2. Callback OAuth (Freshworks redireciona aqui com ?code=...) ─────────
    if (action === 'callback' || (method === 'GET' && url.searchParams.has('code'))) {
      const code  = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        return htmlPage('Erro OAuth',
          `<h2>❌ Erro na autorização</h2><p><code>${error}</code></p>` +
          `<p>${url.searchParams.get('error_description') ?? ''}</p>`,
        );
      }
      if (!code) return json({ error: 'code_ausente' }, 400);

      const tokens = await exchangeCode(code);
      await storeTokens(tokens as Parameters<typeof storeTokens>[0]);

      return htmlPage('OAuth Freshsales',
        `<h2>✅ Autorização concluída!</h2>` +
        `<p>Tokens armazenados no Supabase com sucesso.</p>` +
        `<p><strong>Expira em:</strong> ${tokens.expires_in}s</p>` +
        `<p>Você pode fechar esta janela.</p>`,
      );
    }

    // ── 3. Token válido (auto-refresh) ────────────────────────────────────────
    if (action === 'token' && method === 'GET') {
      const token = await getValidToken();
      if (!token) return json({ error: 'nao_autorizado', hint: 'Acesse ?action=authorize' }, 404);
      return json({ access_token: token, token_type: 'Bearer' });
    }

    // ── 4. Status ─────────────────────────────────────────────────────────────
    if (action === 'status' || (method === 'GET' && !action)) {
      const stored = await getStoredTokens();
      if (!stored) return json({ authorized: false, hint: 'Acesse ?action=authorize' });

      const expiresAt   = new Date(stored.expires_at).getTime();
      const valid       = Date.now() < expiresAt - 60_000;
      const expiresInMs = expiresAt - Date.now();

      return json({
        authorized:        true,
        valid,
        expires_at:        stored.expires_at,
        expires_in_s:      Math.round(expiresInMs / 1000),
        has_refresh_token: !!stored.refresh_token,
        updated_at:        stored.updated_at,
      });
    }

    // ── 5. Forçar refresh ─────────────────────────────────────────────────────
    if (action === 'refresh' && method === 'POST') {
      const stored = await getStoredTokens();
      if (!stored?.refresh_token) return json({ error: 'refresh_token_ausente' }, 404);

      const tokens = await doRefresh(stored.refresh_token);
      await storeTokens(tokens as Parameters<typeof storeTokens>[0]);

      return json({
        ok:         true,
        expires_in: tokens.expires_in,
        updated_at: new Date().toISOString(),
      });
    }

    // ── 6. Seed — bootstrap tokens a partir das env vars ─────────────────────
    if (action === 'seed' && method === 'POST') {
      const access_token  = Deno.env.get('FRESHSALES_ACCESS_TOKEN');
      const refresh_token = Deno.env.get('FRESHSALES_REFRESH_TOKEN');
      const expires_in_s  = Number(Deno.env.get('FRESHSALES_EXPIRES_IN') ?? '1799');
      const expiry_ts     = Number(Deno.env.get('FRESHSALES_TOKEN_EXPIRY') ?? '0');

      if (!access_token || !refresh_token) {
        return json({ error: 'FRESHSALES_ACCESS_TOKEN ou FRESHSALES_REFRESH_TOKEN não definidos' }, 400);
      }

      // Calcula expires_in a partir do timestamp de expiração salvo (mais preciso)
      const now_ms      = Date.now();
      const computed_in = expiry_ts > now_ms
        ? Math.round((expiry_ts - now_ms) / 1000)
        : expires_in_s;

      await storeTokens({
        access_token,
        refresh_token,
        expires_in: computed_in,
        token_type: Deno.env.get('FRESHSALES_TOKEN_TYPE') ?? 'Bearer',
        scope:      SCOPES,
      });

      return json({ ok: true, seeded: true, expires_in: computed_in });
    }

    return json({ error: 'acao_desconhecida', actions: ['authorize', 'callback', 'token', 'status', 'refresh', 'seed'] }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('oauth error:', msg);
    return json({ error: 'internal', details: msg }, 500);
  }
});
