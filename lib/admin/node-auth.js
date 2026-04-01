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
    return { ok: false, status: 401, error: "Token administrativo ausente." };
  }

  const user = await getSupabaseUser(process.env, accessToken);
  if (!user?.id) {
    return { ok: false, status: 401, error: "Sessao administrativa invalida ou expirada." };
  }

  const profile = await getAdminProfile(process.env, user.id);
  if ((!profile || !profile.is_active) && isFallbackSuperadminIdentity(user)) {
    return { ok: true, user, profile: getFallbackSuperadminProfile() };
  }

  if (!profile || !profile.is_active) {
    return { ok: false, status: 403, error: "Usuario autenticado sem perfil administrativo ativo." };
  }

  return { ok: true, user, profile };
}
