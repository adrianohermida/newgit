import { HealthBadge } from "./ui-primitives";

export function PublicacoesIntegratedToolbar(props) {
  const {
    actionState,
    allIntegratedFilteredSelected,
    applyValidationToNumbers,
    bulkValidationNote,
    bulkValidationStatus,
    canManuallyDrainActiveJob,
    clearQueueSelections,
    drainInFlight,
    filteredCount,
    handleAction,
    hasBlockingJob,
    integratedFilters,
    integratedQueue,
    integratedSourceLabel,
    loadHeavyQueueReads,
    noPublicationActivityTypeConfigured,
    publicationActivityTypeHint,
    refreshIntegratedSnapshot,
    runBulkContactsReconcile,
    runPendingJobsNow,
    selectedUnifiedCount,
    selectedUnifiedNumbers,
    setBulkValidationNote,
    setBulkValidationStatus,
    setIntegratedFilters,
    toggleIntegratedFiltered,
  } = props;

  const updateFilter = (field) => (event) => {
    const value = event.target.value;
    setIntegratedFilters((state) => ({ ...state, [field]: value }));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-xs uppercase tracking-[0.14em] opacity-60">Buscar por CNJ, titulo ou parte<input value={integratedFilters.query} onChange={updateFilter("query")} className="mt-2 w-full border border-[#2D2E2E] bg-transparent px-3 py-2 text-sm text-[#F4F1EA]" placeholder="0004600-54.2009..." /></label>
        <label className="text-xs uppercase tracking-[0.14em] opacity-60">Origem<select value={integratedFilters.source} onChange={updateFilter("source")} className="mt-2 w-full border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm text-[#F4F1EA]"><option value="todos">Todos</option><option value="processos">Criacao de processo</option><option value="partes">Enriquecimento de partes</option></select></label>
        <label className="text-xs uppercase tracking-[0.14em] opacity-60">Validacao<select value={integratedFilters.validation} onChange={updateFilter("validation")} className="mt-2 w-full border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm text-[#F4F1EA]"><option value="todos">Todos</option><option value="validado">Validado</option><option value="revisar">Revisar</option><option value="bloqueado">Bloqueado</option><option value="">Sem validacao</option></select></label>
        <label className="text-xs uppercase tracking-[0.14em] opacity-60">Ordenacao<select value={integratedFilters.sort} onChange={updateFilter("sort")} className="mt-2 w-full border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm text-[#F4F1EA]"><option value="pendencia">Maior pendencia</option><option value="validacao_recente">Validacao mais recente</option><option value="validado_por">Validado por</option><option value="cnj">CNJ</option></select></label>
      </div>
      <div className="rounded-[20px] border border-[#2D2E2E] bg-[rgba(255,255,255,0.02)] p-4">
        <div className="flex flex-wrap items-center gap-2"><HealthBadge label={`${selectedUnifiedCount} selecionado(s)`} tone="default" /><HealthBadge label={`${selectedUnifiedNumbers.length} CNJ(s) unicos`} tone="default" /><HealthBadge label={`${filteredCount} filtrado(s)`} tone="warning" />{integratedQueue.limited ? <HealthBadge label="leitura parcial protegida" tone="warning" /> : null}<HealthBadge label={integratedQueue.mode === "snapshot" ? "cursor seguro" : "fallback legado"} tone={integratedQueue.mode === "snapshot" ? "success" : "warning"} /><HealthBadge label={`origem ${integratedSourceLabel}`} tone="default" /><button type="button" onClick={() => toggleIntegratedFiltered(!allIntegratedFilteredSelected)} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">{allIntegratedFilteredSelected ? "Limpar filtrados" : "Selecionar filtrados"}</button></div>
        <div className="mt-4 grid gap-3 md:grid-cols-[0.9fr_1.1fr_auto_auto_auto_auto]"><label className="text-xs uppercase tracking-[0.14em] opacity-60">Validacao em massa<select value={bulkValidationStatus} onChange={(event) => setBulkValidationStatus(event.target.value)} className="mt-2 w-full border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm text-[#F4F1EA]"><option value="validado">Validado</option><option value="revisar">Revisar</option><option value="bloqueado">Bloqueado</option></select></label><label className="text-xs uppercase tracking-[0.14em] opacity-60">Observacao<input value={bulkValidationNote} onChange={(event) => setBulkValidationNote(event.target.value)} className="mt-2 w-full border border-[#2D2E2E] bg-transparent px-3 py-2 text-sm text-[#F4F1EA]" placeholder="Motivo, proximo passo, responsavel..." /></label><button type="button" onClick={() => applyValidationToNumbers(selectedUnifiedNumbers, bulkValidationStatus, bulkValidationNote)} disabled={!selectedUnifiedNumbers.length} className="self-end border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-40">Validar lote</button><button type="button" onClick={() => runBulkContactsReconcile(false)} disabled={actionState.loading || !selectedUnifiedNumbers.length} className="self-end border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-40">Simular contatos</button><button type="button" onClick={() => runBulkContactsReconcile(true)} disabled={actionState.loading || !selectedUnifiedNumbers.length} className="self-end border border-[#6E5630] px-3 py-2 text-xs text-[#F8E7B5] disabled:opacity-40">Aplicar contatos</button><button type="button" onClick={clearQueueSelections} className="self-end border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">Limpar selecao</button></div>
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => loadHeavyQueueReads("mesa")} disabled={actionState.loading} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-40">Carregar mesa manualmente</button><button type="button" onClick={() => handleAction("orquestrar_drenagem_publicacoes", true, selectedUnifiedNumbers)} disabled={actionState.loading || hasBlockingJob} className="border border-[#30543A] px-3 py-2 text-xs text-[#B7F7C6] disabled:opacity-40">Orquestrar drenagem</button><button type="button" onClick={() => handleAction("criar_processos_publicacoes", true, selectedUnifiedNumbers)} disabled={actionState.loading || hasBlockingJob || !selectedUnifiedNumbers.length} className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40">Criar processos</button><button type="button" onClick={() => handleAction("sincronizar_publicacoes_activity", true, selectedUnifiedNumbers)} disabled={actionState.loading || hasBlockingJob || !selectedUnifiedNumbers.length || noPublicationActivityTypeConfigured} title={publicationActivityTypeHint || undefined} className="border border-[#6E5630] px-3 py-2 text-xs text-[#F8E7B5] disabled:opacity-40">Sincronizar publicacoes</button><button type="button" onClick={() => refreshIntegratedSnapshot(integratedFilters.source === "partes" ? "candidatos_partes" : "mesa_integrada")} disabled={actionState.loading || hasBlockingJob} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-40">Atualizar snapshot</button><button type="button" onClick={runPendingJobsNow} disabled={actionState.loading || drainInFlight || !canManuallyDrainActiveJob} className="border border-[#30543A] px-3 py-2 text-xs text-[#B7F7C6] disabled:opacity-40">{drainInFlight ? "Drenando..." : "Drenar fila"}</button><a href="/interno/processos" className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">Partes em processos</a></div>
      </div>
    </div>
  );
}
