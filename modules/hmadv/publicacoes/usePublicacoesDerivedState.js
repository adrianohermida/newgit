import { useMemo } from "react";
import {
  derivePrimaryPublicacoesAction,
  deriveRecurringPublicacoes,
  deriveRecurringPublicacoesFocus,
  deriveSuggestedPublicacoesActions,
  deriveSuggestedPublicacoesBatch,
  deriveSuggestedPublicacoesChecklist,
  groupRecurringPublicacoes,
  summarizeRecurrenceBands,
  summarizeRecurringPublicacoes,
} from "./recurrence";

export function usePublicacoesDerivedState({
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
}) {
  return useMemo(() => {
    const recurringPublicacoes = deriveRecurringPublicacoes(remoteHistory);
    const recurringPublicacoesSummary = summarizeRecurringPublicacoes(recurringPublicacoes);
    const recurringPublicacoesBands = summarizeRecurrenceBands(recurringPublicacoes);
    const recurringPublicacoesGroups = groupRecurringPublicacoes(recurringPublicacoes);
    const recurringPublicacoesFocus = deriveRecurringPublicacoesFocus(recurringPublicacoesSummary, recurringPublicacoesBands);
    const recurringPublicacoesBatch = deriveSuggestedPublicacoesBatch(recurringPublicacoesSummary, recurringPublicacoesBands);
    const recurringPublicacoesActions = deriveSuggestedPublicacoesActions(recurringPublicacoesSummary, recurringPublicacoesBands);
    const recurringPublicacoesChecklist = deriveSuggestedPublicacoesChecklist(recurringPublicacoesSummary, recurringPublicacoesBands);
    const queueDiagnostics = [
      processCandidates.error ? {
        key: "processos",
        title: "Fila de processos criaveis",
        message: processCandidates.error,
        target: { view: "filas", hash: "publicacoes-fila-processos-criaveis" },
      } : null,
      partesCandidates.error ? {
        key: "partes",
        title: "Fila de partes extraiveis",
        message: partesCandidates.error,
        target: { view: "filas", hash: "publicacoes-fila-partes-extraiveis" },
      } : null,
      integratedQueue.error ? {
        key: "mesa",
        title: "Mesa integrada",
        message: integratedQueue.error,
        target: { view: "filas", hash: "publicacoes-mesa-integrada" },
      } : null,
    ].filter(Boolean);
    const visibleItems = [...processCandidates.items, ...partesCandidates.items]
      .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index);
    const visibleRecurringCount = visibleItems
      .filter((item) => recurringPublicacoes.some((recurring) => recurring.key === (item.numero_cnj || item.key))).length;
    const visibleSevereRecurringCount = visibleItems
      .filter((item) => recurringPublicacoes.some((recurring) => recurring.key === (item.numero_cnj || item.key) && recurring.hits >= 3)).length;
    const selectedVisibleSevereRecurringCount = visibleItems
      .filter((item) => recurringPublicacoes.some((recurring) => recurring.key === (item.numero_cnj || item.key) && recurring.hits >= 3))
      .filter((item) => selectedProcessKeys.includes(item.numero_cnj || item.key) || selectedPartesKeys.includes(item.numero_cnj || item.key))
      .length;
    const primaryPublicacoesAction = derivePrimaryPublicacoesAction(recurringPublicacoesActions);
    const partesBacklogCount = Number(partesCandidates.totalRows || partesCandidates.items.length || 0);
    const syncWorkerShouldFocusCrm = Number(data.publicacoesPendentesComAccount || 0) > 0;
    const selectedUnifiedCount = selectedIntegratedNumbers.length;
    const allIntegratedPageSelected = pagedIntegratedRows.length > 0 && pagedIntegratedRows.every((row) => row.selected);
    const allIntegratedFilteredSelected = filteredIntegratedRows.length > 0 && filteredIntegratedRows.every((row) => selectedIntegratedNumbers.includes(row.numero_cnj));
    const integratedCanGoPrevious = integratedPage > 1;
    const integratedCanGoNext = integratedQueue.mode === "snapshot"
      ? Boolean(integratedQueue.hasMore && integratedQueue.nextCursor)
      : integratedPage < Math.max(1, Math.ceil(Number(integratedQueue.totalRows || 0) / Math.max(1, integratedPageSize)));
    const integratedSourceLabel = integratedQueue.source === "snapshot"
      ? "snapshot"
      : integratedQueue.source === "legacy"
        ? "fallback"
        : integratedQueue.source || "live";
    const priorityBatchReady = visibleSevereRecurringCount > 0 && selectedVisibleSevereRecurringCount >= visibleSevereRecurringCount && limit === recurringPublicacoesBatch.size;

    return {
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
    };
  }, [
    data.publicacoesPendentesComAccount,
    filteredIntegratedRows,
    integratedPage,
    integratedPageSize,
    integratedQueue,
    limit,
    pagedIntegratedRows,
    partesCandidates,
    processCandidates,
    remoteHistory,
    selectedIntegratedNumbers,
    selectedPartesKeys,
    selectedProcessKeys,
  ]);
}
