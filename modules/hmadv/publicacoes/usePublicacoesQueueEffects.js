import { useEffect } from "react";

import { PUBLICACOES_QUEUE_VIEWS } from "./constants";

export function usePublicacoesQueueEffects(params) {
  const {
    activeJobId,
    detailState,
    heavyQueuesEnabled,
    integratedCursorTrail,
    integratedFilters,
    integratedPage,
    integratedPageSize,
    integratedQueue,
    jobs,
    loadIntegratedQueue,
    loadPartesCandidates,
    loadProcessCandidates,
    partesPage,
    processPage,
    setActiveJobId,
    setDetailState,
    setIntegratedCursorTrail,
    setIntegratedPage,
    setSelectedDetailLinkedPartes,
    setSelectedDetailPendingPartes,
    validationMap,
    view,
  } = params;

  useEffect(() => {
    if (!PUBLICACOES_QUEUE_VIEWS.has(view)) return;
    loadProcessCandidates(processPage);
  }, [loadProcessCandidates, processPage, view]);

  useEffect(() => {
    if (!PUBLICACOES_QUEUE_VIEWS.has(view) || activeJobId || !heavyQueuesEnabled) return;
    loadPartesCandidates(partesPage);
  }, [activeJobId, heavyQueuesEnabled, loadPartesCandidates, partesPage, view]);

  useEffect(() => {
    if (view !== "filas" || !heavyQueuesEnabled) return;
    loadIntegratedQueue(integratedPage);
  }, [heavyQueuesEnabled, integratedFilters, integratedPage, loadIntegratedQueue, view]);

  useEffect(() => {
    setIntegratedPage(1);
    setIntegratedCursorTrail([""]);
  }, [integratedFilters, setIntegratedCursorTrail, setIntegratedPage]);

  useEffect(() => {
    if (integratedPage <= 1) return;
    if (integratedQueue.mode === "snapshot" && !integratedQueue.hasMore && !(integratedCursorTrail[integratedPage] || "")) {
      if (integratedPage > 1) setIntegratedPage(integratedPage);
      return;
    }
    const totalPages = Math.max(1, Math.ceil((integratedQueue.totalRows || 0) / integratedPageSize));
    if (integratedQueue.mode !== "snapshot" && integratedPage > totalPages) setIntegratedPage(totalPages);
  }, [integratedCursorTrail, integratedPage, integratedPageSize, integratedQueue, setIntegratedPage]);

  useEffect(() => {
    if (!detailState?.row?.numero_cnj) return;
    const nextValidation = validationMap[detailState.row.numero_cnj] || { status: "", note: "", updatedAt: null };
    setDetailState((state) => state?.row?.numero_cnj === detailState.row.numero_cnj ? {
      ...state,
      row: { ...state.row, validation: nextValidation },
    } : state);
  }, [detailState?.row?.numero_cnj, setDetailState, validationMap]);

  useEffect(() => {
    setSelectedDetailPendingPartes([]);
    setSelectedDetailLinkedPartes([]);
  }, [detailState?.row?.numero_cnj, setSelectedDetailLinkedPartes, setSelectedDetailPendingPartes]);

  useEffect(() => {
    if (!jobs.length) return;
    const runningJob = jobs.find((item) => item.status === "running" || item.status === "pending");
    if (runningJob?.id && !activeJobId) setActiveJobId(runningJob.id);
  }, [activeJobId, jobs, setActiveJobId]);
}
