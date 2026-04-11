import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { runDotobotRagHealth } from "../../lib/lawdesk/rag.js";

function parseBoolean(value, defaultValue = true) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
      errorType: auth.errorType || "authentication",
      details: auth.details || null,
    });
  }

  const includeUpsert = parseBoolean(req.query?.include_upsert, true);
  const topK = Number(req.query?.top_k || 3);
  const query = typeof req.query?.query === "string" ? req.query.query : "healthcheck dotobot memory retrieval";

  try {
    const result = await runDotobotRagHealth(process.env, {
      includeUpsert,
      topK: Number.isFinite(topK) && topK > 0 ? topK : 3,
      query,
    });
    const statusCode = result.status === "failed" ? 500 : 200;
    return res.status(statusCode).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Falha ao executar admin-dotobot-rag-health.",
    });
  }
}
