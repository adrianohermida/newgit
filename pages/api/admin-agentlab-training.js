import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { getAgentLabDashboard, runTrainingScenario } from "../../lib/agentlab/server.js";

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
      errorType: auth.errorType || "authentication",
      details: auth.details || null,
    });
  }

  if (req.method === "GET") {
    try {
      const data = await getAgentLabDashboard(process.env);
      return res.status(200).json({ ok: true, training: data.training, governance: data.governance });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || "Falha ao carregar training center." });
    }
  }

  if (req.method === "POST") {
    try {
      const result = await runTrainingScenario(process.env, req.body || {});
      return res.status(200).json({ ok: true, result });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error.message || "Falha ao executar treinamento." });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
}
