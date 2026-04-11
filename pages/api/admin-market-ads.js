import { requireAdminNode } from "../../lib/admin/node-auth.js";
import {
  generateLegalAdVariant,
  getMarketAdsDashboardData,
  persistComplianceValidation,
  saveMarketAdsDraft,
} from "../../lib/admin/market-ads.js";

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
    return res.status(200).json({ ok: true, data: await getMarketAdsDashboardData() });
  }

  if (req.method === "POST") {
    const action = String(req.body?.action || "").trim();

    if (action === "generate_preview") {
      return res.status(200).json({
        ok: true,
        data: generateLegalAdVariant(req.body?.input || {}),
      });
    }

    if (action === "save_draft") {
      const data = await saveMarketAdsDraft(req.body?.input || {}, auth.user?.id || null);
      return res.status(200).json({ ok: true, data });
    }

    if (action === "validate_copy") {
      return res.status(200).json({
        ok: true,
        data: await persistComplianceValidation(req.body?.input || {}, auth.user?.id || null, req.body?.draftId || null),
      });
    }

    return res.status(400).json({ ok: false, error: "Acao administrativa invalida para HMADV Market Ads." });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ ok: false, error: "Method not allowed." });
}
