function cleanEnvValue(value) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizeSupabaseKey(value) {
  const key = cleanEnvValue(value);
  if (!key || typeof key !== "string") {
    return { key, repaired: false };
  }

  if (!key.startsWith("eyJ")) {
    return { key, repaired: false };
  }

  const dotCount = (key.match(/\./g) || []).length;
  if (dotCount === 2) {
    return { key, repaired: false };
  }

  let candidateStart = key.indexOf("eyJ", 1);
  while (candidateStart !== -1) {
    const candidate = key.slice(candidateStart);
    if ((candidate.match(/\./g) || []).length === 2) {
      return { key: candidate, repaired: true };
    }
    candidateStart = key.indexOf("eyJ", candidateStart + 1);
  }

  return { key, repaired: false };
}

function getSupabaseBaseUrl() {
  return cleanEnvValue(process.env.SUPABASE_URL) || cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

function getSupabaseApiKey() {
  return (
    normalizeSupabaseKey(process.env.SUPABASE_SERVICE_ROLE_KEY).key ||
    cleanEnvValue(process.env.SUPABASE_ANON_KEY) ||
    cleanEnvValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    null
  );
}

function getSupabaseServiceKey() {
  return normalizeSupabaseKey(process.env.SUPABASE_SERVICE_ROLE_KEY).key || null;
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
}

export async function fetchSupabaseAdmin(path, init = {}) {
  const baseUrl = getSupabaseBaseUrl();
  const serviceKey = getSupabaseServiceKey();

  if (!baseUrl || !serviceKey) {
    throw new Error("Configuracao administrativa do Supabase incompleta.");
  }

  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
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

async function getSupabaseUser(accessToken) {
  const baseUrl = getSupabaseBaseUrl();
  const apiKey = getSupabaseApiKey();

  if (!baseUrl || !apiKey) {
    throw new Error("Configuracao do Supabase incompleta para validar sessao administrativa.");
  }

  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function getAdminProfile(userId) {
  const params = new URLSearchParams();
  params.set("select", "id,email,full_name,role,is_active");
  params.set("id", `eq.${userId}`);
  params.set("limit", "1");

  const rows = await fetchSupabaseAdmin(`admin_profiles?${params.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function requireAdminApiAccess(req) {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return { ok: false, status: 401, error: "Token administrativo ausente." };
  }

  const serviceKey = getSupabaseServiceKey();
  if (!serviceKey) {
    return { ok: false, status: 500, error: "SUPABASE_SERVICE_ROLE_KEY ausente no ambiente." };
  }

  const user = await getSupabaseUser(accessToken);
  if (!user?.id) {
    return { ok: false, status: 401, error: "Sessao administrativa invalida ou expirada." };
  }

  const profile = await getAdminProfile(user.id);
  if (!profile || !profile.is_active) {
    return { ok: false, status: 403, error: "Usuario autenticado sem perfil administrativo ativo." };
  }

  return { ok: true, user, profile };
}

export async function listFreshdeskTickets(filters = {}) {
  const domain = cleanEnvValue(process.env.FRESHDESK_DOMAIN)?.replace(/\/+$/, "");
  const token = cleanEnvValue(process.env.FRESHDESK_BASIC_TOKEN);

  if (!domain || !token) {
    throw new Error("Configuracao do Freshdesk incompleta no ambiente.");
  }

  const params = new URLSearchParams();
  params.set("per_page", String(filters.perPage || 30));
  params.set("page", String(filters.page || 1));

  if (filters.email) {
    params.set("email", filters.email);
  }

  const response = await fetch(`${domain}/api/v2/tickets?${params.toString()}`, {
    headers: {
      Authorization: token,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(detail || `Freshdesk request failed with status ${response.status}`);
  }

  return response.json();
}
