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

export function getSupabaseBaseUrl(env) {
  return (
    getCleanEnvValue(env.SUPABASE_URL) ||
    getCleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL) ||
    null
  );
}

export function normalizeSupabaseKey(value) {
  const key = getCleanEnvValue(value);
  if (!key || typeof key !== 'string') {
    return { key, repaired: false, repairHint: null };
  }

  if (!key.startsWith('eyJ')) {
    return { key, repaired: false, repairHint: null };
  }

  const dotCount = (key.match(/\./g) || []).length;
  if (dotCount === 2) {
    return { key, repaired: false, repairHint: null };
  }

  if (dotCount > 2) {
    const trimmedCandidate = key.split('.').slice(0, 3).join('.');
    if (trimmedCandidate.startsWith('eyJ') && (trimmedCandidate.match(/\./g) || []).length === 2) {
      return {
        key: trimmedCandidate,
        repaired: true,
        repairHint: 'jwt_trimmed_to_three_segments',
      };
    }
  }

  const candidateStarts = [];
  let searchIndex = key.indexOf('eyJ', 1);
  while (searchIndex !== -1) {
    candidateStarts.push(searchIndex);
    searchIndex = key.indexOf('eyJ', searchIndex + 1);
  }

  for (let index = candidateStarts.length - 1; index >= 0; index -= 1) {
    const start = candidateStarts[index];
    const candidate = key.slice(start);
    const candidateDotCount = (candidate.match(/\./g) || []).length;
    if (candidate.startsWith('eyJ') && candidateDotCount === 2) {
      return {
        key: candidate,
        repaired: true,
        repairHint: 'suffix_jwt_extracted',
      };
    }
  }

  return { key, repaired: false, repairHint: null };
}

export function inspectSupabaseKey(value) {
  const normalized = normalizeSupabaseKey(value);
  const key = normalized.key;
  if (!key) {
    return { exists: false, format: 'missing', dotCount: 0, repaired: false };
  }

  if (key.startsWith('sb_secret_')) {
    return { exists: true, format: 'sb_secret', dotCount: 0, repaired: normalized.repaired };
  }

  if (key.startsWith('eyJ')) {
    const dotCount = (key.match(/\./g) || []).length;
    return {
      exists: true,
      format: dotCount === 2 ? 'jwt' : 'malformed_jwt',
      dotCount,
      repaired: normalized.repaired,
      repairHint: normalized.repairHint,
    };
  }

  return { exists: true, format: 'unknown', dotCount: 0, repaired: normalized.repaired };
}

export function getSupabaseApiKey(env) {
  return (
    getCleanEnvValue(env.SUPABASE_ANON_KEY) ||
    getCleanEnvValue(env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    null
  );
}

export function getSupabaseServerKey(env) {
  return normalizeSupabaseKey(env.SUPABASE_SERVICE_ROLE_KEY).key || null;
}
