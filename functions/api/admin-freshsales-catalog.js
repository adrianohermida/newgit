import { requireAdminAccess } from "../lib/admin-auth.js";
import { getFreshsalesCatalog } from "../lib/freshsales-catalog.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const data = await getFreshsalesCatalog(context.env);
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao consultar catalogo do Freshsales." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
