import { requireClientAccess } from "../lib/client-auth.js";
import { listClientConsultas } from "../lib/client-data.js";

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

  const consultas = await listClientConsultas(env, auth.profile.email);
  return new Response(JSON.stringify({ ok: true, ...consultas }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}
