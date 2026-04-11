import { getSupabaseApiKey, getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";
import { fetchSupabaseAdmin } from "./supabase-rest.js";
import { getFallbackSuperadminProfile, isFallbackSuperadminIdentity } from "./superadmin.js";

function getBearerToken(request) {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
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

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function getAdminProfile(env, userId) {
  try {
    const rows = await fetchSupabaseAdmin(
      env,
      `admin_profiles?select=id,email,full_name,role,is_active&id=eq.${encodeURIComponent(userId)}&limit=1`
    );

    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (error) {
    if (String(error?.message || "").includes("404")) {
      return null;
    }

    throw error;
  }
}

export async function requireAdminAccess(request, env) {
  const accessToken = getBearerToken(request);
  const serverKey = getSupabaseServerKey(env);

  if (!accessToken) {
    return buildAdminAuthFailure(401, "Token administrativo ausente.", "missing_token");
  }

  if (!serverKey) {
    return buildAdminAuthFailure(500, "SUPABASE_SERVICE_ROLE_KEY ausente no ambiente.", "server_key_missing");
  }

  let user = null;
  try {
    user = await getSupabaseUser(env, accessToken);
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
    profile = await getAdminProfile(env, user.id);
  } catch (error) {
    return buildAdminAuthFailure(
      503,
      error?.message || "Falha ao carregar perfil administrativo.",
      "admin_profile_unavailable",
      { stage: "admin_profile" }
    );
  }

  if ((!profile || !profile.is_active) && isFallbackSuperadminIdentity(user)) {
    return {
      ok: true,
      user,
      profile: getFallbackSuperadminProfile(),
    };
  }

  if (!profile || !profile.is_active) {
    return buildAdminAuthFailure(403, "Usuario autenticado sem perfil administrativo ativo.", "inactive_profile");
  }

  return {
    ok: true,
    user,
    profile,
  };
}
