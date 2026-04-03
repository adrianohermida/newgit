import { getSupabaseBrowserClient } from "../supabase";

const DEFAULT_FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_FETCH_MAX_RETRIES = 2;

export class AdminApiError extends Error {
  constructor(message, status = 500, payload = null) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.payload = payload;
  }
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
    throw new Error("Sessao administrativa ausente.");
  }

  return session.access_token;
}

export async function adminFetch(path, init = {}, options = {}) {
  const timeoutMs = Number(options?.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_FETCH_TIMEOUT_MS;
  const maxRetries = Number.isInteger(options?.maxRetries) && options.maxRetries >= 0
    ? options.maxRetries
    : DEFAULT_FETCH_MAX_RETRIES;

  let effectivePath = path;
  let routeFallbackApplied = false;

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
          } catch {
            payload = {
              ok: false,
              error: rawText.slice(0, 500) || "Falha na chamada administrativa.",
            };
          }
        }

        if (!response.ok || payload.ok === false) {
          if (
            response.status === 404 &&
            !routeFallbackApplied &&
            typeof effectivePath === "string" &&
            effectivePath.includes("/api/admin-dotobot-chat")
          ) {
            effectivePath = effectivePath.replace("/api/admin-dotobot-chat", "/api/admin-lawdesk-chat");
            routeFallbackApplied = true;
            continue;
          }

          const retryableStatus = response.status >= 500 || response.status === 429;
          if (retryableStatus && attempt < maxRetries) {
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
