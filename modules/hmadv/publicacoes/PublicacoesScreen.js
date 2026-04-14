import React from "react";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { ACTION_LABELS } from "./constants";
import { buildJobPreview } from "./action-utils";
import { usePublicacoesAdminFetch } from "./usePublicacoesAdminFetch";
import { usePublicacoesCoreState } from "./usePublicacoesCoreState";
import { usePublicacoesQueueState } from "./usePublicacoesQueueState";
import { usePublicacoesDetailState } from "./usePublicacoesDetailState";
import { formatDateTimeLabel, formatFallbackReason, formatSnapshotLabel, formatValidationMeta, getPublicacaoSelectionValue, isResourceLimitError as detectResourceLimitError, validationLabel, validationTone } from "./publicacoesFormatting";
import { usePublicacoesActivityLog } from "./usePublicacoesActivityLog";
import { PublicacoesScreenBody } from "./PublicacoesScreenBody";
import { usePublicacoesScreenRuntime } from "./usePublicacoesScreenRuntime";

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
  const screenBodyProps = usePublicacoesScreenRuntime({
    ACTION_LABELS,
    actionState,
    activeJobId,
    backendHealth,
    buildJobPreview,
    bulkValidationNote,
    bulkValidationStatus,
    copilotContext,
    copilotQueryAppliedRef,
    detailEditForm,
    detailLinkType,
    detailState,
    drainInFlight,
    executionHistory,
    formatDateTimeLabel,
    formatFallbackReason,
    formatSnapshotLabel,
    formatValidationMeta,
    getPublicacaoSelectionValue,
    globalError,
    globalErrorUntil,
    heavyQueuesEnabled,
    integratedCursorTrail,
    integratedFilters,
    integratedPage,
    integratedPageSize,
    integratedQueue,
    integratedQueueRequestRef,
    isLightTheme,
    isResourceLimitError: detectResourceLimitError,
    jobs,
    lastFocusHash,
    limit,
    logUiEvent,
    operationalStatus,
    overview,
    pageVisible,
    partesCandidates,
    partesCandidatesRequestRef,
    partesPage,
    processCandidates,
    processCandidatesRequestRef,
    processNumbers,
    processPage,
    queueRefreshLog,
    remoteHistory,
    selectedDetailLinkedPartes,
    selectedDetailPendingPartes,
    selectedIntegratedNumbers,
    selectedPartesKeys,
    selectedProcessKeys,
    setActionState,
    setActiveJobId,
    setBackendHealth,
    setBulkValidationNote,
    setBulkValidationStatus,
    setCopilotContext,
    setDetailEditForm,
    setDetailLinkType,
    setDetailState,
    setDrainInFlight,
    setExecutionHistory,
    setGlobalError,
    setGlobalErrorUntil,
    setHeavyQueuesEnabled,
    setIntegratedCursorTrail,
    setIntegratedFilters,
    setIntegratedPage,
    setIntegratedQueue,
    setJobs,
    setLastFocusHash,
    setLimit,
    setOperationalStatus,
    setOverview,
    setPageVisible,
    setPartesCandidates,
    setPartesPage,
    setProcessCandidates,
    setProcessNumbers,
    setProcessPage,
    setQueueRefreshLog,
    setRemoteHistory,
    setSelectedDetailLinkedPartes,
    setSelectedDetailPendingPartes,
    setSelectedIntegratedNumbers,
    setSelectedPartesKeys,
    setSelectedProcessKeys,
    setValidationMap,
    setView,
    validationLabel,
    validationMap,
    validationTone,
    view,
  });

  return (
    <PublicacoesScreenBody {...screenBodyProps} />
  );
}

export default function PublicacoesScreen() {
  return <RequireAdmin><PublicacoesContent /></RequireAdmin>;
}

