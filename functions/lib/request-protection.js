import { getCleanEnvValue } from './env.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const MIN_FORM_FILL_MS = 1500;

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function parseUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function getAllowedOrigins(env) {
  const configured = [
    getCleanEnvValue(env.SITE_URL),
    getCleanEnvValue(env.PUBLIC_SITE_URL),
    getCleanEnvValue(env.NEXT_PUBLIC_SITE_URL),
  ]
    .map(parseUrl)
    .filter(Boolean)
    .map((url) => url.origin);

  return Array.from(
    new Set([
      ...configured,
      'https://hermidamaia.adv.br',
      'http://localhost:3000',
      'http://localhost:8788',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:8788',
    ])
  );
}

function getRequestOrigin(request) {
  const originHeader = request.headers.get('origin');
  const refererHeader = request.headers.get('referer');

  const origin = parseUrl(originHeader)?.origin;
  if (origin) return origin;

  const referer = parseUrl(refererHeader)?.origin;
  return referer || null;
}

function getTurnstileToken(request, body) {
  return (
    body?.turnstileToken ||
    body?.turnstile_token ||
    request.headers.get('cf-turnstile-response') ||
    null
  );
}

async function verifyTurnstile(secretKey, token, ip) {
  const formData = new FormData();
  formData.set('secret', secretKey);
  formData.set('response', token);
  if (ip) {
    formData.set('remoteip', ip);
  }

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    return { ok: false, reason: `turnstile_http_${response.status}` };
  }

  const payload = await response.json().catch(() => ({}));
  return {
    ok: Boolean(payload.success),
    reason: Array.isArray(payload['error-codes']) ? payload['error-codes'].join(',') : null,
  };
}

export async function validatePublicMutationRequest(request, env, body, options = {}) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse(415, {
      ok: false,
      error: 'Tipo de conteudo invalido.',
      code: 'invalid_content_type',
    });
  }

  const origin = getRequestOrigin(request);
  const allowedOrigins = getAllowedOrigins(env);
  if (!origin || !allowedOrigins.includes(origin)) {
    return jsonResponse(403, {
      ok: false,
      error: 'Origem da requisicao nao autorizada.',
      code: 'origin_not_allowed',
    });
  }

  const honeypotFields = options.honeypotFields || ['website', 'company_url'];
  const honeypotFilled = honeypotFields.some((field) => {
    const value = body?.[field];
    return typeof value === 'string' && value.trim() !== '';
  });

  if (honeypotFilled) {
    return jsonResponse(400, {
      ok: false,
      error: 'Requisicao bloqueada.',
      code: 'honeypot_triggered',
    });
  }

  const startedAt = Number(body?.startedAt || body?.started_at || 0);
  if (Number.isFinite(startedAt) && startedAt > 0) {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_FORM_FILL_MS) {
      return jsonResponse(429, {
        ok: false,
        error: 'Envio muito rapido. Tente novamente.',
        code: 'submission_too_fast',
      });
    }
  }

  const turnstileSecret = getCleanEnvValue(env.TURNSTILE_SECRET_KEY);
  if (turnstileSecret) {
    const token = getTurnstileToken(request, body);
    if (!token) {
      return jsonResponse(403, {
        ok: false,
        error: 'Validacao anti-bot obrigatoria ausente.',
        code: 'turnstile_required',
      });
    }

    const ip =
      request.headers.get('CF-Connecting-IP') ||
      request.headers.get('X-Forwarded-For') ||
      null;
    const verification = await verifyTurnstile(turnstileSecret, token, ip);
    if (!verification.ok) {
      return jsonResponse(403, {
        ok: false,
        error: 'Validacao anti-bot falhou.',
        code: 'turnstile_failed',
        detail: verification.reason,
      });
    }
  }

  return null;
}
