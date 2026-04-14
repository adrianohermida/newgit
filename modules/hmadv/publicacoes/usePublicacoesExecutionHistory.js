import { persistHistoryEntries } from "./storage";

export function usePublicacoesExecutionHistory({
  processNumbers,
  limit,
  selectedProcessKeys,
  selectedPartesKeys,
  setExecutionHistory,
}) {
  function buildActionMeta(numbers = []) {
    const explicit = numbers.length ? numbers.join("\n") : String(processNumbers || "");
    return {
      limit,
      selectedCount: selectedProcessKeys.length + selectedPartesKeys.length,
      processNumbersPreview: explicit
        .split(/\r?\n|,|;/)
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 6)
        .join(", "),
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

  return {
    buildActionMeta,
    pushHistoryEntry,
    replaceHistoryEntry,
  };
}
