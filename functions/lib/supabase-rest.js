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

function parseContentRangeCount(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/\/(\d+|\*)$/);
  if (!match || match[1] === "*") return null;
  const count = Number(match[1]);
  return Number.isFinite(count) ? count : null;
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

  if (response.status === 204) return null;
  const text = await response.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Supabase admin response invalida: ${error?.message || "JSON invalido"}`);
  }
}

export async function countSupabaseAdmin(env, path, options = {}) {
  const { url, apiKey } = buildSupabaseUrl(env, path);
  const response = await fetch(url, {
    method: "HEAD",
    ...options,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Prefer: "count=exact",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Supabase admin count failed with status ${response.status}`);
  }

  return parseContentRangeCount(response.headers.get("content-range"));
}
