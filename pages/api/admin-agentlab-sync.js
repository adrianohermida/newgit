import { requireAdminNode } from "../../lib/admin/node-auth.js";
import {
  getAgentLabDashboard,
  syncFreshsalesActivitiesIntoAgentLab,
  syncWorkspaceConversations,
} from "../../lib/agentlab/server.js";

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
    try {
      const action = String(req.body?.action || "").trim();
      if (action === "sync_workspace_conversations") {
        const result = await syncWorkspaceConversations(process.env);
        return res.status(200).json({ ok: true, result });
      }

      if (action === "sync_freshsales_activities") {
        const result = await syncFreshsalesActivitiesIntoAgentLab(process.env, Number(req.body?.limit || 25));
        return res.status(200).json({ ok: true, result });
      }

      return res.status(400).json({ ok: false, error: "Acao de sync invalida." });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || "Falha ao executar sync." });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
}
