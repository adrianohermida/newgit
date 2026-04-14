import { usePublicacoesDerivedState } from "./usePublicacoesDerivedState";
import { usePublicacoesBlockingState } from "./usePublicacoesBlockingState";
import { usePublicacoesOverviewState } from "./usePublicacoesOverviewState";

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

  return { ...blocking, ...derived, ...overview };
}
