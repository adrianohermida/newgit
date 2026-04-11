/**
 * Freshsales Suite OAuth 2.0 via Supabase Edge Function
 *
 * Supported query params:
 * - action=authorize|callback|token|status|refresh|seed
 * - kind=deals|contacts
 *
 * Backward compatibility:
 * - kind=deals is the default
 * - provider "freshsales" is kept for deals tokens
 * - provider "freshsales_contacts" is used for contacts tokens
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ORG_DOMAIN = Deno.env.get('FRESHSALES_ORG_DOMAIN') ?? Deno.env.get('FRESHSALES_DOMAIN') ?? 'hmadv-org.myfreshworks.com';
const REDIRECT_URI = Deno.env.get('FRESHSALES_REDIRECT_URI') ?? Deno.env.get('REDIRECT_URI') ?? `${SUPABASE_URL}/functions/v1/oauth`;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type OAuthKind = 'deals' | 'contacts';

interface TokenRow {
  provider: string;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  token_type: string;
  scope: string | null;
  updated_at: string;
}

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
      '<style>body{font-family:sans-serif;max-width:640px;margin:80px auto;padding:0 20px}</style></head>' +
      `<body>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  );
}

function normalizeKind(value: string | null): OAuthKind {
  return value === 'contacts' ? 'contacts' : 'deals';
}

function encodeState(kind: OAuthKind) {
  return `${kind}:${crypto.randomUUID()}`;
}

function decodeStateKind(value: string | null): OAuthKind {
  const prefix = String(value || '').split(':')[0];
  return normalizeKind(prefix || null);
}

function resolveConfig(kind: OAuthKind) {
  const isContacts = kind === 'contacts';
  const clientId = isContacts
    ? Deno.env.get('FRESHSALES_OAUTH_CONTACTS_CLIENT_ID') ?? Deno.env.get('FRESHSALES_OAUTH_CLIENT_ID') ?? ''
    : Deno.env.get('FRESHSALES_OAUTH_DEALS_CLIENT_ID') ?? Deno.env.get('FRESHSALES_OAUTH_CLIENT_ID') ?? '';
  const clientSecret = isContacts
    ? Deno.env.get('FRESHSALES_OAUTH_CONTACTS_CLIENT_SECRET') ?? Deno.env.get('FRESHSALES_OAUTH_CLIENT_SECRET') ?? ''
    : Deno.env.get('FRESHSALES_OAUTH_DEALS_CLIENT_SECRET') ?? Deno.env.get('FRESHSALES_OAUTH_CLIENT_SECRET') ?? '';
  const scopes = isContacts
    ? Deno.env.get('FRESHSALES_CONTACTS_SCOPES') ?? Deno.env.get('FRESHSALES_SCOPES') ?? ''
    : Deno.env.get('FRESHSALES_DEALS_SCOPES') ?? Deno.env.get('FRESHSALES_SCOPES') ?? '';

  return {
    kind,
    provider: isContacts ? 'freshsales_contacts' : 'freshsales',
    clientId,
    clientSecret,
    scopes,
    authorizeUrl: `https://${ORG_DOMAIN}/org/oauth/v2/authorize`,
    tokenUrl: `https://${ORG_DOMAIN}/org/oauth/v2/token`,
  };
}

async function storeTokens(
  provider: string,
  fallbackScope: string,
  tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type?: string;
    scope?: string;
  },
) {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  const { error } = await db
    .from('freshsales_oauth_tokens')
    .upsert(
      {
        provider,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? null,
        expires_at: expiresAt,
        token_type: tokens.token_type ?? 'Bearer',
        scope: tokens.scope ?? fallbackScope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'provider' },
    );
  if (error) throw new Error(`Falha ao salvar tokens: ${error.message}`);
}

async function getStoredTokens(provider: string): Promise<TokenRow | null> {
  const { data, error } = await db
    .from('freshsales_oauth_tokens')
    .select('*')
    .eq('provider', provider)
    .maybeSingle();
  if (error || !data) return null;
  return data as TokenRow;
}

async function exchangeCode(code: string, kind: OAuthKind): Promise<Record<string, unknown>> {
  const config = resolveConfig(kind);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
    code,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Troca de codigo falhou (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function refreshTokens(refreshToken: string, kind: OAuthKind): Promise<Record<string, unknown>> {
  const config = resolveConfig(kind);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
    },
    body,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Refresh falhou (${response.status}): ${JSON.stringify(payload)}`);
  }
  return payload;
}

async function getValidToken(kind: OAuthKind): Promise<string | null> {
  const config = resolveConfig(kind);
  const stored = await getStoredTokens(config.provider);
  if (!stored) return null;

  const expiresAt = new Date(stored.expires_at).getTime();
  const isExpired = Date.now() >= expiresAt - 60_000;
  if (isExpired && stored.refresh_token) {
    const refreshed = await refreshTokens(stored.refresh_token, kind);
    await storeTokens(config.provider, config.scopes, refreshed as Parameters<typeof storeTokens>[2]);
    return (refreshed as { access_token: string }).access_token;
  }

  return stored.access_token;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') ?? '';
  const method = req.method;
  const requestedKind = normalizeKind(url.searchParams.get('kind'));

  if (method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  try {
    if (action === 'authorize' && method === 'GET') {
      const config = resolveConfig(requestedKind);
      if (!config.clientId || !config.clientSecret || !config.scopes) {
        return json({ error: 'oauth_config_missing', kind: requestedKind }, 400);
      }

      const authUrl = new URL(config.authorizeUrl);
      authUrl.searchParams.set('client_id', config.clientId);
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('state', encodeState(requestedKind));
      authUrl.searchParams.set('scope', config.scopes);
      return Response.redirect(authUrl.toString(), 302);
    }

    if (action === 'callback' || (method === 'GET' && url.searchParams.has('code'))) {
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      const kind = normalizeKind(url.searchParams.get('kind') ?? decodeStateKind(url.searchParams.get('state')));
      const config = resolveConfig(kind);

      if (error) {
        return htmlPage(
          'Erro OAuth',
          `<h2>Falha na autorizacao</h2><p><code>${error}</code></p><p>${url.searchParams.get('error_description') ?? ''}</p>`,
        );
      }
      if (!code) return json({ error: 'code_ausente' }, 400);
      if (!config.clientId || !config.clientSecret) {
        return json({ error: 'oauth_config_missing', kind }, 400);
      }

      const tokens = await exchangeCode(code, kind);
      await storeTokens(config.provider, config.scopes, tokens as Parameters<typeof storeTokens>[2]);

      return htmlPage(
        'OAuth Freshsales',
        `<h2>Autorizacao concluida</h2><p><strong>Modulo:</strong> ${kind}</p><p>Tokens armazenados com sucesso.</p><p><strong>Expira em:</strong> ${String((tokens as { expires_in?: number }).expires_in ?? '')}s</p><p>Voce pode fechar esta janela.</p>`,
      );
    }

    if (action === 'token' && method === 'GET') {
      const token = await getValidToken(requestedKind);
      if (!token) return json({ error: 'nao_autorizado', kind: requestedKind, hint: 'Acesse ?action=authorize' }, 404);
      return json({ access_token: token, token_type: 'Bearer', kind: requestedKind });
    }

    if (action === 'status' || (method === 'GET' && !action)) {
      const config = resolveConfig(requestedKind);
      const stored = await getStoredTokens(config.provider);
      if (!stored) return json({ authorized: false, kind: requestedKind, hint: 'Acesse ?action=authorize' });

      const expiresAt = new Date(stored.expires_at).getTime();
      const valid = Date.now() < expiresAt - 60_000;
      const expiresInMs = expiresAt - Date.now();

      return json({
        kind: requestedKind,
        authorized: true,
        valid,
        expires_at: stored.expires_at,
        expires_in_s: Math.round(expiresInMs / 1000),
        has_refresh_token: !!stored.refresh_token,
        updated_at: stored.updated_at,
      });
    }

    if (action === 'refresh' && method === 'POST') {
      const config = resolveConfig(requestedKind);
      const stored = await getStoredTokens(config.provider);
      if (!stored?.refresh_token) return json({ error: 'refresh_token_ausente', kind: requestedKind }, 404);

      const tokens = await refreshTokens(stored.refresh_token, requestedKind);
      await storeTokens(config.provider, config.scopes, tokens as Parameters<typeof storeTokens>[2]);

      return json({
        ok: true,
        kind: requestedKind,
        expires_in: (tokens as { expires_in?: number }).expires_in ?? null,
        updated_at: new Date().toISOString(),
      });
    }

    if (action === 'seed' && method === 'POST') {
      const config = resolveConfig(requestedKind);
      const accessToken = Deno.env.get('FRESHSALES_ACCESS_TOKEN');
      const refreshToken = Deno.env.get('FRESHSALES_REFRESH_TOKEN');
      const expiresInEnv = Number(Deno.env.get('FRESHSALES_EXPIRES_IN') ?? '1799');
      const expiryTs = Number(Deno.env.get('FRESHSALES_TOKEN_EXPIRY') ?? '0');

      if (!accessToken || !refreshToken) {
        return json({ error: 'FRESHSALES_ACCESS_TOKEN ou FRESHSALES_REFRESH_TOKEN nao definidos' }, 400);
      }

      const computedIn = expiryTs > Date.now()
        ? Math.round((expiryTs - Date.now()) / 1000)
        : expiresInEnv;

      await storeTokens(config.provider, config.scopes, {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: computedIn,
        token_type: Deno.env.get('FRESHSALES_TOKEN_TYPE') ?? 'Bearer',
        scope: config.scopes,
      });

      return json({ ok: true, seeded: true, kind: requestedKind, expires_in: computedIn });
    }

    return json({
      error: 'acao_desconhecida',
      actions: ['authorize', 'callback', 'token', 'status', 'refresh', 'seed'],
    }, 400);
  } catch (err) {
    const details = err instanceof Error ? err.message : String(err);
    console.error('oauth error:', details);
    return json({ error: 'internal', details }, 500);
  }
});
