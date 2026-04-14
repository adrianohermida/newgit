export function usePublicacoesQueueSelection({
  integratedQueue,
  integratedPage,
  integratedPageSize,
  pagedIntegratedRows,
  setIntegratedCursorTrail,
  setIntegratedPage,
  setSelectedIntegratedNumbers,
}) {
  function toggleSelection(setter, current, key) {
    setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function togglePageSelection(setter, current, rows, nextState, getSelectionValue) {
    const keys = rows.map((item) => getSelectionValue(item)).filter(Boolean);
    if (nextState) {
      setter([...new Set([...current, ...keys])]);
      return;
    }
    setter(current.filter((item) => !keys.includes(item)));
  }

  function toggleUnifiedRow(row) {
    const numero = row?.numero_cnj;
    if (!numero) return;
    setSelectedIntegratedNumbers((current) => current.includes(numero) ? current.filter((item) => item !== numero) : [...current, numero]);
  }

  function goToIntegratedPreviousPage() {
    setIntegratedPage((current) => Math.max(1, current - 1));
  }

  function goToIntegratedNextPage() {
    if (integratedQueue.mode === "snapshot") {
      if (!integratedQueue.hasMore || !integratedQueue.nextCursor) return;
      setIntegratedCursorTrail((current) => {
        const next = current.slice(0, integratedPage);
        next[integratedPage] = integratedQueue.nextCursor;
        return next;
      });
      setIntegratedPage((current) => current + 1);
      return;
    }
    const totalPages = Math.max(1, Math.ceil(Number(integratedQueue.totalRows || 0) / Math.max(1, integratedPageSize)));
    setIntegratedPage((current) => Math.min(totalPages, current + 1));
  }

  function toggleIntegratedPage(nextState) {
    const numbers = pagedIntegratedRows.map((row) => row.numero_cnj).filter(Boolean);
    if (nextState) {
      setSelectedIntegratedNumbers((current) => [...new Set([...current, ...numbers])]);
      return;
    }
    setSelectedIntegratedNumbers((current) => current.filter((item) => !numbers.includes(item)));
  }

  return {
    toggleSelection,
    togglePageSelection,
    toggleUnifiedRow,
    goToIntegratedPreviousPage,
    goToIntegratedNextPage,
    toggleIntegratedPage,
  };
}
