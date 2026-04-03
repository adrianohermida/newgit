import { requireAdminNode } from "../../lib/admin/node-auth.js";
import {
  getAgentLabDashboard,
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

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  if (req.method === "GET") {
    try {
      const data = await getAgentLabDashboard(process.env);
      return res.status(200).json({ ok: true, runs: data.intelligence.syncRuns || [] });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || "Falha ao carregar sync runs." });
    }
  }

  if (req.method === "POST") {
    const body = req.body || {};
    try {
      const action = String(body.action || "").trim();
      if (action === "sync_workspace_conversations") {
        const result = await syncWorkspaceConversations(process.env);
        return res.status(200).json({ ok: true, result });
      }

      if (action === "sync_freshsales_activities") {
        const result = await syncFreshsalesActivitiesIntoAgentLab(process.env, Number(body.limit || 5));
        return res.status(200).json({ ok: true, result });
      }

      if (action === "sync_freshchat_conversations") {
        const result = await syncFreshchatConversationsIntoAgentLab(process.env, Number(body.limit || 5));
        return res.status(200).json({ ok: true, result });
      }

      if (action === "sync_freshchat_messages") {
        const result = await syncFreshchatMessagesIntoAgentLab(
          process.env,
          Number(body.thread_limit || 2),
          Number(body.limit || 20)
        );
        return res.status(200).json({ ok: true, result });
      }

      return res.status(400).json({ ok: false, error: "Acao de sync invalida." });
    } catch (error) {
      if (isFreshchatSdkCredentialError(error)) {
        return res.status(200).json({
          ok: true,
          result: {
            unavailable: true,
            mode: "sdk_credentials",
            requiredSecrets: ["FRESHCHAT_API_BASE", "FRESHCHAT_API_KEY"],
            message: error.message,
          },
        });
      }
      if (isFreshchatCredentialError(error)) {
        return res.status(200).json({
          ok: true,
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
        return res.status(200).json({
          ok: true,
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
        return res.status(200).json({
          ok: true,
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
      return res.status(500).json({ ok: false, error: error.message || "Falha ao executar sync." });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
}
