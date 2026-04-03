import { requireClientAccess } from "../lib/client-auth.js";
import { buildClientDraftProfile } from "../lib/client-data.js";
import {
  createClientProfileChangeRequest,
  listClientProfileChangeRequests,
  normalizeClientProfilePayload,
  updateClientAuthMetadata,
  upsertClientProfile,
} from "../lib/client-profile-ops.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function isProfileBootstrapRequired(profile) {
  return !profile?.full_name || !profile?.whatsapp || !profile?.cpf;
}

function buildResponseProfile(user, profile) {
  return buildClientDraftProfile(user, profile);
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

  try {
    const requests = await listClientProfileChangeRequests(env, {
      clientId: auth.user.id,
      limit: 10,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: auth.user.id,
          email: auth.user.email,
        },
        profile: buildResponseProfile(auth.user, auth.profile),
        requests,
        pending_request: requests.find((item) => item.status === "pending") || null,
      }),
      {
        status: 200,
        headers: JSON_HEADERS,
      }
    );
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao carregar o perfil do cliente." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
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
    const normalized = normalizeClientProfilePayload(body, auth.profile, {
      requireEssentialFields: isProfileBootstrapRequired(auth.profile),
    });

    if (normalized.error) {
      return new Response(JSON.stringify({ ok: false, error: normalized.error }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const immediateUpdate = Boolean(body.bootstrap) || isProfileBootstrapRequired(auth.profile) || auth.onboardingRequired;

    if (immediateUpdate) {
      const profileRow = await upsertClientProfile(env, {
        user: auth.user,
        currentProfile: auth.profile,
        payload: {
          ...normalized.payload,
          email: auth.user.email,
          id: auth.user.id,
          is_active: true,
        },
      });

      await updateClientAuthMetadata(env, auth.user.id, {
        ...(auth.user?.user_metadata && typeof auth.user.user_metadata === "object" ? auth.user.user_metadata : {}),
        ...(normalized.payload.metadata || {}),
        full_name: normalized.payload.full_name,
        whatsapp: normalized.payload.whatsapp,
        cpf: normalized.payload.cpf,
        is_active: true,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          mode: "profile_updated",
          message: "Perfil atualizado com sucesso.",
          profile: buildResponseProfile(auth.user, profileRow),
        }),
        {
          status: 200,
          headers: JSON_HEADERS,
        }
      );
    }

    const requestRow = await createClientProfileChangeRequest(env, {
      user: auth.user,
      profile: auth.profile,
      requestedPayload: {
        ...normalized.payload,
        email: auth.user.email,
        id: auth.user.id,
      },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        mode: "change_request_submitted",
        message: "Sua solicitacao de atualizacao cadastral foi enviada para aprovacao da equipe.",
        request: requestRow,
        profile: buildResponseProfile(auth.user, auth.profile),
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
