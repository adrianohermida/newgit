import { getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";

function buildSupabaseUrl(env, path) {
  const baseUrl = getSupabaseBaseUrl(env);
  const apiKey = getSupabaseServerKey(env);

  if (!baseUrl || !apiKey) {
    throw new Error("Configuracao do Supabase incompleta para acesso administrativo.");
  }

  return {
    url: `${baseUrl}/rest/v1/${path}`,
    apiKey,
  };
}

export async function fetchSupabaseAdmin(env, path, init = {}) {
  const { url, apiKey } = buildSupabaseUrl(env, path);

  const response = await fetch(url, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Supabase admin request failed with status ${response.status}`);
  }

  return response.json();
}
