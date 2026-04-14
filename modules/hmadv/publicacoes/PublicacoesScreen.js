import { useEffect, useMemo, useRef, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import OperationalHealthPanel from "../../../components/interno/hmadv/OperationalHealthPanel";
import OperationalPlanPanel from "../../../components/interno/hmadv/OperationalPlanPanel";
import { appendActivityLog, setModuleHistory } from "../../../lib/admin/activity-log";
import {
  ACTION_LABELS,
  MODULE_LIMITS,
  PUBLICACOES_QUEUE_VIEWS,
} from "./constants";
import {
  buildJobPreview,
  getPublicacoesActionLabel,
  stringifyLogPayload,
} from "./action-utils";
import {
  loadHistoryEntries,
  loadValidationState,
  parseCopilotContext,
  persistValidationState,
} from "./storage";
import { usePublicacoesAdminFetch } from "./usePublicacoesAdminFetch";
import { usePublicacoesNavigationState } from "./usePublicacoesNavigationState";
import {
  HealthBadge,
  Panel,
  QueueSummaryCard,
} from "./ui-primitives";
import { PublicacoesWorkspaceHeader } from "./workspace-header";
import {
  deriveRemoteHealth,
} from "./recurrence";
import { PublicacoesOperationView } from "./operation-view";
import { PublicacoesResultView } from "./result-view";
import { PublicacoesQueuesView } from "./queues-view";
import { usePublicacoesDerivedState } from "./usePublicacoesDerivedState";
import { usePublicacoesQueueSelection } from "./usePublicacoesQueueSelection";
import { PublicacoesAdviseStatusPanel } from "./advise-status-panel";
import { usePublicacoesValidationActions } from "./usePublicacoesValidationActions";
import { usePublicacoesIntegratedDetail } from "./usePublicacoesIntegratedDetail";
import { usePublicacoesParteActions } from "./usePublicacoesParteActions";
import { usePublicacoesExecutionHistory } from "./usePublicacoesExecutionHistory";
import { usePublicacoesActionRunner } from "./usePublicacoesActionRunner";
import { usePublicacoesUiActions } from "./usePublicacoesUiActions";
import { usePublicacoesQueuesViewModel } from "./usePublicacoesQueuesViewModel";
import { usePublicacoesOperationalPlan } from "./usePublicacoesOperationalPlan";
import { usePublicacoesDataLoader } from "./usePublicacoesDataLoader";
import { usePublicacoesMetaLoader } from "./usePublicacoesMetaLoader";

function isResourceLimitError(error) {
  const text = String(error?.payload || error?.message || error || "").toLowerCase();
  return text.includes("worker exceeded resource limits");
}

function getPublicacaoSelectionValue(row) {
  return String(row?.numero_cnj || row?.publicacao_id || row?.id || row?.key || "").trim();
}

function matchesPublicacaoSelection(row, selectedValues = []) {
  const selectionValue = getPublicacaoSelectionValue(row);
  return Boolean(selectionValue) && selectedValues.includes(selectionValue);
}

function validationTone(status) {
  if (status === "validado") return "success";
  if (status === "bloqueado") return "danger";
  if (status === "revisar") return "warning";
  return "default";
}

function validationLabel(status) {
  if (status === "validado") return "validado";
  if (status === "bloqueado") return "bloqueado";
  if (status === "revisar") return "revisar";
  return "sem validacao";
}

function formatValidationMeta(validation) {
  if (!validation?.updatedAt && !validation?.updatedBy) return "";
  const parts = [];
  if (validation.updatedBy) parts.push(String(validation.updatedBy));
  if (validation.updatedAt) {
    const date = new Date(validation.updatedAt);
    parts.push(Number.isNaN(date.getTime()) ? String(validation.updatedAt) : date.toLocaleString("pt-BR"));
  }
  return parts.join(" • ");
}

function formatDateTimeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR");
}

function formatSnapshotLabel(snapshot) {
  if (!snapshot?.updatedAt) return "snapshot ausente";
  return `snapshot ${formatDateTimeLabel(snapshot.updatedAt)}`;
}

function formatFallbackReason(reason) {
  if (reason === "edge_function_unavailable") return "Fallback local apos falha da edge function.";
  if (reason === "local_backlog_path") return "Processamento local orientado pelo backlog.";
  if (reason === "edge_function_unavailable_or_empty") return "Fallback local apos resposta vazia ou indisponivel.";
  return reason ? String(reason) : "";
}

function candidateQueueHasReadMismatch(queue) {
  return Number(queue?.totalRows || 0) > 0 && !(queue?.items || []).length;
}

function PublicacoesContent() {
  const { isLightTheme } = useInternalTheme();
  const [view, setView] = useState("operacao");
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [processCandidates, setProcessCandidates] = useState({ loading: true, error: null, items: [], totalRows: 0, pageSize: 20, updatedAt: null, limited: false, errorUntil: null });
  const [partesCandidates, setPartesCandidates] = useState({
    loading: false,
    error: "Leitura sob demanda para evitar estouro do Worker. Use o botao de carregar ou atualize o snapshot.",
    items: [],
    totalRows: 0,
    pageSize: 20,
    updatedAt: null,
    limited: true,
    errorUntil: null,
  });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [executionHistory, setExecutionHistory] = useState([]);
  const [remoteHistory, setRemoteHistory] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [drainInFlight, setDrainInFlight] = useState(false);
  const [processNumbers, setProcessNumbers] = useState("");
  const [copilotContext, setCopilotContext] = useState(null);
  const copilotQueryAppliedRef = useRef(false);
  const [queueRefreshLog, setQueueRefreshLog] = useState([]);
  const [pageVisible, setPageVisible] = useState(true);
  const [lastFocusHash, setLastFocusHash] = useState("");
  const [globalError, setGlobalError] = useState(null);
  const [globalErrorUntil, setGlobalErrorUntil] = useState(null);
  const [operationalStatus, setOperationalStatus] = useState({ mode: "ok", message: "", updatedAt: null });
  const [backendHealth, setBackendHealth] = useState({ status: "ok", message: "", updatedAt: null });
  const [limit, setLimit] = useState(10);
  const [processPage, setProcessPage] = useState(1);
  const [partesPage, setPartesPage] = useState(1);
  const [selectedProcessKeys, setSelectedProcessKeys] = useState([]);
  const [selectedPartesKeys, setSelectedPartesKeys] = useState([]);
  const [validationMap, setValidationMap] = useState({});
  const [integratedQueue, setIntegratedQueue] = useState({
    loading: false,
    error: "Leitura sob demanda para evitar estouro do Worker. Atualize o snapshot ou carregue a mesa manualmente.",
    items: [],
    totalRows: 0,
    pageSize: 12,
    updatedAt: null,
    limited: true,
    totalEstimated: false,
    hasMore: false,
    nextCursor: null,
    mode: "snapshot",
    source: "snapshot",
  });
  const [heavyQueuesEnabled, setHeavyQueuesEnabled] = useState(false);
  const [integratedFilters, setIntegratedFilters] = useState({ query: "", source: "todos", validation: "todos", sort: "pendencia" });
  const [integratedPage, setIntegratedPage] = useState(1);
  const [integratedCursorTrail, setIntegratedCursorTrail] = useState([""]);
  const [selectedIntegratedNumbers, setSelectedIntegratedNumbers] = useState([]);
  const [detailState, setDetailState] = useState({ loading: false, error: null, row: null, data: null });
  const [detailEditForm, setDetailEditForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [detailLinkType, setDetailLinkType] = useState("Cliente");
  const [selectedDetailPendingPartes, setSelectedDetailPendingPartes] = useState([]);
  const [selectedDetailLinkedPartes, setSelectedDetailLinkedPartes] = useState([]);
  const [bulkValidationStatus, setBulkValidationStatus] = useState("validado");
  const [bulkValidationNote, setBulkValidationNote] = useState("");
  const adminFetch = usePublicacoesAdminFetch();
  const processCandidatesRequestRef = useRef({ promise: null, page: null });
  const partesCandidatesRequestRef = useRef({ promise: null, page: null });
  const integratedQueueRequestRef = useRef({ promise: null, key: "" });
  const integratedPageSize = 12;
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
    isResourceLimitError,
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

  function logUiEvent(label, action, response, patch = {}) {
    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      module: "publicacoes",
      component: patch.component || "publicacoes-ui",
      label,
      action,
      method: "UI",
      path: "/interno/publicacoes",
      expectation: patch.expectation || label,
      status: patch.status || "success",
      request: patch.request || "",
      response: stringifyLogPayload(response),
      error: patch.error || "",
    });
  }
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
    recoverAdviseBackfillFailure,
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
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState !== "hidden");
    };
    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
  useEffect(() => {
    if (typeof window === "undefined" || copilotQueryAppliedRef.current) return;
    const url = new URL(window.location.href);
    const queryProcessNumbers = String(url.searchParams.get("processNumbers") || "").trim();
    const queryContext = parseCopilotContext(url.searchParams.get("copilotContext") || "");
    if (queryProcessNumbers) setProcessNumbers(queryProcessNumbers);
    if (queryContext) setCopilotContext(queryContext);
    copilotQueryAppliedRef.current = true;
  }, []);
  useEffect(() => { setExecutionHistory(loadHistoryEntries()); }, []);
  useEffect(() => { setValidationMap(loadValidationState()); }, []);
  useEffect(() => { persistValidationState(validationMap); }, [validationMap]);
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
        partesPage,
        selectedProcessCount: selectedProcessKeys.length,
        selectedPartesCount: selectedPartesKeys.length,
      },
    });
  }, [
    executionHistory,
    remoteHistory,
    jobs,
    overview,
    processCandidates,
    partesCandidates,
    queueRefreshLog,
    operationalStatus,
    backendHealth,
    actionState,
    view,
    limit,
    processPage,
    partesPage,
    selectedProcessKeys,
    selectedPartesKeys,
  ]);
  useEffect(() => { loadRemoteHistory(); }, []);
  useEffect(() => { loadJobs(); }, []);

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (!PUBLICACOES_QUEUE_VIEWS.has(view)) return;
    loadProcessCandidates(processPage);
  }, [processPage, view]);

  useEffect(() => {
    if (!PUBLICACOES_QUEUE_VIEWS.has(view)) return;
    if (activeJobId) return;
    if (!heavyQueuesEnabled) return;
    loadPartesCandidates(partesPage);
  }, [partesPage, view, activeJobId, heavyQueuesEnabled]);
  useEffect(() => {
    if (view !== "filas") return;
    if (!heavyQueuesEnabled) return;
    loadIntegratedQueue(integratedPage);
  }, [integratedPage, integratedFilters, view, heavyQueuesEnabled]);
  useEffect(() => {
    setIntegratedPage(1);
    setIntegratedCursorTrail([""]);
  }, [integratedFilters]);
  useEffect(() => {
    if (integratedPage <= 1) return;
    if (integratedQueue.mode === "snapshot" && !integratedQueue.hasMore && !(integratedCursorTrail[integratedPage] || "")) {
      const totalPages = Math.max(1, integratedPage);
      if (integratedPage > totalPages) setIntegratedPage(totalPages);
      return;
    }
    const totalPages = Math.max(1, Math.ceil((integratedQueue.totalRows || 0) / integratedPageSize));
    if (integratedQueue.mode !== "snapshot" && integratedPage > totalPages) setIntegratedPage(totalPages);
  }, [integratedQueue.totalRows, integratedQueue.mode, integratedQueue.hasMore, integratedCursorTrail, integratedPage, integratedPageSize]);
  useEffect(() => {
    if (!detailState?.row?.numero_cnj) return;
    const nextValidation = validationMap[detailState.row.numero_cnj] || { status: "", note: "", updatedAt: null };
    setDetailState((state) => state?.row?.numero_cnj === detailState.row.numero_cnj ? {
      ...state,
      row: { ...state.row, validation: nextValidation },
    } : state);
  }, [detailState?.row?.numero_cnj, validationMap]);
  useEffect(() => {
    setSelectedDetailPendingPartes([]);
    setSelectedDetailLinkedPartes([]);
  }, [detailState?.row?.numero_cnj]);
  useEffect(() => {
    if (!jobs.length) return;
    const runningJob = jobs.find((item) => item.status === "running" || item.status === "pending");
    if (runningJob?.id && !activeJobId) {
      setActiveJobId(runningJob.id);
    }
  }, [jobs, activeJobId]);
  useEffect(() => {
    if (!activeJobId) return undefined;
    let cancelled = false;
    async function runLoop() {
      while (!cancelled) {
        try {
          const idleDelayMs = pageVisible ? 1800 : 6000;
          if (!pageVisible) {
            setDrainInFlight(false);
            await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
            continue;
          }
          setDrainInFlight(true);
          const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "run_pending_jobs", id: activeJobId, maxChunks: 1 }),
          }, { timeoutMs: 120000, maxRetries: 0 });
          const result = payload.data || {};
          const job = result.job || null;
          if (cancelled) return;
          await Promise.all([loadJobs(), loadRemoteHistory()]);
          setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result } : { drain: result } });
          if (result.completedAll || !job?.id || job?.status === "completed" || job?.status === "error" || job?.status === "cancelled") {
            setActiveJobId(null);
            if (job?.acao) {
              await refreshAfterAction(job.acao);
            } else {
              await refreshOperationalContext();
            }
            if (typeof window !== "undefined" && "Notification" in window) {
              if (Notification.permission === "default") {
                Notification.requestPermission().catch(() => {});
              } else if (Notification.permission === "granted") {
                new Notification("Atualizacao de publicacoes concluida", {
                  body: result.completedAll
                    ? "Todas as pendencias de publicacoes desta fila foram drenadas."
                    : `${ACTION_LABELS[job?.acao] || job?.acao}: ${buildJobPreview(job)}`,
                });
              }
            }
            setDrainInFlight(false);
            return;
          }
          setDrainInFlight(false);
          await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
        } catch (error) {
          if (!cancelled) {
            setActionState({ loading: false, error: error.message || "Falha ao processar job.", result: null });
            setActiveJobId(null);
            await Promise.all([loadJobs(), loadRemoteHistory()]);
          }
          setDrainInFlight(false);
          return;
        }
      }
    }
    runLoop();
    return () => {
      cancelled = true;
    };
  }, [activeJobId, processPage, partesPage, pageVisible]);

  useEffect(() => {
    if (globalError) {
      setOperationalStatus({ mode: "error", message: globalError, updatedAt: new Date().toISOString() });
      return;
    }
    const overviewData = overview?.data || {};
    const advisePersistedDelta = Number(overviewData.advisePersistedDelta || 0);
    const publicacoesSemProcesso = Number(overviewData.publicacoesSemProcesso || 0);
    const publicacoesPendentesComAccount = Number(overviewData.publicacoesPendentesComAccount || 0);
    const queues = [processCandidates, partesCandidates];
    const queueErrorCount = queues.filter((queue) => queue?.error).length;
    const mismatchCount = queues.filter((queue) => candidateQueueHasReadMismatch(queue)).length;
    const limitedCount = queues.filter((queue) => queue?.limited).length;
    if (queueErrorCount > 0) {
      setOperationalStatus({
        mode: "error",
        message: `${queueErrorCount} fila(s) com erro de leitura no painel.`,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (mismatchCount > 0) {
      setOperationalStatus({
        mode: "limited",
        message: `${mismatchCount} fila(s) com contagem maior que a pagina retornada.`,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (limitedCount > 0) {
      setOperationalStatus({
        mode: "limited",
        message: `${limitedCount} fila(s) em modo reduzido para evitar sobrecarga.`,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (advisePersistedDelta > 0) {
      setOperationalStatus({
        mode: "limited",
        message: `Ainda existe delta estrutural de ${advisePersistedDelta} publicacao(oes) entre o cursor do Advise e o banco.`,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (publicacoesSemProcesso > 0) {
      setOperationalStatus({
        mode: "limited",
        message: `${publicacoesSemProcesso} publicacao(oes) seguem sem processo vinculado e exigem drenagem de criacao.`,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (publicacoesPendentesComAccount > 0) {
      setOperationalStatus({
        mode: "limited",
        message: `${publicacoesPendentesComAccount} publicacao(oes) vinculadas ainda aguardam atualizacao no CRM.`,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    setOperationalStatus({ mode: "ok", message: "Fluxo operando normalmente", updatedAt: new Date().toISOString() });
  }, [globalError, overview.data, processCandidates, partesCandidates]);

  useEffect(() => {
    const latest = remoteHistory[0];
    if (!latest) {
      setBackendHealth({ status: "unknown", message: "Sem historico recente.", updatedAt: null });
      return;
    }
    if (latest.status === "error") {
      setBackendHealth({ status: "error", message: "A ultima rodada apresentou falha.", updatedAt: latest.created_at });
      return;
    }
    const latestRows = Array.isArray(latest?.result_sample) ? latest.result_sample : [];
    const fallbackRows = latestRows.filter((row) => row?.status === "fallback_local").length;
    if (fallbackRows > 0) {
      setBackendHealth({ status: "warning", message: `Ultimo ciclo operou em fallback local para ${fallbackRows} item(ns).`, updatedAt: latest.created_at });
      return;
    }
    if (Number(latest.affected_count || 0) === 0) {
      setBackendHealth({ status: "warning", message: "Ultimo ciclo nao teve progresso.", updatedAt: latest.created_at });
      return;
    }
    setBackendHealth({ status: "ok", message: "Ultima rodada concluida com estabilidade.", updatedAt: latest.created_at });
  }, [remoteHistory]);

  async function recoverAdviseBackfillFailure(error, safeLimit) {
    try {
      const [overviewPayload, historyPayload] = await Promise.all([
        adminFetch("/api/admin-hmadv-publicacoes?action=overview", {}, {
          action: "overview",
          component: "publicacoes-actions",
          label: "Recarregar overview apos falha do backfill",
          expectation: "Ler o estado atual do modulo apos falha do backfill Advise",
        }),
        adminFetch("/api/admin-hmadv-publicacoes?action=historico&limit=20", {}, {
          action: "historico",
          component: "publicacoes-actions",
          label: "Recarregar historico apos falha do backfill",
          expectation: "Ler o historico HMADV apos falha do backfill Advise",
        }),
      ]);

      const nextOverview = overviewPayload?.data || null;
      const nextHistory = Array.isArray(historyPayload?.data?.items) ? historyPayload.data.items : [];
      const latestBackfillAttempt = nextHistory.find((item) => item?.acao === "run_advise_backfill") || null;
      const latestBackfillSuccess = nextHistory.find((item) => item?.acao === "run_advise_backfill" && item?.status === "success") || null;
      const latestBackfillError = nextHistory.find((item) => item?.acao === "run_advise_backfill" && item?.status === "error") || null;
      const latestWorker = nextOverview?.syncWorker?.worker || null;

      setOverview({ loading: false, error: null, data: nextOverview });
      setRemoteHistory(nextHistory);
      setGlobalError(null);
      setGlobalErrorUntil(null);

      return {
        ok: false,
        fallbackRecovered: true,
        source: "client_backfill_recovery",
        erro: error?.message || "Falha ao executar backfill do Advise.",
        plannedPages: safeLimit,
        latestBackfillAttempt,
        latestBackfillSuccess,
        latestBackfillError,
        overviewSummary: nextOverview ? {
          publicacoesTotal: Number(nextOverview.publicacoesTotal || 0),
          publicacoesSemProcesso: Number(nextOverview.publicacoesSemProcesso || 0),
          publicacoesVinculadas: Number(nextOverview.publicacoesVinculadas || 0),
          publicacoesComActivity: Number(nextOverview.publicacoesComActivity || 0),
          partesTotal: Number(nextOverview.partesTotal || 0),
        } : null,
        worker: latestWorker ? {
          em_execucao: Boolean(latestWorker.em_execucao),
          ultima_execucao: latestWorker.ultima_execucao || null,
          ultimo_lote: latestWorker.ultimo_lote || null,
        } : null,
        uiHint: latestBackfillAttempt
          ? `O backfill do Advise retornou falha remota, mas a tela foi reidratada com o estado atual. Ultima tentativa HMADV: ${latestBackfillAttempt.status} em ${formatDateTimeLabel(latestBackfillAttempt.created_at || latestBackfillAttempt.finished_at)}. Ultimo sucesso conhecido: ${latestBackfillSuccess ? formatDateTimeLabel(latestBackfillSuccess.created_at || latestBackfillSuccess.finished_at) : "nao encontrado"}.`
          : `O backfill do Advise retornou falha remota, mas o overview foi recarregado. O lote solicitado foi ${safeLimit} pagina(s).`,
      };
    } catch {
      return null;
    }
  }

  async function refreshOperationalContext(options = {}) {
    const { forceAll = false, forceQueues = false } = options;
    const shouldLoadQueues = forceAll || PUBLICACOES_QUEUE_VIEWS.has(view);
    const calls = [loadOverview(), loadRemoteHistory(), loadJobs()];
    if (shouldLoadQueues) {
      calls.push(loadProcessCandidates(processPage, { force: forceAll || forceQueues }));
      if (heavyQueuesEnabled && (!activeJobId || forceAll || forceQueues)) {
        calls.push(loadPartesCandidates(partesPage, { force: forceAll || forceQueues }));
      }
      if (heavyQueuesEnabled) {
        calls.push(loadIntegratedQueue(integratedPage, { force: forceAll || forceQueues }));
      }
    }
    await Promise.all(calls);
  }

  async function refreshAfterAction(action) {
    const calls = [loadOverview(), loadRemoteHistory(), loadJobs()];
    if (PUBLICACOES_QUEUE_VIEWS.has(view) && heavyQueuesEnabled) {
      calls.push(loadIntegratedQueue(integratedPage, { force: true }));
      if (action === "criar_processos_publicacoes") {
        calls.push(loadProcessCandidates(processPage, { force: true }));
      }
      if ((action === "backfill_partes" || action === "sincronizar_partes") && !activeJobId) {
        calls.push(loadPartesCandidates(partesPage, { force: false }));
      }
    }
    await Promise.all(calls);
  }

  async function toggleIntegratedFiltered(nextState) {
    if (!nextState) {
      const numbers = filteredIntegratedRows.map((row) => row.numero_cnj).filter(Boolean);
      setSelectedIntegratedNumbers((current) => current.filter((item) => !numbers.includes(item)));
      return;
    }
    if (!integratedQueue.hasMore && filteredIntegratedRows.length >= (integratedQueue.totalRows || 0)) {
      const numbers = filteredIntegratedRows.map((row) => row.numero_cnj).filter(Boolean);
      setSelectedIntegratedNumbers((current) => [...new Set([...current, ...numbers])]);
      return;
    }
    try {
      const selectionLimit = Math.min(
        5000,
        Math.max(
          Number(integratedQueue.totalRows || 0) || 0,
          filteredIntegratedRows.length || 0,
          integratedPageSize
        )
      );
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=mesa_integrada_selecao&query=${encodeURIComponent(integratedFilters.query || "")}&source=${encodeURIComponent(integratedFilters.source || "todos")}&limit=${selectionLimit}&preferSnapshot=1`, {}, {
        action: "mesa_integrada_selecao",
        component: "publicacoes-mesa-integrada",
        label: "Selecionar todos os itens filtrados",
        expectation: "Trazer todos os CNJs filtrados da mesa integrada",
      });
      const numbers = payload.data?.items || [];
      setSelectedIntegratedNumbers((current) => [...new Set([...current, ...numbers])]);
      if (payload.data?.limited) {
        setActionState({
          loading: false,
          error: `A selecao filtrada atingiu o teto operacional de ${selectionLimit} itens. Refine os filtros para continuar a drenagem com seguranca.`,
          result: payload.data,
        });
      }
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao selecionar todos os itens filtrados.", result: null });
    }
  }

  async function refreshIntegratedSnapshot(queueType = "all") {
    if (hasBlockingJob) {
      setActionState({
        loading: false,
        error: `Ja existe um job em andamento (${getPublicacoesActionLabel(blockingJob?.acao)}). Aguarde a conclusao antes de reconstruir o snapshot.`,
        result: blockingJob ? { job: blockingJob } : null,
      });
      return;
    }
    setActionState({ loading: true, error: null, result: null });
    setHeavyQueuesEnabled(true);
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "refresh_snapshot_filas",
          asyncJob: true,
          queueType,
          snapshotLimit: 800,
        }),
      }, {
        action: "refresh_snapshot_filas",
        component: "publicacoes-mesa-integrada",
        label: `Atualizar snapshot da mesa integrada (${queueType})`,
        expectation: "Reconstruir a fila operacional em snapshot para navegação segura",
      });
      const job = payload.data || null;
      if (job?.id) {
        setActiveJobId(job.id);
      }
      if (queueType === "all") {
        registerQueueRefresh("candidatos_processos");
        registerQueueRefresh("candidatos_partes");
        registerQueueRefresh("mesa_integrada");
      } else {
        registerQueueRefresh(queueType);
      }
      setActionState({ loading: false, error: null, result: job ? { job } : payload.data || null });
      setIntegratedCursorTrail([""]);
      setIntegratedPage(1);
      await Promise.all([
        loadJobs(),
        loadRemoteHistory(),
        loadIntegratedQueue(1, { force: true }),
      ]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao atualizar snapshot operacional.", result: null });
    }
  }

  async function loadHeavyQueueReads(scope = "all") {
    setHeavyQueuesEnabled(true);
    if (scope === "partes") {
      await loadPartesCandidates(partesPage, { force: true });
      return;
    }
    if (scope === "mesa") {
      setIntegratedCursorTrail([""]);
      setIntegratedPage(1);
      await loadIntegratedQueue(1, { force: true });
      return;
    }
    await Promise.all([
      loadPartesCandidates(partesPage, { force: true }),
      loadIntegratedQueue(integratedPage, { force: true }),
    ]);
  }

  const selectedProcessNumbers = useMemo(
    () => processCandidates.items.filter((item) => matchesPublicacaoSelection(item, selectedProcessKeys)).map((item) => item.numero_cnj).filter(Boolean),
    [processCandidates.items, selectedProcessKeys]
  );
  const selectedPartesNumbers = useMemo(
    () => partesCandidates.items.filter((item) => matchesPublicacaoSelection(item, selectedPartesKeys)).map((item) => item.numero_cnj).filter(Boolean),
    [partesCandidates.items, selectedPartesKeys]
  );
  const data = overview.data || {};
  const publicationActivityTypes = data.publicationActivityTypes || {};
  const noPublicationActivityTypeConfigured = publicationActivityTypes?.matched === false;
  const publicationActivityTypeHint = noPublicationActivityTypeConfigured
    ? (publicationActivityTypes.error
      ? `Freshsales bloqueado: ${publicationActivityTypes.error}`
      : "Nao ha sales activity type compativel para publicacao no Freshsales.")
    : "";
  const adviseSync = data.adviseSync || null;
  const snapshotOverview = data.snapshotOverview || {};
  const snapshotMesaIntegrada = snapshotOverview.mesa_integrada || null;
  const snapshotPartes = snapshotOverview.candidatos_partes || null;
  const snapshotProcessos = snapshotOverview.candidatos_processos || null;
  const adviseConfig = adviseSync?.config || {};
  const adviseCursor = adviseSync?.status_cursor || adviseSync?.ultima_execucao || {};
  const adviseLastRunAt = adviseCursor?.ultima_execucao || null;
  const adviseTokenOk = adviseConfig?.token_ok === true;
  const adviseMode = adviseConfig?.modo || "indisponivel";
  const adviseLastCycleTotal = Number(adviseCursor?.total_registros || 0);
  const advisePersistedDelta = Number(data.advisePersistedDelta || 0);
  const adviseBackfillPage = Number(adviseCursor?.ultima_pagina || 0);
  const adviseBackfillTotalPages = Number(adviseCursor?.total_paginas || 0);
  const adviseBackfillProgress = adviseBackfillTotalPages > 0
    ? `${Math.min(adviseBackfillPage, adviseBackfillTotalPages)}/${adviseBackfillTotalPages}`
    : "cursor sem pagina total";
  const publicacoesSemProcesso = Number(data.publicacoesSemProcesso || 0);
  const publicacoesPendentesComAccount = Number(data.publicacoesPendentesComAccount || 0);
  const syncWorkerLastPublicacoes = Number(data?.syncWorker?.worker?.ultimo_lote?.publicacoes || 0);
  const latestHistory = executionHistory[0] || null;
  const latestRemoteRun = remoteHistory[0] || null;
  const latestJob = jobs[0] || null;
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
  const pendingOrRunningJobs = jobs.filter((item) => ["pending", "running"].includes(String(item.status || "")));
  const blockingJob = pendingOrRunningJobs[0] || null;
  const hasBlockingJob = pendingOrRunningJobs.length > 0;
  const hasMultipleBlockingJobs = pendingOrRunningJobs.length > 1;
  const currentDrainJobId = activeJobId || blockingJob?.id || null;
  const canManuallyDrainActiveJob = Boolean(currentDrainJobId);
  const candidateQueues = [processCandidates, partesCandidates];
  const candidateQueueErrorCount = candidateQueues.filter((queue) => queue?.error).length;
  const candidateQueueMismatchCount = candidateQueues.filter((queue) => candidateQueueHasReadMismatch(queue)).length;
  const backendRecommendedAction = data?.recommendedNextAction || null;
  const backendRecommendedHealthAction = backendRecommendedAction?.label
    ? {
        key: `backend_${backendRecommendedAction.key || "action"}`,
        label: backendRecommendedAction.label,
        onClick: () => {
          if (backendRecommendedAction.key === "run_advise_backfill") {
            handleAction("run_advise_backfill", false);
            return;
          }
          if (backendRecommendedAction.key === "refresh_snapshot_filas") {
            refreshIntegratedSnapshot("all");
            return;
          }
          updateView(backendRecommendedAction.view || "operacao", backendRecommendedAction.hash || "operacao");
        },
        disabled: backendRecommendedAction.key === "refresh_snapshot_filas"
          ? actionState.loading || hasBlockingJob
          : actionState.loading,
      }
    : null;
  const healthQueueTarget = processCandidates.error || candidateQueueHasReadMismatch(processCandidates)
    ? { hash: "publicacoes-fila-processos-criaveis", label: "Criar processos", view: "filas" }
    : partesCandidates.error || candidateQueueHasReadMismatch(partesCandidates)
      ? { hash: "publicacoes-fila-partes-extraiveis", label: "Salvar + CRM", view: "filas" }
      : integratedQueue.error
        ? { hash: "publicacoes-mesa-integrada", label: "Revisar mesa integrada", view: "operacao" }
        : { hash: "filas", label: "Abrir filas", view: "filas" };
  const healthSuggestedActions = [];
  if (backendRecommendedHealthAction) {
    healthSuggestedActions.push(backendRecommendedHealthAction);
  }
  if (advisePersistedDelta > 0 || publicacoesSemProcesso > 0) {
    healthSuggestedActions.push({ key: "operacao-drenagem", label: "Abrir drenagem principal", onClick: () => updateView("operacao", "operacao") });
    healthSuggestedActions.push({ key: "advise-backfill", label: "Importar backlog Advise", onClick: () => handleAction("run_advise_backfill", false), disabled: actionState.loading });
  }
  if (candidateQueueErrorCount > 0 || candidateQueueMismatchCount > 0) {
    healthSuggestedActions.push({ key: "filas", label: healthQueueTarget.label, onClick: () => updateView(healthQueueTarget.view, healthQueueTarget.hash) });
  }
  if (integratedQueue.mode !== "snapshot" || integratedQueue.error) {
    healthSuggestedActions.push({
      key: "snapshot",
      label: "Atualizar snapshot",
      onClick: () => refreshIntegratedSnapshot("all"),
      disabled: actionState.loading || hasBlockingJob,
    });
  }
  if (publicacoesPendentesComAccount > 0) {
    healthSuggestedActions.push({ key: "sync-crm", label: "Sincronizar publicacoes", onClick: () => updateView("operacao", "operacao") });
  }
  if (backendHealth.status === "warning" || backendHealth.status === "error") {
    healthSuggestedActions.push({ key: "resultado", label: "Ver resultado", onClick: () => updateView("resultado", "resultado") });
  }
  if (canManuallyDrainActiveJob) {
    healthSuggestedActions.push({ key: "drain", label: drainInFlight ? "Drenando..." : "Drenar fila", onClick: runPendingJobsNow, disabled: actionState.loading || drainInFlight || !canManuallyDrainActiveJob });
  }
  if (!healthSuggestedActions.length || (candidateQueueErrorCount === 0 && candidateQueueMismatchCount === 0 && backendHealth.status === "ok" && !canManuallyDrainActiveJob)) {
    healthSuggestedActions.push({ key: "operacao", label: "Ir para operacao", onClick: () => updateView("operacao", "operacao") });
  }
  const remoteHealth = deriveRemoteHealth(remoteHistory);
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
    data,
    limit,
    selectedProcessKeys,
    selectedPartesKeys,
  });
  const operationalPlan = Array.isArray(data?.operationalPlan) ? data.operationalPlan : [];

  const isResultView = view === "resultado";
  const isDockedPublicacoesView = view === "operacao" || view === "resultado";
  const queuesViewModel = usePublicacoesQueuesViewModel({
    isLightTheme,
    queueDiagnostics,
    updateView,
    recurringPublicacoes,
    recurringPublicacoesFocus,
    recurringPublicacoesBatch,
    visibleRecurringCount,
    visibleSevereRecurringCount,
    selectedVisibleSevereRecurringCount,
    priorityBatchReady,
    setLimit,
    applySevereRecurringPreset,
    selectVisibleRecurringPublicacoes,
    selectVisibleSevereRecurringPublicacoes,
    clearQueueSelections,
    recurringPublicacoesActions,
    primaryPublicacoesAction,
    runPendingJobsNow,
    actionState,
    drainInFlight,
    canManuallyDrainActiveJob,
    recurringPublicacoesChecklist,
    recurringPublicacoesSummary,
    recurringPublicacoesBands,
    recurringPublicacoesGroups,
    processCandidates,
    partesCandidates,
    data,
    integratedFilters,
    setIntegratedFilters,
    selectedUnifiedCount,
    selectedUnifiedNumbers,
    integratedQueue,
    filteredIntegratedRows,
    integratedSourceLabel,
    bulkValidationStatus,
    setBulkValidationStatus,
    bulkValidationNote,
    setBulkValidationNote,
    applyValidationToNumbers,
    runBulkContactsReconcile,
    loadHeavyQueueReads,
    handleAction,
    hasBlockingJob,
    noPublicationActivityTypeConfigured,
    publicationActivityTypeHint,
    refreshIntegratedSnapshot,
    pagedIntegratedRows,
    integratedPage,
    integratedPageSize,
    loadIntegratedDetail,
    toggleUnifiedRow,
    toggleIntegratedPage,
    toggleIntegratedFiltered,
    allIntegratedPageSelected,
    allIntegratedFilteredSelected,
    goToIntegratedPreviousPage,
    goToIntegratedNextPage,
    integratedCanGoPrevious,
    integratedCanGoNext,
    validationLabel,
    validationTone,
    formatValidationMeta,
    detailState,
    detailEditForm,
    setDetailEditForm,
    detailLinkType,
    setDetailLinkType,
    selectedDetailPendingPartes,
    selectedDetailLinkedPartes,
    toggleDetailPendingParte,
    toggleDetailLinkedParte,
    toggleDetailPendingPage,
    toggleDetailLinkedPage,
    linkPendingDetailPartes,
    moveLinkedDetailPartes,
    reclassifyLinkedDetailPartes,
    unlinkLinkedDetailPartes,
    saveDetailContact,
    formatDateTimeLabel,
    processPage,
    setProcessPage,
    selectedProcessKeys,
    toggleSelection,
    togglePageSelection,
    partesPage,
    setPartesPage,
    selectedPartesKeys,
    setSelectedPartesKeys,
    getPublicacaoSelectionValue,
    heavyQueuesEnabled,
  });

  return (
    <div className={`${isDockedPublicacoesView ? "flex min-h-full flex-1 flex-col gap-6" : isResultView ? "space-y-6" : "space-y-8"}`.trim()}>
      {copilotContext ? (
        <section className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#bdd8cf] bg-[#f3fbf8] text-[#25403a]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)] text-[#C6D1CC]"}`}>
          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#2c7a66]" : "text-[#7FC4AF]"}`}>Contexto vindo do Copilot</p>
          <p className={`mt-2 font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{copilotContext.conversationTitle || "Conversa ativa"}</p>
          {copilotContext.mission ? <p className={`mt-2 leading-6 ${isLightTheme ? "text-[#4b5563]" : "text-[#9BAEA8]"}`}>{copilotContext.mission}</p> : null}
          {processNumbers ? <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#2c7a66]" : "text-[#7F928C]"}`}>CNJs pré-carregados para operação de publicações.</p> : null}
        </section>
      ) : null}
      <PublicacoesWorkspaceHeader
        view={view}
        onChangeView={updateView}
        latestHistory={latestHistory}
        latestJob={latestJob}
        activeJobId={activeJobId}
        selectedCount={selectedProcessKeys.length + selectedPartesKeys.length}
        hasMultipleBlockingJobs={hasMultipleBlockingJobs}
        pendingJobCount={pendingOrRunningJobs.length}
        actionState={actionState}
        operationalStatus={operationalStatus}
        backendHealth={backendHealth}
        healthSuggestedActions={healthSuggestedActions}
        candidateQueueErrorCount={candidateQueueErrorCount}
        candidateQueueMismatchCount={candidateQueueMismatchCount}
        operationalPlan={!isResultView ? operationalPlan : []}
        getOperationalPlanStepState={getOperationalPlanStepState}
        runOperationalPlanStep={runOperationalPlanStep}
        queueRefreshLog={queueRefreshLog}
        latestRemoteRun={latestRemoteRun}
        remoteHealth={remoteHealth}
        metrics={[
          { label: "Publicacoes operacionais", value: data.publicacoesOperacionais || 0, helper: "Total operacional no portal, excluindo itens marcados como leilao ignorado." },
          { label: "Vinculadas", value: data.publicacoesVinculadas || 0, helper: "Publicacoes que ja possuem processo vinculado no HMADV." },
          { label: "Pendentes de sync", value: data.publicacoesPendentesComAccount || 0, helper: "Publicacoes vinculadas ainda sem activity no Freshsales." },
          { label: "Sem processo", value: data.publicacoesSemProcesso || 0, helper: "Publicacoes ainda sem processo vinculado no HMADV." },
        ]}
      />

      <PublicacoesAdviseStatusPanel
        adviseSync={adviseSync}
        adviseTokenOk={adviseTokenOk}
        adviseMode={adviseMode}
        adviseCursor={adviseCursor}
        adviseLastRunAt={adviseLastRunAt}
        adviseBackfillProgress={adviseBackfillProgress}
        advisePersistedDelta={advisePersistedDelta}
        snapshotMesaIntegrada={snapshotMesaIntegrada}
        snapshotPartes={snapshotPartes}
        snapshotProcessos={snapshotProcessos}
        publicationActivityTypes={publicationActivityTypes}
        adviseLastCycleTotal={adviseLastCycleTotal}
        syncWorkerLastPublicacoes={syncWorkerLastPublicacoes}
        data={data}
        actionState={actionState}
        handleAction={handleAction}
        formatSnapshotLabel={formatSnapshotLabel}
        isLightTheme={isLightTheme}
      />

      {view === "operacao" ? (
        <>
          <PublicacoesOperationView
            data={data}
            processCandidates={processCandidates}
            selectedProcessKeys={selectedProcessKeys}
            processNumbers={processNumbers}
            setProcessNumbers={setProcessNumbers}
            limit={limit}
            setLimit={setLimit}
            actionState={actionState}
            hasBlockingJob={hasBlockingJob}
            canManuallyDrainActiveJob={canManuallyDrainActiveJob}
            blockingJob={blockingJob}
            drainInFlight={drainInFlight}
            selectedProcessNumbers={selectedProcessNumbers}
            selectedUnifiedNumbers={selectedUnifiedNumbers}
            noPublicationActivityTypeConfigured={noPublicationActivityTypeConfigured}
            publicationActivityTypeHint={publicationActivityTypeHint}
            partesBacklogCount={partesBacklogCount}
            handleAction={handleAction}
            updateView={updateView}
            runPendingJobsNow={runPendingJobsNow}
            loadOverview={loadOverview}
            loadProcessCandidates={loadProcessCandidates}
            loadPartesCandidates={loadPartesCandidates}
            processPage={processPage}
            partesPage={partesPage}
          />
        </>
      ) : null}

      {view === "filas" ? (
        <>
          <PublicacoesQueuesView model={queuesViewModel} />
        </>
      ) : null}

      {view === "resultado" ? (
        <>
          <PublicacoesResultView
            actionState={actionState}
            jobs={jobs}
            activeJobId={activeJobId}
            executionHistory={executionHistory}
            remoteHistory={remoteHistory}
            formatFallbackReason={formatFallbackReason}
          />
        </>
      ) : null}
    </div>
  );
}

export default function PublicacoesScreen() {
  return (
    <RequireAdmin>
      <PublicacoesContent />
    </RequireAdmin>
  );
}

