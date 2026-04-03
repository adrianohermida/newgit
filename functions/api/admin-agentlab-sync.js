import { requireAdminAccess } from "../lib/admin-auth.js";
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
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
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
    if (isMissingSourceError(error)) {
      const action = String(body.action || "").trim();
      return jsonOk({
        result: {
          unavailable: true,
          mode: "schema_missing",
          requiredSources:
            action === "sync_freshchat_messages"
              ? ["agentlab_conversation_messages"]
              : [
                  "agentlab_conversation_threads",
                  "agentlab_incidents",
                  "agentlab_source_sync_runs",
                ],
          message:
            action === "sync_freshchat_messages"
              ? "A tabela de mensagens ainda nao existe neste ambiente. Aplique a migration 022 para sincronizar mensagens do Freshchat."
              : "Este ambiente ainda nao possui todas as tabelas de inteligencia conversacional. O sync local foi bloqueado para evitar erro operacional.",
        },
      });
    }
    return jsonError(error, 500);
  }
}
