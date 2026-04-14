import { useEffect, useMemo, useRef, useState } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import OperationalHealthPanel from "../../../components/interno/hmadv/OperationalHealthPanel";
import OperationalPlanPanel from "../../../components/interno/hmadv/OperationalPlanPanel";
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
import { ActionButton, Field, MetricCard, Panel, SelectField, StatusBadge, ViewToggle } from "./ui-primitives";
import ProcessosFilasView from "./ProcessosFilasView";
import ProcessosOperacaoView from "./ProcessosOperacaoView";
import ProcessosRelacoesView from "./ProcessosRelacoesView";
import ProcessosResultadoView from "./ProcessosResultadoView";
import { useProcessosNavigationState } from "./useProcessosNavigationState";
import {
  derivePrimaryProcessAction,
  deriveRecurringProcessEntries,
  deriveRecurringProcessFocus,
  deriveRemoteHealth,
  deriveSuggestedProcessActions,
  deriveSuggestedProcessBatch,
  deriveSuggestedProcessChecklist,
  groupRecurringProcessEntries,
  RecurringProcessGroup,
  summarizeRecurrenceBands,
  summarizeRecurringProcessEntries,
} from "./recurrence";

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
import { HistoryCard, JobCard, OperationResult, RemoteRunSummary } from "./processos-result-components";

function deriveSelectionActionHint({
  selectedWithoutMovements = [],
  selectedMovementBacklog = [],
  selectedPublicationBacklog = [],
  selectedPartesBacklog = [],
  selectedAudienciaCandidates = [],
  selectedMonitoringActive = [],
  selectedMonitoringInactive = [],
  selectedFieldGaps = [],
  selectedOrphans = [],
  monitoringUnsupported = false,
}) {
  if (selectedOrphans.length) {
    return {
      title: "Criar contas primeiro",
      body: "Ha processos sem conta comercial selecionados. Priorize a criacao dessas contas para liberar as proximas etapas.",
      badges: [`${selectedOrphans.length} sem conta`, "acao: criar contas"],
    };
  }
  if (selectedFieldGaps.length) {
    return {
      title: "Ajustar CRM agora",
      body: "Os itens selecionados ainda precisam de ajuste entre a base interna e o CRM. O melhor proximo passo e corrigir os dados antes de atualizar novamente.",
      badges: [`${selectedFieldGaps.length} ajustes`, "acao: corrigir crm"],
    };
  }
  if (selectedWithoutMovements.length) {
    return {
      title: "Buscar movimentacoes no DataJud",
      body: "A selecao atual esta concentrada em processos sem andamento local. Reenriquecer pelo DataJud tende a gerar o maior ganho.",
      badges: [`${selectedWithoutMovements.length} sem mov.`, "acao: datajud"],
    };
  }
  if (selectedMovementBacklog.length) {
    return {
      title: "Atualizar andamentos no CRM",
      body: "Os processos selecionados ja tem andamentos, mas ainda faltam reflexos no CRM. Vale priorizar essa atualizacao antes de novos lotes amplos.",
      badges: [`${selectedMovementBacklog.length} com andamentos pendentes`, "acao: sync movimentacoes"],
    };
  }
  if (selectedPublicationBacklog.length) {
    return {
      title: "Atualizar publicacoes no CRM",
      body: "Os processos selecionados ainda tem publicacoes sem reflexo no CRM. Vale atualizar esse historico antes de novas rodadas amplas.",
      badges: [`${selectedPublicationBacklog.length} com publicacoes pendentes`, "acao: sync publicacoes"],
    };
  }
  if (selectedPartesBacklog.length) {
    return {
      title: "Reconciliar partes com contatos",
      body: "Os processos selecionados ainda tem partes sem contato no CRM. A conciliacao reduz perda de contexto no produto e no portal.",
      badges: [`${selectedPartesBacklog.length} com partes pendentes`, "acao: reconciliar contatos"],
    };
  }
  if (selectedAudienciaCandidates.length) {
    return {
      title: "Retroagir audiencias agora",
      body: "Ha processos com audiencias detectadas nas publicacoes e ainda pendentes de persistencia. Vale priorizar essa fila antes de novas rodadas amplas.",
      badges: [`${selectedAudienciaCandidates.length} com audiencias`, "acao: retroagir audiencias"],
    };
  }
  if (selectedMonitoringInactive.length) {
    return {
      title: monitoringUnsupported ? "Estrutura de monitoramento pendente" : "Retomar monitoramento",
      body: monitoringUnsupported
        ? "A fila esta em leitura assistida: a coluna monitoramento_ativo ainda nao esta disponivel na base, entao novas gravacoes ficam temporariamente pausadas."
        : "Ha processos fora do acompanhamento automatico. Retome o monitoramento para manter a carteira atualizada.",
      badges: [`${selectedMonitoringInactive.length} itens`, monitoringUnsupported ? "somente leitura" : "acao: ativar"],
    };
  }
  if (selectedMonitoringActive.length) {
    if (monitoringUnsupported) {
      return {
        title: "Estrutura de monitoramento pendente",
        body: "A leitura de monitoramento ativo esta em modo auxiliar e serve apenas para diagnostico. Acoes em lote ficam liberadas assim que a estrutura for concluida.",
        badges: [`${selectedMonitoringActive.length} itens`, "somente leitura"],
      };
    }
    return {
      title: "Atualizar itens monitorados",
      body: "A selecao atual ja esta em acompanhamento. Vale priorizar atualizacao de andamentos e audiencias nesse recorte.",
      badges: [`${selectedMonitoringActive.length} monitorados`, "acao: sincronizar"],
    };
  }
  return {
    title: "Selecione uma fila para priorizar",
    body: "Use as filas para organizar a proxima rodada e o painel destaca automaticamente a acao mais util.",
    badges: ["sem selecao ativa"],
  };
}
function buildSelectionSuggestedAction({
  selectedWithoutMovements = [],
  selectedMovementBacklog = [],
  selectedPublicationBacklog = [],
  selectedPartesBacklog = [],
  selectedAudienciaCandidates = [],
  selectedMonitoringActive = [],
  selectedMonitoringInactive = [],
  selectedFieldGaps = [],
  selectedOrphans = [],
  monitoringUnsupported = false,
  withoutMovements = [],
  movementBacklog = [],
  publicationBacklog = [],
  partesBacklog = [],
  audienciaCandidates = [],
  monitoringActive = [],
  monitoringInactive = [],
  fieldGaps = [],
  orphans = [],
  resolveActionProcessNumbers,
  getSelectedNumbers,
  limit,
}) {
  if (selectedOrphans.length) {
    return {
      key: "push_orfaos",
      label: "Criar contas agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(orphans, selectedOrphans).join("\n")),
        limit,
      },
    };
  }
  if (selectedFieldGaps.length) {
    return {
      key: "repair_freshsales_accounts",
      label: "Corrigir CRM agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps, selectedFieldGaps).join("\n")),
        limit,
      },
    };
  }
  if (selectedWithoutMovements.length) {
    return {
      key: "enriquecer_datajud",
      intent: "buscar_movimentacoes",
      label: "Buscar atualizacoes agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(withoutMovements, selectedWithoutMovements).join("\n")),
        limit,
        intent: "buscar_movimentacoes",
        action: "enriquecer_datajud",
      },
    };
  }
  if (selectedMovementBacklog.length) {
    return {
      key: "sincronizar_movimentacoes_activity",
      label: "Atualizar andamentos agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(movementBacklog, selectedMovementBacklog).join("\n")),
        limit,
      },
    };
  }
  if (selectedPublicationBacklog.length) {
    return {
      key: "sincronizar_publicacoes_activity",
      label: "Atualizar publicacoes agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(publicationBacklog, selectedPublicationBacklog).join("\n")),
        limit,
      },
    };
  }
  if (selectedPartesBacklog.length) {
    return {
      key: "reconciliar_partes_contatos",
      label: "Reconciliar partes agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(partesBacklog, selectedPartesBacklog).join("\n")),
        limit,
      },
    };
  }
  if (selectedAudienciaCandidates.length) {
    return {
      key: "backfill_audiencias",
      label: "Retroagir audiencias agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(audienciaCandidates, selectedAudienciaCandidates).join("\n")),
        limit,
        apply: true,
      },
    };
  }
  if (selectedMonitoringInactive.length) {
    if (monitoringUnsupported) {
      return {
        key: "monitoramento_status",
        label: "Estrutura pendente para monitoramento",
        tone: "subtle",
        disabled: true,
      };
    }
    return {
      key: "monitoramento_status",
      label: "Ativar monitoramento agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringInactive, selectedMonitoringInactive).join("\n")),
        active: true,
        limit,
      },
    };
  }
  if (selectedMonitoringActive.length) {
    if (monitoringUnsupported) {
      return {
        key: "monitoramento_schema",
        label: "Estrutura pendente de conclusao",
        tone: "subtle",
        disabled: true,
      };
    }
    return {
      key: "enriquecer_datajud",
      intent: "sincronizar_monitorados",
      label: "Atualizar monitorados agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive, selectedMonitoringActive).join("\n")),
        limit,
        intent: "sincronizar_monitorados",
        action: "enriquecer_datajud",
      },
    };
  }
  return null;
}
export default function InternoProcessosPage() {
return <RequireAdmin>{(profile) => <InternoLayout profile={profile} title="Gestão de Processos" description="Gestão da carteira processual com acompanhamento, relacionamento e atualização contínua."><InternoProcessosContent /></InternoLayout>}</RequireAdmin>;
}

function InternoProcessosContent() {
  const { isLightTheme } = useInternalTheme();
  const [view, setView] = useState("operacao");
  const [overview, setOverview] = useState({ loading: true, data: null });
  const [processCoverage, setProcessCoverage] = useState({ loading: true, items: [], totalRows: 0, page: 1, pageSize: 20 });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [executionHistory, setExecutionHistory] = useState([]);
  const [queueRefreshLog, setQueueRefreshLog] = useState([]);
  const [operationalStatus, setOperationalStatus] = useState({ mode: "ok", message: "", updatedAt: null });
  const [backendHealth, setBackendHealth] = useState({ status: "ok", message: "", updatedAt: null });
  const [remoteHistory, setRemoteHistory] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [drainInFlight, setDrainInFlight] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState({ loading: true, data: null });
  const [runnerMetrics, setRunnerMetrics] = useState({ loading: true, data: null });
  const [snapshotAt, setSnapshotAt] = useState(null);
  const [globalError, setGlobalError] = useState(null);
  const [globalErrorUntil, setGlobalErrorUntil] = useState(null);
  const [uiHydrated, setUiHydrated] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [lastFocusHash, setLastFocusHash] = useState("");
  const bootstrappedRef = useRef(false);
  const snapshotPayloadRef = useRef("");
  const [limit, setLimit] = useState(2);
  const [queueBatchSizes, setQueueBatchSizes] = useState(DEFAULT_QUEUE_BATCHES);
  const [processNumbers, setProcessNumbers] = useState("");
  const [copilotContext, setCopilotContext] = useState(null);
  const copilotQueryAppliedRef = useRef(false);
  const [withoutMovements, setWithoutMovements] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [movementBacklog, setMovementBacklog] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [publicationBacklog, setPublicationBacklog] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [partesBacklog, setPartesBacklog] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [audienciaCandidates, setAudienciaCandidates] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [monitoringActive, setMonitoringActive] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [monitoringInactive, setMonitoringInactive] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [fieldGaps, setFieldGaps] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [orphans, setOrphans] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [wmPage, setWmPage] = useState(1);
  const [movPage, setMovPage] = useState(1);
  const [pubPage, setPubPage] = useState(1);
  const [partesPage, setPartesPage] = useState(1);
  const [audPage, setAudPage] = useState(1);
  const [maPage, setMaPage] = useState(1);
  const [miPage, setMiPage] = useState(1);
  const [fgPage, setFgPage] = useState(1);
  const [orphanPage, setOrphanPage] = useState(1);
  const [covPage, setCovPage] = useState(1);
  const [selectedWithoutMovements, setSelectedWithoutMovements] = useState([]);
  const [selectedMovementBacklog, setSelectedMovementBacklog] = useState([]);
  const [selectedPublicationBacklog, setSelectedPublicationBacklog] = useState([]);
  const [selectedPartesBacklog, setSelectedPartesBacklog] = useState([]);
  const [selectedAudienciaCandidates, setSelectedAudienciaCandidates] = useState([]);
  const [selectedMonitoringActive, setSelectedMonitoringActive] = useState([]);
  const [selectedMonitoringInactive, setSelectedMonitoringInactive] = useState([]);
  const [selectedFieldGaps, setSelectedFieldGaps] = useState([]);
  const [selectedOrphans, setSelectedOrphans] = useState([]);
  const [relations, setRelations] = useState({ loading: true, error: null, items: [], totalRows: 0, page: 1, pageSize: 20 });
  const [relationSuggestions, setRelationSuggestions] = useState({ loading: true, error: null, items: [], totalRows: 0, page: 1, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [relationMinScore, setRelationMinScore] = useState("0.45");
  const [lookup, setLookup] = useState({ loading: false, items: [] });
  const [lookupTerm, setLookupTerm] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRelationId, setEditingRelationId] = useState(null);
  const [selectedRelations, setSelectedRelations] = useState([]);
  const [selectedSuggestionKeys, setSelectedSuggestionKeys] = useState([]);
  const [allMatchingRelationsSelected, setAllMatchingRelationsSelected] = useState(false);
  const [allMatchingSuggestionsSelected, setAllMatchingSuggestionsSelected] = useState(false);
  const [relationSelectionLoading, setRelationSelectionLoading] = useState(false);
  const [suggestionSelectionLoading, setSuggestionSelectionLoading] = useState(false);
  const adminFetch = useProcessosAdminFetch();
  const persistedUiState = useMemo(() => ({
    view,
    lastFocusHash,
    processNumbers,
    limit,
    queueBatchSizes,
    wmPage,
    movPage,
    pubPage,
    partesPage,
    audPage,
    maPage,
    miPage,
    fgPage,
    orphanPage,
    covPage,
    search,
    relationMinScore,
    selectedWithoutMovements,
    selectedMovementBacklog,
    selectedPublicationBacklog,
    selectedPartesBacklog,
    selectedAudienciaCandidates,
    selectedMonitoringActive,
    selectedMonitoringInactive,
    selectedFieldGaps,
    selectedOrphans,
    selectedRelations,
    selectedSuggestionKeys,
  }), [
    view,
    lastFocusHash,
    processNumbers,
    limit,
    queueBatchSizes,
    wmPage,
    movPage,
    pubPage,
    partesPage,
    audPage,
    maPage,
    miPage,
    fgPage,
    orphanPage,
    covPage,
    search,
    relationMinScore,
    selectedWithoutMovements,
    selectedMovementBacklog,
    selectedPublicationBacklog,
    selectedPartesBacklog,
    selectedAudienciaCandidates,
    selectedMonitoringActive,
    selectedMonitoringInactive,
    selectedFieldGaps,
    selectedOrphans,
    selectedRelations,
    selectedSuggestionKeys,
  ]);
  const applySavedUiState = useMemo(() => (saved) => {
    if (saved.processNumbers) setProcessNumbers(String(saved.processNumbers));
    if (saved.limit) setLimit(Number(saved.limit) || 2);
    if (saved.queueBatchSizes && typeof saved.queueBatchSizes === "object") setQueueBatchSizes((current) => ({ ...current, ...saved.queueBatchSizes }));
    if (saved.wmPage) setWmPage(Math.max(1, Number(saved.wmPage) || 1));
    if (saved.movPage) setMovPage(Math.max(1, Number(saved.movPage) || 1));
    if (saved.pubPage) setPubPage(Math.max(1, Number(saved.pubPage) || 1));
    if (saved.partesPage) setPartesPage(Math.max(1, Number(saved.partesPage) || 1));
    if (saved.audPage) setAudPage(Math.max(1, Number(saved.audPage) || 1));
    if (saved.maPage) setMaPage(Math.max(1, Number(saved.maPage) || 1));
    if (saved.miPage) setMiPage(Math.max(1, Number(saved.miPage) || 1));
    if (saved.fgPage) setFgPage(Math.max(1, Number(saved.fgPage) || 1));
    if (saved.orphanPage) setOrphanPage(Math.max(1, Number(saved.orphanPage) || 1));
    if (saved.covPage) setCovPage(Math.max(1, Number(saved.covPage) || 1));
    if (saved.search) setSearch(String(saved.search));
    if (saved.relationMinScore) setRelationMinScore(String(saved.relationMinScore));
    if (Array.isArray(saved.selectedWithoutMovements)) setSelectedWithoutMovements(saved.selectedWithoutMovements);
    if (Array.isArray(saved.selectedMovementBacklog)) setSelectedMovementBacklog(saved.selectedMovementBacklog);
    if (Array.isArray(saved.selectedPublicationBacklog)) setSelectedPublicationBacklog(saved.selectedPublicationBacklog);
    if (Array.isArray(saved.selectedPartesBacklog)) setSelectedPartesBacklog(saved.selectedPartesBacklog);
    if (Array.isArray(saved.selectedAudienciaCandidates)) setSelectedAudienciaCandidates(saved.selectedAudienciaCandidates);
    if (Array.isArray(saved.selectedMonitoringActive)) setSelectedMonitoringActive(saved.selectedMonitoringActive);
    if (Array.isArray(saved.selectedMonitoringInactive)) setSelectedMonitoringInactive(saved.selectedMonitoringInactive);
    if (Array.isArray(saved.selectedFieldGaps)) setSelectedFieldGaps(saved.selectedFieldGaps);
    if (Array.isArray(saved.selectedOrphans)) setSelectedOrphans(saved.selectedOrphans);
    if (Array.isArray(saved.selectedRelations)) setSelectedRelations(saved.selectedRelations);
    if (Array.isArray(saved.selectedSuggestionKeys)) setSelectedSuggestionKeys(saved.selectedSuggestionKeys);
  }, []);
  useProcessosNavigationState({
    view,
    lastFocusHash,
    setView,
    setLastFocusHash,
    applySavedState: applySavedUiState,
    persistedState: persistedUiState,
    setUiHydrated,
  });

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

  async function loadOverview() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      setOverview((state) => ({ ...state, loading: false }));
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=overview");
      setOverview({ loading: false, data: payload.data });
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch (error) {
      setOverview({ loading: false, data: null });
      setGlobalError(error.message || "Falha ao carregar visao geral.");
      setGlobalErrorUntil(Date.now() + GLOBAL_ERROR_TTL_MS);
    }
  }
  async function loadSchemaStatus() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      setSchemaStatus((state) => ({ ...state, loading: false }));
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=schema_status");
      setSchemaStatus({ loading: false, data: payload.data });
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch (error) {
      setSchemaStatus({ loading: false, data: null });
      setGlobalError(error.message || "Falha ao ler schema.");
      setGlobalErrorUntil(Date.now() + GLOBAL_ERROR_TTL_MS);
    }
  }
  async function loadRunnerMetrics() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      setRunnerMetrics((state) => ({ ...state, loading: false }));
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=runner_metrics");
      setRunnerMetrics({ loading: false, data: payload.data });
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch (error) {
      setRunnerMetrics({ loading: false, data: null });
      setGlobalError(error.message || "Falha ao carregar runner.");
      setGlobalErrorUntil(Date.now() + GLOBAL_ERROR_TTL_MS);
    }
  }
  function pushQueueRefresh(key) {
    const label = QUEUE_LABELS[key] || key;
    const entry = { key, label, ts: new Date().toISOString() };
    setQueueRefreshLog((current) => [entry, ...(current || []).filter((item) => item.key !== key)].slice(0, 6));
  }
  async function loadCoverage(page = 1) {
    if (schemaStatus?.data?.exists === false) {
      setProcessCoverage({ loading: false, items: [], totalRows: 0, page, pageSize: 20, unsupported: true, limited: false, error: null });
      pushQueueRefresh("cobertura");
      return;
    }
    setProcessCoverage((state) => ({ ...state, loading: true }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=cobertura_processos&page=${page}&pageSize=20`);
      setProcessCoverage({ loading: false, items: payload.data.items || [], totalRows: payload.data.totalRows || 0, page: payload.data.page || page, pageSize: payload.data.pageSize || 20, unsupported: false, limited: Boolean(payload.data.limited), error: payload.data?.error || null });
      pushQueueRefresh("cobertura");
    } catch (error) {
      setProcessCoverage((state) => ({ loading: false, items: state?.items || [], totalRows: state?.totalRows || 0, page, pageSize: state?.pageSize || 20, unsupported: false, limited: Boolean(state?.limited), error: error.message || "Falha ao carregar cobertura." }));
      pushQueueRefresh("cobertura");
    }
  }
  async function loadQueue(action, setter, page) {
    setter((state) => ({ ...state, loading: true, error: null }));
    const now = Date.now();
    setter((state) => {
      if (state?.errorUntil && now < state.errorUntil) {
        return { ...state, loading: false };
      }
      return state;
    });
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=${action}&page=${page}&pageSize=20`);
        const payloadError = payload.data?.error || null;
        const nextErrorUntil = payloadError ? Date.now() + QUEUE_ERROR_TTL_MS : null;
        setter({
          loading: false,
          items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })),
          totalRows: payload.data.totalRows || 0,
          page: payload.data.page || page,
          pageSize: payload.data.pageSize || 20,
          unsupported: Boolean(payload.data.unsupported),
          updatedAt: new Date().toISOString(),
          limited: Boolean(payload.data.limited),
          error: payloadError,
          errorUntil: nextErrorUntil,
        });
        pushQueueRefresh(action);
    } catch (error) {
      const message = error.message || "Falha ao carregar fila.";
      setter((state) => ({
        loading: false,
        items: state?.items || [],
        totalRows: state?.totalRows || 0,
        page,
        pageSize: 20,
        unsupported: Boolean(state?.unsupported),
        updatedAt: state?.updatedAt || new Date().toISOString(),
        limited: Boolean(state?.limited),
        error: message,
        errorUntil: Date.now() + QUEUE_ERROR_TTL_MS,
      }));
      pushQueueRefresh(action);
    }
  }
  async function loadOrphans(page = 1) {
    setOrphans((state) => ({ ...state, loading: true }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=orfaos&page=${page}&pageSize=20`);
      setOrphans({ loading: false, items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })), totalRows: payload.data.totalRows || 0, page: payload.data.page || page, pageSize: payload.data.pageSize || 20, updatedAt: new Date().toISOString() });
      pushQueueRefresh("orfaos");
    } catch {
      setOrphans({ loading: false, items: [], totalRows: 0, page, pageSize: 20, updatedAt: new Date().toISOString() });
      pushQueueRefresh("orfaos");
    }
  }
  async function loadRelations(page = 1, query = "") {
    setRelations((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=relacoes&page=${page}&pageSize=20&query=${encodeURIComponent(query || "")}`);
      setRelations({
        loading: false,
        error: null,
        items: payload.data.items || [],
        totalRows: payload.data.totalRows || 0,
        page: payload.data.page || page,
        pageSize: payload.data.pageSize || 20,
      });
    } catch (error) {
      setRelations({ loading: false, error: error.message || "Falha ao carregar relacoes.", items: [], totalRows: 0, page, pageSize: 20 });
    }
  }
  async function loadRelationSuggestions(page = 1, query = "", minScore = relationMinScore) {
    setRelationSuggestions((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=sugestoes_relacoes&page=${page}&pageSize=20&query=${encodeURIComponent(query || "")}&minScore=${encodeURIComponent(minScore || "0.45")}`);
      setRelationSuggestions({
        loading: false,
        error: null,
        items: payload.data.items || [],
        totalRows: payload.data.totalRows || 0,
        page: payload.data.page || page,
        pageSize: payload.data.pageSize || 20,
      });
    } catch (error) {
      setRelationSuggestions({ loading: false, error: error.message || "Falha ao carregar sugestoes.", items: [], totalRows: 0, page, pageSize: 20 });
    }
  }
  async function loadRemoteHistory() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=historico&limit=20");
      setRemoteHistory(payload.data.items || []);
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch {
      setRemoteHistory([]);
    }
  }
  async function loadJobs() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=jobs&limit=12");
      setJobs(payload.data.items || []);
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch {
      setJobs([]);
    }
  }
  function mergeJobIntoState(job) {
    if (!job?.id) return;
    setJobs((current) => {
      const next = Array.isArray(current) ? [...current] : [];
      const index = next.findIndex((item) => item.id === job.id);
      if (index >= 0) next[index] = { ...next[index], ...job };
      else next.unshift(job);
      return next.slice(0, 12);
    });
  }
  async function refreshOperationalQueues(options = {}) {
    const { forceAll = false } = options;
    const shouldLoadQueues = forceAll || OPERATIONAL_VIEWS.has(view);
    const shouldLoadCoverage = forceAll || COVERAGE_VIEWS.has(view);
    const calls = [loadOverview()];
    if (shouldLoadCoverage) calls.push(loadCoverage(covPage));
    if (shouldLoadQueues) {
      calls.push(
        loadQueue("sem_movimentacoes", setWithoutMovements, wmPage),
        loadQueue("movimentacoes_pendentes", setMovementBacklog, movPage),
        loadQueue("publicacoes_pendentes", setPublicationBacklog, pubPage),
        loadQueue("partes_sem_contato", setPartesBacklog, partesPage),
        loadQueue("audiencias_pendentes", setAudienciaCandidates, audPage),
        loadQueue("monitoramento_ativo", setMonitoringActive, maPage),
        loadQueue("monitoramento_inativo", setMonitoringInactive, miPage),
        loadQueue("campos_orfaos", setFieldGaps, fgPage),
        loadOrphans(orphanPage),
      );
    }
    await Promise.all(calls);
  }
  function buildRefreshPlan(action, payload = {}) {
    const intent = String(payload.intent || "").trim();
    const queues = new Set();
    let coverage = false;
    let orphans = false;
    if (action === "push_orfaos") {
      orphans = true;
    } else if (action === "repair_freshsales_accounts") {
      queues.add(QUEUE_REFRESHERS.campos_orfaos);
    } else if (action === "sync_supabase_crm") {
      coverage = true;
      queues.add(QUEUE_REFRESHERS.movimentacoes_pendentes);
      queues.add(QUEUE_REFRESHERS.publicacoes_pendentes);
      queues.add(QUEUE_REFRESHERS.partes_sem_contato);
      queues.add(QUEUE_REFRESHERS.campos_orfaos);
    } else if (action === "sincronizar_movimentacoes_activity") {
      queues.add(QUEUE_REFRESHERS.movimentacoes_pendentes);
    } else if (action === "sincronizar_publicacoes_activity") {
      queues.add(QUEUE_REFRESHERS.publicacoes_pendentes);
    } else if (action === "reconciliar_partes_contatos") {
      queues.add(QUEUE_REFRESHERS.partes_sem_contato);
    } else if (action === "backfill_audiencias") {
      queues.add(QUEUE_REFRESHERS.audiencias_pendentes);
    } else if (action === "monitoramento_status") {
      queues.add(QUEUE_REFRESHERS.monitoramento_ativo);
      queues.add(QUEUE_REFRESHERS.monitoramento_inativo);
    } else if (action === "enriquecer_datajud") {
      if (intent === "sincronizar_monitorados") {
        queues.add(QUEUE_REFRESHERS.monitoramento_ativo);
        queues.add(QUEUE_REFRESHERS.monitoramento_inativo);
      } else if (intent === "reenriquecer_gaps") {
        queues.add(QUEUE_REFRESHERS.campos_orfaos);
      } else {
        queues.add(QUEUE_REFRESHERS.sem_movimentacoes);
        queues.add(QUEUE_REFRESHERS.movimentacoes_pendentes);
      }
    }
    return {
      queues: [...queues],
      coverage,
      orphans,
    };
  }
  async function refreshAfterAction(action, payload = {}) {
    const plan = buildRefreshPlan(action, payload);
    const calls = [loadOverview()];
    if (plan.coverage) calls.push(loadCoverage(covPage));
    if (plan.orphans) calls.push(loadOrphans(orphanPage));
    if (plan.queues.length) {
      plan.queues.forEach((queue) => {
        if (queue === QUEUE_REFRESHERS.sem_movimentacoes) calls.push(loadQueue("sem_movimentacoes", setWithoutMovements, wmPage));
        if (queue === QUEUE_REFRESHERS.movimentacoes_pendentes) calls.push(loadQueue("movimentacoes_pendentes", setMovementBacklog, movPage));
        if (queue === QUEUE_REFRESHERS.publicacoes_pendentes) calls.push(loadQueue("publicacoes_pendentes", setPublicationBacklog, pubPage));
        if (queue === QUEUE_REFRESHERS.partes_sem_contato) calls.push(loadQueue("partes_sem_contato", setPartesBacklog, partesPage));
        if (queue === QUEUE_REFRESHERS.audiencias_pendentes) calls.push(loadQueue("audiencias_pendentes", setAudienciaCandidates, audPage));
        if (queue === QUEUE_REFRESHERS.monitoramento_ativo) calls.push(loadQueue("monitoramento_ativo", setMonitoringActive, maPage));
        if (queue === QUEUE_REFRESHERS.monitoramento_inativo) calls.push(loadQueue("monitoramento_inativo", setMonitoringInactive, miPage));
        if (queue === QUEUE_REFRESHERS.campos_orfaos) calls.push(loadQueue("campos_orfaos", setFieldGaps, fgPage));
      });
    }
    await Promise.all([...calls, loadRemoteHistory(), loadJobs()]);
  }
  async function refreshOperationalContext(options = {}) {
    await Promise.all([
      refreshOperationalQueues(options),
      loadRemoteHistory(),
      loadJobs(),
    ]);
  }
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
  const recurringProcesses = deriveRecurringProcessEntries(remoteHistory);
  const recurringProcessSummary = summarizeRecurringProcessEntries(recurringProcesses);
  const recurringProcessBands = summarizeRecurrenceBands(recurringProcesses);
  const recurringProcessGroups = groupRecurringProcessEntries(recurringProcesses);
  const recurringProcessFocus = deriveRecurringProcessFocus(recurringProcessSummary, recurringProcessBands);
  const recurringProcessBatch = deriveSuggestedProcessBatch(recurringProcessSummary, recurringProcessBands);
  const recurringProcessActions = deriveSuggestedProcessActions(recurringProcessSummary, recurringProcessBands);
  const recurringProcessChecklist = deriveSuggestedProcessChecklist(recurringProcessSummary, recurringProcessBands);
  function selectVisibleRecurringProcesses() {
    const recurringKeys = new Set(recurringProcesses.map((item) => item.key));
    setSelectedWithoutMovements(withoutMovements.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMovementBacklog(movementBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedPublicationBacklog(publicationBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedPartesBacklog(partesBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedAudienciaCandidates(audienciaCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMonitoringActive(monitoringActive.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMonitoringInactive(monitoringInactive.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedFieldGaps(fieldGaps.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedOrphans(orphans.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    updateView("filas");
  }
  function selectVisibleSevereRecurringProcesses() {
    const recurringKeys = new Set(recurringProcesses.filter((item) => item.hits >= 3).map((item) => item.key));
    setSelectedWithoutMovements(withoutMovements.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMovementBacklog(movementBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedPublicationBacklog(publicationBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedPartesBacklog(partesBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedAudienciaCandidates(audienciaCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMonitoringActive(monitoringActive.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMonitoringInactive(monitoringInactive.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedFieldGaps(fieldGaps.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedOrphans(orphans.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    updateView("filas");
  }
  function applySevereRecurringPreset() {
    setLimit(recurringProcessBatch.size);
    selectVisibleSevereRecurringProcesses();
  }
  function clearAllQueueSelections() {
    setSelectedWithoutMovements([]);
    setSelectedMovementBacklog([]);
    setSelectedPublicationBacklog([]);
    setSelectedPartesBacklog([]);
    setSelectedAudienciaCandidates([]);
    setSelectedMonitoringActive([]);
    setSelectedMonitoringInactive([]);
    setSelectedFieldGaps([]);
    setSelectedOrphans([]);
  }
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
  async function toggleAllMatchingRelations() {
    if (allMatchingRelationsSelected) {
      setSelectedRelations([]);
      setAllMatchingRelationsSelected(false);
      return;
    }
    setRelationSelectionLoading(true);
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=relacoes&selection=1&page=1&pageSize=500&query=${encodeURIComponent(search || "")}`);
      setSelectedRelations((payload.data.items || []).map((item) => item.selection_key).filter(Boolean));
      setAllMatchingRelationsSelected(true);
    } finally {
      setRelationSelectionLoading(false);
    }
  }
  async function toggleAllMatchingSuggestions() {
    if (allMatchingSuggestionsSelected) {
      setSelectedSuggestionKeys([]);
      setAllMatchingSuggestionsSelected(false);
      return;
    }
    setSuggestionSelectionLoading(true);
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=sugestoes_relacoes&selection=1&page=1&pageSize=500&query=${encodeURIComponent(search || "")}&minScore=${encodeURIComponent(relationMinScore || "0.45")}`);
      setSelectedSuggestionKeys((payload.data.items || []).map((item) => item.suggestion_key).filter(Boolean));
      setAllMatchingSuggestionsSelected(true);
    } finally {
      setSuggestionSelectionLoading(false);
    }
  }
  async function loadSelectedRelationItems() {
    const needRemote = allMatchingRelationsSelected || selectedRelations.length > relations.items.length;
    if (!needRemote) {
      return relations.items.filter((item) => selectedRelations.includes(getRelationSelectionValue(item)));
    }
    const payload = await adminFetch(`/api/admin-hmadv-processos?action=relacoes&page=1&pageSize=500&query=${encodeURIComponent(search || "")}`);
    return (payload.data.items || []).filter((item) => selectedRelations.includes(getRelationSelectionValue(item)));
  }
  async function loadSelectedSuggestionItems() {
    const needRemote = allMatchingSuggestionsSelected || selectedSuggestionKeys.length > relationSuggestions.items.length;
    if (!needRemote) {
      return relationSuggestions.items.filter((item) => selectedSuggestionKeys.includes(getSuggestionSelectionValue(item)));
    }
    const payload = await adminFetch(`/api/admin-hmadv-processos?action=sugestoes_relacoes&page=1&pageSize=500&query=${encodeURIComponent(search || "")}&minScore=${encodeURIComponent(relationMinScore || "0.45")}`);
    return (payload.data.items || []).filter((item) => selectedSuggestionKeys.includes(getSuggestionSelectionValue(item)));
  }
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
  async function handleSaveRelation() {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "salvar_relacao", id: editingRelationId, ...form }) });
      setActionState({ loading: false, error: null, result: payload.data }); setForm(EMPTY_FORM); setEditingRelationId(null); await Promise.all([loadRelations(relations.page, search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) { setActionState({ loading: false, error: error.message || "Falha ao salvar relacao.", result: null }); }
  }
  async function handleDeleteRelation(id) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remover_relacao", id }) });
      setActionState({ loading: false, error: null, result: payload.data }); await Promise.all([loadRelations(relations.page, search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) { setActionState({ loading: false, error: error.message || "Falha ao remover relacao.", result: null }); }
  }
  async function handleBulkRelationStatus(nextStatus) {
    if (!selectedRelations.length) return;
    setActionState({ loading: true, error: null, result: null });
    try {
      const relationIds = (await loadSelectedRelationItems())
        .map((item) => item.id)
        .filter(Boolean);
      const payload = await adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_relacoes", ids: relationIds, status: nextStatus }),
      });
      setActionState({ loading: false, error: null, result: payload.data });
      await Promise.all([loadRelations(relations.page, search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha na atualizacao em massa.", result: null });
    }
  }
  async function handleBulkRelationRemoval() {
    if (!selectedRelations.length) return;
    setActionState({ loading: true, error: null, result: null });
    try {
      const relationIds = (await loadSelectedRelationItems())
        .map((item) => item.id)
        .filter(Boolean);
      const payload = await adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_relacoes", ids: relationIds, remove: true }),
      });
      setActionState({ loading: false, error: null, result: payload.data });
      setSelectedRelations([]);
      await Promise.all([loadRelations(Math.max(1, relations.page), search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha na remocao em massa.", result: null });
    }
  }
  function useSuggestionInForm(item) {
    setForm({
      numero_cnj_pai: item.numero_cnj_pai || "",
      numero_cnj_filho: item.numero_cnj_filho || "",
      tipo_relacao: item.tipo_relacao || "dependencia",
      status: item.status || "ativo",
      observacoes: item.evidence?.trecho ? `Sugerido a partir de publicacao: ${item.evidence.trecho}` : "",
    });
  }
  async function handleBulkSaveSuggestions() {
    if (!selectedSuggestionKeys.length) return;
    setActionState({ loading: true, error: null, result: null });
    try {
      const items = (await loadSelectedSuggestionItems())
        .map((item) => ({
          numero_cnj_pai: item.numero_cnj_pai,
          numero_cnj_filho: item.numero_cnj_filho,
          tipo_relacao: item.tipo_relacao,
          status: item.status || "ativo",
          score: item.score,
          observacoes: item.evidence?.trecho ? `Sugestao validada em massa. Evidencia: ${item.evidence.trecho}` : "",
        }));
      const payload = await adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_salvar_relacoes", items }),
      });
      setActionState({ loading: false, error: null, result: payload.data });
      setSelectedSuggestionKeys([]);
      await Promise.all([
        loadRelations(1, search),
        loadRelationSuggestions(relationSuggestions.page, search, relationMinScore),
      ]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao validar sugestoes em massa.", result: null });
    }
  }
  useEffect(() => {
    if (!uiHydrated) return;
    if (!COVERAGE_VIEWS.has(view)) return;
    loadCoverage(covPage);
  }, [covPage, view, uiHydrated]);
  function startEditing(item) { setEditingRelationId(item.id); setForm({ numero_cnj_pai: item.numero_cnj_pai || "", numero_cnj_filho: item.numero_cnj_filho || "", tipo_relacao: item.tipo_relacao || "dependencia", status: item.status || "ativo", observacoes: item.observacoes || "" }); }
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
  const primaryProcessAction = derivePrimaryProcessAction(recurringProcessActions);
  const combinedSelectedNumbers = getCombinedSelectedNumbers();
  const selectedSummary = combinedSelectedNumbers.length;
  const visibleRecurringCount = [...withoutMovements.items, ...movementBacklog.items, ...publicationBacklog.items, ...partesBacklog.items, ...audienciaCandidates.items, ...monitoringActive.items, ...monitoringInactive.items, ...fieldGaps.items, ...orphans.items]
    .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index)
    .filter((item) => recurringProcesses.some((recurring) => recurring.key === (item.numero_cnj || item.key))).length;
  const visibleSevereRecurringCount = [...withoutMovements.items, ...movementBacklog.items, ...publicationBacklog.items, ...partesBacklog.items, ...audienciaCandidates.items, ...monitoringActive.items, ...monitoringInactive.items, ...fieldGaps.items, ...orphans.items]
    .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index)
    .filter((item) => recurringProcesses.some((recurring) => recurring.key === (item.numero_cnj || item.key) && recurring.hits >= 3)).length;
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
  const queueActionConfigs = useMemo(() => ({
    sem_movimentacoes: {
      batchSize: getQueueBatchSize("sem_movimentacoes"),
      selectionCount: selectedWithoutMovements.length,
      helper: "Aplica o lote apenas sobre os processos selecionados nesta fila.",
      actions: [
        {
          label: "Buscar movimentacoes",
          tone: isSuggestedAction("enriquecer_datajud", "buscar_movimentacoes") ? "primary" : "subtle",
          onClick: () => runQueueAction("enriquecer_datajud", "sem_movimentacoes", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(withoutMovements.items, selectedWithoutMovements).join("\n")),
            intent: "buscar_movimentacoes",
            action: "enriquecer_datajud",
          }),
        },
      ],
    },
    movimentacoes_pendentes: {
      batchSize: getQueueBatchSize("movimentacoes_pendentes"),
      selectionCount: selectedMovementBacklog.length,
      helper: "Use o lote da fila para refletir apenas os andamentos selecionados no Freshsales.",
      actions: [
        {
          label: "Sincronizar movimentacoes",
          tone: isSuggestedAction("sincronizar_movimentacoes_activity") ? "primary" : "subtle",
          onClick: () => runQueueAction("sincronizar_movimentacoes_activity", "movimentacoes_pendentes", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(movementBacklog.items, selectedMovementBacklog).join("\n")),
          }),
        },
      ],
    },
    publicacoes_pendentes: {
      batchSize: getQueueBatchSize("publicacoes_pendentes"),
      selectionCount: selectedPublicationBacklog.length,
      helper: "Dispare o lote local para publicar apenas o recorte desta fila.",
      actions: [
        {
          label: "Sincronizar publicacoes",
          tone: isSuggestedAction("sincronizar_publicacoes_activity") ? "primary" : "subtle",
          onClick: () => runQueueAction("sincronizar_publicacoes_activity", "publicacoes_pendentes", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(publicationBacklog.items, selectedPublicationBacklog).join("\n")),
          }),
        },
      ],
    },
    partes_sem_contato: {
      batchSize: getQueueBatchSize("partes_sem_contato"),
      selectionCount: selectedPartesBacklog.length,
      helper: "O lote atua apenas nas partes dos processos marcados nesta fila.",
      actions: [
        {
          label: "Reconciliar partes",
          tone: isSuggestedAction("reconciliar_partes_contatos") ? "primary" : "subtle",
          onClick: () => runQueueAction("reconciliar_partes_contatos", "partes_sem_contato", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(partesBacklog.items, selectedPartesBacklog).join("\n")),
          }),
        },
      ],
    },
    audiencias_pendentes: {
      batchSize: getQueueBatchSize("audiencias_pendentes"),
      selectionCount: selectedAudienciaCandidates.length,
      helper: "Retroage audiencias somente para os processos escolhidos nesta fila.",
      actions: [
        {
          label: "Retroagir audiencias",
          tone: isSuggestedAction("backfill_audiencias") ? "primary" : "subtle",
          onClick: () => runQueueAction("backfill_audiencias", "audiencias_pendentes", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(audienciaCandidates.items, selectedAudienciaCandidates).join("\n")),
            apply: true,
          }),
        },
      ],
    },
    monitoramento_ativo: {
      batchSize: getQueueBatchSize("monitoramento_ativo"),
      selectionCount: selectedMonitoringActive.length,
      helper: monitoringUnsupported ? "Fila somente leitura: mostra o backlog que depende da coluna monitoramento_ativo no HMADV." : "Escolha um lote local para sincronizar ou desligar o monitoramento do recorte atual.",
      actions: monitoringUnsupported ? [] : [
        {
          label: "Sincronizar monitorados",
          tone: isSuggestedAction("enriquecer_datajud", "sincronizar_monitorados") ? "primary" : "subtle",
          onClick: () => runQueueAction("enriquecer_datajud", "monitoramento_ativo", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n")),
            intent: "sincronizar_monitorados",
            action: "enriquecer_datajud",
          }),
        },
        {
          label: "Desativar monitoramento",
          onClick: () => runQueueAction("monitoramento_status", "monitoramento_ativo", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n")),
            active: false,
          }),
        },
      ],
    },
    monitoramento_inativo: {
      batchSize: getQueueBatchSize("monitoramento_inativo"),
      selectionCount: selectedMonitoringInactive.length,
      helper: monitoringUnsupported ? "Fila somente leitura: o painel mostra apenas o que precisa de adequacao de schema." : "Reative em lote apenas os processos selecionados nesta fila.",
      actions: monitoringUnsupported ? [] : [
        {
          label: "Ativar monitoramento",
          tone: "primary",
          onClick: () => runQueueAction("monitoramento_status", "monitoramento_inativo", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringInactive.items, selectedMonitoringInactive).join("\n")),
            active: true,
          }),
        },
      ],
    },
    campos_orfaos: {
      batchSize: getQueueBatchSize("campos_orfaos"),
      selectionCount: selectedFieldGaps.length,
      helper: "Combine reparo de CRM e reenriquecimento apenas para os gaps marcados nesta fila.",
      actions: [
        {
          label: "Corrigir CRM",
          tone: isSuggestedAction("repair_freshsales_accounts") ? "primary" : "subtle",
          onClick: () => runQueueAction("repair_freshsales_accounts", "campos_orfaos", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n")),
          }),
        },
        {
          label: "Reenriquecer gaps",
          onClick: () => runQueueAction("enriquecer_datajud", "campos_orfaos", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n")),
            intent: "reenriquecer_gaps",
            action: "enriquecer_datajud",
          }),
        },
      ],
    },
    orfaos: {
      batchSize: getQueueBatchSize("orfaos"),
      selectionCount: selectedOrphans.length,
      helper: "Cria Sales Accounts apenas para os processos escolhidos nesta fila.",
      actions: [
        {
          label: "Criar accounts",
          tone: isSuggestedAction("push_orfaos") ? "primary" : "subtle",
          onClick: () => runQueueAction("push_orfaos", "orfaos", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(orphans.items, selectedOrphans).join("\n")),
          }),
        },
      ],
    },
  }), [selectedWithoutMovements, selectedMovementBacklog, selectedPublicationBacklog, selectedPartesBacklog, selectedAudienciaCandidates, selectedMonitoringActive, selectedMonitoringInactive, selectedFieldGaps, selectedOrphans, monitoringUnsupported, withoutMovements.items, movementBacklog.items, publicationBacklog.items, partesBacklog.items, audienciaCandidates.items, monitoringActive.items, monitoringInactive.items, fieldGaps.items, orphans.items, queueBatchSizes, selectionSuggestedAction, processNumbers]);
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
    {copilotContext ? (
      <section className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)] text-[#C6D1CC]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#7FC4AF]"}`}>Contexto vindo do Copilot</p>
        <p className={`mt-2 font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{copilotContext.conversationTitle || "Conversa ativa"}</p>
        {copilotContext.mission ? <p className={`mt-2 leading-6 ${isLightTheme ? "text-[#6b7280]" : "text-[#9BAEA8]"}`}>{copilotContext.mission}</p> : null}
        {processNumbers ? <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>CNJs pré-carregados no campo de foco manual.</p> : null}
      </section>
    ) : null}
    <section className={`rounded-[30px] border px-4 md:px-6 ${isResultView ? "py-4 md:py-5" : "py-5 md:py-6"} ${isLightTheme ? "border-[#d7d4cb] bg-[radial-gradient(circle_at_top_left,rgba(199,155,44,0.12),transparent_35%),linear-gradient(180deg,#fffdf8,#f5f1e8)] text-[#1f2937]" : "border-[#2D2E2E] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_35%),linear-gradient(180deg,rgba(13,15,14,0.98),rgba(8,10,10,0.98))]"}`}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>Centro operacional</p>
          <h3 className="mt-3 font-serif text-4xl leading-tight">Processos com menos ruido, mais decisao e execucao.</h3>
          <p className={`mt-3 max-w-2xl text-sm leading-7 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>A operacao precisa mostrar o gargalo real, sugerir o melhor lote e reduzir cliques repetidos. O foco agora e decisao clara por etapa, nao um painel monolitico.</p>
        </div>
        <div className={`flex flex-col gap-3 rounded-[26px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.86)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}>
          <div className="flex items-center justify-between gap-4"><span className={isLightTheme ? "text-[#6b7280]" : "opacity-60"}>Selecionados</span><strong className="font-serif text-2xl">{selectedSummary}</strong></div>
          <div className="flex items-center justify-between gap-4"><span className={isLightTheme ? "text-[#6b7280]" : "opacity-60"}>Estado da sessao</span><span className={`text-right text-xs uppercase tracking-[0.16em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>{actionState.loading ? "executando" : actionState.error ? "erro" : actionState.result ? "concluida" : "aguardando"}</span></div>
          {latestHistory ? <p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{latestHistory.label}: {latestHistory.preview}</p> : null}
        </div>
      </div>
        <div className={`mt-6 ${isResultView ? "space-y-3" : "space-y-4"}`}>
          <ViewToggle value={view} onChange={updateView} />
          <div className={`rounded-[22px] border p-4 text-sm ${operationalStatus.mode === "error" || backendHealth.status === "error" ? "border-[#4B2222] bg-[rgba(127,29,29,0.12)]" : operationalStatus.mode === "limited" || backendHealth.status === "warning" ? "border-[#6E5630] bg-[rgba(76,57,26,0.16)]" : isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.82)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Barra de saude operacional</p>
                <p className="mt-2">{operationalStatus.message || "Operacao normal"} • {backendHealth.message || "Sem historico recente."}</p>
                <p className={`mt-2 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-70"}`}>Acao sugerida: {healthSuggestedActions[0]?.label || "Ir para operacao"}</p>
                {data.syncWorkerScopeNote ? <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "opacity-70"}`}>{data.syncWorkerScopeNote}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={operationalStatus.mode === "error" ? "danger" : operationalStatus.mode === "limited" ? "warning" : "success"}>{operationalStatus.mode === "error" ? "operacao com alerta" : operationalStatus.mode === "limited" ? "operacao degradada" : "operacao estavel"}</StatusBadge>
                <StatusBadge tone={backendHealth.status === "error" ? "danger" : backendHealth.status === "warning" ? "warning" : "success"}>{backendHealth.status === "error" ? "backend com falha" : backendHealth.status === "warning" ? "backend com ressalva" : "backend saudavel"}</StatusBadge>
                {trackedQueueErrorCount ? <StatusBadge tone="danger">{trackedQueueErrorCount} fila(s) com erro</StatusBadge> : null}
                {trackedQueueMismatchCount ? <StatusBadge tone="warning">{trackedQueueMismatchCount} fila(s) com leitura parcial</StatusBadge> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {healthSuggestedActions.map((action) => <ActionButton key={action.key} className="px-3 py-2 text-xs" onClick={action.onClick} disabled={action.disabled}>{action.label}</ActionButton>)}
            </div>
          </div>
          {!isResultView && operationalPlan.length ? <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.82)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)]"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Plano operacional enxuto</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {operationalPlan.slice(0, 3).map((step, index) => <button key={`${step.title}-${index}`} type="button" onClick={() => runOperationalPlanStep(step)} className={`rounded-[18px] border p-3 text-left hover:border-[#C5A059] ${isLightTheme ? "border-[#d7d4cb] bg-white" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>Passo {index + 1}</p>
                  <StatusBadge tone={getOperationalPlanStepState(step, index).tone}>{getOperationalPlanStepState(step, index).label}</StatusBadge>
                </div>
                <p className="mt-2 font-semibold">{step.title}</p>
                <p className={`mt-2 text-xs ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{step.detail}</p>
              </button>)}
            </div>
          </div> : null}
          {!isResultView ? <div className={`rounded-[26px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.88)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.55)]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Leitura consolidada</p>
              <p className={`mt-1 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-75"}`}>Schema, runner e integracao total em um unico resumo acionavel.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton tone="primary" onClick={() => handleAction("executar_integracao_total_hmadv")} disabled={actionState.loading}>
                Rodar integracao completa
              </ActionButton>
              <ActionButton onClick={() => Promise.all([loadSchemaStatus(), loadRunnerMetrics()])} disabled={actionState.loading}>
                Atualizar leitura
              </ActionButton>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <StatusBadge tone={coverageSchemaExists ? "success" : "warning"}>{coverageSchemaLabel}</StatusBadge>
            <StatusBadge tone={runnerData?.latest?.status === "success" ? "success" : "default"}>
              ultimo runner: {runnerData?.latest?.status || "sem leitura"}
            </StatusBadge>
            <StatusBadge tone="default">limite API Freshsales 1000/h</StatusBadge>
          </div>
          <div className={`mt-3 grid gap-2 text-xs md:grid-cols-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-75"}`}>
            <p><strong>Cobertura:</strong> {Number(runnerCoverage?.coverage_coveredRows || 0)} cobertos / {Number(runnerCoverage?.coverage_totalRows || 0)} total</p>
            <p><strong>Tag datajud:</strong> {Number(runnerTagged?.tagged_fullyCovered || 0)} completos</p>
          </div>
          {runnerAction?.datajud_action_manualActionRequired ? <p className={`mt-2 text-xs ${isLightTheme ? "text-red-700" : "text-[#FECACA]"}`}>A prioridade atual ainda depende de acao manual no Freshsales.</p> : null}
        </div> : null}
        {!isResultView && latestRemoteRun ? <RemoteRunSummary entry={latestRemoteRun} /> : null}
      </div>
    </section>

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
