import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { handleProcessosGet } from "../../lib/admin/processos-api-get.js";
import { handleProcessosPost } from "../../lib/admin/processos-api-post.js";
import { buildAuthDegradedGetResponse } from "../../lib/admin/processos-api-shared.js";

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    if (req.method === "GET" && auth.status >= 500) {
      const action = String(req.query.action || "overview");
      return res.status(200).json(buildAuthDegradedGetResponse(action, req.query, auth));
    }
    return res.status(auth.status).json({
      ok: false,
      error: auth.error,
      errorType: auth.errorType || "authentication",
      details: auth.details || null,
    });
  }

  try {
    if (req.method === "GET") {
      const response = await handleProcessosGet(req.query || {});
      if (response) return res.status(200).json(response);
      return res.status(400).json({ ok: false, error: "Acao GET invalida." });
    }

    if (req.method === "POST") {
      const response = await handleProcessosPost(req.body || {});
      if (response) return res.status(200).json(response);
      return res.status(400).json({ ok: false, error: "Acao POST invalida." });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha no modulo administrativo de processos." });
  }
}
