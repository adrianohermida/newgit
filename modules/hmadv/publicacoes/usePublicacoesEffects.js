import { usePublicacoesNavigationState } from "./usePublicacoesNavigationState";
import { usePublicacoesLifecycle } from "./usePublicacoesLifecycle";
import { usePublicacoesQueueEffects } from "./usePublicacoesQueueEffects";
import { usePublicacoesJobDrain } from "./usePublicacoesJobDrain";
import { usePublicacoesHealthStatus } from "./usePublicacoesHealthStatus";

export function usePublicacoesEffects(params) {
  usePublicacoesNavigationState({
    lastFocusHash: params.lastFocusHash,
    setLastFocusHash: params.setLastFocusHash,
    setView: params.setView,
    view: params.view,
  });

  usePublicacoesLifecycle({
    actionState: params.actionState,
    backendHealth: params.backendHealth,
    copilotQueryAppliedRef: params.copilotQueryAppliedRef,
    executionHistory: params.executionHistory,
    jobs: params.jobs,
    lastFocusHash: params.lastFocusHash,
    limit: params.limit,
    loadJobs: params.loadJobs,
    loadOverview: params.loadOverview,
    loadRemoteHistory: params.loadRemoteHistory,
    operationalStatus: params.operationalStatus,
    overview: params.overview,
    pageVisible: params.pageVisible,
    partesCandidates: params.partesCandidates,
    processCandidates: params.processCandidates,
    processPage: params.processPage,
    queueRefreshLog: params.queueRefreshLog,
    remoteHistory: params.remoteHistory,
    selectedPartesKeys: params.selectedPartesKeys,
    selectedProcessKeys: params.selectedProcessKeys,
    setCopilotContext: params.setCopilotContext,
    setExecutionHistory: params.setExecutionHistory,
    setLastFocusHash: params.setLastFocusHash,
    setPageVisible: params.setPageVisible,
    setProcessNumbers: params.setProcessNumbers,
    setValidationMap: params.setValidationMap,
    validationMap: params.validationMap,
    view: params.view,
  });

  usePublicacoesQueueEffects({
    activeJobId: params.activeJobId,
    detailState: params.detailState,
    heavyQueuesEnabled: params.heavyQueuesEnabled,
    integratedCursorTrail: params.integratedCursorTrail,
    integratedFilters: params.integratedFilters,
    integratedPage: params.integratedPage,
    integratedPageSize: params.integratedPageSize,
    integratedQueue: params.integratedQueue,
    jobs: params.jobs,
    loadIntegratedQueue: params.loadIntegratedQueue,
    loadPartesCandidates: params.loadPartesCandidates,
    loadProcessCandidates: params.loadProcessCandidates,
    partesPage: params.partesPage,
    processPage: params.processPage,
    setActiveJobId: params.setActiveJobId,
    setDetailState: params.setDetailState,
    setIntegratedCursorTrail: params.setIntegratedCursorTrail,
    setIntegratedPage: params.setIntegratedPage,
    setSelectedDetailLinkedPartes: params.setSelectedDetailLinkedPartes,
    setSelectedDetailPendingPartes: params.setSelectedDetailPendingPartes,
    validationMap: params.validationMap,
    view: params.view,
  });

  usePublicacoesJobDrain({
    ACTION_LABELS: params.ACTION_LABELS,
    activeJobId: params.activeJobId,
    adminFetch: params.adminFetch,
    buildJobPreview: params.buildJobPreview,
    loadJobs: params.loadJobs,
    loadRemoteHistory: params.loadRemoteHistory,
    pageVisible: params.pageVisible,
    refreshAfterAction: params.refreshAfterAction,
    refreshOperationalContext: params.refreshOperationalContext,
    setActionState: params.setActionState,
    setActiveJobId: params.setActiveJobId,
    setDrainInFlight: params.setDrainInFlight,
  });

  usePublicacoesHealthStatus({
    globalError: params.globalError,
    overview: params.overview,
    partesCandidates: params.partesCandidates,
    processCandidates: params.processCandidates,
    remoteHistory: params.remoteHistory,
    setBackendHealth: params.setBackendHealth,
    setOperationalStatus: params.setOperationalStatus,
  });
}
