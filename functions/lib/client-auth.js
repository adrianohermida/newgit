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
    throw new Error("Configuracao do Supabase incompleta para validar token do portal.");
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

async function getClientProfile(env, userId) {
  try {
    const rows = await fetchSupabaseAdmin(
      env,
      `client_profiles?select=id,email,full_name,is_active,whatsapp,cpf,metadata,created_at,updated_at&id=eq.${encodeURIComponent(userId)}&limit=1`
    );
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (error) {
    const message = String(error?.message || "");
    if (message.includes("404") || message.includes("PGRST205") || message.includes("client_profiles")) {
      return null;
    }
    throw error;
  }
}

function normalizeMetadata(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

export function buildFallbackClientProfile(user) {
  const metadata = normalizeMetadata(user?.user_metadata);
  return {
    id: user?.id || null,
    email: user?.email || "",
    full_name: metadata.full_name || metadata.name || "",
    is_active: metadata.is_active !== false,
    whatsapp: metadata.whatsapp || "",
    cpf: metadata.cpf || "",
    metadata: {
      consent_lgpd: metadata.consent_lgpd === true,
      communication_consent: metadata.communication_consent === true,
      office_whatsapp: metadata.office_whatsapp || null,
    },
  };
}

export function isClientProfileComplete(profile) {
  if (!profile) return false;
  const metadata = profile.metadata || {};
  return Boolean(
    profile.full_name &&
      profile.whatsapp &&
      profile.cpf &&
      profile.is_active &&
      metadata.consent_lgpd === true
  );
}

export async function requireClientAccess(request, env, options = {}) {
  const { allowMissingProfile = false } = options;
  const accessToken = getBearerToken(request);
  const serverKey = getSupabaseServerKey(env);

  if (!accessToken) {
    return { ok: false, status: 401, error: "Token do portal do cliente ausente." };
  }

  if (!serverKey) {
    return { ok: false, status: 500, error: "SUPABASE_SERVICE_ROLE_KEY ausente no ambiente." };
  }

  const user = await getSupabaseUser(env, accessToken);
  if (!user?.id) {
    return { ok: false, status: 401, error: "Sessao do portal invalida ou expirada." };
  }

  const profile = (await getClientProfile(env, user.id)) || buildFallbackClientProfile(user);

  if (!profile?.email && allowMissingProfile) {
    return {
      ok: true,
      user,
      profile: null,
      onboardingRequired: true,
    };
  }

  if (!profile?.email) {
    return { ok: false, status: 403, error: "Usuario autenticado sem perfil do cliente ativo." };
  }

  if (!profile.is_active) {
    return { ok: false, status: 403, error: "Perfil do cliente desativado para acesso ao portal." };
  }

  return {
    ok: true,
    user,
    profile,
    onboardingRequired: !isClientProfileComplete(profile),
  };
}
