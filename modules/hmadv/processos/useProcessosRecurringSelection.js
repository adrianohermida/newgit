import {
  derivePrimaryProcessAction,
  deriveRecurringProcessEntries,
  deriveRecurringProcessFocus,
  deriveSuggestedProcessActions,
  deriveSuggestedProcessBatch,
  deriveSuggestedProcessChecklist,
  groupRecurringProcessEntries,
  summarizeRecurrenceBands,
  summarizeRecurringProcessEntries,
} from "./recurrence";

function uniqueQueueRows(queueSets = []) {
  return queueSets.flat().filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index);
}

function applyRecurringSelection(recurringKeys, queueSets, getProcessSelectionValue) {
  return queueSets.map(({ items, setter }) => setter(items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item))));
}

export function useProcessosRecurringSelection({
  remoteHistory,
  queueSets,
  getProcessSelectionValue,
  updateView,
  setLimit,
  clearSelectionSetters,
}) {
  const recurringProcesses = deriveRecurringProcessEntries(remoteHistory);
  const recurringProcessSummary = summarizeRecurringProcessEntries(recurringProcesses);
  const recurringProcessBands = summarizeRecurrenceBands(recurringProcesses);
  const recurringProcessGroups = groupRecurringProcessEntries(recurringProcesses);
  const recurringProcessFocus = deriveRecurringProcessFocus(recurringProcessSummary, recurringProcessBands);
  const recurringProcessBatch = deriveSuggestedProcessBatch(recurringProcessSummary, recurringProcessBands);
  const recurringProcessActions = deriveSuggestedProcessActions(recurringProcessSummary, recurringProcessBands);
  const recurringProcessChecklist = deriveSuggestedProcessChecklist(recurringProcessSummary, recurringProcessBands);
  const primaryProcessAction = derivePrimaryProcessAction(recurringProcessActions);
  const visibleRows = uniqueQueueRows(queueSets.map((queue) => queue.items));
  const visibleRecurringCount = visibleRows.filter((item) => recurringProcesses.some((recurring) => recurring.key === (item.numero_cnj || item.key))).length;
  const visibleSevereRecurringCount = visibleRows.filter((item) => recurringProcesses.some((recurring) => recurring.key === (item.numero_cnj || item.key) && recurring.hits >= 3)).length;

  function selectVisibleRecurringProcesses() {
    applyRecurringSelection(new Set(recurringProcesses.map((item) => item.key)), queueSets, getProcessSelectionValue);
    updateView("filas");
  }

  function selectVisibleSevereRecurringProcesses() {
    applyRecurringSelection(new Set(recurringProcesses.filter((item) => item.hits >= 3).map((item) => item.key)), queueSets, getProcessSelectionValue);
    updateView("filas");
  }

  function applySevereRecurringPreset() {
    setLimit(recurringProcessBatch.size);
    selectVisibleSevereRecurringProcesses();
  }

  function clearAllQueueSelections() {
    clearSelectionSetters.forEach((setter) => setter([]));
  }

  return {
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
  };
}
