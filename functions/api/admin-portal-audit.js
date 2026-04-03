import { requireAdminAccess } from "../lib/admin-auth.js";
import { getClientPortalAudit } from "../lib/client-data.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  const url = new URL(request.url);
  const email = String(url.searchParams.get("email") || auth.user?.email || "").trim().toLowerCase();
  if (!email) {
    return new Response(JSON.stringify({ ok: false, error: "Informe um e-mail para auditar o portal." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  try {
    const audit = await getClientPortalAudit(env, email);
    return new Response(JSON.stringify({ ok: true, audit }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao auditar o portal do cliente." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
