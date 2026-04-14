import { usePublicacoesLoaders } from "./usePublicacoesLoaders";
import { usePublicacoesIntegratedRows } from "./usePublicacoesIntegratedRows";
import { usePublicacoesViewState } from "./usePublicacoesViewState";
import { usePublicacoesQueueInteractions } from "./usePublicacoesQueueInteractions";
import { usePublicacoesActionSuite } from "./usePublicacoesActionSuite";
import { usePublicacoesEffects } from "./usePublicacoesEffects";
import { usePublicacoesOperationalPlan } from "./usePublicacoesOperationalPlan";
import { usePublicacoesDashboardState } from "./usePublicacoesDashboardState";
import { usePublicacoesScreenComposition } from "./usePublicacoesScreenComposition";

export function usePublicacoesScreenRuntime(params) {
  const loaders = usePublicacoesLoaders(params);
  const rowState = usePublicacoesIntegratedRows({
    integratedFilters: params.integratedFilters,
    integratedQueue: params.integratedQueue,
    processCandidates: params.processCandidates,
    selectedIntegratedNumbers: params.selectedIntegratedNumbers,
    selectedProcessKeys: params.selectedProcessKeys,
    validationMap: params.validationMap,
  });
  const viewState = usePublicacoesViewState({
    activeJobId: params.activeJobId,
    data: params.overview.data || {},
    executionHistory: params.executionHistory,
    filteredIntegratedRows: rowState.filteredIntegratedRows,
    integratedPage: params.integratedPage,
    integratedPageSize: params.integratedPageSize,
    integratedQueue: params.integratedQueue,
    jobs: params.jobs,
    limit: params.limit,
    pagedIntegratedRows: rowState.pagedIntegratedRows,
    partesCandidates: params.partesCandidates,
    processCandidates: params.processCandidates,
    remoteHistory: params.remoteHistory,
    selectedIntegratedNumbers: params.selectedIntegratedNumbers,
    selectedPartesKeys: params.selectedPartesKeys,
    selectedProcessKeys: params.selectedProcessKeys,
    view: params.view,
  });
  const queue = usePublicacoesQueueInteractions({
    integratedPage: params.integratedPage,
    integratedPageSize: params.integratedPageSize,
    integratedQueue: params.integratedQueue,
    pagedIntegratedRows: rowState.pagedIntegratedRows,
    setIntegratedCursorTrail: params.setIntegratedCursorTrail,
    setIntegratedPage: params.setIntegratedPage,
    setSelectedIntegratedNumbers: params.setSelectedIntegratedNumbers,
  });
  const actions = usePublicacoesActionSuite({
    ...params,
    ...loaders,
    ...rowState,
    blockingJob: viewState.blockingJob,
    canManuallyDrainActiveJob: viewState.canManuallyDrainActiveJob,
    currentDrainJobId: viewState.currentDrainJobId,
    hasBlockingJob: viewState.hasBlockingJob,
    partsBacklogCount: viewState.partesBacklogCount,
    recurringPublicacoes: viewState.recurringPublicacoes,
    recurringPublicacoesBatch: viewState.recurringPublicacoesBatch,
    recurringPublicacoesSummary: viewState.recurringPublicacoesSummary,
    syncWorkerShouldFocusCrm: viewState.syncWorkerShouldFocusCrm,
  });
  const operationalPlanState = usePublicacoesOperationalPlan({
    actionState: params.actionState,
    handleAction: actions.handleAction,
    latestHistory: viewState.latestHistory,
    refreshIntegratedSnapshot: actions.refreshIntegratedSnapshot,
    updateView: actions.updateView,
  });
  const dashboard = usePublicacoesDashboardState({
    actionState: params.actionState,
    activeJobId: params.activeJobId,
    backendHealth: params.backendHealth,
    blockingState: viewState,
    data: params.overview.data || {},
    drainInFlight: params.drainInFlight,
    handleAction: actions.handleAction,
    jobs: params.jobs,
    partesCandidates: params.partesCandidates,
    processCandidates: params.processCandidates,
    refreshIntegratedSnapshot: actions.refreshIntegratedSnapshot,
    remoteHistory: params.remoteHistory,
    runPendingJobsNow: actions.runPendingJobsNow,
    updateView: actions.updateView,
  });

  usePublicacoesEffects({
    ...params,
    ...loaders,
    refreshAfterAction: actions.refreshAfterAction,
    refreshOperationalContext: actions.refreshOperationalContext,
  });

  return usePublicacoesScreenComposition({
    ...params,
    ...actions,
    ...dashboard,
    ...operationalPlanState,
    ...queue,
    ...rowState,
    ...viewState,
    data: params.overview.data || {},
    ...loaders,
  });
}
