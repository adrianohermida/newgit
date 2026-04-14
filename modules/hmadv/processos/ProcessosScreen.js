import { useEffect, useMemo } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import { setModuleHistory } from "../../../lib/admin/activity-log";
import {
  ACTION_LABELS,
  ASYNC_PROCESS_ACTIONS,
  COVERAGE_VIEWS,
  DEFAULT_QUEUE_BATCHES,
  EMPTY_FORM,
  GLOBAL_ERROR_TTL_MS,
  MODULE_LIMITS,
  OPERATIONAL_VIEWS,
  PROCESS_VIEW_ITEMS,
  QUEUE_ERROR_TTL_MS,
  QUEUE_LABELS,
  QUEUE_REFRESHERS,
  RELATION_VIEWS,
} from "./constants";
import {
  buildDrainPreview,
  buildHistoryPreview,
  buildJobPreview,
  getProcessActionLabel,
  getProcessIntentBadge,
  getSafeProcessActionLimit,
} from "./action-utils";
import {
  loadHistoryEntries,
  loadOperationalSnapshot,
  parseCopilotContext,
  persistHistoryEntries,
  persistOperationalSnapshot,
} from "./storage";
import { useProcessosAdminFetch } from "./useProcessosAdminFetch";
import { Field, MetricCard, SelectField } from "./ui-primitives";
import ProcessosFilasView from "./ProcessosFilasView";
import ProcessosOperacaoView from "./ProcessosOperacaoView";
import ProcessosRelacoesView from "./ProcessosRelacoesView";
import ProcessosResultadoView from "./ProcessosResultadoView";
import { deriveRemoteHealth, RecurringProcessGroup } from "./recurrence";
import { useProcessosRecurringSelection } from "./useProcessosRecurringSelection";
import { useProcessosRelationActions } from "./useProcessosRelationActions";
import { useProcessosPageState } from "./useProcessosPageState";
import { useProcessosUiPersistence } from "./useProcessosUiPersistence";
import { useProcessosFetchers } from "./useProcessosFetchers";
import { useProcessosQueueActionConfigs } from "./useProcessosQueueActionConfigs";
import { useProcessosOperationalHealth } from "./useProcessosOperationalHealth";
import { useProcessosJobDrain } from "./useProcessosJobDrain";
import { useProcessosBootstrap } from "./useProcessosBootstrap";

import {
  countQueueErrors,
  countQueueReadMismatches,
  coverageMismatchMessage,
  getProcessSelectionValue,
  getRelationSelectionValue,
  getSuggestionSelectionValue,
  hasJsonTruncationMessage,
  parseProcessNumbers,
  queueHasReadMismatch,
  renderQueueRowStatuses,
  uniqueProcessNumbers,
} from "./processos-screen-utils";
import { CoverageList, QueueActionBlock, QueueList } from "./processos-queue-components";
import { RegisteredRelationCard, RelationSelectionBar, RelationSuggestionCard } from "./processos-relation-components";
import { HistoryCard, JobCard, OperationResult } from "./processos-result-components";
import { buildSelectionSuggestedAction, deriveSelectionActionHint } from "./processos-selection-utils";
import ProcessosHeaderPanel from "./ProcessosHeaderPanel.js";

export default function InternoProcessosPage() {
return <RequireAdmin>{(profile) => <InternoLayout profile={profile} title="Gestão de Processos" description="Gestão da carteira processual com acompanhamento, relacionamento e atualização contínua."><InternoProcessosContent /></InternoLayout>}</RequireAdmin>;
}

function InternoProcessosContent() {
  const { isLightTheme } = useInternalTheme();
  const { actionState, activeJobId, allMatchingRelationsSelected, allMatchingSuggestionsSelected, audPage, audienciaCandidates, backendHealth, bootstrappedRef, copilotContext, copilotQueryAppliedRef, covPage, drainInFlight, editingRelationId, executionHistory, fgPage, fieldGaps, form, globalError, globalErrorUntil, jobs, lastFocusHash, limit, lookup, lookupTerm, maPage, miPage, monitoringActive, monitoringInactive, movPage, movementBacklog, operationalStatus, orphanPage, orphans, overview, pageVisible, partesBacklog, partesPage, processCoverage, processNumbers, pubPage, publicationBacklog, queueBatchSizes, queueRefreshLog, relationMinScore, relationSelectionLoading, relationSuggestions, relations, remoteHistory, runnerMetrics, schemaStatus, search, selectedAudienciaCandidates, selectedFieldGaps, selectedMonitoringActive, selectedMonitoringInactive, selectedMovementBacklog, selectedOrphans, selectedPartesBacklog, selectedPublicationBacklog, selectedRelations, selectedSuggestionKeys, selectedWithoutMovements, setActionState, setActiveJobId, setAllMatchingRelationsSelected, setAllMatchingSuggestionsSelected, setAudPage, setAudienciaCandidates, setBackendHealth, setCopilotContext, setCovPage, setDrainInFlight, setEditingRelationId, setExecutionHistory, setFgPage, setFieldGaps, setForm, setGlobalError, setGlobalErrorUntil, setJobs, setLastFocusHash, setLimit, setLookup, setLookupTerm, setMaPage, setMiPage, setMonitoringActive, setMonitoringInactive, setMovPage, setMovementBacklog, setOperationalStatus, setOrphanPage, setOrphans, setOverview, setPageVisible, setPartesBacklog, setPartesPage, setProcessCoverage, setProcessNumbers, setPubPage, setPublicationBacklog, setQueueBatchSizes, setQueueRefreshLog, setRelationMinScore, setRelationSelectionLoading, setRelationSuggestions, setRelations, setRemoteHistory, setRunnerMetrics, setSchemaStatus, setSearch, setSelectedAudienciaCandidates, setSelectedFieldGaps, setSelectedMonitoringActive, setSelectedMonitoringInactive, setSelectedMovementBacklog, setSelectedOrphans, setSelectedPartesBacklog, setSelectedPublicationBacklog, setSelectedRelations, setSelectedSuggestionKeys, setSelectedWithoutMovements, setSuggestionSelectionLoading, setUiHydrated, setView, setWmPage, snapshotAt, snapshotPayloadRef, suggestionSelectionLoading, uiHydrated, view, wmPage, withoutMovements, setWithoutMovements, setSnapshotAt } = useProcessosPageState();
  const adminFetch = useProcessosAdminFetch();
  useProcessosUiPersistence({ audPage, covPage, fgPage, lastFocusHash, limit, maPage, miPage, movPage, orphanPage, partesPage, processNumbers, pubPage, queueBatchSizes, relationMinScore, search, selectedAudienciaCandidates, selectedFieldGaps, selectedMonitoringActive, selectedMonitoringInactive, selectedMovementBacklog, selectedOrphans, selectedPartesBacklog, selectedPublicationBacklog, selectedRelations, selectedSuggestionKeys, selectedWithoutMovements, setAudPage, setCovPage, setFgPage, setLastFocusHash, setLimit, setMaPage, setMiPage, setMovPage, setOrphanPage, setPartesPage, setProcessNumbers, setPubPage, setQueueBatchSizes, setRelationMinScore, setSearch, setSelectedAudienciaCandidates, setSelectedFieldGaps, setSelectedMonitoringActive, setSelectedMonitoringInactive, setSelectedMovementBacklog, setSelectedOrphans, setSelectedPartesBacklog, setSelectedPublicationBacklog, setSelectedRelations, setSelectedSuggestionKeys, setSelectedWithoutMovements, setUiHydrated, setView, setWmPage, view, wmPage });
  const { buildRefreshPlan, loadCoverage, loadJobs, loadOrphans, loadOverview, loadQueue, loadRelationSuggestions, loadRelations, loadRemoteHistory, loadRunnerMetrics, loadSchemaStatus, mergeJobIntoState, refreshAfterAction, refreshOperationalContext, refreshOperationalQueues } = useProcessosFetchers({ adminFetch, audPage, covPage, fgPage, globalErrorUntil, maPage, miPage, movPage, orphanPage, partesPage, processCoverage, pubPage, relationMinScore, schemaStatus, setAudienciaCandidates, setFieldGaps, setGlobalError, setGlobalErrorUntil, setJobs, setMonitoringActive, setMonitoringInactive, setMovementBacklog, setOrphans, setOverview, setPartesBacklog, setProcessCoverage, setPublicationBacklog, setQueueRefreshLog, setRelationSuggestions, setRelations, setRemoteHistory, setRunnerMetrics, setSchemaStatus, setWithoutMovements, view, wmPage });

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
  useEffect(() => { setExecutionHistory(loadHistoryEntries()); }, []);
  useEffect(() => {
    if (typeof window === "undefined" || copilotQueryAppliedRef.current) return;
    const url = new URL(window.location.href);
    const queryProcessNumbers = String(url.searchParams.get("processNumbers") || "").trim();
    const queryContext = parseCopilotContext(url.searchParams.get("copilotContext") || "");
    if (queryProcessNumbers) setProcessNumbers(queryProcessNumbers);
    if (queryContext) setCopilotContext(queryContext);
    copilotQueryAppliedRef.current = true;
  }, []);
  useEffect(() => {
    setModuleHistory("processos", {
      executionHistory,
      remoteHistory,
      jobs,
      activeJobId,
      drainInFlight,
      operationalStatus,
      backendHealth,
      schemaStatus,
      runnerMetrics,
      queueRefreshLog,
      queueBatchSizes,
      actionState: {
        loading: Boolean(actionState?.loading),
        error: actionState?.error || null,
        result: actionState?.result || null,
      },
      ui: {
        view,
        limit,
        processNumbers,
        selectedWithoutMovements: selectedWithoutMovements.length,
        selectedMovementBacklog: selectedMovementBacklog.length,
        selectedPublicationBacklog: selectedPublicationBacklog.length,
        selectedPartesBacklog: selectedPartesBacklog.length,
        selectedAudienciaCandidates: selectedAudienciaCandidates.length,
        selectedMonitoringActive: selectedMonitoringActive.length,
        selectedMonitoringInactive: selectedMonitoringInactive.length,
        selectedFieldGaps: selectedFieldGaps.length,
        selectedOrphans: selectedOrphans.length,
      },
      queues: {
        semMovimentacoes: {
          totalRows: Number(withoutMovements?.totalRows || withoutMovements?.items?.length || 0),
          pageSize: Number(withoutMovements?.pageSize || 20),
          updatedAt: withoutMovements?.updatedAt || null,
          limited: Boolean(withoutMovements?.limited),
          error: withoutMovements?.error || null,
        },
        movimentacoesPendentes: {
          totalRows: Number(movementBacklog?.totalRows || movementBacklog?.items?.length || 0),
          pageSize: Number(movementBacklog?.pageSize || 20),
          updatedAt: movementBacklog?.updatedAt || null,
          limited: Boolean(movementBacklog?.limited),
          error: movementBacklog?.error || null,
        },
        publicacoesPendentes: {
          totalRows: Number(publicationBacklog?.totalRows || publicationBacklog?.items?.length || 0),
          pageSize: Number(publicationBacklog?.pageSize || 20),
          updatedAt: publicationBacklog?.updatedAt || null,
          limited: Boolean(publicationBacklog?.limited),
          error: publicationBacklog?.error || null,
        },
        partesSemContato: {
          totalRows: Number(partesBacklog?.totalRows || partesBacklog?.items?.length || 0),
          pageSize: Number(partesBacklog?.pageSize || 20),
          updatedAt: partesBacklog?.updatedAt || null,
          limited: Boolean(partesBacklog?.limited),
          error: partesBacklog?.error || null,
        },
        audienciasPendentes: {
          totalRows: Number(audienciaCandidates?.totalRows || audienciaCandidates?.items?.length || 0),
          pageSize: Number(audienciaCandidates?.pageSize || 20),
          updatedAt: audienciaCandidates?.updatedAt || null,
          limited: Boolean(audienciaCandidates?.limited),
          error: audienciaCandidates?.error || null,
        },
        camposOrfaos: {
          totalRows: Number(fieldGaps?.totalRows || fieldGaps?.items?.length || 0),
          pageSize: Number(fieldGaps?.pageSize || 20),
          updatedAt: fieldGaps?.updatedAt || null,
          limited: Boolean(fieldGaps?.limited),
          error: fieldGaps?.error || null,
        },
        orfaos: {
          totalRows: Number(orphans?.totalRows || orphans?.items?.length || 0),
          pageSize: Number(orphans?.pageSize || 20),
          updatedAt: orphans?.updatedAt || null,
          limited: Boolean(orphans?.limited),
          error: orphans?.error || null,
        },
      },
    });
  }, [
    activeJobId,
    actionState,
    audienciaCandidates,
    backendHealth,
    drainInFlight,
    executionHistory,
    fieldGaps,
    jobs,
    limit,
    movementBacklog,
    operationalStatus,
    orphans,
    partesBacklog,
    processNumbers,
    publicationBacklog,
    queueBatchSizes,
    queueRefreshLog,
    remoteHistory,
    runnerMetrics,
    schemaStatus,
    selectedAudienciaCandidates.length,
    selectedFieldGaps.length,
    selectedMonitoringActive.length,
    selectedMonitoringInactive.length,
    selectedMovementBacklog.length,
    selectedOrphans.length,
    selectedPartesBacklog.length,
    selectedPublicationBacklog.length,
    selectedWithoutMovements.length,
    view,
    withoutMovements,
  ]);
  useEffect(() => {
    const snapshot = loadOperationalSnapshot();
    if (!snapshot) return;
    if (snapshot.overview) setOverview(snapshot.overview);
    if (snapshot.processCoverage) setProcessCoverage(snapshot.processCoverage);
    if (snapshot.withoutMovements) setWithoutMovements(snapshot.withoutMovements);
    if (snapshot.movementBacklog) setMovementBacklog(snapshot.movementBacklog);
    if (snapshot.publicationBacklog) setPublicationBacklog(snapshot.publicationBacklog);
    if (snapshot.partesBacklog) setPartesBacklog(snapshot.partesBacklog);
    if (snapshot.audienciaCandidates) setAudienciaCandidates(snapshot.audienciaCandidates);
    if (snapshot.monitoringActive) setMonitoringActive(snapshot.monitoringActive);
    if (snapshot.monitoringInactive) setMonitoringInactive(snapshot.monitoringInactive);
    if (snapshot.fieldGaps) setFieldGaps(snapshot.fieldGaps);
    if (snapshot.orphans) setOrphans(snapshot.orphans);
    if (Array.isArray(snapshot.remoteHistory)) setRemoteHistory(snapshot.remoteHistory);
    if (Array.isArray(snapshot.jobs)) setJobs(snapshot.jobs);
    if (snapshot.schemaStatus) setSchemaStatus(snapshot.schemaStatus);
    if (snapshot.runnerMetrics) setRunnerMetrics(snapshot.runnerMetrics);
    if (snapshot.actionState && typeof snapshot.actionState === "object") {
      setActionState({
        loading: false,
        error: snapshot.actionState.error || null,
        result: snapshot.actionState.result || null,
      });
    }
    if (snapshot.cachedAt) setSnapshotAt(snapshot.cachedAt);
  }, []);
  useEffect(() => {
    const snapshotPayload = {
      overview,
      processCoverage,
      withoutMovements,
      movementBacklog,
      publicationBacklog,
      partesBacklog,
      audienciaCandidates,
      monitoringActive,
      monitoringInactive,
      fieldGaps,
      orphans,
      schemaStatus,
      runnerMetrics,
      remoteHistory,
      jobs,
      actionState: {
        error: actionState.error || null,
        result: actionState.result || null,
      },
    };
    const normalizedPayload = JSON.stringify(snapshotPayload);
    if (normalizedPayload === snapshotPayloadRef.current) return;
    snapshotPayloadRef.current = normalizedPayload;
    const cachedAt = new Date().toISOString();
    setSnapshotAt(cachedAt);
    persistOperationalSnapshot({
      cachedAt,
      ...snapshotPayload,
    });
  }, [overview, processCoverage, withoutMovements, movementBacklog, publicationBacklog, partesBacklog, audienciaCandidates, monitoringActive, monitoringInactive, fieldGaps, orphans, remoteHistory, jobs, actionState.error, actionState.result]);
  useEffect(() => {
    if (!uiHydrated) return undefined;
    let cancelled = false;
    bootstrappedRef.current = false;
    const shouldLoadQueues = OPERATIONAL_VIEWS.has(view);
    const shouldLoadCoverage = COVERAGE_VIEWS.has(view);
    const shouldLoadRelations = RELATION_VIEWS.has(view);
    async function bootstrap() {
      const baseCalls = [
        loadOverview(),
        loadSchemaStatus(),
        loadRunnerMetrics(),
        loadRemoteHistory(),
        loadJobs(),
      ];
      const queueCalls = shouldLoadQueues
        ? [
          loadQueue("sem_movimentacoes", setWithoutMovements, wmPage),
          loadQueue("movimentacoes_pendentes", setMovementBacklog, movPage),
          loadQueue("publicacoes_pendentes", setPublicationBacklog, pubPage),
          loadQueue("partes_sem_contato", setPartesBacklog, partesPage),
          loadQueue("audiencias_pendentes", setAudienciaCandidates, audPage),
          loadQueue("monitoramento_ativo", setMonitoringActive, maPage),
          loadQueue("monitoramento_inativo", setMonitoringInactive, miPage),
          loadQueue("campos_orfaos", setFieldGaps, fgPage),
          loadOrphans(orphanPage),
        ]
        : [];
      const coverageCalls = shouldLoadCoverage ? [loadCoverage(covPage)] : [];
      const relationCalls = shouldLoadRelations ? [loadRelations(1, search), loadRelationSuggestions(1, search, relationMinScore)] : [];
      await Promise.all([...baseCalls, ...queueCalls, ...coverageCalls, ...relationCalls]);
      if (!cancelled) bootstrappedRef.current = true;
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [uiHydrated, view, relationMinScore]);
  useEffect(() => {
    if (globalError) {
      setOperationalStatus({ mode: "error", message: globalError, updatedAt: new Date().toISOString() });
      return;
    }
    const queues = [withoutMovements, movementBacklog, publicationBacklog, partesBacklog, audienciaCandidates, monitoringActive, monitoringInactive, fieldGaps, orphans];
    const queueErrorCount = countQueueErrors(queues);
    const mismatchCount = countQueueReadMismatches(queues);
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
    setOperationalStatus({ mode: "ok", message: "Operacao normal", updatedAt: new Date().toISOString() });
  }, [globalError, withoutMovements, movementBacklog, publicationBacklog, partesBacklog, audienciaCandidates, monitoringActive, monitoringInactive, fieldGaps, orphans]);
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
    const truncationErrors = latestRows.filter((row) => hasJsonTruncationMessage(row?.detalhe)).length;
    if (truncationErrors > 0) {
      setBackendHealth({ status: "warning", message: `Ultimo ciclo remoto devolveu JSON truncado em ${truncationErrors} item(ns).`, updatedAt: latest.created_at });
      return;
    }
    if (Number(latest.affected_count || 0) === 0) {
      setBackendHealth({ status: "warning", message: "Ultimo ciclo nao teve progresso.", updatedAt: latest.created_at });
      return;
    }
    setBackendHealth({ status: "ok", message: "Ultima rodada concluida com estabilidade.", updatedAt: latest.created_at });
  }, [remoteHistory]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("sem_movimentacoes", setWithoutMovements, wmPage);
  }, [wmPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("movimentacoes_pendentes", setMovementBacklog, movPage);
  }, [movPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("publicacoes_pendentes", setPublicationBacklog, pubPage);
  }, [pubPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("partes_sem_contato", setPartesBacklog, partesPage);
  }, [partesPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("audiencias_pendentes", setAudienciaCandidates, audPage);
  }, [audPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("monitoramento_ativo", setMonitoringActive, maPage);
  }, [maPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("monitoramento_inativo", setMonitoringInactive, miPage);
  }, [miPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("campos_orfaos", setFieldGaps, fgPage);
  }, [fgPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadOrphans(orphanPage);
  }, [orphanPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!RELATION_VIEWS.has(view)) return;
    loadRelations(1, search);
  }, [search, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!RELATION_VIEWS.has(view)) return;
    loadRelationSuggestions(1, search, relationMinScore);
  }, [search, relationMinScore, view]);
  useEffect(() => {
    const term = lookupTerm.trim();
    if (!term) { setLookup({ loading: false, items: [] }); return undefined; }
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setLookup((current) => ({ ...current, loading: true }));
      try {
        const payload = await adminFetch(`/api/admin-hmadv-processos?action=buscar_processos&query=${encodeURIComponent(term)}&limit=8`);
        if (!cancelled) setLookup({ loading: false, items: payload.data.items || [] });
      } catch { if (!cancelled) setLookup({ loading: false, items: [] }); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [lookupTerm]);
  useEffect(() => {
    setAllMatchingRelationsSelected(false);
  }, [search, relations.page]);
  useEffect(() => {
    setAllMatchingSuggestionsSelected(false);
  }, [search, relationSuggestions.page, relationMinScore]);
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
    const idleDelayMs = pageVisible ? 1800 : 6000;
    async function runLoop() {
      while (!cancelled) {
        try {
          if (!pageVisible) {
            setDrainInFlight(false);
            await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
            continue;
          }
          setDrainInFlight(true);
          const payload = await adminFetch("/api/admin-hmadv-processos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "run_pending_jobs", id: activeJobId, maxChunks: 1 }),
          }, { timeoutMs: 120000, maxRetries: 0 });
          const result = payload.data || {};
          const job = result.job || null;
          if (cancelled) return;
          mergeJobIntoState(job);
          setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result } : { drain: result } });
          if (result.completedAll || !job?.id || job?.status === "completed" || job?.status === "error" || job?.status === "cancelled") {
            setActiveJobId(null);
            if (job?.acao) {
              await refreshAfterAction(job.acao, job.payload || {});
            } else {
              await refreshOperationalContext();
            }
            if (typeof window !== "undefined" && "Notification" in window) {
              if (Notification.permission === "default") {
                Notification.requestPermission().catch(() => {});
              } else if (Notification.permission === "granted") {
                new Notification("Atualizacao de processos concluida", {
                  body: result.completedAll
                    ? "Todas as pendencias de processos desta fila foram drenadas."
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
  }, [activeJobId, pageVisible, wmPage, movPage, pubPage, partesPage, audPage, maPage, miPage, fgPage, orphanPage]);

  function toggleSelection(setter, current, key) { setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }
  function togglePageSelection(setter, current, rows, nextState) { const keys = rows.map((item) => getProcessSelectionValue(item)).filter(Boolean); if (nextState) { setter([...new Set([...current, ...keys])]); return; } setter(current.filter((item) => !keys.includes(item))); }
  function getSelectedNumbers(rows, selected) {
    const visible = rows.map((item) => getProcessSelectionValue(item)).filter(Boolean);
    const selectedSet = new Set(selected.map((item) => String(item || "").trim()).filter(Boolean));
    return [...new Set([...visible.filter((item) => selectedSet.has(item)), ...selectedSet])];
  }
  function getCombinedSelectedNumbers() {
    return [...new Set([
      ...selectedWithoutMovements,
      ...selectedMovementBacklog,
      ...selectedPublicationBacklog,
      ...selectedPartesBacklog,
      ...selectedAudienciaCandidates,
      ...selectedMonitoringActive,
      ...selectedMonitoringInactive,
      ...selectedFieldGaps,
      ...selectedOrphans,
    ])];
  }
  function resolveActionProcessNumbers(preferredNumbers = "") {
    const explicit = String(preferredNumbers || "").trim();
    if (explicit) return explicit;
    return String(processNumbers || "").trim();
  }
  function getQueueBatchSize(queueKey) {
    const requested = Number(queueBatchSizes?.[queueKey] || DEFAULT_QUEUE_BATCHES[queueKey] || 1);
    return Math.max(1, Math.min(requested, 30));
  }
  function updateQueueBatchSize(queueKey, rawValue) {
    const nextValue = Math.max(1, Math.min(Number(rawValue || 1), 30));
    setQueueBatchSizes((current) => ({ ...current, [queueKey]: nextValue }));
  }
  function runQueueAction(action, queueKey, payload = {}) {
    handleAction(action, { ...payload, limit: getQueueBatchSize(queueKey) });
  }
  const {
    recurringProcesses,
    recurringProcessSummary,
    recurringProcessBands,
    recurringProcessGroups,
    recurringProcessFocus,
    recurringProcessBatch,
    recurringProcessActions,
    recurringProcessChecklist,
    primaryProcessAction,
    visibleRecurringCount,
    visibleSevereRecurringCount,
    selectVisibleRecurringProcesses,
    selectVisibleSevereRecurringProcesses,
    applySevereRecurringPreset,
    clearAllQueueSelections,
  } = useProcessosRecurringSelection({
    remoteHistory,
    queueSets: [
      { items: withoutMovements.items, setter: setSelectedWithoutMovements },
      { items: movementBacklog.items, setter: setSelectedMovementBacklog },
      { items: publicationBacklog.items, setter: setSelectedPublicationBacklog },
      { items: partesBacklog.items, setter: setSelectedPartesBacklog },
      { items: audienciaCandidates.items, setter: setSelectedAudienciaCandidates },
      { items: monitoringActive.items, setter: setSelectedMonitoringActive },
      { items: monitoringInactive.items, setter: setSelectedMonitoringInactive },
      { items: fieldGaps.items, setter: setSelectedFieldGaps },
      { items: orphans.items, setter: setSelectedOrphans },
    ],
    getProcessSelectionValue,
    updateView,
    setLimit,
    clearSelectionSetters: [
      setSelectedWithoutMovements,
      setSelectedMovementBacklog,
      setSelectedPublicationBacklog,
      setSelectedPartesBacklog,
      setSelectedAudienciaCandidates,
      setSelectedMonitoringActive,
      setSelectedMonitoringInactive,
      setSelectedFieldGaps,
      setSelectedOrphans,
    ],
  });
  function toggleCustomSelection(setter, current, key) {
    setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }
  function toggleCustomPageSelection(setter, current, rows, getValue) {
    const keys = rows.map((item) => getValue(item)).filter(Boolean);
    const allSelected = keys.length > 0 && keys.every((key) => current.includes(key));
    if (allSelected) {
      setter(current.filter((item) => !keys.includes(item)));
      return;
    }
    setter([...new Set([...current, ...keys])]);
  }
  const {
    handleBulkRelationRemoval,
    handleBulkRelationStatus,
    handleBulkSaveSuggestions,
    handleDeleteRelation,
    handleSaveRelation,
    startEditing,
    toggleAllMatchingRelations,
    toggleAllMatchingSuggestions,
    useSuggestionInForm,
  } = useProcessosRelationActions({
    adminFetch,
    allMatchingRelationsSelected,
    allMatchingSuggestionsSelected,
    editingRelationId,
    form,
    loadRelations,
    loadRelationSuggestions,
    relationMinScore,
    relationSuggestions,
    relations,
    search,
    selectedRelations,
    selectedSuggestionKeys,
    setActionState,
    setAllMatchingRelationsSelected,
    setAllMatchingSuggestionsSelected,
    setEditingRelationId,
    setForm,
    setRelationSelectionLoading,
    setSelectedRelations,
    setSelectedSuggestionKeys,
    setSuggestionSelectionLoading,
  });
  function useCoverageProcess(number) {
    if (!number) return;
    const next = uniqueProcessNumbers([...getCombinedSelectedNumbers(), String(number || "").trim()]);
    setProcessNumbers(next.join("\n"));
    updateView("operacao");
  }
  function updateView(nextView, nextHash = nextView) {
    setView(nextView);
    setLastFocusHash(nextHash || nextView);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    url.hash = nextHash || nextView;
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function buildActionMeta(payload = {}) {
    const explicitNumbers = String(payload.processNumbers || "").trim();
    const fallbackNumbers = String(processNumbers || "").trim();
    const effectiveNumbers = parseProcessNumbers(explicitNumbers || fallbackNumbers);
    const intentLabel = getProcessIntentBadge(payload);
    const action = String(payload.action || "");
    const safeLimit = action ? getSafeProcessActionLimit(action, payload.limit ?? limit) : Number(limit || 10);
    return {
      limit: safeLimit,
      selectedCount: effectiveNumbers.length || getCombinedSelectedNumbers().length,
      processNumbersPreview: effectiveNumbers.slice(0, 6).join(", "),
      intentLabel,
    };
  }
  function pushHistoryEntry(entry) {
    setExecutionHistory((current) => {
      const next = [entry, ...current].slice(0, 40);
      persistHistoryEntries(next);
      return next;
    });
  }
  function replaceHistoryEntry(id, patch) {
    setExecutionHistory((current) => {
      const next = current.map((item) => item.id === id ? { ...item, ...patch } : item);
      persistHistoryEntries(next);
      return next;
    });
  }
  async function queueAsyncAction(action, payload = {}) {
    const safeLimit = getSafeProcessActionLimit(action, payload.limit ?? limit);
    const response = await adminFetch("/api/admin-hmadv-processos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_job",
        jobAction: action,
        limit: safeLimit,
        processNumbers: payload.processNumbers || processNumbers,
        ...payload,
      }),
    });
    if (response.data?.legacy_inline) {
      setActionState({ loading: false, error: null, result: response.data.result });
      setActiveJobId(null);
      await Promise.all([
        refreshOperationalContext(),
      ]);
      return response.data;
    }
      const job = response.data;
      setActionState({ loading: false, error: null, result: { job } });
      setActiveJobId(job?.id || null);
      mergeJobIntoState(job);
      await loadRemoteHistory();
      return job;
    }
  async function runPendingJobsNow() {
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run_pending_jobs", id: activeJobId, maxChunks: 1 }),
        }, { timeoutMs: 120000, maxRetries: 0 });
        const result = payload.data || {};
        mergeJobIntoState(result.job || null);
        setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result } : { drain: result } });
        setActiveJobId(result.completedAll ? null : (result.job?.id || null));
        if (result.completedAll || !result.job?.id || ["completed", "error", "cancelled"].includes(String(result.job?.status || ""))) {
          if (result.job?.acao) {
            await refreshAfterAction(result.job.acao, result.job.payload || {});
          } else {
            await refreshOperationalContext();
          }
        } else {
          await loadRemoteHistory();
        }
      } catch (error) {
        setActionState({ loading: false, error: error.message || "Falha ao drenar fila.", result: null });
      }
  }
  async function handleAction(action, payload = {}) {
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    const historyId = `${action}:${Date.now()}`;
  const safeLimit = getSafeProcessActionLimit(action, payload.limit ?? limit);
  const normalizedLimit = Math.min(
    safeLimit,
    action === "sincronizar_movimentacoes_activity"
      ? MODULE_LIMITS.maxMovementBatch
      : action === "sincronizar_publicacoes_activity"
        ? MODULE_LIMITS.maxPublicationBatch
        : action === "reconciliar_partes_contatos"
          ? MODULE_LIMITS.maxPartesBatch
          : action === "backfill_audiencias"
            ? MODULE_LIMITS.maxAudienciasBatch
            : MODULE_LIMITS.maxProcessBatch
  );
  const normalizedPayload = {
    ...payload,
    action,
    limit: normalizedLimit,
    processNumbers: payload.processNumbers || processNumbers,
  };
    pushHistoryEntry({
      id: historyId,
      action,
      label: getProcessActionLabel(action, normalizedPayload),
      status: "running",
      createdAt: new Date().toISOString(),
      preview: "Execucao iniciada",
      meta: buildActionMeta(normalizedPayload),
      payload: {
        action,
        limit: safeLimit,
        processNumbers: payload.processNumbers || processNumbers,
        intent: payload.intent || "",
      },
    });
    try {
      if (action === "executar_integracao_total_hmadv") {
        const response = await adminFetch("/api/admin-hmadv-processos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            scanLimit: 100,
            monitorLimit: 100,
            movementLimit: 120,
            advisePages: 2,
            advisePerPage: 50,
            publicacoesBatch: 20,
            maxChunks: 2,
          }),
        });
        setActionState({ loading: false, error: null, result: response.data });
        replaceHistoryEntry(historyId, {
          status: "success",
          preview: buildHistoryPreview(response.data),
          result: response.data,
        });
        await Promise.all([loadRunnerMetrics(), loadSchemaStatus(), loadRemoteHistory(), loadJobs()]);
        return;
      }
      if (ASYNC_PROCESS_ACTIONS.has(action)) {
        const job = await queueAsyncAction(action, normalizedPayload);
        replaceHistoryEntry(historyId, {
          status: "success",
          preview: job?.legacy_inline
            ? `Fallback inline: ${buildHistoryPreview(job.result)}`
            : `Job criado: ${buildJobPreview(job)}`,
          result: job?.legacy_inline ? job.result : { job },
        });
        return;
      }
      const response = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, limit: safeLimit, processNumbers: payload.processNumbers || processNumbers, ...normalizedPayload }) });
      setActionState({ loading: false, error: null, result: response.data });
      replaceHistoryEntry(historyId, {
        status: "success",
        preview: buildHistoryPreview(response.data),
        result: response.data,
      });
      if (action === "executar_integracao_completa") {
        await refreshOperationalContext({ forceAll: true });
      } else {
        await refreshAfterAction(action, normalizedPayload);
      }
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao executar acao.", result: null });
      replaceHistoryEntry(historyId, {
        status: "error",
        preview: error.message || "Falha ao executar acao.",
        error: error.message || "Falha ao executar acao.",
      });
    }
  }
  useEffect(() => {
    if (!uiHydrated) return;
    if (!COVERAGE_VIEWS.has(view)) return;
    loadCoverage(covPage);
  }, [covPage, view, uiHydrated]);
  function reuseHistoryEntry(entry) {
    if (entry?.payload?.processNumbers) setProcessNumbers(entry.payload.processNumbers);
    if (entry?.payload?.limit) {
      const safeLimit = getSafeProcessActionLimit(entry?.action || entry?.payload?.action || "", entry.payload.limit);
      setLimit(Number(safeLimit) || 10);
    }
    updateView("operacao");
  }
  function clearHistory() {
    setExecutionHistory([]);
    persistHistoryEntries([]);
  }

  const data = overview.data || {};
  const focusStats = useMemo(() => [
    { label: "Acao imediata", value: data?.recommendedNextAction?.label || "Operacao", helper: "Atalho mais util para destravar a esteira agora." },
    { label: "Backlog do worker", value: data.workerVisibleTotal || 0, helper: data.syncWorkerScopeNote || "Pendencias realmente drenaveis pelo worker." },
    { label: "Gap estrutural", value: data.structuralGapTotal || 0, helper: "Problemas de CRM, campos e cobertura fora do worker." },
    { label: "Fila critica", value: Math.max(Number(movementBacklog.totalRows || 0), Number(publicationBacklog.totalRows || 0), Number(partesBacklog.totalRows || 0), Number(fieldGaps.totalRows || 0), Number(orphans.totalRows || 0)), helper: "Maior fila operacional visivel neste momento." },
  ], [data, movementBacklog.totalRows, publicationBacklog.totalRows, partesBacklog.totalRows, fieldGaps.totalRows, orphans.totalRows]);
  const relationTypeSummary = useMemo(() => relations.items.reduce((acc, item) => { acc[item.tipo_relacao] = (acc[item.tipo_relacao] || 0) + 1; return acc; }, {}), [relations.items]);
  const latestHistory = executionHistory[0] || null;
  const latestRemoteRun = remoteHistory[0] || null;
  const latestJob = jobs[0] || null;
  const remoteHealth = deriveRemoteHealth(remoteHistory);
  const monitoringUnsupported = Boolean(monitoringActive.unsupported || monitoringInactive.unsupported);
  const combinedSelectedNumbers = getCombinedSelectedNumbers();
  const selectedSummary = combinedSelectedNumbers.length;
  const selectedVisibleSevereRecurringCount = [...withoutMovements.items, ...movementBacklog.items, ...publicationBacklog.items, ...partesBacklog.items, ...audienciaCandidates.items, ...monitoringActive.items, ...monitoringInactive.items, ...fieldGaps.items, ...orphans.items]
    .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index)
    .filter((item) => recurringProcesses.some((recurring) => recurring.key === (item.numero_cnj || item.key) && recurring.hits >= 3))
    .filter((item) => combinedSelectedNumbers.includes(item.numero_cnj))
    .length;
  const priorityBatchReady = visibleSevereRecurringCount > 0 && selectedVisibleSevereRecurringCount >= visibleSevereRecurringCount && limit === recurringProcessBatch.size;
  const selectionActionHint = deriveSelectionActionHint({
    selectedWithoutMovements,
    selectedMovementBacklog,
    selectedPublicationBacklog,
    selectedPartesBacklog,
    selectedAudienciaCandidates,
    selectedMonitoringActive,
    selectedMonitoringInactive,
    selectedFieldGaps,
    selectedOrphans,
    monitoringUnsupported,
  });
  const selectionSuggestedAction = buildSelectionSuggestedAction({
    selectedWithoutMovements,
    selectedMovementBacklog,
    selectedPublicationBacklog,
    selectedPartesBacklog,
    selectedAudienciaCandidates,
    selectedMonitoringActive,
    selectedMonitoringInactive,
    selectedFieldGaps,
    selectedOrphans,
    monitoringUnsupported,
    withoutMovements: withoutMovements.items,
    movementBacklog: movementBacklog.items,
    publicationBacklog: publicationBacklog.items,
    partesBacklog: partesBacklog.items,
    audienciaCandidates: audienciaCandidates.items,
    monitoringActive: monitoringActive.items,
    monitoringInactive: monitoringInactive.items,
    fieldGaps: fieldGaps.items,
    orphans: orphans.items,
    resolveActionProcessNumbers,
    getSelectedNumbers,
    limit,
  });
  const operationalPlan = Array.isArray(data?.operationalPlan) ? data.operationalPlan : [];
  function getOperationalPlanStepState(step, index) {
    const latestAction = String(latestHistory?.action || "");
    const stepAction = String(step?.actionKey || "");
    if (actionState.loading && latestAction && latestAction === stepAction) {
      return { label: "em andamento", tone: "warning" };
    }
    if (latestHistory?.status === "success" && latestAction && latestAction === stepAction) {
      return { label: "concluido", tone: "success" };
    }
    if (latestHistory?.status === "error" && latestAction && latestAction === stepAction) {
      return { label: "falhou", tone: "danger" };
    }
    if (index === 0) {
      return { label: "agora", tone: "default" };
    }
    return { label: "proximo", tone: "default" };
  }
  function runOperationalPlanStep(step) {
    if (!step) return;
    updateView(step.targetView || "filas", step.targetHash || "filas");
  }
  const isSuggestedAction = (action, intent = "") => {
    if (!selectionSuggestedAction) return false;
    return selectionSuggestedAction.key === action && String(selectionSuggestedAction.intent || "") === String(intent || "");
  };
  const queueActionConfigs = useProcessosQueueActionConfigs({ audienciaCandidates, fieldGaps, getQueueBatchSize, getSelectedNumbers, isSuggestedAction, monitoringActive, monitoringInactive, monitoringUnsupported, movementBacklog, orphans, partesBacklog, publicationBacklog, resolveActionProcessNumbers, runQueueAction, selectedAudienciaCandidates, selectedFieldGaps, selectedMonitoringActive, selectedMonitoringInactive, selectedMovementBacklog, selectedOrphans, selectedPartesBacklog, selectedPublicationBacklog, selectedWithoutMovements, withoutMovements });
  const coverageSchemaExists = schemaStatus?.data?.exists;
  const coverageSchemaLabel = schemaStatus.loading
    ? "verificando schema"
    : coverageSchemaExists
      ? "schema de cobertura ok"
      : "schema de cobertura ausente";
  const runnerData = runnerMetrics?.data || {};
  const runnerCoverage = runnerData.coverage || {};
  const runnerDatajud = runnerData.datajud || {};
  const runnerTagged = runnerData.tagged || {};
  const runnerAction = runnerData.datajudAction || {};
  const trackedQueues = [withoutMovements, movementBacklog, publicationBacklog, partesBacklog, audienciaCandidates, monitoringActive, monitoringInactive, fieldGaps, orphans];
  const trackedQueueErrorCount = countQueueErrors(trackedQueues);
  const trackedQueueMismatchCount = countQueueReadMismatches(trackedQueues);
  const hasPendingJobs = jobs.some((item) => ["pending", "running"].includes(String(item.status || "")));
  const backendRecommendedAction = data?.recommendedNextAction || null;
  const workerStoppedWithoutProgress = String(data?.syncWorker?.worker?.ultimo_lote?.motivo || data?.syncWorker?.ultimo_lote?.motivo || "") === "sem_prog";
  const workerStructuralSuggestion = workerStoppedWithoutProgress && Number(data?.structuralGapTotal || 0) > 0
    ? Number(data?.partesSemContato || 0) > 0
      ? { key: "structural_partes", label: "Abrir partes sem contato", onClick: () => updateView("filas", "processos-partes-sem-contato") }
      : Number(data?.camposOrfaos || 0) > 0 || Number(data?.processosSemPolos || 0) > 0 || Number(data?.processosSemStatus || 0) > 0
        ? { key: "structural_gaps", label: "Abrir campos orfaos", onClick: () => updateView("filas", "processos-campos-orfaos") }
        : Number(data?.processosSemMovimentacao || 0) > 0
          ? { key: "structural_movs", label: "Buscar movimentacoes", onClick: () => updateView("filas", "processos-sem-movimentacoes") }
          : { key: "structural_cover", label: "Auditar cobertura", onClick: () => updateView("filas", "processos-cobertura") }
    : null;
  const recommendedHealthAction = backendRecommendedAction?.hash
    ? { key: `backend_${backendRecommendedAction.key || "action"}`, label: backendRecommendedAction.label || "Abrir fila recomendada", onClick: () => updateView("filas", backendRecommendedAction.hash) }
    : workerStructuralSuggestion;
  const healthQueueTarget = publicationBacklog.error || queueHasReadMismatch(publicationBacklog)
    ? { hash: "processos-publicacoes-pendentes", label: "Sincronizar publicacoes", view: "filas" }
    : partesBacklog.error || queueHasReadMismatch(partesBacklog)
      ? { hash: "processos-partes-sem-contato", label: "Reconciliar partes", view: "filas" }
      : movementBacklog.error || queueHasReadMismatch(movementBacklog)
        ? { hash: "processos-movimentacoes-pendentes", label: "Sincronizar movimentacoes", view: "filas" }
        : orphans.error || queueHasReadMismatch(orphans)
          ? { hash: "processos-sem-sales-account", label: "Criar accounts", view: "filas" }
          : processCoverage.error || processCoverage.limited || coverageMismatchMessage(processCoverage)
            ? { hash: "processos-cobertura", label: "Auditar cobertura", view: "filas" }
            : { hash: "filas", label: "Abrir filas", view: "filas" };
  const healthSuggestedActions = [];
  if (recommendedHealthAction) {
    healthSuggestedActions.push(recommendedHealthAction);
  }
  if (trackedQueueErrorCount > 0 || trackedQueueMismatchCount > 0) {
    healthSuggestedActions.push({ key: "filas", label: healthQueueTarget.label, onClick: () => updateView(healthQueueTarget.view, healthQueueTarget.hash) });
  }
  if (backendHealth.status === "warning" || backendHealth.status === "error") {
    healthSuggestedActions.push({ key: "resultado", label: "Ver resultado", onClick: () => updateView("resultado", "resultado") });
  }
  if (hasPendingJobs) {
    healthSuggestedActions.push({ key: "drain", label: drainInFlight ? "Drenando..." : "Drenar fila", onClick: runPendingJobsNow, disabled: actionState.loading || drainInFlight });
  }
  if (!healthSuggestedActions.length || (trackedQueueErrorCount === 0 && trackedQueueMismatchCount === 0 && backendHealth.status === "ok" && !hasPendingJobs)) {
    healthSuggestedActions.push({ key: "operacao", label: "Ir para operacao", onClick: () => updateView("operacao", "operacao") });
  }

  const isResultView = view === "resultado";
  const isDockedProcessView = view === "operacao" || view === "resultado";

  return <div className={`${isDockedProcessView ? "flex min-h-full flex-1 flex-col gap-6" : isResultView ? "space-y-6" : "space-y-8"}`.trim()}>
    <ProcessosHeaderPanel
      copilotContext={copilotContext}
      processNumbers={processNumbers}
      selectedSummary={selectedSummary}
      actionState={actionState}
      latestHistory={latestHistory}
      view={view}
      updateView={updateView}
      operationalStatus={operationalStatus}
      backendHealth={backendHealth}
      healthSuggestedActions={healthSuggestedActions}
      data={data}
      trackedQueueErrorCount={trackedQueueErrorCount}
      trackedQueueMismatchCount={trackedQueueMismatchCount}
      operationalPlan={operationalPlan}
      runOperationalPlanStep={runOperationalPlanStep}
      getOperationalPlanStepState={getOperationalPlanStepState}
      handleAction={handleAction}
      loadSchemaStatus={loadSchemaStatus}
      loadRunnerMetrics={loadRunnerMetrics}
      coverageSchemaExists={coverageSchemaExists}
      coverageSchemaLabel={coverageSchemaLabel}
      runnerData={runnerData}
      runnerCoverage={runnerCoverage}
      runnerTagged={runnerTagged}
      runnerAction={runnerAction}
      latestRemoteRun={latestRemoteRun}
    />

    {!isResultView ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{focusStats.map((card) => <MetricCard key={card.label} label={card.label} value={card.value} helper={card.helper} />)}</div> : null}

    {view === "operacao" ? <ProcessosOperacaoView
      latestJob={latestJob}
      activeJobId={activeJobId}
      JobCard={JobCard}
      processNumbers={processNumbers}
      setProcessNumbers={setProcessNumbers}
      limit={limit}
      setLimit={setLimit}
      selectionSuggestedAction={selectionSuggestedAction}
      handleAction={handleAction}
      actionState={actionState}
      isSuggestedAction={isSuggestedAction}
      resolveActionProcessNumbers={resolveActionProcessNumbers}
      getSelectedNumbers={getSelectedNumbers}
      orphans={orphans}
      selectedOrphans={selectedOrphans}
      combinedSelectedNumbers={combinedSelectedNumbers}
      movementBacklog={movementBacklog}
      selectedMovementBacklog={selectedMovementBacklog}
      publicationBacklog={publicationBacklog}
      selectedPublicationBacklog={selectedPublicationBacklog}
      partesBacklog={partesBacklog}
      selectedPartesBacklog={selectedPartesBacklog}
      runPendingJobsNow={runPendingJobsNow}
      drainInFlight={drainInFlight}
      jobs={jobs}
      snapshotAt={snapshotAt}
      isLightTheme={isLightTheme}
      selectionActionHint={selectionActionHint}
      fieldGaps={fieldGaps}
      selectedFieldGaps={selectedFieldGaps}
      withoutMovements={withoutMovements}
      selectedWithoutMovements={selectedWithoutMovements}
      audienciaCandidates={audienciaCandidates}
      selectedAudienciaCandidates={selectedAudienciaCandidates}
      monitoringActive={monitoringActive}
      selectedMonitoringActive={selectedMonitoringActive}
    /> : null}


    {view === "filas" ? <ProcessosFilasView
      isLightTheme={isLightTheme}
      recurringProcesses={recurringProcesses}
      recurringProcessFocus={recurringProcessFocus}
      recurringProcessBatch={recurringProcessBatch}
      visibleRecurringCount={visibleRecurringCount}
      visibleSevereRecurringCount={visibleSevereRecurringCount}
      selectedVisibleSevereRecurringCount={selectedVisibleSevereRecurringCount}
      priorityBatchReady={priorityBatchReady}
      setLimit={setLimit}
      applySevereRecurringPreset={applySevereRecurringPreset}
      selectVisibleRecurringProcesses={selectVisibleRecurringProcesses}
      selectVisibleSevereRecurringProcesses={selectVisibleSevereRecurringProcesses}
      clearAllQueueSelections={clearAllQueueSelections}
      recurringProcessActions={recurringProcessActions}
      primaryProcessAction={primaryProcessAction}
      updateView={updateView}
      runPendingJobsNow={runPendingJobsNow}
      actionState={actionState}
      drainInFlight={drainInFlight}
      recurringProcessChecklist={recurringProcessChecklist}
      recurringProcessSummary={recurringProcessSummary}
      recurringProcessBands={recurringProcessBands}
      recurringProcessGroups={recurringProcessGroups}
      RecurringProcessGroup={RecurringProcessGroup}
      withoutMovements={withoutMovements}
      movementBacklog={movementBacklog}
      publicationBacklog={publicationBacklog}
      partesBacklog={partesBacklog}
      processCoverage={processCoverage}
      monitoringActive={monitoringActive}
      fieldGaps={fieldGaps}
      orphans={orphans}
      coverageMismatchMessage={coverageMismatchMessage}
      CoverageList={CoverageList}
      covPage={covPage}
      setCovPage={setCovPage}
      useCoverageProcess={useCoverageProcess}
      QueueList={QueueList}
      selectedWithoutMovements={selectedWithoutMovements}
      toggleSelection={toggleSelection}
      setSelectedWithoutMovements={setSelectedWithoutMovements}
      togglePageSelection={togglePageSelection}
      wmPage={wmPage}
      setWmPage={setWmPage}
      queueActionConfigs={queueActionConfigs}
      QueueActionBlock={QueueActionBlock}
      updateQueueBatchSize={updateQueueBatchSize}
      selectedMovementBacklog={selectedMovementBacklog}
      setSelectedMovementBacklog={setSelectedMovementBacklog}
      movPage={movPage}
      setMovPage={setMovPage}
      selectedPublicationBacklog={selectedPublicationBacklog}
      setSelectedPublicationBacklog={setSelectedPublicationBacklog}
      pubPage={pubPage}
      setPubPage={setPubPage}
      selectedPartesBacklog={selectedPartesBacklog}
      setSelectedPartesBacklog={setSelectedPartesBacklog}
      partesPage={partesPage}
      setPartesPage={setPartesPage}
      audienciaCandidates={audienciaCandidates}
      selectedAudienciaCandidates={selectedAudienciaCandidates}
      setSelectedAudienciaCandidates={setSelectedAudienciaCandidates}
      audPage={audPage}
      setAudPage={setAudPage}
      monitoringUnsupported={monitoringUnsupported}
      selectedMonitoringActive={selectedMonitoringActive}
      setSelectedMonitoringActive={setSelectedMonitoringActive}
      maPage={maPage}
      setMaPage={setMaPage}
      renderQueueRowStatuses={renderQueueRowStatuses}
      selectedMonitoringInactive={selectedMonitoringInactive}
      setSelectedMonitoringInactive={setSelectedMonitoringInactive}
      monitoringInactive={monitoringInactive}
      miPage={miPage}
      setMiPage={setMiPage}
      selectedFieldGaps={selectedFieldGaps}
      setSelectedFieldGaps={setSelectedFieldGaps}
      fgPage={fgPage}
      setFgPage={setFgPage}
      selectedOrphans={selectedOrphans}
      setSelectedOrphans={setSelectedOrphans}
      orphanPage={orphanPage}
      setOrphanPage={setOrphanPage}
    /> : null}

    
    

    {view === "relacoes" ? <ProcessosRelacoesView
      editingRelationId={editingRelationId}
      form={form}
      setForm={setForm}
      actionState={actionState}
      handleSaveRelation={handleSaveRelation}
      EMPTY_FORM={EMPTY_FORM}
      setEditingRelationId={setEditingRelationId}
      search={search}
      setSearch={setSearch}
      relationMinScore={relationMinScore}
      setRelationMinScore={setRelationMinScore}
      lookup={lookup}
      lookupTerm={lookupTerm}
      setLookupTerm={setLookupTerm}
      relations={relations}
      relationSelectionLoading={relationSelectionLoading}
      allMatchingRelationsSelected={allMatchingRelationsSelected}
      selectedRelations={selectedRelations}
      relationTypeSummary={relationTypeSummary}
      toggleCustomPageSelection={toggleCustomPageSelection}
      setSelectedRelations={setSelectedRelations}
      loadRelations={loadRelations}
      handleBulkRelationStatus={handleBulkRelationStatus}
      handleBulkRelationRemoval={handleBulkRelationRemoval}
      getRelationSelectionValue={getRelationSelectionValue}
      toggleCustomSelection={toggleCustomSelection}
      startEditing={startEditing}
      handleDeleteRelation={handleDeleteRelation}
      relationSuggestions={relationSuggestions}
      suggestionSelectionLoading={suggestionSelectionLoading}
      allMatchingSuggestionsSelected={allMatchingSuggestionsSelected}
      selectedSuggestionKeys={selectedSuggestionKeys}
      toggleAllMatchingSuggestions={toggleAllMatchingSuggestions}
      setSelectedSuggestionKeys={setSelectedSuggestionKeys}
      getSuggestionSelectionValue={getSuggestionSelectionValue}
      loadRelationSuggestions={loadRelationSuggestions}
      handleBulkSaveSuggestions={handleBulkSaveSuggestions}
      useSuggestionInForm={useSuggestionInForm}
      toggleAllMatchingRelations={toggleAllMatchingRelations}
      RelationSelectionBar={RelationSelectionBar}
      RelationSuggestionCard={RelationSuggestionCard}
      RegisteredRelationCard={RegisteredRelationCard}
    /> : null}
    {view === "resultado" ? <ProcessosResultadoView
      actionState={actionState}
      jobs={jobs}
      activeJobId={activeJobId}
      JobCard={JobCard}
      OperationResult={OperationResult}
      executionHistory={executionHistory}
      remoteHistory={remoteHistory}
      buildDrainPreview={buildDrainPreview}
    /> : null}
  </div>;
}
