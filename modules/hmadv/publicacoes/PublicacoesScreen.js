import React from "react";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import {
  ACTION_LABELS,
} from "./constants";
import {
  buildJobPreview,
} from "./action-utils";
import { usePublicacoesAdminFetch } from "./usePublicacoesAdminFetch";
import { usePublicacoesQueueSelection } from "./usePublicacoesQueueSelection";
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
  validationLabel,
  validationTone,
} from "./publicacoesFormatting";
import { usePublicacoesActivityLog } from "./usePublicacoesActivityLog";
import { PublicacoesScreenBody } from "./PublicacoesScreenBody";
import { usePublicacoesQueuesScreenModel } from "./usePublicacoesQueuesScreenModel";
import { usePublicacoesLoaders } from "./usePublicacoesLoaders";
import { usePublicacoesIntegratedRows } from "./usePublicacoesIntegratedRows";
import { usePublicacoesActionSuite } from "./usePublicacoesActionSuite";
import { usePublicacoesEffects } from "./usePublicacoesEffects";
import { usePublicacoesViewState } from "./usePublicacoesViewState";


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
    loadIntegratedQueue,
    loadJobs,
    loadOverview,
    loadPartesCandidates,
    loadProcessCandidates,
    loadRemoteHistory,
    pushQueueRefresh,
  } = usePublicacoesLoaders({
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
    setGlobalError,
    setGlobalErrorUntil,
    setIntegratedCursorTrail,
    setIntegratedQueue,
    setJobs,
    setOverview,
    setPartesCandidates,
    setProcessCandidates,
    setQueueRefreshLog,
    setRemoteHistory,
    setValidationMap,
  });
  const {
    filteredIntegratedRows,
    pagedIntegratedRows,
    selectedProcessNumbers,
    selectedUnifiedNumbers,
  } = usePublicacoesIntegratedRows({
    integratedFilters,
    integratedQueue,
    processCandidates,
    selectedIntegratedNumbers,
    selectedProcessKeys,
    validationMap,
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
    allIntegratedFilteredSelected,
    allIntegratedPageSelected,
    blockingJob,
    candidateQueueErrorCount,
    candidateQueueMismatchCount,
    canManuallyDrainActiveJob,
    currentDrainJobId,
    hasBlockingJob,
    hasMultipleBlockingJobs,
    integratedCanGoNext,
    integratedCanGoPrevious,
    integratedSourceLabel,
    latestHistory,
    latestJob,
    latestRemoteRun,
    noPublicationActivityTypeConfigured,
    operationalPlan,
    partesBacklogCount,
    pendingJobCount,
    primaryPublicacoesAction,
    priorityBatchReady,
    publicationActivityTypeHint,
    publicationActivityTypes,
    queueDiagnostics,
    recurringPublicacoes,
    recurringPublicacoesActions,
    recurringPublicacoesBands,
    recurringPublicacoesBatch,
    recurringPublicacoesChecklist,
    recurringPublicacoesFocus,
    recurringPublicacoesGroups,
    recurringPublicacoesSummary,
    remoteHealth,
    selectedUnifiedCount,
    selectedVisibleSevereRecurringCount,
    snapshotMesaIntegrada,
    snapshotPartes,
    snapshotProcessos,
    syncWorkerLastPublicacoes,
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
    runOperationalPlanStep,
    getOperationalPlanStepState,
    healthSuggestedActions,
    visibleRecurringCount,
    visibleSevereRecurringCount,
    syncWorkerShouldFocusCrm,
  } = usePublicacoesViewState({
    actionState,
    activeJobId,
    backendHealth,
    data: overview.data || {},
    drainInFlight,
    executionHistory,
    filteredIntegratedRows,
    handleAction: () => null,
    integratedPage,
    integratedPageSize,
    integratedQueue,
    jobs,
    limit,
    pagedIntegratedRows,
    partesCandidates,
    processCandidates,
    refreshIntegratedSnapshot: () => null,
    remoteHistory,
    runPendingJobsNow: () => null,
    selectedIntegratedNumbers,
    selectedPartesKeys,
    selectedProcessKeys,
    updateView: () => null,
    view,
  });
  const {
    applySevereRecurringPreset,
    applyValidationToNumbers,
    clearQueueSelections,
    handleAction,
    linkPendingDetailPartes,
    loadHeavyQueueReads,
    loadIntegratedDetail,
    moveLinkedDetailPartes,
    refreshAfterAction,
    refreshIntegratedSnapshot,
    refreshOperationalContext,
    reclassifyLinkedDetailPartes,
    runBulkContactsReconcile,
    runPendingJobsNow,
    saveDetailContact,
    selectVisibleRecurringPublicacoes,
    selectVisibleSevereRecurringPublicacoes,
    toggleDetailLinkedPage,
    toggleDetailLinkedParte,
    toggleDetailPendingPage,
    toggleDetailPendingParte,
    toggleIntegratedFiltered,
    unlinkLinkedDetailPartes,
    updateView,
  } = usePublicacoesActionSuite({
    activeJobId,
    adminFetch,
    blockingJob,
    canManuallyDrainActiveJob,
    currentDrainJobId,
    detailEditForm,
    detailLinkType,
    detailState,
    filteredIntegratedRows,
    getPublicacaoSelectionValue,
    hasBlockingJob,
    heavyQueuesEnabled,
    integratedFilters,
    integratedPage,
    integratedPageSize,
    integratedQueue,
    jobs,
    limit,
    loadIntegratedQueue,
    loadJobs,
    loadOverview,
    loadPartesCandidates,
    loadProcessCandidates,
    loadRemoteHistory,
    logUiEvent,
    overview: overview.data,
    partesCandidates,
    partesPage,
    partsBacklogCount: partesBacklogCount,
    processCandidates,
    processNumbers,
    processPage,
    pushQueueRefresh,
    recurringPublicacoes,
    recurringPublicacoesBatch,
    recurringPublicacoesSummary,
    selectedDetailLinkedPartes,
    selectedDetailPendingPartes,
    selectedIntegratedNumbers,
    selectedPartesKeys,
    selectedProcessKeys,
    selectedUnifiedNumbers,
    setActionState,
    setActiveJobId,
    setDetailEditForm,
    setDetailState,
    setExecutionHistory,
    setGlobalError,
    setGlobalErrorUntil,
    setHeavyQueuesEnabled,
    setIntegratedCursorTrail,
    setIntegratedPage,
    setLastFocusHash,
    setLimit,
    setOverview,
    setProcessNumbers,
    setRemoteHistory,
    setSelectedDetailLinkedPartes,
    setSelectedDetailPendingPartes,
    setSelectedIntegratedNumbers,
    setSelectedPartesKeys,
    setSelectedProcessKeys,
    setValidationMap,
    setView,
    syncWorkerShouldFocusCrm,
    view,
  });
  usePublicacoesEffects({
    ACTION_LABELS,
    actionState,
    activeJobId,
    adminFetch,
    backendHealth,
    buildJobPreview,
    copilotQueryAppliedRef,
    detailState,
    executionHistory,
    globalError,
    heavyQueuesEnabled,
    integratedCursorTrail,
    integratedFilters,
    integratedPage,
    integratedPageSize,
    integratedQueue,
    jobs,
    lastFocusHash,
    limit,
    loadIntegratedQueue,
    loadJobs,
    loadOverview,
    loadPartesCandidates,
    loadProcessCandidates,
    loadRemoteHistory,
    operationalStatus,
    overview,
    pageVisible,
    partesCandidates,
    partesPage,
    processCandidates,
    processPage,
    queueRefreshLog,
    refreshAfterAction,
    refreshOperationalContext,
    remoteHistory,
    selectedPartesKeys,
    selectedProcessKeys,
    setActionState,
    setActiveJobId,
    setBackendHealth,
    setCopilotContext,
    setDetailState,
    setDrainInFlight,
    setExecutionHistory,
    setLastFocusHash,
    setOperationalStatus,
    setPageVisible,
    setProcessNumbers,
    setSelectedDetailLinkedPartes,
    setSelectedDetailPendingPartes,
    setValidationMap,
    setView,
    validationMap,
    view,
  });




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

