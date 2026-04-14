import { useMemo } from "react";
import { useProcessosNavigationState } from "./useProcessosNavigationState";

export function useProcessosUiPersistence(state) {
  const persistedUiState = useMemo(() => ({
    view: state.view, lastFocusHash: state.lastFocusHash, processNumbers: state.processNumbers, limit: state.limit, queueBatchSizes: state.queueBatchSizes, wmPage: state.wmPage, movPage: state.movPage, pubPage: state.pubPage, partesPage: state.partesPage, audPage: state.audPage, maPage: state.maPage, miPage: state.miPage, fgPage: state.fgPage, orphanPage: state.orphanPage, covPage: state.covPage, search: state.search, relationMinScore: state.relationMinScore, selectedWithoutMovements: state.selectedWithoutMovements, selectedMovementBacklog: state.selectedMovementBacklog, selectedPublicationBacklog: state.selectedPublicationBacklog, selectedPartesBacklog: state.selectedPartesBacklog, selectedAudienciaCandidates: state.selectedAudienciaCandidates, selectedMonitoringActive: state.selectedMonitoringActive, selectedMonitoringInactive: state.selectedMonitoringInactive, selectedFieldGaps: state.selectedFieldGaps, selectedOrphans: state.selectedOrphans, selectedRelations: state.selectedRelations, selectedSuggestionKeys: state.selectedSuggestionKeys,
  }), [state.view, state.lastFocusHash, state.processNumbers, state.limit, state.queueBatchSizes, state.wmPage, state.movPage, state.pubPage, state.partesPage, state.audPage, state.maPage, state.miPage, state.fgPage, state.orphanPage, state.covPage, state.search, state.relationMinScore, state.selectedWithoutMovements, state.selectedMovementBacklog, state.selectedPublicationBacklog, state.selectedPartesBacklog, state.selectedAudienciaCandidates, state.selectedMonitoringActive, state.selectedMonitoringInactive, state.selectedFieldGaps, state.selectedOrphans, state.selectedRelations, state.selectedSuggestionKeys]);

  const applySavedUiState = useMemo(() => (saved) => {
    if (saved.processNumbers) state.setProcessNumbers(String(saved.processNumbers));
    if (saved.limit) state.setLimit(Number(saved.limit) || 2);
    if (saved.queueBatchSizes && typeof saved.queueBatchSizes === "object") state.setQueueBatchSizes((current) => ({ ...current, ...saved.queueBatchSizes }));
    if (saved.wmPage) state.setWmPage(Math.max(1, Number(saved.wmPage) || 1));
    if (saved.movPage) state.setMovPage(Math.max(1, Number(saved.movPage) || 1));
    if (saved.pubPage) state.setPubPage(Math.max(1, Number(saved.pubPage) || 1));
    if (saved.partesPage) state.setPartesPage(Math.max(1, Number(saved.partesPage) || 1));
    if (saved.audPage) state.setAudPage(Math.max(1, Number(saved.audPage) || 1));
    if (saved.maPage) state.setMaPage(Math.max(1, Number(saved.maPage) || 1));
    if (saved.miPage) state.setMiPage(Math.max(1, Number(saved.miPage) || 1));
    if (saved.fgPage) state.setFgPage(Math.max(1, Number(saved.fgPage) || 1));
    if (saved.orphanPage) state.setOrphanPage(Math.max(1, Number(saved.orphanPage) || 1));
    if (saved.covPage) state.setCovPage(Math.max(1, Number(saved.covPage) || 1));
    if (saved.search) state.setSearch(String(saved.search));
    if (saved.relationMinScore) state.setRelationMinScore(String(saved.relationMinScore));
    if (Array.isArray(saved.selectedWithoutMovements)) state.setSelectedWithoutMovements(saved.selectedWithoutMovements);
    if (Array.isArray(saved.selectedMovementBacklog)) state.setSelectedMovementBacklog(saved.selectedMovementBacklog);
    if (Array.isArray(saved.selectedPublicationBacklog)) state.setSelectedPublicationBacklog(saved.selectedPublicationBacklog);
    if (Array.isArray(saved.selectedPartesBacklog)) state.setSelectedPartesBacklog(saved.selectedPartesBacklog);
    if (Array.isArray(saved.selectedAudienciaCandidates)) state.setSelectedAudienciaCandidates(saved.selectedAudienciaCandidates);
    if (Array.isArray(saved.selectedMonitoringActive)) state.setSelectedMonitoringActive(saved.selectedMonitoringActive);
    if (Array.isArray(saved.selectedMonitoringInactive)) state.setSelectedMonitoringInactive(saved.selectedMonitoringInactive);
    if (Array.isArray(saved.selectedFieldGaps)) state.setSelectedFieldGaps(saved.selectedFieldGaps);
    if (Array.isArray(saved.selectedOrphans)) state.setSelectedOrphans(saved.selectedOrphans);
    if (Array.isArray(saved.selectedRelations)) state.setSelectedRelations(saved.selectedRelations);
    if (Array.isArray(saved.selectedSuggestionKeys)) state.setSelectedSuggestionKeys(saved.selectedSuggestionKeys);
  }, []);

  useProcessosNavigationState({ view: state.view, lastFocusHash: state.lastFocusHash, setView: state.setView, setLastFocusHash: state.setLastFocusHash, applySavedState: applySavedUiState, persistedState: persistedUiState, setUiHydrated: state.setUiHydrated });
}
