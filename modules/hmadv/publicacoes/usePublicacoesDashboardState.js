import { useMemo } from "react";

import { deriveRemoteHealth } from "./recurrence";
import { usePublicacoesBlockingState } from "./usePublicacoesBlockingState";

function hasReadMismatch(queue) {
  return Number(queue?.totalRows || 0) > 0 && !(queue?.items || []).length;
}

export function usePublicacoesDashboardState(params) {
  const {
    actionState,
    activeJobId,
    backendHealth,
    blockingState,
    data,
    drainInFlight,
    handleAction,
    jobs,
    partesCandidates,
    processCandidates,
    refreshIntegratedSnapshot,
    remoteHistory,
    runPendingJobsNow,
    updateView,
  } = params;

  const resolvedBlockingState = usePublicacoesBlockingState({
    activeJobId,
    jobs,
    partesCandidates,
    processCandidates,
  });

  return useMemo(() => {
    const advisePersistedDelta = Number(data?.advisePersistedDelta || 0);
    const publicacoesSemProcesso = Number(data?.publicacoesSemProcesso || 0);
    const publicacoesPendentesComAccount = Number(data?.publicacoesPendentesComAccount || 0);
    const state = blockingState || resolvedBlockingState;
    const { blockingJob, candidateQueueErrorCount, candidateQueueMismatchCount, canManuallyDrainActiveJob, currentDrainJobId, hasBlockingJob, hasMultipleBlockingJobs } = state;
    const backendRecommendedAction = data?.recommendedNextAction || null;
    const actions = [];

    if (backendRecommendedAction?.label) {
      actions.push({
        key: `backend_${backendRecommendedAction.key || "action"}`,
        label: backendRecommendedAction.label,
        onClick: () => {
          if (backendRecommendedAction.key === "run_advise_backfill") return handleAction("run_advise_backfill", false);
          if (backendRecommendedAction.key === "refresh_snapshot_filas") return refreshIntegratedSnapshot("all");
          return updateView(backendRecommendedAction.view || "operacao", backendRecommendedAction.hash || "operacao");
        },
        disabled: backendRecommendedAction.key === "refresh_snapshot_filas" ? actionState.loading || hasBlockingJob : actionState.loading,
      });
    }

    if (advisePersistedDelta > 0 || publicacoesSemProcesso > 0) {
      actions.push({ key: "operacao-drenagem", label: "Abrir drenagem principal", onClick: () => updateView("operacao", "operacao") });
      actions.push({ key: "advise-backfill", label: "Importar backlog Advise", onClick: () => handleAction("run_advise_backfill", false), disabled: actionState.loading });
    }

    if (candidateQueueErrorCount > 0 || candidateQueueMismatchCount > 0) {
      const queueTarget = processCandidates.error || hasReadMismatch(processCandidates)
        ? { hash: "publicacoes-fila-processos-criaveis", label: "Criar processos", view: "filas" }
        : { hash: "publicacoes-fila-partes-extraiveis", label: "Salvar + CRM", view: "filas" };
      actions.push({ key: "filas", label: queueTarget.label, onClick: () => updateView(queueTarget.view, queueTarget.hash) });
    }

    if (publicacoesPendentesComAccount > 0) actions.push({ key: "sync-crm", label: "Sincronizar publicacoes", onClick: () => updateView("operacao", "operacao") });
    if (backendHealth.status === "warning" || backendHealth.status === "error") actions.push({ key: "resultado", label: "Ver resultado", onClick: () => updateView("resultado", "resultado") });
    if (canManuallyDrainActiveJob) actions.push({ key: "drain", label: drainInFlight ? "Drenando..." : "Drenar fila", onClick: runPendingJobsNow, disabled: actionState.loading || drainInFlight || !canManuallyDrainActiveJob });
    if (!actions.length) actions.push({ key: "operacao", label: "Ir para operacao", onClick: () => updateView("operacao", "operacao") });

    return {
      blockingJob,
      candidateQueueErrorCount,
      candidateQueueMismatchCount,
      canManuallyDrainActiveJob,
      currentDrainJobId,
      hasBlockingJob,
      hasMultipleBlockingJobs,
      healthSuggestedActions: actions,
      remoteHealth: deriveRemoteHealth(remoteHistory),
    };
  }, [actionState.loading, backendHealth.status, blockingState, data, drainInFlight, handleAction, refreshIntegratedSnapshot, remoteHistory, resolvedBlockingState, runPendingJobsNow, updateView]);
}
