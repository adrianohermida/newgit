import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { getFreshsalesCatalog } from "../../functions/lib/freshsales-catalog.js";

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

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const data = await getFreshsalesCatalog(process.env);
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha ao consultar catalogo do Freshsales." });
  }
}
