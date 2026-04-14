import { ASYNC_PUBLICACOES_ACTIONS, ACTION_LABELS } from "./constants";
import {
  buildDrainPreview,
  buildHistoryPreview,
  buildJobPreview,
  getPublicacoesActionLabel,
  getSafePublicacoesActionLimit,
} from "./action-utils";
import { buildPublicacoesActionResult } from "./buildPublicacoesActionResult";

export function usePublicacoesActionRunner({
  adminFetch,
  activeJobId,
  blockingJob,
  canManuallyDrainActiveJob,
  currentDrainJobId,
  hasBlockingJob,
  limit,
  loadJobs,
  loadRemoteHistory,
  overview,
  partsBacklogCount,
  processNumbers,
  refreshAfterAction,
  refreshOperationalContext,
  replaceHistoryEntry,
  recoverAdviseBackfillFailure,
  setActionState,
  setActiveJobId,
  syncWorkerShouldFocusCrm,
  updateView,
  buildActionMeta,
  pushHistoryEntry,
}) {
  async function queueAsyncAction(action, apply = false, numbers = []) {
    if (hasBlockingJob) {
      const message = `Ja existe um job de publicacoes em andamento (${getPublicacoesActionLabel(blockingJob?.acao)}). Aguarde a conclusao antes de criar outro lote.`;
      setActionState({ loading: false, error: message, result: blockingJob ? { job: blockingJob } : null });
      throw new Error(message);
    }
    const safeLimit = getSafePublicacoesActionLimit(action, limit);
    const response = await adminFetch("/api/admin-hmadv-publicacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_job",
        jobAction: action,
        apply,
        limit: safeLimit,
        createLimit: action === "orquestrar_drenagem_publicacoes" ? safeLimit : undefined,
        syncLimit: action === "orquestrar_drenagem_publicacoes" ? Math.max(1, Math.min(safeLimit, 5)) : undefined,
        snapshotLimit: action === "orquestrar_drenagem_publicacoes" ? 500 : undefined,
        processNumbers: numbers.length ? numbers.join("\n") : processNumbers,
      }),
    }, {
      action,
      component: "publicacoes-actions",
      label: `${getPublicacoesActionLabel(action)} (criar job)`,
      expectation: `Criar job de publicacoes com lote ${safeLimit}`,
    });
    if (response.data?.legacy_inline) {
      setActionState({ loading: false, error: null, result: response.data.result });
      setActiveJobId(null);
      await refreshAfterAction(action);
      return response.data;
    }
    const job = response.data;
    setActionState({ loading: false, error: null, result: { job } });
    setActiveJobId(job?.id || null);
    await Promise.all([loadJobs(), loadRemoteHistory()]);
    return job;
  }

  async function runPendingJobsNow() {
    if (!canManuallyDrainActiveJob) {
      const message = "Nao ha job pendente ou em andamento disponivel para drenagem manual.";
      setActionState({ loading: false, error: message, result: blockingJob ? { job: blockingJob } : null });
      return;
    }
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    try {
      if (!activeJobId && currentDrainJobId) setActiveJobId(currentDrainJobId);
      const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_pending_jobs", id: currentDrainJobId, maxChunks: 1 }),
      }, {
        action: "run_pending_jobs",
        component: "publicacoes-jobs",
        label: "Drenar fila de publicacoes",
        expectation: "Processar o proximo chunk da fila HMADV",
        timeoutMs: 120000,
        maxRetries: 0,
      });
      const result = payload.data || {};
      setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result, preview: buildDrainPreview(result) } : { drain: result, preview: buildDrainPreview(result) } });
      setActiveJobId(result.completedAll ? null : (result.job?.id || null));
      if (result.job?.acao) await refreshAfterAction(result.job.acao);
      else await refreshOperationalContext();
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao drenar fila.", result: null });
    }
  }

  async function handleAction(action, apply = false, numbers = []) {
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    const historyId = `${action}:${Date.now()}`;
    const safeLimit = getSafePublicacoesActionLimit(action, limit);
    pushHistoryEntry({ id: historyId, action, label: ACTION_LABELS[action] || action, status: "running", createdAt: new Date().toISOString(), preview: "Execucao iniciada", meta: buildActionMeta(numbers), payload: { action, apply, limit: safeLimit, processNumbers: numbers.length ? numbers.join("\n") : processNumbers } });
    try {
      if (ASYNC_PUBLICACOES_ACTIONS.has(action)) {
        const job = await queueAsyncAction(action, apply, numbers);
        replaceHistoryEntry(historyId, { status: "success", preview: job?.legacy_inline ? `Fallback inline: ${buildHistoryPreview(job.result)}` : `Job criado: ${buildJobPreview(job)}`, result: job?.legacy_inline ? job.result : { job } });
        return;
      }
      const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, apply, limit: safeLimit, createLimit: action === "orquestrar_drenagem_publicacoes" ? safeLimit : undefined, syncLimit: action === "orquestrar_drenagem_publicacoes" ? Math.max(1, Math.min(safeLimit, 5)) : undefined, snapshotLimit: action === "orquestrar_drenagem_publicacoes" ? 500 : undefined, maxPaginas: action === "run_advise_sync" ? safeLimit : undefined, processNumbers: numbers.length ? numbers.join("\n") : processNumbers }),
      }, {
        action,
        component: "publicacoes-actions",
        label: getPublicacoesActionLabel(action),
        expectation: `Executar ${getPublicacoesActionLabel(action)} com lote ${safeLimit}`,
      });
      const resultData = buildPublicacoesActionResult({ action, payload: payload.data, overview, partesBacklogCount: partsBacklogCount, syncWorkerShouldFocusCrm });
      setActionState({ loading: false, error: null, result: resultData });
      replaceHistoryEntry(historyId, { status: "success", preview: buildHistoryPreview(resultData), result: resultData });
      await refreshAfterAction(action);
    } catch (error) {
      if (action === "run_advise_backfill") {
        const recoveredResult = await recoverAdviseBackfillFailure(error, safeLimit);
        if (recoveredResult) {
          setActionState({ loading: false, error: null, result: recoveredResult });
          replaceHistoryEntry(historyId, { status: "error", preview: recoveredResult.uiHint || error.message || "Falha ao executar acao.", error: error.message || "Falha ao executar acao.", result: recoveredResult });
          return;
        }
      }
      setActionState({ loading: false, error: error.message || "Falha ao executar acao.", result: null });
      replaceHistoryEntry(historyId, { status: "error", preview: error.message || "Falha ao executar acao.", error: error.message || "Falha ao executar acao." });
    }
  }

  return { handleAction, queueAsyncAction, runPendingJobsNow };
}
