export function getCleanEnvValue(value) {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function inspectSupabaseKey(value) {
  const key = getCleanEnvValue(value);
  if (!key) {
    return { exists: false, format: 'missing', dotCount: 0 };
  }

  if (key.startsWith('sb_secret_')) {
    return { exists: true, format: 'sb_secret', dotCount: 0 };
  }

  if (key.startsWith('eyJ')) {
    const dotCount = (key.match(/\./g) || []).length;
    return {
      exists: true,
      format: dotCount === 2 ? 'jwt' : 'malformed_jwt',
      dotCount,
    };
  }

  return { exists: true, format: 'unknown', dotCount: 0 };
}

export function getSupabaseApiKey(env) {
  return (
    getCleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) ||
    getCleanEnvValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    getCleanEnvValue(env.SUPABASE_ANON_KEY) ||
    null
  );
}

export function getSupabaseServerKey(env) {
  return getCleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) || null;
}
