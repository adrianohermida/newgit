import { useMemo } from "react";
import { countQueueErrors, countQueueReadMismatches, coverageMismatchMessage, queueHasReadMismatch } from "./processos-screen-utils";
import { deriveRemoteHealth } from "./recurrence";
import { buildSelectionSuggestedAction, deriveSelectionActionHint } from "./processos-selection-utils";
import { useProcessosQueueActionConfigs } from "./useProcessosQueueActionConfigs";

export function useProcessosDerivedState(args) {
  const data = args.overview.data || {};
  const latestHistory = args.executionHistory[0] || null;
  const latestRemoteRun = args.remoteHistory[0] || null;
  const latestJob = args.jobs[0] || null;
  const monitoringUnsupported = Boolean(args.monitoringActive.unsupported || args.monitoringInactive.unsupported);
  const combinedSelectedNumbers = args.getCombinedSelectedNumbers();
  const remoteHealth = deriveRemoteHealth(args.remoteHistory);

  const focusStats = useMemo(() => [
    { label: "Acao imediata", value: data?.recommendedNextAction?.label || "Operacao", helper: "Atalho mais util para destravar a esteira agora." },
    { label: "Backlog do worker", value: data.workerVisibleTotal || 0, helper: data.syncWorkerScopeNote || "Pendencias realmente drenaveis pelo worker." },
    { label: "Gap estrutural", value: data.structuralGapTotal || 0, helper: "Problemas de CRM, campos e cobertura fora do worker." },
    { label: "Fila critica", value: Math.max(Number(args.movementBacklog.totalRows || 0), Number(args.publicationBacklog.totalRows || 0), Number(args.partesBacklog.totalRows || 0), Number(args.fieldGaps.totalRows || 0), Number(args.orphans.totalRows || 0)), helper: "Maior fila operacional visivel neste momento." },
  ], [args.fieldGaps.totalRows, args.movementBacklog.totalRows, args.orphans.totalRows, args.partesBacklog.totalRows, args.publicationBacklog.totalRows, data]);

  const relationTypeSummary = useMemo(() => args.relations.items.reduce((acc, item) => {
    acc[item.tipo_relacao] = (acc[item.tipo_relacao] || 0) + 1;
    return acc;
  }, {}), [args.relations.items]);

  const selectedVisibleSevereRecurringCount = [...args.withoutMovements.items, ...args.movementBacklog.items, ...args.publicationBacklog.items, ...args.partesBacklog.items, ...args.audienciaCandidates.items, ...args.monitoringActive.items, ...args.monitoringInactive.items, ...args.fieldGaps.items, ...args.orphans.items]
    .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index)
    .filter((item) => args.recurringProcesses.some((recurring) => recurring.key === (item.numero_cnj || item.key) && recurring.hits >= 3))
    .filter((item) => combinedSelectedNumbers.includes(item.numero_cnj))
    .length;

  const selectionActionHint = deriveSelectionActionHint({
    selectedWithoutMovements: args.selectedWithoutMovements,
    selectedMovementBacklog: args.selectedMovementBacklog,
    selectedPublicationBacklog: args.selectedPublicationBacklog,
    selectedPartesBacklog: args.selectedPartesBacklog,
    selectedAudienciaCandidates: args.selectedAudienciaCandidates,
    selectedMonitoringActive: args.selectedMonitoringActive,
    selectedMonitoringInactive: args.selectedMonitoringInactive,
    selectedFieldGaps: args.selectedFieldGaps,
    selectedOrphans: args.selectedOrphans,
    monitoringUnsupported,
  });

  const selectionSuggestedAction = buildSelectionSuggestedAction({
    selectedWithoutMovements: args.selectedWithoutMovements,
    selectedMovementBacklog: args.selectedMovementBacklog,
    selectedPublicationBacklog: args.selectedPublicationBacklog,
    selectedPartesBacklog: args.selectedPartesBacklog,
    selectedAudienciaCandidates: args.selectedAudienciaCandidates,
    selectedMonitoringActive: args.selectedMonitoringActive,
    selectedMonitoringInactive: args.selectedMonitoringInactive,
    selectedFieldGaps: args.selectedFieldGaps,
    selectedOrphans: args.selectedOrphans,
    monitoringUnsupported,
    withoutMovements: args.withoutMovements.items,
    movementBacklog: args.movementBacklog.items,
    publicationBacklog: args.publicationBacklog.items,
    partesBacklog: args.partesBacklog.items,
    audienciaCandidates: args.audienciaCandidates.items,
    monitoringActive: args.monitoringActive.items,
    monitoringInactive: args.monitoringInactive.items,
    fieldGaps: args.fieldGaps.items,
    orphans: args.orphans.items,
    resolveActionProcessNumbers: args.resolveActionProcessNumbers,
    getSelectedNumbers: args.getSelectedNumbers,
    limit: args.limit,
  });

  const trackedQueues = [args.withoutMovements, args.movementBacklog, args.publicationBacklog, args.partesBacklog, args.audienciaCandidates, args.monitoringActive, args.monitoringInactive, args.fieldGaps, args.orphans];
  const trackedQueueErrorCount = countQueueErrors(trackedQueues);
  const trackedQueueMismatchCount = countQueueReadMismatches(trackedQueues);
  const hasPendingJobs = args.jobs.some((item) => ["pending", "running"].includes(String(item.status || "")));
  const backendRecommendedAction = data?.recommendedNextAction || null;
  const workerStoppedWithoutProgress = String(data?.syncWorker?.worker?.ultimo_lote?.motivo || data?.syncWorker?.ultimo_lote?.motivo || "") === "sem_prog";
  const workerStructuralSuggestion = workerStoppedWithoutProgress && Number(data?.structuralGapTotal || 0) > 0
    ? Number(data?.partesSemContato || 0) > 0 ? { key: "structural_partes", label: "Abrir partes sem contato", onClick: () => args.updateView("filas", "processos-partes-sem-contato") } : Number(data?.camposOrfaos || 0) > 0 || Number(data?.processosSemPolos || 0) > 0 || Number(data?.processosSemStatus || 0) > 0 ? { key: "structural_gaps", label: "Abrir campos orfaos", onClick: () => args.updateView("filas", "processos-campos-orfaos") } : Number(data?.processosSemMovimentacao || 0) > 0 ? { key: "structural_movs", label: "Buscar movimentacoes", onClick: () => args.updateView("filas", "processos-sem-movimentacoes") } : { key: "structural_cover", label: "Auditar cobertura", onClick: () => args.updateView("filas", "processos-cobertura") }
    : null;
  const recommendedHealthAction = backendRecommendedAction?.hash ? { key: `backend_${backendRecommendedAction.key || "action"}`, label: backendRecommendedAction.label || "Abrir fila recomendada", onClick: () => args.updateView("filas", backendRecommendedAction.hash) } : workerStructuralSuggestion;
  const healthQueueTarget = args.publicationBacklog.error || queueHasReadMismatch(args.publicationBacklog) ? { hash: "processos-publicacoes-pendentes", label: "Sincronizar publicacoes", view: "filas" } : args.partesBacklog.error || queueHasReadMismatch(args.partesBacklog) ? { hash: "processos-partes-sem-contato", label: "Reconciliar partes", view: "filas" } : args.movementBacklog.error || queueHasReadMismatch(args.movementBacklog) ? { hash: "processos-movimentacoes-pendentes", label: "Sincronizar movimentacoes", view: "filas" } : args.orphans.error || queueHasReadMismatch(args.orphans) ? { hash: "processos-sem-sales-account", label: "Criar accounts", view: "filas" } : args.processCoverage.error || args.processCoverage.limited || coverageMismatchMessage(args.processCoverage) ? { hash: "processos-cobertura", label: "Auditar cobertura", view: "filas" } : { hash: "filas", label: "Abrir filas", view: "filas" };
  const healthSuggestedActions = [];
  if (recommendedHealthAction) healthSuggestedActions.push(recommendedHealthAction);
  if (trackedQueueErrorCount > 0 || trackedQueueMismatchCount > 0) healthSuggestedActions.push({ key: "filas", label: healthQueueTarget.label, onClick: () => args.updateView(healthQueueTarget.view, healthQueueTarget.hash) });
  if (args.backendHealth.status === "warning" || args.backendHealth.status === "error") healthSuggestedActions.push({ key: "resultado", label: "Ver resultado", onClick: () => args.updateView("resultado", "resultado") });
  if (hasPendingJobs) healthSuggestedActions.push({ key: "drain", label: args.drainInFlight ? "Drenando..." : "Drenar fila", onClick: args.runPendingJobsNow, disabled: args.actionState.loading || args.drainInFlight });
  if (!healthSuggestedActions.length || (trackedQueueErrorCount === 0 && trackedQueueMismatchCount === 0 && args.backendHealth.status === "ok" && !hasPendingJobs)) healthSuggestedActions.push({ key: "operacao", label: "Ir para operacao", onClick: () => args.updateView("operacao", "operacao") });

  const queueActionConfigs = useProcessosQueueActionConfigs(args);

  return {
    combinedSelectedNumbers,
    data,
    focusStats,
    hasPendingJobs,
    healthSuggestedActions,
    latestHistory,
    latestJob,
    latestRemoteRun,
    monitoringUnsupported,
    queueActionConfigs,
    relationTypeSummary,
    remoteHealth,
    runnerAction: (args.runnerMetrics?.data || {}).datajudAction || {},
    runnerCoverage: (args.runnerMetrics?.data || {}).coverage || {},
    runnerData: args.runnerMetrics?.data || {},
    runnerDatajud: (args.runnerMetrics?.data || {}).datajud || {},
    runnerTagged: (args.runnerMetrics?.data || {}).tagged || {},
    selectedSummary: combinedSelectedNumbers.length,
    selectedVisibleSevereRecurringCount,
    selectionActionHint,
    selectionSuggestedAction,
    trackedQueueErrorCount,
    trackedQueueMismatchCount,
  };
}
