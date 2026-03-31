import { requireAdminAccess } from "../lib/admin-auth.js";
import {
  getAgentLabGovernance,
  updateAgentLabProfile,
  updateAgentLabQueueItem,
} from "../lib/agentlab-governance.js";

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
    const governance = await getAgentLabGovernance(context.env);
    return new Response(JSON.stringify({ ok: true, governance }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Falha ao carregar governance." }), {
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
    const action = body?.action;

    if (action === "update_profile") {
      const profile = await updateAgentLabProfile(context.env, body);
      return new Response(JSON.stringify({ ok: true, profile }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    if (action === "update_queue_item") {
      const item = await updateAgentLabQueueItem(context.env, body);
      return new Response(JSON.stringify({ ok: true, item }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "Acao administrativa nao suportada." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Falha ao atualizar governance." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
