import { useCallback } from "react";
import { DEFAULT_QUEUE_BATCHES } from "./constants";
import { getProcessSelectionValue, uniqueProcessNumbers } from "./processos-screen-utils";

export function useProcessosSelectionHelpers({
  processNumbers,
  queueBatchSizes,
  setQueueBatchSizes,
  selectionSets,
}) {
  const toggleSelection = useCallback((setter, current, key) => {
    setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }, []);

  const togglePageSelection = useCallback((setter, current, rows, nextState) => {
    const keys = rows.map((item) => getProcessSelectionValue(item)).filter(Boolean);
    if (nextState) {
      setter([...new Set([...current, ...keys])]);
      return;
    }
    setter(current.filter((item) => !keys.includes(item)));
  }, []);

  const getSelectedNumbers = useCallback((rows, selected) => {
    const visible = rows.map((item) => getProcessSelectionValue(item)).filter(Boolean);
    const selectedSet = new Set(selected.map((item) => String(item || "").trim()).filter(Boolean));
    return [...new Set([...visible.filter((item) => selectedSet.has(item)), ...selectedSet])];
  }, []);

  const getCombinedSelectedNumbers = useCallback(
    () => [...new Set(selectionSets.flatMap((items) => items || []))],
    [selectionSets]
  );

  const resolveActionProcessNumbers = useCallback((preferredNumbers = "") => {
    const explicit = String(preferredNumbers || "").trim();
    return explicit || String(processNumbers || "").trim();
  }, [processNumbers]);

  const useCoverageProcess = useCallback((number, setProcessNumbers, updateView) => {
    if (!number) return;
    const next = uniqueProcessNumbers([...getCombinedSelectedNumbers(), String(number || "").trim()]);
    setProcessNumbers(next.join("\n"));
    updateView("operacao");
  }, [getCombinedSelectedNumbers]);

  const getQueueBatchSize = useCallback((queueKey) => {
    const requested = Number(queueBatchSizes?.[queueKey] || DEFAULT_QUEUE_BATCHES[queueKey] || 1);
    return Math.max(1, Math.min(requested, 30));
  }, [queueBatchSizes]);

  const updateQueueBatchSize = useCallback((queueKey, rawValue) => {
    const nextValue = Math.max(1, Math.min(Number(rawValue || 1), 30));
    setQueueBatchSizes((current) => ({ ...current, [queueKey]: nextValue }));
  }, [setQueueBatchSizes]);

  return {
    getCombinedSelectedNumbers,
    getQueueBatchSize,
    getSelectedNumbers,
    resolveActionProcessNumbers,
    togglePageSelection,
    toggleSelection,
    updateQueueBatchSize,
    useCoverageProcess,
  };
}
