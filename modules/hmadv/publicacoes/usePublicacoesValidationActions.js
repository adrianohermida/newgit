export function usePublicacoesValidationActions({
  adminFetch,
  updateView,
  selectedUnifiedNumbers,
  setValidationMap,
  setActionState,
  queueAsyncAction,
}) {
  function applyValidationToNumbers(numbers, status, note = "") {
    if (!numbers.length) return Promise.resolve();
    return adminFetch("/api/admin-hmadv-publicacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "salvar_validacao",
        processNumbers: numbers.join("\n"),
        status,
        note,
      }),
    }, {
      action: "salvar_validacao",
      component: "publicacoes-validacao",
      label: `Salvar validacao (${status || "limpar"})`,
      expectation: "Persistir validacao operacional da mesa de publicacoes",
    }).then((payload) => {
      const validations = payload.data?.validations || {};
      setValidationMap((current) => ({ ...current, ...validations }));
      return payload.data || {};
    }).catch((error) => {
      setActionState({ loading: false, error: error.message || "Falha ao salvar validacao.", result: null });
      throw error;
    });
  }

  async function runBulkContactsReconcile(apply) {
    if (!selectedUnifiedNumbers.length) {
      setActionState({ loading: false, error: "Selecione ao menos um CNJ para reconciliar partes e contatos.", result: null });
      return;
    }
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    try {
      await queueAsyncAction("reconciliar_partes_contatos", apply, selectedUnifiedNumbers);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao reconciliar partes e contatos.", result: null });
    }
  }

  return {
    applyValidationToNumbers,
    runBulkContactsReconcile,
  };
}
