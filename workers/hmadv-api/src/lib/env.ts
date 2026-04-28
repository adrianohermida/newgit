import type { Env } from '../env.d';

export function getCleanEnvValue(value: string | undefined | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed || null;
}

export function getSupabaseBaseUrl(env: Env): string | null {
  return getCleanEnvValue(env.SUPABASE_URL) || getCleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL);
}

export function getSupabaseAnonKey(env: Env): string | null {
  return (
    getCleanEnvValue(env.SUPABASE_ANON_KEY) ||
    getCleanEnvValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export function getSupabaseServiceKey(env: Env): string | null {
  return getCleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSiteUrl(env: Env): string {
  return getCleanEnvValue(env.SITE_URL) || 'https://hermidamaia.adv.br';
}

export function getProcessAiBase(env: Env): string | null {
  return getCleanEnvValue(env.PROCESS_AI_BASE);
}

export function getAiSharedSecret(env: Env): string | null {
  return (
    getCleanEnvValue(env.HMDAV_AI_SHARED_SECRET) ||
    getCleanEnvValue(env.HMADV_AI_SHARED_SECRET)
  );
}

/** Resposta JSON padronizada de erro de configuração */
export function missingEnvResponse(missing: string[], route: string): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: 'Configuração incompleta no servidor. Variáveis de ambiente ausentes.',
      ausentes: missing,
      route,
    }),
    { status: 500, headers: { 'Content-Type': 'application/json' } }
  );
}
