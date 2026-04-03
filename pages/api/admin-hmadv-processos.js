import { requireAdminNode } from "../../lib/admin/node-auth.js";
import {
  backfillAudiencias,
  getProcessosOverview,
  inspectAudiencias,
  runSyncWorker,
  scanOrphanProcesses,
} from "../../lib/admin/hmadv-ops.js";

function parseProcessNumbers(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value)
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  try {
    if (req.method === "GET") {
      const action = String(req.query.action || "overview");
      if (action === "overview") {
        const data = await getProcessosOverview();
        return res.status(200).json({ ok: true, data });
      }
      if (action === "orfaos") {
        const data = await scanOrphanProcesses(Number(req.query.limit || 50));
        return res.status(200).json({ ok: true, data });
      }
      if (action === "inspect_audiencias") {
        const data = await inspectAudiencias(Number(req.query.limit || 10));
        return res.status(200).json({ ok: true, data });
      }
      return res.status(400).json({ ok: false, error: "Acao GET invalida." });
    }

    if (req.method === "POST") {
      const action = String(req.body?.action || "");
      if (action === "backfill_audiencias") {
        const data = await backfillAudiencias({
          processNumbers: parseProcessNumbers(req.body?.processNumbers),
          limit: Number(req.body?.limit || 100),
          apply: Boolean(req.body?.apply),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "run_sync_worker") {
        const data = await runSyncWorker();
        return res.status(200).json({ ok: true, data });
      }
      return res.status(400).json({ ok: false, error: "Acao POST invalida." });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Falha no modulo administrativo de processos." });
  }
}
