import { useEffect } from "react";
import InternoLayout from "../../../components/interno/InternoLayout";
import RequireAdmin from "../../../components/interno/RequireAdmin";
import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import { buildDrainPreview } from "./action-utils";
import { EMPTY_FORM } from "./constants";
import { CoverageList, QueueActionBlock, QueueList } from "./processos-queue-components";
import { RegisteredRelationCard, RelationSelectionBar, RelationSuggestionCard } from "./processos-relation-components";
import { getProcessSelectionValue, getRelationSelectionValue, getSuggestionSelectionValue, parseCopilotContext } from "./processos-screen-utils";
import { HistoryCard, JobCard, OperationResult } from "./processos-result-components";
import ProcessosScreenView from "./ProcessosScreenView";
import { RecurringProcessGroup } from "./recurrence";
import { useProcessosActionHandlers } from "./useProcessosActionHandlers";
import { useProcessosAdminFetch } from "./useProcessosAdminFetch";
import { useProcessosBootstrap } from "./useProcessosBootstrap";
import { useProcessosDerivedState } from "./useProcessosDerivedState";
import { useProcessosFetchers } from "./useProcessosFetchers";
import { useProcessosJobDrain } from "./useProcessosJobDrain";
import { useProcessosOperationalHealth } from "./useProcessosOperationalHealth";
import { useProcessosPageState } from "./useProcessosPageState";
import { useProcessosPersistence } from "./useProcessosPersistence";
import { useProcessosRecurringSelection } from "./useProcessosRecurringSelection";
import { useProcessosRelationActions } from "./useProcessosRelationActions";
import { useProcessosSelectionHelpers } from "./useProcessosSelectionHelpers";
import { useProcessosUiPersistence } from "./useProcessosUiPersistence";

export default function ProcessosScreen() {
  return <RequireAdmin>{(profile) => <InternoLayout profile={profile} title="Gestao de Processos" description="Gestao da carteira processual com acompanhamento, relacionamento e atualizacao continua."><ProcessosContent /></InternoLayout>}</RequireAdmin>;
}

function ProcessosContent() {
  const { isLightTheme } = useInternalTheme();
  const state = useProcessosPageState();
  const adminFetch = useProcessosAdminFetch();
  useProcessosUiPersistence({ ...state });
  const fetchers = useProcessosFetchers({ adminFetch, ...state });
  useProcessosPersistence({ ...state });
  useProcessosOperationalHealth({ ...state });
  useProcessosBootstrap({ adminFetch, ...fetchers, ...state });
  useProcessosJobDrain({ adminFetch, ...fetchers, ...state });

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVisibility = () => state.setPageVisible(document.visibilityState !== "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [state.setPageVisible]);

  useEffect(() => {
    if (typeof window === "undefined" || state.copilotQueryAppliedRef.current) return;
    const url = new URL(window.location.href);
    const queryProcessNumbers = String(url.searchParams.get("processNumbers") || "").trim();
    const queryContext = parseCopilotContext(url.searchParams.get("copilotContext") || "");
    if (queryProcessNumbers) state.setProcessNumbers(queryProcessNumbers);
    if (queryContext) state.setCopilotContext(queryContext);
    state.copilotQueryAppliedRef.current = true;
  }, [state.copilotQueryAppliedRef, state.setCopilotContext, state.setProcessNumbers]);

  const selection = useProcessosSelectionHelpers({ processNumbers: state.processNumbers, queueBatchSizes: state.queueBatchSizes, setQueueBatchSizes: state.setQueueBatchSizes, selectionSets: [state.selectedWithoutMovements, state.selectedMovementBacklog, state.selectedPublicationBacklog, state.selectedPartesBacklog, state.selectedAudienciaCandidates, state.selectedMonitoringActive, state.selectedMonitoringInactive, state.selectedFieldGaps, state.selectedOrphans] });
  const actions = useProcessosActionHandlers({ ...fetchers, ...selection, adminFetch, activeJobId: state.activeJobId, limit: state.limit, processNumbers: state.processNumbers, setActionState: state.setActionState, setActiveJobId: state.setActiveJobId, setExecutionHistory: state.setExecutionHistory, setLastFocusHash: state.setLastFocusHash, setLimit: state.setLimit, setProcessNumbers: state.setProcessNumbers, setView: state.setView });

  const recurring = useProcessosRecurringSelection({ remoteHistory: state.remoteHistory, queueSets: [{ items: state.withoutMovements.items, setter: state.setSelectedWithoutMovements }, { items: state.movementBacklog.items, setter: state.setSelectedMovementBacklog }, { items: state.publicationBacklog.items, setter: state.setSelectedPublicationBacklog }, { items: state.partesBacklog.items, setter: state.setSelectedPartesBacklog }, { items: state.audienciaCandidates.items, setter: state.setSelectedAudienciaCandidates }, { items: state.monitoringActive.items, setter: state.setSelectedMonitoringActive }, { items: state.monitoringInactive.items, setter: state.setSelectedMonitoringInactive }, { items: state.fieldGaps.items, setter: state.setSelectedFieldGaps }, { items: state.orphans.items, setter: state.setSelectedOrphans }], getProcessSelectionValue, updateView: actions.updateView, setLimit: state.setLimit, clearSelectionSetters: [state.setSelectedWithoutMovements, state.setSelectedMovementBacklog, state.setSelectedPublicationBacklog, state.setSelectedPartesBacklog, state.setSelectedAudienciaCandidates, state.setSelectedMonitoringActive, state.setSelectedMonitoringInactive, state.setSelectedFieldGaps, state.setSelectedOrphans] });

  const relationActions = useProcessosRelationActions({ adminFetch, allMatchingRelationsSelected: state.allMatchingRelationsSelected, allMatchingSuggestionsSelected: state.allMatchingSuggestionsSelected, editingRelationId: state.editingRelationId, form: state.form, loadRelations: fetchers.loadRelations, loadRelationSuggestions: fetchers.loadRelationSuggestions, relationMinScore: state.relationMinScore, relationSuggestions: state.relationSuggestions, relations: state.relations, search: state.search, selectedRelations: state.selectedRelations, selectedSuggestionKeys: state.selectedSuggestionKeys, setActionState: state.setActionState, setAllMatchingRelationsSelected: state.setAllMatchingRelationsSelected, setAllMatchingSuggestionsSelected: state.setAllMatchingSuggestionsSelected, setEditingRelationId: state.setEditingRelationId, setForm: state.setForm, setRelationSelectionLoading: state.setRelationSelectionLoading, setSelectedRelations: state.setSelectedRelations, setSelectedSuggestionKeys: state.setSelectedSuggestionKeys, setSuggestionSelectionLoading: state.setSuggestionSelectionLoading });

  const derived = useProcessosDerivedState({ ...state, ...selection, ...actions, ...recurring, runnerMetrics: state.runnerMetrics, relations: state.relations, isLightTheme, actionState: state.actionState, backendHealth: state.backendHealth, drainInFlight: state.drainInFlight });
  const useCoverageProcess = (number) => selection.useCoverageProcess(number, state.setProcessNumbers, actions.updateView);
  const toggleCustomSelection = (setter, current, key) => setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const toggleCustomPageSelection = (setter, current, rows, getValue) => { const keys = rows.map((item) => getValue(item)).filter(Boolean); const allSelected = keys.length > 0 && keys.every((key) => current.includes(key)); setter(allSelected ? current.filter((item) => !keys.includes(item)) : [...new Set([...current, ...keys])]); };
  const getOperationalPlanStepState = (step, index) => state.actionState.loading && String(derived.latestHistory?.action || "") === String(step?.actionKey || "") ? { label: "em andamento", tone: "warning" } : derived.latestHistory?.status === "success" && String(derived.latestHistory?.action || "") === String(step?.actionKey || "") ? { label: "concluido", tone: "success" } : derived.latestHistory?.status === "error" && String(derived.latestHistory?.action || "") === String(step?.actionKey || "") ? { label: "falhou", tone: "danger" } : index === 0 ? { label: "agora", tone: "default" } : { label: "proximo", tone: "default" };
  const isSuggestedAction = (action, intent = "") => derived.selectionSuggestedAction?.key === action && String(derived.selectionSuggestedAction?.intent || "") === String(intent || "");

  return <ProcessosScreenView {...state} {...fetchers} {...selection} {...actions} {...derived} {...recurring} {...relationActions} isLightTheme={isLightTheme} RecurringProcessGroup={RecurringProcessGroup} CoverageList={CoverageList} QueueList={QueueList} QueueActionBlock={QueueActionBlock} RelationSelectionBar={RelationSelectionBar} RelationSuggestionCard={RelationSuggestionCard} RegisteredRelationCard={RegisteredRelationCard} HistoryCard={HistoryCard} JobCard={JobCard} OperationResult={OperationResult} EMPTY_FORM={EMPTY_FORM} getRelationSelectionValue={getRelationSelectionValue} getSuggestionSelectionValue={getSuggestionSelectionValue} getOperationalPlanStepState={getOperationalPlanStepState} runOperationalPlanStep={(step) => step && actions.updateView(step.targetView || "filas", step.targetHash || "filas")} isSuggestedAction={isSuggestedAction} useCoverageProcess={useCoverageProcess} toggleCustomSelection={toggleCustomSelection} toggleCustomPageSelection={toggleCustomPageSelection} buildDrainPreview={buildDrainPreview} />;
}
