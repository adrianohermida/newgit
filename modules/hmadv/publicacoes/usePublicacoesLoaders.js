import { usePublicacoesDataLoader } from "./usePublicacoesDataLoader";
import { usePublicacoesMetaLoader } from "./usePublicacoesMetaLoader";

export function usePublicacoesLoaders(params) {
  const meta = usePublicacoesMetaLoader({
    adminFetch: params.adminFetch,
    globalErrorUntil: params.globalErrorUntil,
    setGlobalError: params.setGlobalError,
    setGlobalErrorUntil: params.setGlobalErrorUntil,
    setJobs: params.setJobs,
    setOverview: params.setOverview,
    setRemoteHistory: params.setRemoteHistory,
  });

  const data = usePublicacoesDataLoader({
    adminFetch: params.adminFetch,
    globalErrorUntil: params.globalErrorUntil,
    heavyQueuesEnabled: params.heavyQueuesEnabled,
    integratedCursorTrail: params.integratedCursorTrail,
    integratedFilters: params.integratedFilters,
    integratedPageSize: params.integratedPageSize,
    integratedQueue: params.integratedQueue,
    integratedQueueRequestRef: params.integratedQueueRequestRef,
    isResourceLimitError: params.isResourceLimitError,
    partesCandidates: params.partesCandidates,
    partesCandidatesRequestRef: params.partesCandidatesRequestRef,
    processCandidates: params.processCandidates,
    processCandidatesRequestRef: params.processCandidatesRequestRef,
    setIntegratedCursorTrail: params.setIntegratedCursorTrail,
    setIntegratedQueue: params.setIntegratedQueue,
    setPartesCandidates: params.setPartesCandidates,
    setProcessCandidates: params.setProcessCandidates,
    setQueueRefreshLog: params.setQueueRefreshLog,
    setValidationMap: params.setValidationMap,
  });

  return { ...meta, ...data };
}
