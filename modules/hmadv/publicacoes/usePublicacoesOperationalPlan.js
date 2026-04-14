export function usePublicacoesOperationalPlan({
  actionState,
  latestHistory,
  handleAction,
  refreshIntegratedSnapshot,
  updateView,
}) {
  function getOperationalPlanStepState(step, index) {
    const latestAction = String(latestHistory?.action || "");
    const stepAction = String(step?.actionKey || "");
    if (actionState.loading && latestAction && latestAction === stepAction) return { label: "em andamento", tone: "warning" };
    if (latestHistory?.status === "success" && latestAction && latestAction === stepAction) return { label: "concluido", tone: "success" };
    if (latestHistory?.status === "error" && latestAction && latestAction === stepAction) return { label: "falhou", tone: "danger" };
    if (index === 0) return { label: "agora", tone: "default" };
    return { label: "proximo", tone: "default" };
  }

  function runOperationalPlanStep(step) {
    if (!step) return;
    if (step.actionKey === "run_advise_backfill") {
      handleAction("run_advise_backfill", false);
      return;
    }
    if (step.actionKey === "refresh_snapshot_filas") {
      refreshIntegratedSnapshot("all");
      return;
    }
    updateView(step.targetView || "operacao", step.targetHash || "operacao");
  }

  return {
    getOperationalPlanStepState,
    runOperationalPlanStep,
  };
}
