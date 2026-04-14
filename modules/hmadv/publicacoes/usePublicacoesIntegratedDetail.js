export function usePublicacoesIntegratedDetail({
  adminFetch,
  detailState,
  detailEditForm,
  applyValidationToNumbers,
  setValidationMap,
  setActionState,
  setDetailState,
  setDetailEditForm,
}) {
  async function loadIntegratedDetail(row) {
    if (!row?.numero_cnj) return;
    setDetailState({ loading: true, error: null, row, data: null });
    try {
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=detalhe_integrado&numero_cnj=${encodeURIComponent(row.numero_cnj)}`, {}, {
        action: "detalhe_integrado",
        component: "publicacoes-integrated-detail",
        label: `Carregar detalhe integrado de ${row.numero_cnj}`,
        expectation: "Trazer processo, partes e contato no mesmo payload",
      });
      const nextData = payload.data || null;
      if (row?.numero_cnj && nextData?.validation) {
        setValidationMap((current) => ({ ...current, [row.numero_cnj]: nextData.validation }));
      }
      setDetailState({ loading: false, error: null, row, data: nextData });
      const linkedItems = nextData?.linkedPartes?.items || [];
      const contact = nextData.contactDetail?.contact || linkedItems.find((item) => item?.contact)?.contact || null;
      setDetailEditForm({
        name: contact?.name || "",
        email: contact?.email || "",
        phone: contact?.phone || "",
        note: row?.validation?.note || "",
      });
    } catch (error) {
      setDetailState({ loading: false, error: error.message || "Falha ao carregar detalhe integrado.", row, data: null });
    }
  }

  async function saveDetailContact() {
    const contactId = detailState?.data?.contactDetail?.contact?.freshsales_contact_id || detailState?.data?.linkedPartes?.items?.find((item) => item?.contact?.freshsales_contact_id)?.contact?.freshsales_contact_id;
    if (!contactId) {
      setActionState({ loading: false, error: "Nao existe contato vinculado para edicao simples neste item.", result: null });
      return;
    }
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_contact",
          contactId,
          name: detailEditForm.name,
          email: detailEditForm.email,
          phone: detailEditForm.phone,
        }),
      }, {
        action: "update_contact",
        component: "publicacoes-integrated-detail",
        label: `Atualizar contato ${contactId} pela mesa de publicacoes`,
        expectation: "Salvar edicao simples do contato relacionado ao processo",
      });
      if (detailState?.row?.numero_cnj) {
        await applyValidationToNumbers([detailState.row.numero_cnj], detailState.row.validation?.status || "", detailEditForm.note || "");
        await loadIntegratedDetail(detailState.row);
      }
      setActionState({ loading: false, error: null, result: payload.data || { ok: true } });
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao salvar contato.", result: null });
    }
  }

  return {
    loadIntegratedDetail,
    saveDetailContact,
  };
}
