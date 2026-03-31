import { getSupabaseBrowserClient } from "../supabase";

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
  const accessToken = await getAccessToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Falha na chamada do portal do cliente.");
  }

  return payload;
}
