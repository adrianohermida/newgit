import { useCallback, useMemo } from "react";

import { PUBLICACOES_QUEUE_VIEWS } from "./constants";
import { getPublicacoesActionLabel } from "./action-utils";

export function usePublicacoesRefreshActions(params) {
  const { activeJobId, adminFetch, filteredIntegratedRows, heavyQueuesEnabled, integratedFilters, integratedPage, integratedPageSize, integratedQueue, jobs, loadIntegratedQueue, loadJobs, loadOverview, loadPartesCandidates, loadProcessCandidates, loadRemoteHistory, partesPage, processPage, pushQueueRefresh, setActionState, setActiveJobId, setHeavyQueuesEnabled, setIntegratedCursorTrail, setIntegratedPage, setSelectedIntegratedNumbers, view } = params;
  const pendingOrRunningJobs = useMemo(() => jobs.filter((item) => ["pending", "running"].includes(String(item.status || ""))), [jobs]);
  const blockingJob = pendingOrRunningJobs[0] || null;
  const hasBlockingJob = pendingOrRunningJobs.length > 0;

  const refreshOperationalContext = useCallback(async (options = {}) => {
    const { forceAll = false, forceQueues = false } = options;
    const shouldLoadQueues = forceAll || PUBLICACOES_QUEUE_VIEWS.has(view);
    const calls = [loadOverview(), loadRemoteHistory(), loadJobs()];
    if (shouldLoadQueues) {
      calls.push(loadProcessCandidates(processPage, { force: forceAll || forceQueues }));
      if (heavyQueuesEnabled && (!activeJobId || forceAll || forceQueues)) calls.push(loadPartesCandidates(partesPage, { force: forceAll || forceQueues }));
      if (heavyQueuesEnabled) calls.push(loadIntegratedQueue(integratedPage, { force: forceAll || forceQueues }));
    }
    await Promise.all(calls);
  }, [activeJobId, heavyQueuesEnabled, integratedPage, loadIntegratedQueue, loadJobs, loadOverview, loadPartesCandidates, loadProcessCandidates, loadRemoteHistory, partesPage, processPage, view]);

  const refreshAfterAction = useCallback(async (action) => {
    const calls = [loadOverview(), loadRemoteHistory(), loadJobs()];
    if (PUBLICACOES_QUEUE_VIEWS.has(view) && heavyQueuesEnabled) {
      calls.push(loadIntegratedQueue(integratedPage, { force: true }));
      if (action === "criar_processos_publicacoes") calls.push(loadProcessCandidates(processPage, { force: true }));
      if ((action === "backfill_partes" || action === "sincronizar_partes") && !activeJobId) calls.push(loadPartesCandidates(partesPage, { force: false }));
    }
    await Promise.all(calls);
  }, [activeJobId, heavyQueuesEnabled, integratedPage, loadIntegratedQueue, loadJobs, loadOverview, loadPartesCandidates, loadProcessCandidates, loadRemoteHistory, partesPage, processPage, view]);

  const toggleIntegratedFiltered = useCallback(async (nextState) => {
    if (!nextState) {
      const numbers = filteredIntegratedRows.map((row) => row.numero_cnj).filter(Boolean);
      setSelectedIntegratedNumbers((current) => current.filter((item) => !numbers.includes(item)));
      return;
    }
    if (!integratedQueue.hasMore && filteredIntegratedRows.length >= (integratedQueue.totalRows || 0)) {
      const numbers = filteredIntegratedRows.map((row) => row.numero_cnj).filter(Boolean);
      setSelectedIntegratedNumbers((current) => [...new Set([...current, ...numbers])]);
      return;
    }
    try {
      const selectionLimit = Math.min(5000, Math.max(Number(integratedQueue.totalRows || 0) || 0, filteredIntegratedRows.length || 0, integratedPageSize));
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=mesa_integrada_selecao&query=${encodeURIComponent(integratedFilters.query || "")}&source=${encodeURIComponent(integratedFilters.source || "todos")}&limit=${selectionLimit}&preferSnapshot=1`, {}, { action: "mesa_integrada_selecao", component: "publicacoes-mesa-integrada", label: "Selecionar todos os itens filtrados", expectation: "Trazer todos os CNJs filtrados da mesa integrada" });
      setSelectedIntegratedNumbers((current) => [...new Set([...current, ...(payload.data?.items || [])])]);
      if (payload.data?.limited) setActionState({ loading: false, error: `A selecao filtrada atingiu o teto operacional de ${selectionLimit} itens. Refine os filtros para continuar a drenagem com seguranca.`, result: payload.data });
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao selecionar todos os itens filtrados.", result: null });
    }
  }, [adminFetch, filteredIntegratedRows, integratedFilters.query, integratedFilters.source, integratedPageSize, integratedQueue.hasMore, integratedQueue.totalRows, setActionState, setSelectedIntegratedNumbers]);

  const refreshIntegratedSnapshot = useCallback(async (queueType = "all") => {
    if (hasBlockingJob) {
      setActionState({ loading: false, error: `Ja existe um job em andamento (${getPublicacoesActionLabel(blockingJob?.acao)}). Aguarde a conclusao antes de reconstruir o snapshot.`, result: blockingJob ? { job: blockingJob } : null });
      return;
    }
    setActionState({ loading: true, error: null, result: null });
    setHeavyQueuesEnabled(true);
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "refresh_snapshot_filas", asyncJob: true, queueType, snapshotLimit: 800 }) }, { action: "refresh_snapshot_filas", component: "publicacoes-mesa-integrada", label: `Atualizar snapshot da mesa integrada (${queueType})`, expectation: "Reconstruir a fila operacional em snapshot para navegacao segura" });
      const job = payload.data || null;
      if (job?.id) setActiveJobId(job.id);
      if (queueType === "all") ["candidatos_processos", "candidatos_partes", "mesa_integrada"].forEach(pushQueueRefresh);
      else pushQueueRefresh(queueType);
      setActionState({ loading: false, error: null, result: job ? { job } : payload.data || null });
      setIntegratedCursorTrail([""]);
      setIntegratedPage(1);
      await Promise.all([loadJobs(), loadRemoteHistory(), loadIntegratedQueue(1, { force: true })]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao atualizar snapshot operacional.", result: null });
    }
  }, [adminFetch, blockingJob, hasBlockingJob, loadIntegratedQueue, loadJobs, loadRemoteHistory, pushQueueRefresh, setActionState, setActiveJobId, setHeavyQueuesEnabled, setIntegratedCursorTrail, setIntegratedPage]);

  const loadHeavyQueueReads = useCallback(async (scope = "all") => {
    setHeavyQueuesEnabled(true);
    if (scope === "partes") return loadPartesCandidates(partesPage, { force: true });
    if (scope === "mesa") {
      setIntegratedCursorTrail([""]);
      setIntegratedPage(1);
      await loadIntegratedQueue(1, { force: true });
      return;
    }
    await Promise.all([loadPartesCandidates(partesPage, { force: true }), loadIntegratedQueue(integratedPage, { force: true })]);
  }, [integratedPage, loadIntegratedQueue, loadPartesCandidates, partesPage, setHeavyQueuesEnabled, setIntegratedCursorTrail, setIntegratedPage]);

  return { loadHeavyQueueReads, refreshAfterAction, refreshIntegratedSnapshot, refreshOperationalContext, toggleIntegratedFiltered };
}
