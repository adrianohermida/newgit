import { useEffect, useMemo } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import OperationalHealthPanel from "../../../components/interno/hmadv/OperationalHealthPanel";
import OperationalPlanPanel from "../../../components/interno/hmadv/OperationalPlanPanel";
import {
  ACTION_LABELS,
  MODULE_LIMITS,
} from "./constants";
import {
  buildJobPreview,
} from "./action-utils";
import { usePublicacoesAdminFetch } from "./usePublicacoesAdminFetch";
import { usePublicacoesNavigationState } from "./usePublicacoesNavigationState";
import {
  HealthBadge,
  Panel,
  QueueSummaryCard,
} from "./ui-primitives";
import { usePublicacoesDerivedState } from "./usePublicacoesDerivedState";
import { usePublicacoesQueueSelection } from "./usePublicacoesQueueSelection";
import { usePublicacoesValidationActions } from "./usePublicacoesValidationActions";
import { usePublicacoesIntegratedDetail } from "./usePublicacoesIntegratedDetail";
import { usePublicacoesParteActions } from "./usePublicacoesParteActions";
import { usePublicacoesExecutionHistory } from "./usePublicacoesExecutionHistory";
import { usePublicacoesActionRunner } from "./usePublicacoesActionRunner";
import { usePublicacoesUiActions } from "./usePublicacoesUiActions";
import { usePublicacoesOperationalPlan } from "./usePublicacoesOperationalPlan";
import { usePublicacoesCoreState } from "./usePublicacoesCoreState";
import { usePublicacoesQueueState } from "./usePublicacoesQueueState";
import { usePublicacoesDetailState } from "./usePublicacoesDetailState";
import {
  formatDateTimeLabel,
  formatFallbackReason,
  formatSnapshotLabel,
  formatValidationMeta,
  getPublicacaoSelectionValue,
  isResourceLimitError as detectResourceLimitError,
  matchesPublicacaoSelection,
  validationLabel,
  validationTone,
} from "./publicacoesFormatting";
import { usePublicacoesActivityLog } from "./usePublicacoesActivityLog";
import { usePublicacoesDashboardState } from "./usePublicacoesDashboardState";
import { usePublicacoesBlockingState } from "./usePublicacoesBlockingState";
import { usePublicacoesLifecycle } from "./usePublicacoesLifecycle";
import { usePublicacoesHealthStatus } from "./usePublicacoesHealthStatus";
import { usePublicacoesJobDrain } from "./usePublicacoesJobDrain";
import { usePublicacoesQueueEffects } from "./usePublicacoesQueueEffects";
import { recoverPublicacoesAdviseBackfillFailure } from "./publicacoesBackfillRecovery";
import { usePublicacoesRefreshActions } from "./usePublicacoesRefreshActions";
import { usePublicacoesOverviewState } from "./usePublicacoesOverviewState";
import { PublicacoesScreenBody } from "./PublicacoesScreenBody";
import { usePublicacoesQueuesScreenModel } from "./usePublicacoesQueuesScreenModel";
import { usePublicacoesLoaders } from "./usePublicacoesLoaders";
import { usePublicacoesIntegratedRows } from "./usePublicacoesIntegratedRows";


function PublicacoesContent() {
  const { isLightTheme } = useInternalTheme();
  const { logUiEvent } = usePublicacoesActivityLog();
  const {
    activeJobId, actionState, backendHealth, copilotContext, copilotQueryAppliedRef, drainInFlight,
    executionHistory, globalError, globalErrorUntil, jobs, lastFocusHash, limit, operationalStatus,
    overview, pageVisible, processNumbers, queueRefreshLog, remoteHistory, setActiveJobId, setActionState,
    setBackendHealth, setCopilotContext, setDrainInFlight, setExecutionHistory, setGlobalError,
    setGlobalErrorUntil, setJobs, setLastFocusHash, setLimit, setOperationalStatus, setOverview,
    setPageVisible, setProcessNumbers, setQueueRefreshLog, setRemoteHistory, setView, view,
  } = usePublicacoesCoreState();
  const {
    heavyQueuesEnabled, integratedCursorTrail, integratedFilters, integratedPage, integratedPageSize,
    integratedQueue, integratedQueueRequestRef, partesCandidates, partesCandidatesRequestRef, partesPage,
    processCandidates, processCandidatesRequestRef, processPage, selectedIntegratedNumbers, selectedPartesKeys,
    selectedProcessKeys, setHeavyQueuesEnabled, setIntegratedCursorTrail, setIntegratedFilters, setIntegratedPage,
    setIntegratedQueue, setPartesCandidates, setPartesPage, setProcessCandidates, setProcessPage,
    setSelectedIntegratedNumbers, setSelectedPartesKeys, setSelectedProcessKeys, setValidationMap, validationMap,
  } = usePublicacoesQueueState();
  const {
    bulkValidationNote, bulkValidationStatus, detailEditForm, detailLinkType, detailState,
    selectedDetailLinkedPartes, selectedDetailPendingPartes, setBulkValidationNote,
    setBulkValidationStatus, setDetailEditForm, setDetailLinkType, setDetailState,
    setSelectedDetailLinkedPartes, setSelectedDetailPendingPartes,
  } = usePublicacoesDetailState();
  const adminFetch = usePublicacoesAdminFetch();
  const {
    loadJobs,
    loadOverview,
    loadRemoteHistory,
  } = usePublicacoesMetaLoader({
    adminFetch,
    globalErrorUntil,
    setGlobalError,
    setGlobalErrorUntil,
    setJobs,
    setOverview,
    setRemoteHistory,
  });
  const {
    loadIntegratedQueue,
    loadPartesCandidates,
    loadProcessCandidates,
    pushQueueRefresh,
  } = usePublicacoesDataLoader({
    adminFetch,
    globalErrorUntil,
    heavyQueuesEnabled,
    integratedCursorTrail,
    integratedFilters,
    integratedPageSize,
    integratedQueue,
    integratedQueueRequestRef,
    isResourceLimitError: detectResourceLimitError,
    partesCandidates,
    partesCandidatesRequestRef,
    processCandidates,
    processCandidatesRequestRef,
    setIntegratedCursorTrail,
    setIntegratedQueue,
    setPartesCandidates,
    setProcessCandidates,
    setQueueRefreshLog,
    setValidationMap,
  });
  const integratedRows = useMemo(
    () => (integratedQueue.items || []).map((row) => ({
      ...row,
      validation: validationMap[row.numero_cnj] || { status: "", note: "", updatedAt: null },
    })),
    [integratedQueue.items, validationMap]
  );
  const filteredIntegratedRows = useMemo(() => {
    const filtered = integratedRows.filter((row) => {
      if (integratedFilters.validation !== "todos" && (row.validation?.status || "") !== integratedFilters.validation) return false;
      return true;
    });
    const sorted = [...filtered];
    if (integratedFilters.sort === "cnj") {
      sorted.sort((a, b) => String(a.numero_cnj || "").localeCompare(String(b.numero_cnj || "")));
      return sorted;
    }
    if (integratedFilters.sort === "validacao_recente") {
      sorted.sort((a, b) => new Date(b.validation?.updatedAt || 0).getTime() - new Date(a.validation?.updatedAt || 0).getTime());
      return sorted;
    }
    if (integratedFilters.sort === "validado_por") {
      sorted.sort((a, b) => String(a.validation?.updatedBy || "").localeCompare(String(b.validation?.updatedBy || "")));
      return sorted;
    }
    sorted.sort((a, b) => {
      const aCount = Number(a?.partes_novas || a?.partes_detectadas || a?.publicacoes || 0);
      const bCount = Number(b?.partes_novas || b?.partes_detectadas || b?.publicacoes || 0);
      if (bCount !== aCount) return bCount - aCount;
      return String(a.numero_cnj || "").localeCompare(String(b.numero_cnj || ""));
    });
    return sorted;
  }, [integratedFilters.sort, integratedFilters.validation, integratedRows]);
  const pagedIntegratedRows = useMemo(() => {
    return filteredIntegratedRows.map((row) => ({
      ...row,
      selected: selectedIntegratedNumbers.includes(row.numero_cnj),
    }));
  }, [filteredIntegratedRows, selectedIntegratedNumbers]);
  const selectedUnifiedNumbers = useMemo(
    () => selectedIntegratedNumbers,
    [selectedIntegratedNumbers]
  );
  const {
    recurringPublicacoes,
    recurringPublicacoesSummary,
    recurringPublicacoesBands,
    recurringPublicacoesGroups,
    recurringPublicacoesFocus,
    recurringPublicacoesBatch,
    recurringPublicacoesActions,
    recurringPublicacoesChecklist,
    queueDiagnostics,
    visibleRecurringCount,
    visibleSevereRecurringCount,
    selectedVisibleSevereRecurringCount,
    primaryPublicacoesAction,
    partesBacklogCount,
    syncWorkerShouldFocusCrm,
    selectedUnifiedCount,
    allIntegratedPageSelected,
    allIntegratedFilteredSelected,
    integratedCanGoPrevious,
    integratedCanGoNext,
    integratedSourceLabel,
    priorityBatchReady,
  } = usePublicacoesDerivedState({
    remoteHistory,
    processCandidates,
    partesCandidates,
    integratedQueue,
    selectedIntegratedNumbers,
    pagedIntegratedRows,
    filteredIntegratedRows,
    integratedPage,
    integratedPageSize,
    data: overview.data || {},
    limit,
    selectedProcessKeys,
    selectedPartesKeys,
  });
  const {
    blockingJob,
    candidateQueueErrorCount,
    candidateQueueMismatchCount,
    canManuallyDrainActiveJob,
    currentDrainJobId,
    hasBlockingJob,
    hasMultipleBlockingJobs,
  } = usePublicacoesBlockingState({
    activeJobId,
    jobs,
    partesCandidates,
    processCandidates,
  });
  const {
    toggleSelection,
    togglePageSelection,
    toggleUnifiedRow,
    goToIntegratedPreviousPage,
    goToIntegratedNextPage,
    toggleIntegratedPage,
  } = usePublicacoesQueueSelection({
    integratedQueue,
    integratedPage,
    integratedPageSize,
    pagedIntegratedRows,
    setIntegratedCursorTrail,
    setIntegratedPage,
    setSelectedIntegratedNumbers,
  });
  const {
    buildActionMeta,
    pushHistoryEntry,
    replaceHistoryEntry,
  } = usePublicacoesExecutionHistory({
    processNumbers,
    limit,
    selectedProcessKeys,
    selectedPartesKeys,
    setExecutionHistory,
  });

  const {
    applySevereRecurringPreset,
    clearHistory,
    clearQueueSelections,
    reuseHistoryEntry,
    selectVisibleRecurringPublicacoes,
    selectVisibleSevereRecurringPublicacoes,
    updateView,
  } = usePublicacoesUiActions({
    filteredIntegratedRows,
    getPublicacaoSelectionValue,
    logUiEvent,
    processCandidates,
    recurringPublicacoes,
    recurringPublicacoesBatch,
    recurringPublicacoesSummary,
    setExecutionHistory,
    setLastFocusHash,
    setLimit,
    setProcessNumbers,
    setSelectedIntegratedNumbers,
    setSelectedPartesKeys,
    setSelectedProcessKeys,
    setView,
    partesCandidates,
  });
  const runAdviseBackfillRecovery = async (error, safeLimit) => recoverPublicacoesAdviseBackfillFailure({
    adminFetch,
    error,
    safeLimit,
    setGlobalError,
    setGlobalErrorUntil,
    setOverview,
    setRemoteHistory,
  });
  const {
    loadHeavyQueueReads,
    refreshAfterAction,
    refreshIntegratedSnapshot,
    refreshOperationalContext,
    toggleIntegratedFiltered,
  } = usePublicacoesRefreshActions({
    activeJobId,
    adminFetch,
    filteredIntegratedRows,
    heavyQueuesEnabled,
    integratedFilters,
    integratedPage,
    integratedPageSize,
    integratedQueue,
    jobs,
    loadIntegratedQueue,
    loadJobs,
    loadOverview,
    loadPartesCandidates,
    loadProcessCandidates,
    loadRemoteHistory,
    partesPage,
    processPage,
    pushQueueRefresh,
    setActionState,
    setActiveJobId,
    setHeavyQueuesEnabled,
    setIntegratedCursorTrail,
    setIntegratedPage,
    setSelectedIntegratedNumbers,
    view,
  });
  const {
    handleAction,
    queueAsyncAction,
    runPendingJobsNow,
  } = usePublicacoesActionRunner({
    adminFetch,
    activeJobId,
    blockingJob,
    buildActionMeta,
    canManuallyDrainActiveJob,
    currentDrainJobId,
    hasBlockingJob,
    limit,
    loadJobs,
    loadRemoteHistory,
    overview: overview.data,
    partsBacklogCount,
    processNumbers,
    pushHistoryEntry,
    recoverAdviseBackfillFailure: runAdviseBackfillRecovery,
    refreshAfterAction,
    refreshOperationalContext,
    replaceHistoryEntry,
    setActionState,
    setActiveJobId,
    syncWorkerShouldFocusCrm,
    updateView,
  });
  const {
    applyValidationToNumbers,
    runBulkContactsReconcile,
  } = usePublicacoesValidationActions({
    adminFetch,
    updateView,
    selectedUnifiedNumbers,
    setValidationMap,
    setActionState,
    queueAsyncAction,
  });
  const {
    loadIntegratedDetail,
    saveDetailContact,
  } = usePublicacoesIntegratedDetail({
    adminFetch,
    detailState,
    detailEditForm,
    applyValidationToNumbers,
    setValidationMap,
    setActionState,
    setDetailState,
    setDetailEditForm,
  });
  const {
    toggleDetailPendingParte,
    toggleDetailLinkedParte,
    toggleDetailPendingPage,
    toggleDetailLinkedPage,
    linkPendingDetailPartes,
    moveLinkedDetailPartes,
    reclassifyLinkedDetailPartes,
    unlinkLinkedDetailPartes,
  } = usePublicacoesParteActions({
    adminFetch,
    detailState,
    detailLinkType,
    selectedDetailPendingPartes,
    selectedDetailLinkedPartes,
    setActionState,
    setSelectedDetailPendingPartes,
    setSelectedDetailLinkedPartes,
    loadIntegratedDetail,
  });
  usePublicacoesNavigationState({ view, lastFocusHash, setView, setLastFocusHash });
  usePublicacoesLifecycle({
    actionState,
    backendHealth,
    copilotQueryAppliedRef,
    executionHistory,
    jobs,
    lastFocusHash,
    limit,
    loadJobs,
    loadOverview,
    loadRemoteHistory,
    operationalStatus,
    overview,
    pageVisible,
    partesCandidates,
    processCandidates,
    processPage,
    queueRefreshLog,
    remoteHistory,
    selectedPartesKeys,
    selectedProcessKeys,
    setCopilotContext,
    setExecutionHistory,
    setLastFocusHash,
    setPageVisible,
    setProcessNumbers,
    setValidationMap,
    validationMap,
    view,
  });

  usePublicacoesQueueEffects({
    activeJobId,
    detailState,
    heavyQueuesEnabled,
    integratedCursorTrail,
    integratedFilters,
    integratedPage,
    integratedPageSize,
    integratedQueue,
    jobs,
    loadIntegratedQueue,
    loadPartesCandidates,
    loadProcessCandidates,
    partesPage,
    processPage,
    setActiveJobId,
    setDetailState,
    setIntegratedCursorTrail,
    setIntegratedPage,
    setSelectedDetailLinkedPartes,
    setSelectedDetailPendingPartes,
    validationMap,
    view,
  });
  usePublicacoesJobDrain({
    ACTION_LABELS,
    activeJobId,
    adminFetch,
    buildJobPreview,
    loadJobs,
    loadRemoteHistory,
    pageVisible,
    refreshAfterAction,
    refreshOperationalContext,
    setActionState,
    setActiveJobId,
    setDrainInFlight,
  });
  usePublicacoesHealthStatus({
    globalError,
    overview,
    partesCandidates,
    processCandidates,
    remoteHistory,
    setBackendHealth,
    setOperationalStatus,
  });




  const selectedProcessNumbers = useMemo(
    () => processCandidates.items.filter((item) => matchesPublicacaoSelection(item, selectedProcessKeys)).map((item) => item.numero_cnj).filter(Boolean),
    [processCandidates.items, selectedProcessKeys]
  );
  const data = overview.data || {};
  const {
    adviseBackfillProgress,
    adviseCursor,
    adviseLastCycleTotal,
    adviseLastRunAt,
    adviseMode,
    advisePersistedDelta,
    adviseSync,
    adviseTokenOk,
    isDockedPublicacoesView,
    isResultView,
    latestHistory,
    latestJob,
    latestRemoteRun,
    noPublicationActivityTypeConfigured,
    operationalPlan,
    pendingJobCount,
    publicationActivityTypeHint,
    publicationActivityTypes,
    snapshotMesaIntegrada,
    snapshotPartes,
    snapshotProcessos,
    syncWorkerLastPublicacoes,
  } = usePublicacoesOverviewState({
    data,
    executionHistory,
    jobs,
    remoteHistory,
    view,
  });
  const {
    getOperationalPlanStepState,
    runOperationalPlanStep,
  } = usePublicacoesOperationalPlan({
    actionState,
    latestHistory,
    handleAction,
    refreshIntegratedSnapshot,
    updateView,
  });
  const {
    healthSuggestedActions,
    remoteHealth,
  } = usePublicacoesDashboardState({
    actionState,
    activeJobId,
    backendHealth,
    blockingState: {
      blockingJob,
      candidateQueueErrorCount,
      candidateQueueMismatchCount,
      canManuallyDrainActiveJob,
      currentDrainJobId,
      hasBlockingJob,
      hasMultipleBlockingJobs,
    },
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
  });
  const queuesViewModel = usePublicacoesQueuesScreenModel({
    actionState,
    allIntegratedFilteredSelected,
    allIntegratedPageSelected,
    applySevereRecurringPreset,
    applyValidationToNumbers,
    bulkValidationNote,
    bulkValidationStatus,
    canManuallyDrainActiveJob,
    clearQueueSelections,
    data,
    detailEditForm,
    detailLinkType,
    detailState,
    drainInFlight,
    filteredIntegratedRows,
    formatDateTimeLabel,
    formatValidationMeta,
    getPublicacaoSelectionValue,
    goToIntegratedNextPage,
    goToIntegratedPreviousPage,
    handleAction,
    hasBlockingJob,
    heavyQueuesEnabled,
    integratedCanGoNext,
    integratedCanGoPrevious,
    integratedFilters,
    integratedPage,
    integratedPageSize,
    integratedQueue,
    integratedSourceLabel,
    isLightTheme,
    linkPendingDetailPartes,
    loadHeavyQueueReads,
    loadIntegratedDetail,
    moveLinkedDetailPartes,
    noPublicationActivityTypeConfigured,
    pagedIntegratedRows,
    partesCandidates,
    partesPage,
    primaryPublicacoesAction,
    priorityBatchReady,
    processCandidates,
    processPage,
    publicationActivityTypeHint,
    queueDiagnostics,
    reclassifyLinkedDetailPartes,
    recurringPublicacoes,
    recurringPublicacoesActions,
    recurringPublicacoesBands,
    recurringPublicacoesBatch,
    recurringPublicacoesChecklist,
    recurringPublicacoesFocus,
    recurringPublicacoesGroups,
    recurringPublicacoesSummary,
    refreshIntegratedSnapshot,
    runBulkContactsReconcile,
    runPendingJobsNow,
    saveDetailContact,
    selectedDetailLinkedPartes,
    selectedDetailPendingPartes,
    selectedPartesKeys,
    selectedProcessKeys,
    selectedUnifiedCount,
    selectedUnifiedNumbers,
    selectedVisibleSevereRecurringCount,
    selectVisibleRecurringPublicacoes,
    selectVisibleSevereRecurringPublicacoes,
    setBulkValidationNote,
    setBulkValidationStatus,
    setDetailEditForm,
    setDetailLinkType,
    setIntegratedFilters,
    setLimit,
    setPartesPage,
    setProcessPage,
    setSelectedPartesKeys,
    toggleDetailLinkedPage,
    toggleDetailLinkedParte,
    toggleDetailPendingPage,
    toggleDetailPendingParte,
    toggleIntegratedFiltered,
    toggleIntegratedPage,
    togglePageSelection,
    toggleSelection,
    toggleUnifiedRow,
    unlinkLinkedDetailPartes,
    updateView,
    validationLabel,
    validationTone,
    visibleRecurringCount,
    visibleSevereRecurringCount,
  });

  return (
    <PublicacoesScreenBody
      actionState={actionState}
      activeJobId={activeJobId}
      adviseBackfillProgress={adviseBackfillProgress}
      adviseCursor={adviseCursor}
      adviseLastCycleTotal={adviseLastCycleTotal}
      adviseLastRunAt={adviseLastRunAt}
      adviseMode={adviseMode}
      advisePersistedDelta={advisePersistedDelta}
      adviseSync={adviseSync}
      adviseTokenOk={adviseTokenOk}
      backendHealth={backendHealth}
      blockingJob={blockingJob}
      canManuallyDrainActiveJob={canManuallyDrainActiveJob}
      candidateQueueErrorCount={candidateQueueErrorCount}
      candidateQueueMismatchCount={candidateQueueMismatchCount}
      copilotContext={copilotContext}
      data={data}
      drainInFlight={drainInFlight}
      executionHistory={executionHistory}
      formatFallbackReason={formatFallbackReason}
      formatSnapshotLabel={formatSnapshotLabel}
      getOperationalPlanStepState={getOperationalPlanStepState}
      handleAction={handleAction}
      hasBlockingJob={hasBlockingJob}
      hasMultipleBlockingJobs={hasMultipleBlockingJobs}
      healthSuggestedActions={healthSuggestedActions}
      isDockedPublicacoesView={isDockedPublicacoesView}
      isLightTheme={isLightTheme}
      isResultView={isResultView}
      jobs={jobs}
      latestHistory={latestHistory}
      latestJob={latestJob}
      latestRemoteRun={latestRemoteRun}
      limit={limit}
      loadIntegratedDetail={loadIntegratedDetail}
      loadOverview={loadOverview}
      loadPartesCandidates={loadPartesCandidates}
      loadProcessCandidates={loadProcessCandidates}
      noPublicationActivityTypeConfigured={noPublicationActivityTypeConfigured}
      operationalPlan={operationalPlan}
      operationalStatus={operationalStatus}
      pagedIntegratedRows={pagedIntegratedRows}
      partesBacklogCount={partesBacklogCount}
      partesPage={partesPage}
      pendingJobCount={pendingJobCount}
      processCandidates={processCandidates}
      processNumbers={processNumbers}
      processPage={processPage}
      publicationActivityTypeHint={publicationActivityTypeHint}
      publicationActivityTypes={publicationActivityTypes}
      queueRefreshLog={queueRefreshLog}
      queuesViewModel={queuesViewModel}
      remoteHealth={remoteHealth}
      remoteHistory={remoteHistory}
      runOperationalPlanStep={runOperationalPlanStep}
      runPendingJobsNow={runPendingJobsNow}
      selectedPartesKeys={selectedPartesKeys}
      selectedProcessKeys={selectedProcessKeys}
      selectedProcessNumbers={selectedProcessNumbers}
      selectedUnifiedNumbers={selectedUnifiedNumbers}
      setLimit={setLimit}
      setProcessNumbers={setProcessNumbers}
      snapshotMesaIntegrada={snapshotMesaIntegrada}
      snapshotPartes={snapshotPartes}
      snapshotProcessos={snapshotProcessos}
      syncWorkerLastPublicacoes={syncWorkerLastPublicacoes}
      updateView={updateView}
      view={view}
    />
  );
}

export default function PublicacoesScreen() {
  return (
    <RequireAdmin>
      <PublicacoesContent />
    </RequireAdmin>
  );
}

