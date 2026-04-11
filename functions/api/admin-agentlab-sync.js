import { requireAdminAccess } from "../lib/admin-auth.js";
<<<<<<< HEAD
import {
  getAgentLabDashboard,
  jsonError,
  jsonOk,
  syncFreshchatConversationsIntoAgentLab,
  syncFreshchatMessagesIntoAgentLab,
  syncFreshsalesActivitiesIntoAgentLab,
  syncWorkspaceConversations,
} from "../../lib/agentlab/server.js";

function isMissingSourceError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("PGRST205") ||
    message.includes("schema cache") ||
    message.includes("Could not find the table") ||
    message.includes("does not exist")
  );
}

function isFreshchatCredentialError(error) {
  return String(error?.message || "").includes("Credenciais do Freshchat ausentes");
}

function isFreshchatSdkCredentialError(error) {
  return String(error?.message || "").includes("parecem ser do SDK/widget do Freshchat");
}

function isFreshsalesPayloadError(error) {
  const message = String(error?.message || "");
  return message.includes("Unexpected end of JSON input");
}

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  try {
    const data = await getAgentLabDashboard(context.env);
    return jsonOk({ runs: data.intelligence.syncRuns || [] });
  } catch (error) {
    return jsonError(error, 500);
=======
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
>>>>>>> codex/hmadv-tpu-fase53
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
<<<<<<< HEAD
  if (!auth.ok) {
    return jsonError(new Error(auth.error), auth.status);
  }

  let body = {};
  try {
    body = await context.request.json();
    const action = String(body.action || "").trim();

    if (action === "sync_workspace_conversations") {
      const result = await syncWorkspaceConversations(context.env);
      return jsonOk({ result });
    }

    if (action === "sync_freshsales_activities") {
      const result = await syncFreshsalesActivitiesIntoAgentLab(context.env, Number(body.limit || 5));
      return jsonOk({ result });
    }

    if (action === "sync_freshchat_conversations") {
      const result = await syncFreshchatConversationsIntoAgentLab(context.env, Number(body.limit || 5));
      return jsonOk({ result });
    }

    if (action === "sync_freshchat_messages") {
      const result = await syncFreshchatMessagesIntoAgentLab(
        context.env,
        Number(body.thread_limit || 2),
        Number(body.limit || 20)
      );
      return jsonOk({ result });
    }

    return jsonError(new Error("Acao de sync invalida."), 400);
  } catch (error) {
    if (isFreshchatSdkCredentialError(error)) {
      return jsonOk({
        result: {
          unavailable: true,
          mode: "sdk_credentials",
          requiredSecrets: ["FRESHCHAT_API_BASE", "FRESHCHAT_API_KEY"],
          message: error.message,
        },
      });
    }
    if (isFreshchatCredentialError(error)) {
      return jsonOk({
        result: {
          unavailable: true,
          mode: "config_missing",
          requiredSecrets: ["FRESHCHAT_API_BASE", "FRESHCHAT_API_KEY"],
          message:
            "Credenciais do Freshchat ausentes para sincronizacao viva. Configure FRESHCHAT_API_BASE e FRESHCHAT_API_KEY no Pages.",
        },
      });
    }
    if (isFreshsalesPayloadError(error)) {
      return jsonOk({
        result: {
          unavailable: true,
          mode: "upstream_empty",
          message:
            "O Freshsales respondeu sem corpo JSON nesta tentativa. Tente novamente; se persistir, revisamos a surface do endpoint ativo no tenant.",
        },
      });
    }
    if (isMissingSourceError(error)) {
      const action = String(body.action || "").trim();
      return jsonOk({
        result: {
          unavailable: true,
          mode: "schema_missing",
          requiredSources:
            action === "sync_workspace_conversations"
              ? ["conversas"]
              : action === "sync_freshchat_messages"
                ? ["agentlab_conversation_messages"]
                : [
                    "agentlab_conversation_threads",
                    "agentlab_incidents",
                    "agentlab_source_sync_runs",
                  ],
          message:
            action === "sync_workspace_conversations"
              ? "A tabela legado `conversas` nao existe neste ambiente. Esse sync e opcional e pode permanecer desabilitado."
              : action === "sync_freshchat_messages"
              ? "A tabela de mensagens ainda nao existe neste ambiente. Aplique a migration 022 para sincronizar mensagens do Freshchat."
              : "Este ambiente ainda nao possui todas as tabelas de inteligencia conversacional. O sync local foi bloqueado para evitar erro operacional.",
        },
      });
    }
    return jsonError(error, 500);
=======

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
>>>>>>> codex/hmadv-tpu-fase53
  }
}
