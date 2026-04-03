import { requireClientAccess } from "../lib/client-auth.js";
import { getClientProcessDetails } from "../lib/client-data.js";

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

  const url = new URL(request.url);
  const processId = String(url.searchParams.get("id") || "").trim();

  if (!processId) {
    return new Response(JSON.stringify({ ok: false, error: "Informe o identificador do processo." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  try {
    const payload = await getClientProcessDetails(env, auth.profile, processId);
    return new Response(JSON.stringify({ ok: true, ...payload }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error?.message || "Nao foi possivel carregar o detalhe do processo.",
    }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
