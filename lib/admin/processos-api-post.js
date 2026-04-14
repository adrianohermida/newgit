import { backfillAudiencias, bulkSaveSuggestedRelations, bulkUpdateProcessRelations, deleteProcessRelation, runSyncWorker, saveProcessRelation } from "./hmadv-ops.js";
import { parseProcessNumbers } from "./processos-api-shared.js";

export async function handleProcessosPost(body) {
  const action = String(body?.action || "");
  if (action === "run_pending_jobs") {
    return {
      ok: true,
      data: {
        job: null,
        chunksProcessed: 0,
        completedAll: true,
        degraded: true,
        limited: true,
        error: "Fila de jobs de processos ainda nao foi conectada ao runner desta rota.",
      },
    };
  }
  if (action === "backfill_audiencias") return { ok: true, data: await backfillAudiencias({ processNumbers: parseProcessNumbers(body?.processNumbers), limit: Number(body?.limit || 100), apply: Boolean(body?.apply) }) };
  if (action === "run_sync_worker") return { ok: true, data: await runSyncWorker() };
  if (action === "salvar_relacao") return { ok: true, data: await saveProcessRelation(body || {}) };
  if (action === "remover_relacao") return { ok: true, data: await deleteProcessRelation(body?.id) };
  if (action === "bulk_relacoes") return { ok: true, data: await bulkUpdateProcessRelations({ ids: Array.isArray(body?.ids) ? body.ids : [], status: body?.status, remove: Boolean(body?.remove) }) };
  if (action === "bulk_salvar_relacoes") return { ok: true, data: await bulkSaveSuggestedRelations({ items: Array.isArray(body?.items) ? body.items : [] }) };
  return null;
}
