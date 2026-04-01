import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { updateAgentLabProfile, updateImprovementQueueItem } from "../../lib/agentlab/server.js";

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const action = String(req.body?.action || "").trim();
    if (action === "update_profile") {
      const item = await updateAgentLabProfile(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    if (action === "update_queue_item") {
      const item = await updateImprovementQueueItem(process.env, req.body || {});
      return res.status(200).json({ ok: true, item });
    }

    return res.status(400).json({ ok: false, error: "Acao de governanca invalida." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao salvar governanca." });
  }
}
