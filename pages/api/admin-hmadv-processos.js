import { requireAdminNode } from "../../lib/admin/node-auth.js";
import {
  backfillAudiencias,
  bulkSaveSuggestedRelations,
  bulkUpdateProcessRelations,
  deleteProcessRelation,
  getProcessosOverview,
  inspectAudiencias,
  listProcessRelations,
  runSyncWorker,
  scanOrphanProcesses,
  saveProcessRelation,
  searchProcesses,
  suggestProcessRelations,
} from "../../lib/admin/hmadv-ops.js";

function parseProcessNumbers(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value)
    .split(/\r?\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function isQueueOverloadError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Too many subrequests") ||
    message.includes("subrequests") ||
    message.includes("Worker exceeded resource limits") ||
    message.includes("exceeded resource limits")
  );
}

function buildQueueFallback({ error }) {
  return {
    limited: true,
    unavailable: true,
    items: [],
    totalRows: 0,
    error: error?.message || "Painel em modo reduzido por sobrecarga.",
  };
}

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

  try {
    if (req.method === "GET") {
      const action = String(req.query.action || "overview");
      if (action === "overview") {
        let data;
        try {
          data = await getProcessosOverview();
        } catch (error) {
          if (!isQueueOverloadError(error)) throw error;
          data = buildQueueFallback({ error });
        }
        return res.status(200).json({ ok: true, data });
      }
      if (action === "orfaos") {
        let data;
        try {
          data = await scanOrphanProcesses(Number(req.query.limit || 50));
        } catch (error) {
          if (!isQueueOverloadError(error)) throw error;
          data = buildQueueFallback({ error });
        }
        return res.status(200).json({ ok: true, data });
      }
      if (action === "inspect_audiencias") {
        let data;
        try {
          data = await inspectAudiencias(Number(req.query.limit || 10));
        } catch (error) {
          if (!isQueueOverloadError(error)) throw error;
          data = buildQueueFallback({ error });
        }
        return res.status(200).json({ ok: true, data });
      }
      if (action === "buscar_processos") {
        let data;
        try {
          data = await searchProcesses(String(req.query.query || ""), Number(req.query.limit || 8));
        } catch (error) {
          if (!isQueueOverloadError(error)) throw error;
          data = buildQueueFallback({ error });
        }
        return res.status(200).json({ ok: true, data });
      }
      if (action === "relacoes") {
        let data;
        try {
          data = await listProcessRelations({
            page: Number(req.query.page || 1),
            pageSize: Number(req.query.pageSize || 20),
            query: String(req.query.query || ""),
            selectionOnly: String(req.query.selection || "") === "1",
          });
        } catch (error) {
          if (!isQueueOverloadError(error)) throw error;
          data = buildQueueFallback({ error });
        }
        return res.status(200).json({ ok: true, data });
      }
      if (action === "sugestoes_relacoes") {
        let data;
        try {
          data = await suggestProcessRelations({
            page: Number(req.query.page || 1),
            pageSize: Number(req.query.pageSize || 20),
            query: String(req.query.query || ""),
            minScore: Number(req.query.minScore || 0.45),
            selectionOnly: String(req.query.selection || "") === "1",
          });
        } catch (error) {
          if (!isQueueOverloadError(error)) throw error;
          data = buildQueueFallback({ error });
        }
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
      if (action === "salvar_relacao") {
        const data = await saveProcessRelation(req.body || {});
        return res.status(200).json({ ok: true, data });
      }
      if (action === "remover_relacao") {
        const data = await deleteProcessRelation(req.body?.id);
        return res.status(200).json({ ok: true, data });
      }
      if (action === "bulk_relacoes") {
        const data = await bulkUpdateProcessRelations({
          ids: Array.isArray(req.body?.ids) ? req.body.ids : [],
          status: req.body?.status,
          remove: Boolean(req.body?.remove),
        });
        return res.status(200).json({ ok: true, data });
      }
      if (action === "bulk_salvar_relacoes") {
        const data = await bulkSaveSuggestedRelations({
          items: Array.isArray(req.body?.items) ? req.body.items : [],
        });
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
