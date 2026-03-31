import { requireClientAccess } from "../lib/client-auth.js";
import { createClientTicket, listClientTickets } from "../lib/client-data.js";

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

  const payload = await listClientTickets(env, auth.profile.email);
  return new Response(JSON.stringify({ ok: true, items: payload.items, warning: payload.warning || null, urls: payload.urls || null }), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireClientAccess(request, env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const body = await request.json();
    const subject = String(body.subject || "").trim();
    const description = String(body.description || "").trim();

    if (!subject || !description) {
      return new Response(JSON.stringify({ ok: false, error: "Informe assunto e descricao para abrir o ticket." }), {
        status: 400,
        headers: JSON_HEADERS,
      });
    }

    const ticket = await createClientTicket(env, auth.profile, { subject, description });
    return new Response(JSON.stringify({ ok: true, ticket }), {
      status: 201,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message || "Falha ao abrir ticket do cliente." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
