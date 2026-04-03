import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  listClientProfileChangeRequests,
  reviewClientProfileChangeRequest,
  updateClientProfileLocks,
} from "../lib/client-profile-ops.js";
import { fetchSupabaseAdmin } from "../lib/supabase-rest.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

async function getClientProfiles(env, ids = []) {
  const unique = [...new Set((ids || []).map((item) => String(item || "").trim()).filter(Boolean))];
  if (!unique.length) return [];
  const rows = await fetchSupabaseAdmin(
    env,
    `client_profiles?select=id,email,full_name,is_active,whatsapp,cpf,metadata,created_at,updated_at&id=in.(${unique.join(",")})`
  );
  return Array.isArray(rows) ? rows : [];
}

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, auth.status);
  }

  try {
    const url = new URL(context.request.url);
    const status = String(url.searchParams.get("status") || "pending").trim();
    const limit = Number(url.searchParams.get("limit") || 50);
    const requests = await listClientProfileChangeRequests(context.env, {
      status: status || undefined,
      limit,
    });
    const profiles = await getClientProfiles(context.env, requests.map((item) => item.client_id));
    const profileMap = new Map(profiles.map((item) => [String(item.id), item]));

    return jsonResponse({
      ok: true,
      items: requests.map((item) => ({
        ...item,
        profile: profileMap.get(String(item.client_id)) || null,
      })),
    });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || "Falha ao carregar a fila de alteracoes cadastrais." }, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, auth.status);
  }

  try {
    const body = await context.request.json();
    const action = String(body.action || "").trim();

    if (action === "approve" || action === "reject") {
      const result = await reviewClientProfileChangeRequest(context.env, {
        requestId: body.id,
        decision: action === "approve" ? "approve" : "reject",
        adminUser: auth.user,
        adminProfile: auth.profile,
      });
      return jsonResponse({ ok: true, result });
    }

    if (action === "set_locks") {
      const profile = await updateClientProfileLocks(context.env, {
        clientId: body.client_id,
        cpfVerified: body.cpf_verified === true,
        fullNameVerified: body.full_name_verified === true,
      });
      return jsonResponse({ ok: true, profile });
    }

    return jsonResponse({ ok: false, error: "Acao administrativa invalida." }, 400);
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message || "Falha na aprovacao das alteracoes cadastrais." }, 500);
  }
}
