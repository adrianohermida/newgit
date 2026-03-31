import { requireClientAccess } from "../lib/client-auth.js";
import { buildClientDraftProfile } from "../lib/client-data.js";
import { getSupabaseBaseUrl, getSupabaseServerKey } from "../lib/env.js";
import { fetchSupabaseAdmin } from "../lib/supabase-rest.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function normalizeProfilePayload(body, user) {
  const fullName = String(body.full_name || "").trim();
  const whatsapp = String(body.whatsapp || "").trim();
  const cpf = String(body.cpf || "").trim();
  const consentLgpd = body?.metadata?.consent_lgpd === true || body?.consent_lgpd === true;
  const communicationConsent =
    body?.metadata?.communication_consent === true || body?.communication_consent === true;

  if (!fullName || !whatsapp || !cpf) {
    return { error: "Preencha nome completo, WhatsApp e CPF para concluir o perfil do cliente." };
  }

  if (!consentLgpd) {
    return { error: "E necessario aceitar o consentimento LGPD para ativar o portal." };
  }

  return {
    payload: {
      id: user.id,
      email: user.email,
      full_name: fullName,
      whatsapp,
      cpf,
      is_active: true,
      updated_at: new Date().toISOString(),
      metadata: {
        consent_lgpd: true,
        communication_consent: communicationConsent,
      },
    },
  };
}

function isMissingClientProfilesError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("PGRST205") ||
    message.includes("Could not find the table") ||
    message.includes("client_profiles")
  );
}

async function updateClientMetadataFallback(env, auth, payload) {
  const baseUrl = getSupabaseBaseUrl(env);
  const serviceKey = getSupabaseServerKey(env);

  if (!baseUrl || !serviceKey) {
    throw new Error("Configuracao do Supabase incompleta para salvar o perfil do cliente.");
  }

  const currentMetadata =
    auth.user?.user_metadata && typeof auth.user.user_metadata === "object" ? auth.user.user_metadata : {};

  const mergedMetadata = {
    ...currentMetadata,
    full_name: payload.full_name,
    whatsapp: payload.whatsapp,
    cpf: payload.cpf,
    is_active: true,
    consent_lgpd: payload.metadata?.consent_lgpd === true,
    communication_consent: payload.metadata?.communication_consent === true,
  };

  const response = await fetch(`${baseUrl}/auth/v1/admin/users/${encodeURIComponent(auth.user.id)}`, {
    method: "PUT",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_metadata: mergedMetadata,
    }),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      body?.msg ||
        body?.message ||
        body?.error_description ||
        "Falha ao salvar o perfil do cliente no fallback de autenticacao."
    );
  }

  const updatedUser = body?.user || {
    ...auth.user,
    user_metadata: mergedMetadata,
  };

  const resolvedProfile = {
    id: auth.user.id,
    email: auth.user.email,
    full_name: mergedMetadata.full_name || "",
    whatsapp: mergedMetadata.whatsapp || "",
    cpf: mergedMetadata.cpf || "",
    is_active: mergedMetadata.is_active !== false,
    metadata: {
      consent_lgpd: mergedMetadata.consent_lgpd === true,
      communication_consent: mergedMetadata.communication_consent === true,
      office_whatsapp: mergedMetadata.office_whatsapp || null,
    },
    created_at: auth.profile?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return buildClientDraftProfile(updatedUser, resolvedProfile);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireClientAccess(request, env, { allowMissingProfile: true });

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  return new Response(
    JSON.stringify({
      ok: true,
      user: {
        id: auth.user.id,
        email: auth.user.email,
      },
      profile: buildClientDraftProfile(auth.user, auth.profile),
    }),
    {
      status: 200,
      headers: JSON_HEADERS,
    }
  );
}

export async function onRequestPatch(context) {
  const { request, env } = context;
  const auth = await requireClientAccess(request, env, { allowMissingProfile: true });

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const body = await request.json();
    const { payload, error } = normalizeProfilePayload(body, auth.user);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    let rows;

    try {
      rows = await fetchSupabaseAdmin(env, "client_profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          ...payload,
          created_at: auth.profile?.created_at || new Date().toISOString(),
        }),
      });
    } catch (error) {
      if (isMissingClientProfilesError(error)) {
        const profile = await updateClientMetadataFallback(env, auth, payload);
        return new Response(JSON.stringify({ ok: true, profile }), {
          status: 200,
          headers: JSON_HEADERS,
        });
      }
      throw error;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        profile: buildClientDraftProfile(auth.user, Array.isArray(rows) ? rows[0] || payload : payload),
      }),
      {
        status: 200,
        headers: JSON_HEADERS,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao salvar perfil do cliente." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
