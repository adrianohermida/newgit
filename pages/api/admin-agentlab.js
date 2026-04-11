import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { getAgentLabDashboard } from "../../lib/agentlab/server.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
    const data = await getAgentLabDashboard(process.env);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao carregar AgentLab." });
  }
}
