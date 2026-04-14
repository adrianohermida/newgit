import { usePublicacoesQueueSelection } from "./usePublicacoesQueueSelection";

export function usePublicacoesQueueInteractions(params) {
  return usePublicacoesQueueSelection({
    integratedPage: params.integratedPage,
    integratedPageSize: params.integratedPageSize,
    integratedQueue: params.integratedQueue,
    pagedIntegratedRows: params.pagedIntegratedRows,
    setIntegratedCursorTrail: params.setIntegratedCursorTrail,
    setIntegratedPage: params.setIntegratedPage,
    setSelectedIntegratedNumbers: params.setSelectedIntegratedNumbers,
  });
}
