import { getSupabaseBrowserClient } from "../supabase";

const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_FETCH_MAX_RETRIES = 2;
const ACCESS_TOKEN_CACHE_TTL_MS = 15_000;
const GET_RESPONSE_CACHE_TTL_MS = 10_000;
let accessTokenCache = {
  token: null,
  expiresAt: 0,
};
const adminGetResponseCache = new Map();
const adminGetInflightRequests = new Map();

function clonePayload(payload) {
  if (payload == null) return payload;
  return JSON.parse(JSON.stringify(payload));
}

function normalizeAdminPath(path) {
  if (typeof path !== "string") return path;
  return path.startsWith("/functions/api/")
    ? path.replace(/^\/functions\/api\//, "/api/")
    : path;
}

function buildAdminPathCandidates(path) {
  const normalized = normalizeAdminPath(path);
  const candidates = [normalized];
  if (normalized === "/api/admin-lawdesk-chat") {
    candidates.push("/functions/api/admin-lawdesk-chat");
  }
  return [...new Set(candidates.filter(Boolean))];
}

function buildAdminCacheKey(path, init = {}) {
  const method = String(init?.method || "GET").toUpperCase();
  const headers = init?.headers ? JSON.stringify(init.headers) : "";
  const body = typeof init?.body === "string" ? init.body : "";
  return `${method}:${path}:${headers}:${body}`;
}

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

export function resetAdminAccessTokenCache() {
  accessTokenCache = {
    token: null,
    expiresAt: 0,
  };
}

function cacheAccessToken(token) {
  accessTokenCache = {
    token,
    expiresAt: Date.now() + ACCESS_TOKEN_CACHE_TTL_MS,
  };
  return token;
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

  if (session?.access_token) {
    return cacheAccessToken(session.access_token);
  }

  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();

  if (refreshError) {
    throw new Error(refreshError.message || "Sessao administrativa expirada.");
  }

  if (!refreshed?.session?.access_token) {
    throw new Error("Sessao administrativa ausente.");
  }

  return cacheAccessToken(refreshed.session.access_token);
}

export async function getAdminAccessToken() {
  return getAccessToken();
}

export async function adminFetch(path, init = {}, options = {}) {
  const timeoutMs = Number(options?.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_FETCH_TIMEOUT_MS;
  const maxRetries = Number.isInteger(options?.maxRetries) && options.maxRetries >= 0
    ? options.maxRetries
    : DEFAULT_FETCH_MAX_RETRIES;
  const method = String(init?.method || "GET").toUpperCase();
  const shouldCacheGet = method === "GET" && options?.cache !== false;
  const cacheTtlMs = Number(options?.cacheTtlMs) > 0 ? Number(options.cacheTtlMs) : GET_RESPONSE_CACHE_TTL_MS;

  const pathCandidates = buildAdminPathCandidates(path);
  const primaryPath = pathCandidates[0];

  const cacheKey = shouldCacheGet ? buildAdminCacheKey(primaryPath, init) : "";
  if (shouldCacheGet) {
    const cachedEntry = adminGetResponseCache.get(cacheKey);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return clonePayload(cachedEntry.payload);
    }

    const inflightRequest = adminGetInflightRequests.get(cacheKey);
    if (inflightRequest) {
      return inflightRequest.then((payload) => clonePayload(payload));
    }
  }

  const executeRequest = async () => {
    let lastError = null;
    let lastAdminRuntimeError = null;
    attemptLoop:
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const accessToken = await getAccessToken();
        for (let pathIndex = 0; pathIndex < pathCandidates.length; pathIndex += 1) {
          const effectivePath = pathCandidates[pathIndex];
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
              if (response.status === 401 && attempt < maxRetries) {
                resetAdminAccessTokenCache();
                await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 250));
                continue attemptLoop;
              }

              const isCanonicalAdminRoute =
                response.status === 404 ||
                response.status === 405;

              if (
                isCanonicalAdminRoute &&
                typeof effectivePath === "string" &&
                effectivePath.startsWith("/api/admin-") &&
                pathIndex < pathCandidates.length - 1
              ) {
                lastAdminRuntimeError = new AdminApiError(
                  "Runtime administrativo indisponivel na rota canonica. Tentando rota alternativa publicada no deploy.",
                  response.status || 500,
                  {
                    ...payload,
                    ok: false,
                    errorType: "admin_runtime_unavailable",
                    canonicalPath: effectivePath,
                    attemptedPath: effectivePath,
                    fallbackPath: pathCandidates[pathIndex + 1],
                  }
                );
                continue;
              }

              if (
                isCanonicalAdminRoute &&
                typeof effectivePath === "string" &&
                (effectivePath.startsWith("/api/admin-") || effectivePath.startsWith("/functions/api/"))
              ) {
                throw new AdminApiError(
                  "Runtime administrativo indisponivel neste deploy. Verifique se o Pages/Functions publicou a rota de chat administrativo.",
                  response.status || 500,
                  {
                    ...payload,
                    ok: false,
                    errorType: "admin_runtime_unavailable",
                    canonicalPath: primaryPath,
                    attemptedPath: effectivePath,
                    candidatePaths: pathCandidates,
                  }
                );
              }

              const retryableStatus = response.status >= 500 || response.status === 429;
              if ((retryableStatus || (response.ok && retryablePayloadError)) && attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
                continue attemptLoop;
              }
              throw new AdminApiError(
                payload.error || "Falha na chamada administrativa.",
                response.status || 500,
                {
                  ...payload,
                  attemptedPath: effectivePath,
                  candidatePaths: pathCandidates,
                }
              );
            }

            if (shouldCacheGet) {
              adminGetResponseCache.set(cacheKey, {
                payload: clonePayload(payload),
                expiresAt: Date.now() + cacheTtlMs,
              });
            }

            return payload;
          } finally {
            clearTimeout(timeoutId);
          }
        }
        if (lastAdminRuntimeError) {
          throw lastAdminRuntimeError;
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
  };

  const requestPromise = executeRequest();
  if (shouldCacheGet) {
    adminGetInflightRequests.set(cacheKey, requestPromise);
  }

  try {
    return await requestPromise;
  } finally {
    if (shouldCacheGet) {
      adminGetInflightRequests.delete(cacheKey);
    }
  }
}
