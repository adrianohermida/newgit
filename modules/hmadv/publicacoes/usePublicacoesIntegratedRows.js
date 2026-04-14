import { useMemo } from "react";

import { matchesPublicacaoSelection } from "./publicacoesFormatting";

export function usePublicacoesIntegratedRows(params) {
  const { integratedFilters, integratedQueue, processCandidates, selectedIntegratedNumbers, selectedProcessKeys, validationMap } = params;

  const integratedRows = useMemo(() => (integratedQueue.items || []).map((row) => ({
    ...row,
    validation: validationMap[row.numero_cnj] || { status: "", note: "", updatedAt: null },
  })), [integratedQueue.items, validationMap]);

  const filteredIntegratedRows = useMemo(() => {
    const sorted = integratedRows
      .filter((row) => integratedFilters.validation === "todos" || (row.validation?.status || "") === integratedFilters.validation)
      .slice();
    if (integratedFilters.sort === "cnj") return sorted.sort((a, b) => String(a.numero_cnj || "").localeCompare(String(b.numero_cnj || "")));
    if (integratedFilters.sort === "validacao_recente") return sorted.sort((a, b) => new Date(b.validation?.updatedAt || 0).getTime() - new Date(a.validation?.updatedAt || 0).getTime());
    if (integratedFilters.sort === "validado_por") return sorted.sort((a, b) => String(a.validation?.updatedBy || "").localeCompare(String(b.validation?.updatedBy || "")));
    return sorted.sort((a, b) => {
      const aCount = Number(a?.partes_novas || a?.partes_detectadas || a?.publicacoes || 0);
      const bCount = Number(b?.partes_novas || b?.partes_detectadas || b?.publicacoes || 0);
      if (bCount !== aCount) return bCount - aCount;
      return String(a.numero_cnj || "").localeCompare(String(b.numero_cnj || ""));
    });
  }, [integratedFilters.sort, integratedFilters.validation, integratedRows]);

  const pagedIntegratedRows = useMemo(() => filteredIntegratedRows.map((row) => ({
    ...row,
    selected: selectedIntegratedNumbers.includes(row.numero_cnj),
  })), [filteredIntegratedRows, selectedIntegratedNumbers]);

  const selectedProcessNumbers = useMemo(
    () => processCandidates.items.filter((item) => matchesPublicacaoSelection(item, selectedProcessKeys)).map((item) => item.numero_cnj).filter(Boolean),
    [processCandidates.items, selectedProcessKeys]
  );

  return {
    filteredIntegratedRows,
    integratedRows,
    pagedIntegratedRows,
    selectedProcessNumbers,
    selectedUnifiedNumbers: selectedIntegratedNumbers,
  };
}
