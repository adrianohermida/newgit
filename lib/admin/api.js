import { getSupabaseBrowserClient } from "../supabase";

const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_FETCH_MAX_RETRIES = 2;
const ACCESS_TOKEN_CACHE_TTL_MS = 15_000;
let accessTokenCache = {
  token: null,
  expiresAt: 0,
};

function looksLikeHtmlDocument(value) {
  const text = String(value || "").trim();
  return /^<!doctype html/i.test(text) || /^<html[\s>]/i.test(text);
}

function buildInvalidPayload(rawText, parseError) {
  const text = String(rawText || "").trim();
  const parseMessage = String(parseError?.message || "").trim();
  if (!text) {
    return {
      ok: false,
      error: "Resposta administrativa vazia.",
      errorType: "empty_response",
    };
  }
  if (looksLikeHtmlDocument(text)) {
    const exceededResources = /worker exceeded resource limits/i.test(text);
    return {
      ok: false,
      error: exceededResources
        ? "Worker exceeded resource limits. Reduza o lote ou a pagina antes de tentar novamente."
        : "Resposta HTML inesperada na chamada administrativa.",
      errorType: exceededResources ? "resource_limits" : "html_response",
      raw: text.slice(0, 500),
    };
  }
  return {
    ok: false,
    error: parseMessage || "Resposta JSON invalida na chamada administrativa.",
    errorType: "invalid_json",
    raw: text.slice(0, 500),
  };
}

export class AdminApiError extends Error {
  constructor(message, status = 500, payload = null) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function getAccessToken() {
  if (accessTokenCache.token && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token;
  }

  const supabase = await getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase nao configurado no frontend.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sessao administrativa ausente.");
  }

  accessTokenCache = {
    token: session.access_token,
    expiresAt: Date.now() + ACCESS_TOKEN_CACHE_TTL_MS,
  };

  return session.access_token;
}

export async function getAdminAccessToken() {
  return getAccessToken();
}

export async function adminFetch(path, init = {}, options = {}) {
  const timeoutMs = Number(options?.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_FETCH_TIMEOUT_MS;
  const maxRetries = Number.isInteger(options?.maxRetries) && options.maxRetries >= 0
    ? options.maxRetries
    : DEFAULT_FETCH_MAX_RETRIES;

  let effectivePath = path;

  if (typeof effectivePath === "string" && effectivePath.startsWith("/functions/api/")) {
    effectivePath = effectivePath.replace(/^\/functions\/api\//, "/api/");
  }

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const accessToken = await getAccessToken();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(effectivePath, {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(init.headers || {}),
          },
        });

        const rawText = await response.text().catch(() => "");
        let payload = {};
        if (rawText) {
          try {
            payload = JSON.parse(rawText);
          } catch (parseError) {
            payload = buildInvalidPayload(rawText, parseError);
          }
        }

        const retryablePayloadError = ["invalid_json", "html_response", "resource_limits", "empty_response"].includes(String(payload?.errorType || ""));

        if (!response.ok || payload.ok === false) {
          if ((response.status === 404 || response.status === 405) && typeof effectivePath === "string" && effectivePath.startsWith("/api/admin-")) {
            throw new AdminApiError(
              "Runtime administrativo indisponivel na rota canonica. Verifique se o deploy publicou Cloudflare Pages Functions para /api/* em vez de apenas o site estatico.",
              response.status || 500,
              {
                ...payload,
                ok: false,
                errorType: "admin_runtime_unavailable",
                canonicalPath: effectivePath,
              }
            );
          }

          const retryableStatus = response.status >= 500 || response.status === 429;
          if ((retryableStatus || (response.ok && retryablePayloadError)) && attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
            continue;
          }
          throw new AdminApiError(
            payload.error || "Falha na chamada administrativa.",
            response.status || 500,
            payload
          );
        }

        return payload;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error;
      const isTimeout = error?.name === "AbortError";
      const isNetwork = String(error?.message || "").toLowerCase().includes("fetch");

      if ((isTimeout || isNetwork) && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
        continue;
      }

      if (isTimeout) {
        throw new AdminApiError("Timeout na chamada administrativa.", 504, { ok: false, errorType: "timeout" });
      }
      throw error;
    }
  }

  throw lastError || new AdminApiError("Falha na chamada administrativa.");
}
