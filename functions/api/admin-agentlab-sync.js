import { requireAdminAccess } from "../lib/admin-auth.js";
import { getConversationSyncRuns, syncFreshsalesActivities, syncLegacyConversationIntelligence } from "../lib/agentlab-sync.js";

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
    const runs = await getConversationSyncRuns(context.env);
    return new Response(JSON.stringify({ ok: true, runs }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Falha ao carregar sync runs." }), {
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
    const action = body?.action || "sync_legacy_conversations";

    if (action === "sync_legacy_conversations") {
      const result = await syncLegacyConversationIntelligence(context.env, body || {});
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    if (action === "sync_freshsales_activities") {
      const result = await syncFreshsalesActivities(context.env, body || {});
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "Acao de sync nao suportada." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Falha ao executar sync." }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }
}
