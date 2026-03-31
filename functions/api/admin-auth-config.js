function cleanEnvValue(value) {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

export async function onRequestGet(context) {
  try {
    const { env } = context;
    const url =
      cleanEnvValue(env.SUPABASE_URL) ||
      cleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL) ||
      null;
    const anonKey =
      cleanEnvValue(env.SUPABASE_ANON_KEY) ||
      cleanEnvValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
      null;

    if (!url || !anonKey) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Configuracao publica do Supabase ausente no ambiente.",
          hasUrl: Boolean(url),
          hasAnonKey: Boolean(anonKey),
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
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Falha ao montar configuracao publica do Supabase.",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
