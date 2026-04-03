import { getSupabaseBrowserClient } from "../supabase";

const CACHE_PREFIX = "hmadv.portal.cache.v2";
const inFlightRequests = new Map();

const CACHE_TTLS = [
  { prefix: "/api/client-consultas", ttlMs: 5 * 60 * 1000 },
  { prefix: "/api/client-financeiro", ttlMs: 5 * 60 * 1000 },
  { prefix: "/api/client-processos", ttlMs: 10 * 60 * 1000 },
  { prefix: "/api/client-publicacoes", ttlMs: 15 * 60 * 1000 },
  { prefix: "/api/client-documentos", ttlMs: 15 * 60 * 1000 },
  { prefix: "/api/client-processo", ttlMs: 10 * 60 * 1000 },
  { prefix: "/api/client-profile", ttlMs: 10 * 60 * 1000 },
];

function getCacheTtl(path) {
  const matched = CACHE_TTLS.find((item) => path.startsWith(item.prefix));
  return matched ? matched.ttlMs : 5 * 60 * 1000;
}

function getCacheKey(path) {
  return `${CACHE_PREFIX}:${path}`;
}

function readCachedPayload(path) {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(getCacheKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.payload || !parsed?.cachedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedPayload(path, payload) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(
      getCacheKey(path),
      JSON.stringify({
        path,
        cachedAt: new Date().toISOString(),
        payload,
      })
    );
  } catch {
    // noop
  }
}

function isCacheFresh(entry, path) {
  if (!entry?.cachedAt) return false;
  const cachedAt = new Date(entry.cachedAt).getTime();
  if (!Number.isFinite(cachedAt)) return false;
  return Date.now() - cachedAt <= getCacheTtl(path);
}

function withCacheMeta(payload, entry, flags = {}) {
  if (!entry?.cachedAt) return payload;

  const warning = flags.stale
    ? payload.warning || "Exibindo os dados salvos mais recentemente enquanto a conexao e a sincronizacao se restabelecem."
    : payload.warning || null;

  return {
    ...payload,
    warning,
    cache: {
      cached: true,
      stale: Boolean(flags.stale),
      offline: Boolean(flags.offline),
      cached_at: entry.cachedAt,
    },
  };
}

async function getAccessToken() {
  const supabase = await getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error("Supabase nao configurado no frontend.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sessao do portal ausente.");
  }

  return session.access_token;
}

export async function clientFetch(path, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const cachedEntry = isGet ? readCachedPayload(path) : null;

  if (isGet && typeof navigator !== "undefined" && navigator.onLine === false && cachedEntry?.payload) {
    return withCacheMeta(cachedEntry.payload, cachedEntry, { stale: true, offline: true });
  }

  const dedupeKey = isGet ? `${method}:${path}` : null;
  if (dedupeKey && inFlightRequests.has(dedupeKey)) {
    return inFlightRequests.get(dedupeKey);
  }

  const requestPromise = (async () => {
    const accessToken = await getAccessToken();
    const response = await fetch(path, {
      ...init,
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.headers || {}),
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      if (isGet && cachedEntry?.payload) {
        return withCacheMeta(cachedEntry.payload, cachedEntry, { stale: true });
      }
      throw new Error(payload.error || "Falha na chamada do portal do cliente.");
    }

    if (isGet) {
      writeCachedPayload(path, payload);
      return withCacheMeta(payload, { cachedAt: new Date().toISOString() });
    }

    return payload;
  })().finally(() => {
    if (dedupeKey) inFlightRequests.delete(dedupeKey);
  });

  if (dedupeKey) {
    inFlightRequests.set(dedupeKey, requestPromise);
  }

  try {
    return await requestPromise;
  } catch (error) {
    if (isGet && cachedEntry?.payload && isCacheFresh(cachedEntry, path)) {
      return withCacheMeta(cachedEntry.payload, cachedEntry, { stale: true });
    }
    throw error;
  }
}
