import { requireAdminAccess } from "../lib/admin-auth.js";
import { listFreshdeskTickets } from "../lib/freshdesk-admin.js";

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

  try {
    const url = new URL(request.url);
    const page = Number(url.searchParams.get("page") || "1");
    const perPage = Number(url.searchParams.get("perPage") || "30");
    const email = url.searchParams.get("email") || undefined;

    const items = await listFreshdeskTickets(env, { page, perPage, email });
    return new Response(JSON.stringify({ ok: true, items }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao carregar tickets." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
