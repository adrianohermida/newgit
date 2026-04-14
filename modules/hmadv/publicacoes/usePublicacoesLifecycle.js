import { useEffect } from "react";

import { setModuleHistory } from "../../../lib/admin/activity-log";

import {
  loadHistoryEntries,
  loadValidationState,
  parseCopilotContext,
  persistValidationState,
} from "./storage";

export function usePublicacoesLifecycle(params) {
  const {
    actionState,
    backendHealth,
    copilotQueryAppliedRef,
    executionHistory,
    jobs,
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
  } = params;

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const handleVisibilityChange = () => setPageVisible(document.visibilityState !== "hidden");
    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [setPageVisible]);

  useEffect(() => {
    if (typeof window === "undefined" || copilotQueryAppliedRef.current) return;
    const url = new URL(window.location.href);
    const queryProcessNumbers = String(url.searchParams.get("processNumbers") || "").trim();
    const queryContext = parseCopilotContext(url.searchParams.get("copilotContext") || "");
    if (queryProcessNumbers) setProcessNumbers(queryProcessNumbers);
    if (queryContext) setCopilotContext(queryContext);
    copilotQueryAppliedRef.current = true;
  }, [copilotQueryAppliedRef, setCopilotContext, setProcessNumbers]);

  useEffect(() => setExecutionHistory(loadHistoryEntries()), [setExecutionHistory]);
  useEffect(() => setValidationMap(loadValidationState()), [setValidationMap]);
  useEffect(() => persistValidationState(validationMap), [validationMap]);

  useEffect(() => {
    setModuleHistory("publicacoes", {
      executionHistory,
      remoteHistory,
      jobs,
      overview: overview?.data || null,
      queues: {
        candidatosProcessos: {
          totalRows: Number(processCandidates?.totalRows || 0),
          pageSize: Number(processCandidates?.pageSize || 20),
          updatedAt: processCandidates?.updatedAt || null,
          limited: Boolean(processCandidates?.limited),
          error: processCandidates?.error || null,
        },
        candidatosPartes: {
          totalRows: Number(partesCandidates?.totalRows || 0),
          pageSize: Number(partesCandidates?.pageSize || 20),
          updatedAt: partesCandidates?.updatedAt || null,
          limited: Boolean(partesCandidates?.limited),
          error: partesCandidates?.error || null,
        },
      },
      queueRefreshLog,
      operationalStatus,
      backendHealth,
      actionState: {
        loading: Boolean(actionState?.loading),
        error: actionState?.error || null,
        result: actionState?.result || null,
      },
      ui: {
        view,
        limit,
        processPage,
        pageVisible,
        selectedProcessCount: selectedProcessKeys.length,
        selectedPartesCount: selectedPartesKeys.length,
      },
    });
  }, [actionState, backendHealth, executionHistory, jobs, limit, operationalStatus, overview, pageVisible, partesCandidates, processCandidates, processPage, queueRefreshLog, remoteHistory, selectedPartesKeys, selectedProcessKeys, view]);

  useEffect(() => { loadRemoteHistory(); }, [loadRemoteHistory]);
  useEffect(() => { loadJobs(); }, [loadJobs]);
  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { setLastFocusHash(""); }, [setLastFocusHash]);
}
