import { getSupabaseApiKey, getSupabaseBaseUrl, getSupabaseServerKey } from "./env.js";
import { fetchSupabaseAdmin } from "./supabase-rest.js";

function getBearerToken(request) {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim();
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
  const rows = await fetchSupabaseAdmin(
    env,
    `admin_profiles?select=id,email,full_name,role,is_active&id=eq.${encodeURIComponent(userId)}&limit=1`
  );

  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function requireAdminAccess(request, env) {
  const accessToken = getBearerToken(request);
  const serverKey = getSupabaseServerKey(env);

  if (!accessToken) {
    return { ok: false, status: 401, error: "Token administrativo ausente." };
  }

  if (!serverKey) {
    return { ok: false, status: 500, error: "SUPABASE_SERVICE_ROLE_KEY ausente no ambiente." };
  }

  const user = await getSupabaseUser(env, accessToken);
  if (!user?.id) {
    return { ok: false, status: 401, error: "Sessao administrativa invalida ou expirada." };
  }

  const profile = await getAdminProfile(env, user.id);
  if (!profile || !profile.is_active) {
    return { ok: false, status: 403, error: "Usuario autenticado sem perfil administrativo ativo." };
  }

  return {
    ok: true,
    user,
    profile,
  };
}
