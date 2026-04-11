import { getFallbackSuperadminProfile, isFallbackSuperadminIdentity } from "../../functions/lib/superadmin.js";

function getCleanEnvValue(value) {
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

function getSupabaseBaseUrl(env) {
  return getCleanEnvValue(env.SUPABASE_URL) || getCleanEnvValue(env.NEXT_PUBLIC_SUPABASE_URL) || null;
}

function getSupabaseApiKey(env) {
  return getCleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY) || getCleanEnvValue(env.SUPABASE_ANON_KEY) || null;
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header || !String(header).startsWith("Bearer ")) return null;
  return String(header).slice("Bearer ".length).trim();
}

function buildAdminAuthFailure(status, error, errorType, details = null) {
  return {
    ok: false,
    status,
    error,
    errorType,
    details: details || null,
  };
}

async function getSupabaseUser(env, accessToken) {
  const baseUrl = getSupabaseBaseUrl(env);
  const apiKey = getSupabaseApiKey(env);

  if (!baseUrl || !apiKey) {
    throw new Error("Configuracao do Supabase incompleta para validar token administrativo.");
  }

  const response = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  return response.json();
}

async function getAdminProfile(env, userId) {
  const baseUrl = getSupabaseBaseUrl(env);
  const apiKey = getCleanEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);

  if (!baseUrl || !apiKey) {
    return null;
  }

  const response = await fetch(
    `${baseUrl}/rest/v1/admin_profiles?select=id,email,full_name,role,is_active&id=eq.${encodeURIComponent(userId)}&limit=1`,
    {
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function requireAdminNode(req) {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    return buildAdminAuthFailure(401, "Token administrativo ausente.", "missing_token");
  }

  let user = null;
  try {
    user = await getSupabaseUser(process.env, accessToken);
  } catch (error) {
    return buildAdminAuthFailure(
      503,
      error?.message || "Falha ao validar sessao administrativa.",
      "auth_provider_unavailable",
      { stage: "supabase_user" }
    );
  }

  if (!user?.id) {
    return buildAdminAuthFailure(401, "Sessao administrativa invalida ou expirada.", "invalid_session");
  }

  let profile = null;
  try {
    profile = await getAdminProfile(process.env, user.id);
  } catch (error) {
    return buildAdminAuthFailure(
      503,
      error?.message || "Falha ao carregar perfil administrativo.",
      "admin_profile_unavailable",
      { stage: "admin_profile" }
    );
  }

  if ((!profile || !profile.is_active) && isFallbackSuperadminIdentity(user)) {
    return { ok: true, user, profile: getFallbackSuperadminProfile() };
  }

  if (!profile || !profile.is_active) {
    return buildAdminAuthFailure(403, "Usuario autenticado sem perfil administrativo ativo.", "inactive_profile");
  }

  return { ok: true, user, profile };
}
