import { useCallback } from "react";
import {
  buildDrainPreview,
  buildHistoryPreview,
  buildJobPreview,
  getProcessActionLabel,
  getProcessIntentBadge,
  getSafeProcessActionLimit,
} from "./action-utils";
import { ASYNC_PROCESS_ACTIONS, MODULE_LIMITS } from "./constants";
import { parseProcessNumbers } from "./processos-screen-utils";
import { persistHistoryEntries } from "./storage";

export function useProcessosActionHandlers(args) {
  const updateView = useCallback((nextView, nextHash = nextView) => {
    args.setView(nextView);
    args.setLastFocusHash(nextHash || nextView);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    url.hash = nextHash || nextView;
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, [args]);

  const buildActionMeta = useCallback((payload = {}) => {
    const explicitNumbers = String(payload.processNumbers || "").trim();
    const fallbackNumbers = String(args.processNumbers || "").trim();
    const effectiveNumbers = parseProcessNumbers(explicitNumbers || fallbackNumbers);
    const action = String(payload.action || "");
    return {
      limit: action ? getSafeProcessActionLimit(action, payload.limit ?? args.limit) : Number(args.limit || 10),
      selectedCount: effectiveNumbers.length || args.getCombinedSelectedNumbers().length,
      processNumbersPreview: effectiveNumbers.slice(0, 6).join(", "),
      intentLabel: getProcessIntentBadge(payload),
    };
  }, [args]);

  const pushHistoryEntry = useCallback((entry) => {
    args.setExecutionHistory((current) => {
      const next = [entry, ...current].slice(0, 40);
      persistHistoryEntries(next);
      return next;
    });
  }, [args.setExecutionHistory]);

  const replaceHistoryEntry = useCallback((id, patch) => {
    args.setExecutionHistory((current) => {
      const next = current.map((item) => item.id === id ? { ...item, ...patch } : item);
      persistHistoryEntries(next);
      return next;
    });
  }, [args.setExecutionHistory]);

  const queueAsyncAction = useCallback(async (action, payload = {}) => {
    const response = await args.adminFetch("/api/admin-hmadv-processos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_job", jobAction: action, limit: getSafeProcessActionLimit(action, payload.limit ?? args.limit), processNumbers: payload.processNumbers || args.processNumbers, ...payload }),
    });
    if (response.data?.legacy_inline) {
      args.setActionState({ loading: false, error: null, result: response.data.result });
      args.setActiveJobId(null);
      await args.refreshOperationalContext();
      return response.data;
    }
    const job = response.data;
    args.setActionState({ loading: false, error: null, result: { job } });
    args.setActiveJobId(job?.id || null);
    args.mergeJobIntoState(job);
    await args.loadRemoteHistory();
    return job;
  }, [args]);

  const runPendingJobsNow = useCallback(async () => {
    args.setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    try {
      const payload = await args.adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_pending_jobs", id: args.activeJobId, maxChunks: 1 }),
      }, { timeoutMs: 120000, maxRetries: 0 });
      const result = payload.data || {};
      args.mergeJobIntoState(result.job || null);
      args.setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result } : { drain: result } });
      args.setActiveJobId(result.completedAll ? null : (result.job?.id || null));
      if (result.completedAll || !result.job?.id || ["completed", "error", "cancelled"].includes(String(result.job?.status || ""))) {
        if (result.job?.acao) await args.refreshAfterAction(result.job.acao, result.job.payload || {});
        else await args.refreshOperationalContext();
      } else {
        await args.loadRemoteHistory();
      }
    } catch (error) {
      args.setActionState({ loading: false, error: error.message || "Falha ao drenar fila.", result: null });
    }
  }, [args, updateView]);

  const handleAction = useCallback(async (action, payload = {}) => {
    args.setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    const historyId = `${action}:${Date.now()}`;
    const safeLimit = getSafeProcessActionLimit(action, payload.limit ?? args.limit);
    const normalizedLimit = Math.min(safeLimit, action === "sincronizar_movimentacoes_activity" ? MODULE_LIMITS.maxMovementBatch : action === "sincronizar_publicacoes_activity" ? MODULE_LIMITS.maxPublicationBatch : action === "reconciliar_partes_contatos" ? MODULE_LIMITS.maxPartesBatch : action === "backfill_audiencias" ? MODULE_LIMITS.maxAudienciasBatch : MODULE_LIMITS.maxProcessBatch);
    const normalizedPayload = { ...payload, action, limit: normalizedLimit, processNumbers: payload.processNumbers || args.processNumbers };
    pushHistoryEntry({ id: historyId, action, label: getProcessActionLabel(action, normalizedPayload), status: "running", createdAt: new Date().toISOString(), preview: "Execucao iniciada", meta: buildActionMeta(normalizedPayload), payload: { action, limit: safeLimit, processNumbers: payload.processNumbers || args.processNumbers, intent: payload.intent || "" } });
    try {
      if (action === "executar_integracao_total_hmadv") {
        const response = await args.adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, scanLimit: 100, monitorLimit: 100, movementLimit: 120, advisePages: 2, advisePerPage: 50, publicacoesBatch: 20, maxChunks: 2 }) });
        args.setActionState({ loading: false, error: null, result: response.data });
        replaceHistoryEntry(historyId, { status: "success", preview: buildHistoryPreview(response.data), result: response.data });
        await Promise.all([args.loadRunnerMetrics(), args.loadSchemaStatus(), args.loadRemoteHistory(), args.loadJobs()]);
        return;
      }
      if (ASYNC_PROCESS_ACTIONS.has(action)) {
        const job = await queueAsyncAction(action, normalizedPayload);
        replaceHistoryEntry(historyId, { status: "success", preview: job?.legacy_inline ? `Fallback inline: ${buildHistoryPreview(job.result)}` : `Job criado: ${buildJobPreview(job)}`, result: job?.legacy_inline ? job.result : { job } });
        return;
      }
      const response = await args.adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, limit: safeLimit, processNumbers: payload.processNumbers || args.processNumbers, ...normalizedPayload }) });
      args.setActionState({ loading: false, error: null, result: response.data });
      replaceHistoryEntry(historyId, { status: "success", preview: buildHistoryPreview(response.data), result: response.data });
      await args.refreshAfterAction(action, normalizedPayload);
    } catch (error) {
      args.setActionState({ loading: false, error: error.message || "Falha ao executar acao.", result: null });
      replaceHistoryEntry(historyId, { status: "error", preview: error.message || "Falha ao executar acao.", error: error.message || "Falha ao executar acao." });
    }
  }, [args, buildActionMeta, pushHistoryEntry, queueAsyncAction, replaceHistoryEntry, updateView]);

  const reuseHistoryEntry = useCallback((entry) => {
    if (entry?.payload?.processNumbers) args.setProcessNumbers(entry.payload.processNumbers);
    if (entry?.payload?.limit) args.setLimit(Number(getSafeProcessActionLimit(entry?.action || entry?.payload?.action || "", entry.payload.limit)) || 10);
    updateView("operacao");
  }, [args.setLimit, args.setProcessNumbers, updateView]);

  const clearHistory = useCallback(() => {
    args.setExecutionHistory([]);
    persistHistoryEntries([]);
  }, [args.setExecutionHistory]);

  return {
    buildActionMeta,
    clearHistory,
    handleAction,
    pushHistoryEntry,
    replaceHistoryEntry,
    reuseHistoryEntry,
    runPendingJobsNow,
    updateView,
  };
}
