import { getCleanEnvValue, getSupabaseBaseUrl } from "../lib/env.js";

export async function onRequestGet(context) {
  const { env } = context;
  const url = getSupabaseBaseUrl(env);
  const anonKey =
    getCleanEnvValue(env.SUPABASE_ANON_KEY) ||
    getCleanEnvValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    null;

  if (!url || !anonKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Configuracao publica do Supabase ausente no ambiente.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      url,
      anonKey,
    }),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, max-age=300",
      },
    }
  );
}
