import { requireClientAccess } from "../lib/client-auth.js";
import { listClientPublicacoes } from "../lib/client-data.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await requireClientAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  const payload = await listClientPublicacoes(env, auth.profile);
  return new Response(JSON.stringify({ ok: true, items: payload.items, warning: payload.warning || null }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
