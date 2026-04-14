import { EMPTY_FORM } from "./constants";
import { getRelationSelectionValue, getSuggestionSelectionValue } from "./processos-screen-utils";

export function useProcessosRelationActions({
  adminFetch,
  allMatchingRelationsSelected,
  allMatchingSuggestionsSelected,
  editingRelationId,
  form,
  loadRelations,
  loadRelationSuggestions,
  relationMinScore,
  relationSuggestions,
  relations,
  search,
  selectedRelations,
  selectedSuggestionKeys,
  setActionState,
  setAllMatchingRelationsSelected,
  setAllMatchingSuggestionsSelected,
  setEditingRelationId,
  setForm,
  setRelationSelectionLoading,
  setSelectedRelations,
  setSelectedSuggestionKeys,
  setSuggestionSelectionLoading,
}) {
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
    if (!(allMatchingRelationsSelected || selectedRelations.length > relations.items.length)) return relations.items.filter((item) => selectedRelations.includes(getRelationSelectionValue(item)));
    const payload = await adminFetch(`/api/admin-hmadv-processos?action=relacoes&page=1&pageSize=500&query=${encodeURIComponent(search || "")}`);
    return (payload.data.items || []).filter((item) => selectedRelations.includes(getRelationSelectionValue(item)));
  }

  async function loadSelectedSuggestionItems() {
    if (!(allMatchingSuggestionsSelected || selectedSuggestionKeys.length > relationSuggestions.items.length)) return relationSuggestions.items.filter((item) => selectedSuggestionKeys.includes(getSuggestionSelectionValue(item)));
    const payload = await adminFetch(`/api/admin-hmadv-processos?action=sugestoes_relacoes&page=1&pageSize=500&query=${encodeURIComponent(search || "")}&minScore=${encodeURIComponent(relationMinScore || "0.45")}`);
    return (payload.data.items || []).filter((item) => selectedSuggestionKeys.includes(getSuggestionSelectionValue(item)));
  }

  async function handleSaveRelation() {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "salvar_relacao", id: editingRelationId, ...form }) });
      setActionState({ loading: false, error: null, result: payload.data });
      setForm(EMPTY_FORM);
      setEditingRelationId(null);
      await Promise.all([loadRelations(relations.page, search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao salvar relacao.", result: null });
    }
  }

  async function handleDeleteRelation(id) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remover_relacao", id }) });
      setActionState({ loading: false, error: null, result: payload.data });
      await Promise.all([loadRelations(relations.page, search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao remover relacao.", result: null });
    }
  }

  async function handleBulkRelationStatus(nextStatus) {
    if (!selectedRelations.length) return;
    setActionState({ loading: true, error: null, result: null });
    try {
      const relationIds = (await loadSelectedRelationItems()).map((item) => item.id).filter(Boolean);
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk_relacoes", ids: relationIds, status: nextStatus }) });
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
      const relationIds = (await loadSelectedRelationItems()).map((item) => item.id).filter(Boolean);
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk_relacoes", ids: relationIds, remove: true }) });
      setActionState({ loading: false, error: null, result: payload.data });
      setSelectedRelations([]);
      await Promise.all([loadRelations(Math.max(1, relations.page), search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha na remocao em massa.", result: null });
    }
  }

  function useSuggestionInForm(item) {
    setForm({ numero_cnj_pai: item.numero_cnj_pai || "", numero_cnj_filho: item.numero_cnj_filho || "", tipo_relacao: item.tipo_relacao || "dependencia", status: item.status || "ativo", observacoes: item.evidence?.trecho ? `Sugerido a partir de publicacao: ${item.evidence.trecho}` : "" });
  }

  function startEditing(item) {
    setEditingRelationId(item.id);
    setForm({ numero_cnj_pai: item.numero_cnj_pai || "", numero_cnj_filho: item.numero_cnj_filho || "", tipo_relacao: item.tipo_relacao || "dependencia", status: item.status || "ativo", observacoes: item.observacoes || "" });
  }

  async function handleBulkSaveSuggestions() {
    if (!selectedSuggestionKeys.length) return;
    setActionState({ loading: true, error: null, result: null });
    try {
      const items = (await loadSelectedSuggestionItems()).map((item) => ({ numero_cnj_pai: item.numero_cnj_pai, numero_cnj_filho: item.numero_cnj_filho, tipo_relacao: item.tipo_relacao, status: item.status || "ativo", score: item.score, observacoes: item.evidence?.trecho ? `Sugestao validada em massa. Evidencia: ${item.evidence.trecho}` : "" }));
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk_salvar_relacoes", items }) });
      setActionState({ loading: false, error: null, result: payload.data });
      setSelectedSuggestionKeys([]);
      await Promise.all([loadRelations(1, search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao validar sugestoes em massa.", result: null });
    }
  }

  return { handleBulkRelationRemoval, handleBulkRelationStatus, handleBulkSaveSuggestions, handleDeleteRelation, handleSaveRelation, startEditing, toggleAllMatchingRelations, toggleAllMatchingSuggestions, useSuggestionInForm };
}
