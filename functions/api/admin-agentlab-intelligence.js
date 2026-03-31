import { requireAdminAccess } from "../lib/admin-auth.js";
import { getAgentLabIntelligence, ingestAgentLabIntelligence } from "../lib/agentlab-intelligence.js";

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
    const intelligence = await getAgentLabIntelligence(context.env);
    return new Response(JSON.stringify({ ok: true, intelligence }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Falha ao carregar intelligence." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);

  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  try {
    const body = await context.request.json().catch(() => ({}));
    const result = await ingestAgentLabIntelligence(context.env, body);
    return new Response(JSON.stringify({ ok: true, result }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Falha ao ingerir intelligence." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
