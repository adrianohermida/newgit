import { persistHistoryEntries } from "./storage";

export function usePublicacoesUiActions({
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
}) {
  function updateView(nextView, nextHash = nextView) {
    setView(nextView);
    setLastFocusHash(nextHash || nextView);
    logUiEvent(`Alternar view para ${nextView}`, "alterar_view_publicacoes", { view: nextView }, { component: "publicacoes-navigation" });
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    url.hash = nextHash || nextView;
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function selectRecurringByPredicate(predicate, logLabel, logAction) {
    const recurringKeys = new Set(recurringPublicacoes.filter(predicate).map((item) => item.key));
    const selectedProcessos = processCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key));
    const selectedPartes = partesCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key));
    const selectedIntegrado = filteredIntegratedRows.filter((item) => recurringKeys.has(item.numero_cnj || item.key));
    setSelectedProcessKeys(selectedProcessos.map((item) => getPublicacaoSelectionValue(item)).filter(Boolean));
    setSelectedPartesKeys(selectedPartes.map((item) => getPublicacaoSelectionValue(item)).filter(Boolean));
    setSelectedIntegratedNumbers(selectedIntegrado.map((item) => item.numero_cnj).filter(Boolean));
    logUiEvent(logLabel, logAction, {
      selectedProcessos: selectedProcessos.length,
      selectedPartes: selectedPartes.length,
      selectedIntegrado: selectedIntegrado.length,
    }, { component: "publicacoes-recorrencia" });
    updateView("filas");
  }

  function selectVisibleRecurringPublicacoes() {
    selectRecurringByPredicate(() => true, "Selecionar reincidentes visiveis", "selecionar_reincidentes_publicacoes");
  }

  function selectVisibleSevereRecurringPublicacoes() {
    selectRecurringByPredicate((item) => item.hits >= 3, "Selecionar reincidentes severos", "selecionar_reincidentes_severos_publicacoes");
  }

  function applySevereRecurringPreset() {
    setLimit(recurringPublicacoesBatch.size);
    logUiEvent("Aplicar lote prioritario", "aplicar_preset_publicacoes", {
      limit: recurringPublicacoesBatch.size,
      recurringSummary: recurringPublicacoesSummary,
    }, { component: "publicacoes-recorrencia" });
    selectVisibleSevereRecurringPublicacoes();
  }

  function clearQueueSelections() {
    setSelectedProcessKeys([]);
    setSelectedPartesKeys([]);
    setSelectedIntegratedNumbers([]);
    logUiEvent("Limpar selecoes de filas", "limpar_selecoes_publicacoes", {
      selectedProcessos: 0,
      selectedPartes: 0,
      selectedIntegrado: 0,
    }, { component: "publicacoes-filas" });
  }

  function reuseHistoryEntry(entry) {
    if (entry?.payload?.processNumbers) setProcessNumbers(entry.payload.processNumbers);
    if (entry?.payload?.limit) setLimit(Number(entry.payload.limit) || 10);
    logUiEvent("Reusar parametros do historico", "reusar_historico_publicacoes", {
      action: entry?.action || "",
      limit: entry?.payload?.limit || null,
    }, { component: "publicacoes-history" });
    updateView("operacao");
  }

  function clearHistory() {
    setExecutionHistory([]);
    persistHistoryEntries([]);
  }

  return {
    applySevereRecurringPreset,
    clearHistory,
    clearQueueSelections,
    reuseHistoryEntry,
    selectVisibleRecurringPublicacoes,
    selectVisibleSevereRecurringPublicacoes,
    updateView,
  };
}
