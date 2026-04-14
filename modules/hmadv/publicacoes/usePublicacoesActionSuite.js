import { usePublicacoesExecutionHistory } from "./usePublicacoesExecutionHistory";
import { usePublicacoesUiActions } from "./usePublicacoesUiActions";
import { usePublicacoesRefreshActions } from "./usePublicacoesRefreshActions";
import { usePublicacoesActionRunner } from "./usePublicacoesActionRunner";
import { usePublicacoesValidationActions } from "./usePublicacoesValidationActions";
import { usePublicacoesIntegratedDetail } from "./usePublicacoesIntegratedDetail";
import { usePublicacoesParteActions } from "./usePublicacoesParteActions";
import { recoverPublicacoesAdviseBackfillFailure } from "./publicacoesBackfillRecovery";

export function usePublicacoesActionSuite(params) {
  const history = usePublicacoesExecutionHistory({
    limit: params.limit,
    processNumbers: params.processNumbers,
    selectedPartesKeys: params.selectedPartesKeys,
    selectedProcessKeys: params.selectedProcessKeys,
    setExecutionHistory: params.setExecutionHistory,
  });

  const ui = usePublicacoesUiActions({
    filteredIntegratedRows: params.filteredIntegratedRows,
    getPublicacaoSelectionValue: params.getPublicacaoSelectionValue,
    logUiEvent: params.logUiEvent,
    partesCandidates: params.partesCandidates,
    processCandidates: params.processCandidates,
    recurringPublicacoes: params.recurringPublicacoes,
    recurringPublicacoesBatch: params.recurringPublicacoesBatch,
    recurringPublicacoesSummary: params.recurringPublicacoesSummary,
    setExecutionHistory: params.setExecutionHistory,
    setLastFocusHash: params.setLastFocusHash,
    setLimit: params.setLimit,
    setProcessNumbers: params.setProcessNumbers,
    setSelectedIntegratedNumbers: params.setSelectedIntegratedNumbers,
    setSelectedPartesKeys: params.setSelectedPartesKeys,
    setSelectedProcessKeys: params.setSelectedProcessKeys,
    setView: params.setView,
  });

  const refresh = usePublicacoesRefreshActions({
    activeJobId: params.activeJobId,
    adminFetch: params.adminFetch,
    filteredIntegratedRows: params.filteredIntegratedRows,
    heavyQueuesEnabled: params.heavyQueuesEnabled,
    integratedFilters: params.integratedFilters,
    integratedPage: params.integratedPage,
    integratedPageSize: params.integratedPageSize,
    integratedQueue: params.integratedQueue,
    jobs: params.jobs,
    loadIntegratedQueue: params.loadIntegratedQueue,
    loadJobs: params.loadJobs,
    loadOverview: params.loadOverview,
    loadPartesCandidates: params.loadPartesCandidates,
    loadProcessCandidates: params.loadProcessCandidates,
    loadRemoteHistory: params.loadRemoteHistory,
    partesPage: params.partesPage,
    processPage: params.processPage,
    pushQueueRefresh: params.pushQueueRefresh,
    setActionState: params.setActionState,
    setActiveJobId: params.setActiveJobId,
    setHeavyQueuesEnabled: params.setHeavyQueuesEnabled,
    setIntegratedCursorTrail: params.setIntegratedCursorTrail,
    setIntegratedPage: params.setIntegratedPage,
    setSelectedIntegratedNumbers: params.setSelectedIntegratedNumbers,
    view: params.view,
  });

  const recoverAdviseBackfillFailure = async (error, safeLimit) => recoverPublicacoesAdviseBackfillFailure({
    adminFetch: params.adminFetch,
    error,
    safeLimit,
    setGlobalError: params.setGlobalError,
    setGlobalErrorUntil: params.setGlobalErrorUntil,
    setOverview: params.setOverview,
    setRemoteHistory: params.setRemoteHistory,
  });

  const runner = usePublicacoesActionRunner({
    activeJobId: params.activeJobId,
    adminFetch: params.adminFetch,
    blockingJob: params.blockingJob,
    buildActionMeta: history.buildActionMeta,
    canManuallyDrainActiveJob: params.canManuallyDrainActiveJob,
    currentDrainJobId: params.currentDrainJobId,
    hasBlockingJob: params.hasBlockingJob,
    limit: params.limit,
    loadJobs: params.loadJobs,
    loadRemoteHistory: params.loadRemoteHistory,
    overview: params.overview,
    partsBacklogCount: params.partsBacklogCount,
    processNumbers: params.processNumbers,
    pushHistoryEntry: history.pushHistoryEntry,
    recoverAdviseBackfillFailure,
    refreshAfterAction: refresh.refreshAfterAction,
    refreshOperationalContext: refresh.refreshOperationalContext,
    replaceHistoryEntry: history.replaceHistoryEntry,
    setActionState: params.setActionState,
    setActiveJobId: params.setActiveJobId,
    syncWorkerShouldFocusCrm: params.syncWorkerShouldFocusCrm,
    updateView: ui.updateView,
  });

  const validation = usePublicacoesValidationActions({
    adminFetch: params.adminFetch,
    queueAsyncAction: runner.queueAsyncAction,
    selectedUnifiedNumbers: params.selectedUnifiedNumbers,
    setActionState: params.setActionState,
    setValidationMap: params.setValidationMap,
    updateView: ui.updateView,
  });

  const detail = usePublicacoesIntegratedDetail({
    adminFetch: params.adminFetch,
    applyValidationToNumbers: validation.applyValidationToNumbers,
    detailEditForm: params.detailEditForm,
    detailState: params.detailState,
    setActionState: params.setActionState,
    setDetailEditForm: params.setDetailEditForm,
    setDetailState: params.setDetailState,
    setValidationMap: params.setValidationMap,
  });

  const partes = usePublicacoesParteActions({
    adminFetch: params.adminFetch,
    detailLinkType: params.detailLinkType,
    detailState: params.detailState,
    loadIntegratedDetail: detail.loadIntegratedDetail,
    selectedDetailLinkedPartes: params.selectedDetailLinkedPartes,
    selectedDetailPendingPartes: params.selectedDetailPendingPartes,
    setActionState: params.setActionState,
    setSelectedDetailLinkedPartes: params.setSelectedDetailLinkedPartes,
    setSelectedDetailPendingPartes: params.setSelectedDetailPendingPartes,
  });

  return { ...detail, ...history, ...partes, ...refresh, ...runner, ...ui, ...validation };
}
