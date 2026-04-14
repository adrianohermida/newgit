import { usePublicacoesDerivedState } from "./usePublicacoesDerivedState";
import { usePublicacoesBlockingState } from "./usePublicacoesBlockingState";
import { usePublicacoesOverviewState } from "./usePublicacoesOverviewState";
import { usePublicacoesOperationalPlan } from "./usePublicacoesOperationalPlan";
import { usePublicacoesDashboardState } from "./usePublicacoesDashboardState";

export function usePublicacoesViewState(params) {
  const derived = usePublicacoesDerivedState({
    data: params.data,
    filteredIntegratedRows: params.filteredIntegratedRows,
    integratedPage: params.integratedPage,
    integratedPageSize: params.integratedPageSize,
    integratedQueue: params.integratedQueue,
    pagedIntegratedRows: params.pagedIntegratedRows,
    partesCandidates: params.partesCandidates,
    processCandidates: params.processCandidates,
    limit: params.limit,
    remoteHistory: params.remoteHistory,
    selectedIntegratedNumbers: params.selectedIntegratedNumbers,
    selectedPartesKeys: params.selectedPartesKeys,
    selectedProcessKeys: params.selectedProcessKeys,
  });

  const blocking = usePublicacoesBlockingState({
    activeJobId: params.activeJobId,
    jobs: params.jobs,
    partesCandidates: params.partesCandidates,
    processCandidates: params.processCandidates,
  });

  const overview = usePublicacoesOverviewState({
    data: params.data,
    executionHistory: params.executionHistory,
    jobs: params.jobs,
    remoteHistory: params.remoteHistory,
    view: params.view,
  });

  const operationalPlanState = usePublicacoesOperationalPlan({
    actionState: params.actionState,
    handleAction: params.handleAction,
    latestHistory: overview.latestHistory,
    refreshIntegratedSnapshot: params.refreshIntegratedSnapshot,
    updateView: params.updateView,
  });

  const dashboard = usePublicacoesDashboardState({
    actionState: params.actionState,
    activeJobId: params.activeJobId,
    backendHealth: params.backendHealth,
    blockingState: blocking,
    data: params.data,
    drainInFlight: params.drainInFlight,
    handleAction: params.handleAction,
    jobs: params.jobs,
    partesCandidates: params.partesCandidates,
    processCandidates: params.processCandidates,
    refreshIntegratedSnapshot: params.refreshIntegratedSnapshot,
    remoteHistory: params.remoteHistory,
    runPendingJobsNow: params.runPendingJobsNow,
    updateView: params.updateView,
  });

  return { ...blocking, ...dashboard, ...derived, ...operationalPlanState, ...overview };
}
