export function usePublicacoesParteActions({
  adminFetch,
  detailState,
  detailLinkType,
  selectedDetailPendingPartes,
  selectedDetailLinkedPartes,
  setActionState,
  setSelectedDetailPendingPartes,
  setSelectedDetailLinkedPartes,
  loadIntegratedDetail,
}) {
  function toggleDetailPendingParte(id) {
    setSelectedDetailPendingPartes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleDetailLinkedParte(id) {
    setSelectedDetailLinkedPartes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleDetailPendingPage(nextState) {
    const ids = (detailState?.data?.pendingPartes?.items || []).map((item) => item.id).filter(Boolean);
    setSelectedDetailPendingPartes(nextState ? ids : []);
  }

  function toggleDetailLinkedPage(nextState) {
    const ids = (detailState?.data?.linkedPartes?.items || []).map((item) => item.id).filter(Boolean);
    setSelectedDetailLinkedPartes(nextState ? ids : []);
  }

  async function runDetailParteAction(action, payload, successMessage) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const response = await adminFetch("/api/admin-hmadv-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      }, {
        action,
        component: "publicacoes-integrated-detail",
        label: successMessage,
        expectation: successMessage,
      });
      if (detailState?.row) await loadIntegratedDetail(detailState.row);
      setActionState({ loading: false, error: null, result: response.data || { ok: true } });
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao atualizar partes do detalhe.", result: null });
    }
  }

  async function linkPendingDetailPartes() {
    const contactId = detailState?.data?.contactDetail?.contact?.freshsales_contact_id || detailState?.data?.linkedPartes?.items?.find((item) => item?.contact?.freshsales_contact_id)?.contact?.freshsales_contact_id;
    if (!contactId || !selectedDetailPendingPartes.length) return;
    await runDetailParteAction("vincular_partes", { parteIds: selectedDetailPendingPartes, contactId, type: detailLinkType }, "Vincular partes pendentes ao contato do detalhe");
    setSelectedDetailPendingPartes([]);
  }

  async function moveLinkedDetailPartes() {
    const contactId = detailState?.data?.contactDetail?.contact?.freshsales_contact_id || detailState?.data?.linkedPartes?.items?.find((item) => item?.contact?.freshsales_contact_id)?.contact?.freshsales_contact_id;
    if (!contactId || !selectedDetailLinkedPartes.length) return;
    await runDetailParteAction("vincular_partes", { parteIds: selectedDetailLinkedPartes, contactId, type: detailLinkType }, "Mover partes vinculadas para o contato em foco");
    setSelectedDetailLinkedPartes([]);
  }

  async function reclassifyLinkedDetailPartes() {
    if (!selectedDetailLinkedPartes.length) return;
    await runDetailParteAction("reclassificar_partes", { parteIds: selectedDetailLinkedPartes, type: detailLinkType }, "Reclassificar tipo de contato das partes vinculadas");
    setSelectedDetailLinkedPartes([]);
  }

  async function unlinkLinkedDetailPartes() {
    if (!selectedDetailLinkedPartes.length) return;
    await runDetailParteAction("desvincular_partes", { parteIds: selectedDetailLinkedPartes }, "Desvincular partes do contato atual");
    setSelectedDetailLinkedPartes([]);
  }

  return {
    toggleDetailPendingParte,
    toggleDetailLinkedParte,
    toggleDetailPendingPage,
    toggleDetailLinkedPage,
    linkPendingDetailPartes,
    moveLinkedDetailPartes,
    reclassifyLinkedDetailPartes,
    unlinkLinkedDetailPartes,
  };
}
