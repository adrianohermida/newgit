import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import { ActionButton, Field, Panel, SelectField } from "./ui-primitives";

export default function ProcessosRelacoesView(props) {
  const { isLightTheme } = useInternalTheme();
  const {
    editingRelationId, form, setForm, actionState, handleSaveRelation, EMPTY_FORM, setEditingRelationId,
    search, setSearch, relationMinScore, setRelationMinScore, lookup, lookupTerm, setLookupTerm,
    relations, relationSelectionLoading, allMatchingRelationsSelected, selectedRelations, relationTypeSummary,
    toggleCustomPageSelection, setSelectedRelations, loadRelations, handleBulkRelationStatus, handleBulkRelationRemoval,
    getRelationSelectionValue, toggleCustomSelection, startEditing, handleDeleteRelation,
    relationSuggestions, suggestionSelectionLoading, allMatchingSuggestionsSelected, selectedSuggestionKeys,
    toggleAllMatchingSuggestions, setSelectedSuggestionKeys, getSuggestionSelectionValue, loadRelationSuggestions,
    handleBulkSaveSuggestions, useSuggestionInForm, toggleAllMatchingRelations,
    RelationSelectionBar, RelationSuggestionCard, RegisteredRelationCard,
  } = props;

  return <div className="space-y-6" id="relacoes">
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel title="Vincular processos relacionados" eyebrow="Arvore processual">
        <div className="space-y-4">
          {editingRelationId ? <div className={`rounded-2xl border px-4 py-3 text-sm ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] bg-[rgba(76,57,26,0.22)]"}`}>Editando relacao existente. Salve novamente para atualizar o vinculo.</div> : null}
          <Field label="Processo principal / pai" value={form.numero_cnj_pai} onChange={(value) => setForm((current) => ({ ...current, numero_cnj_pai: value }))} placeholder="CNJ do processo principal" />
          <Field label="Processo relacionado / filho" value={form.numero_cnj_filho} onChange={(value) => setForm((current) => ({ ...current, numero_cnj_filho: value }))} placeholder="CNJ do apenso, incidente, recurso ou dependencia" />
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField label="Tipo de relacao" value={form.tipo_relacao} onChange={(value) => setForm((current) => ({ ...current, tipo_relacao: value }))} options={[{ value: "dependencia", label: "Dependencia" }, { value: "apenso", label: "Apenso" }, { value: "incidente", label: "Incidente" }, { value: "recurso", label: "Recurso" }]} />
            <SelectField label="Status" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }]} />
          </div>
          <label className="block">
            <span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Observacoes</span>
            <textarea value={form.observacoes} onChange={(e) => setForm((current) => ({ ...current, observacoes: e.target.value }))} rows={4} className={`w-full rounded-[22px] border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`} placeholder="Ex.: recurso distribuido por dependencia do principal." />
          </label>
          <div className="flex flex-wrap gap-3">
            <ActionButton tone="primary" onClick={handleSaveRelation} disabled={actionState.loading}>{editingRelationId ? "Atualizar relacao" : "Salvar relacao"}</ActionButton>
            <ActionButton onClick={() => { setForm(EMPTY_FORM); setEditingRelationId(null); }} disabled={actionState.loading}>{editingRelationId ? "Cancelar edicao" : "Limpar formulario"}</ActionButton>
          </div>
        </div>
      </Panel>
      <Panel title="Busca e enriquecimento" eyebrow="Publicacoes + semelhanca">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <Field label="Buscar por CNJ, titulo ou parte" value={search} onChange={setSearch} placeholder="Use um CNJ, nome de parte ou trecho do titulo" />
            <label className="block">
              <span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Confianca minima</span>
              <select value={relationMinScore} onChange={(e) => setRelationMinScore(e.target.value)} className={`w-full rounded-2xl border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`}>
                <option value="0.35">35%</option><option value="0.45">45%</option><option value="0.60">60%</option><option value="0.75">75%</option>
              </select>
            </label>
          </div>
          <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] opacity-75"}`}>
            <p className="font-semibold">Como as sugestoes sao montadas</p>
            <p className="mt-2 leading-6">A tela cruza CNJs citados nas publicacoes recentes com semelhanca entre titulo e polos do processo. O resultado vira uma fila priorizada para validacao humana e aprovacao em massa.</p>
          </div>
          <div className="space-y-3">
            <Field label="Busca rapida de processos" value={lookupTerm} onChange={setLookupTerm} placeholder="Digite o CNJ ou parte do titulo" />
            {lookup.loading ? <p className="text-sm opacity-60">Buscando processos...</p> : null}
            {!lookup.loading && !lookup.items.length && lookupTerm.trim() ? <p className="text-sm opacity-60">Nenhum processo encontrado para esse termo.</p> : null}
            <div className="space-y-3">
              {lookup.items.map((item) => <div key={item.id || item.numero_cnj} className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}><p className="font-semibold">{item.numero_cnj || "Sem CNJ"}</p><p className={`mt-1 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{item.titulo || "Sem titulo"}</p><div className={`mt-2 flex flex-wrap gap-3 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}><span>Status: {item.status_atual_processo || "sem_status"}</span>{item.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${item.account_id_freshsales}`} target="_blank" rel="noreferrer" className={`underline transition ${isLightTheme ? "hover:text-[#9a6d14]" : "hover:text-[#C5A059]"}`}>Account {item.account_id_freshsales}</a> : null}</div><div className="mt-3 flex flex-wrap gap-2"><ActionButton onClick={() => setForm((current) => ({ ...current, numero_cnj_pai: item.numero_cnj || current.numero_cnj_pai }))} className="px-3 py-2 text-xs">Usar como pai</ActionButton><ActionButton onClick={() => setForm((current) => ({ ...current, numero_cnj_filho: item.numero_cnj || current.numero_cnj_filho }))} className="px-3 py-2 text-xs">Usar como filho</ActionButton></div></div>)}
            </div>
          </div>
        </div>
      </Panel>
    </div>

    <Panel title="Sugestoes de associacao" eyebrow="Validacao em massa">
      <div className="space-y-4">
        <RelationSelectionBar title="Fila enriquecida por publicacoes" helper="Use a selecao multipla para validar varias associacoes de uma vez. O botao de todos do filtro considera as paginas seguintes." page={relationSuggestions.page} totalRows={relationSuggestions.totalRows} pageSize={relationSuggestions.pageSize} selectedCount={selectedSuggestionKeys.length} allMatchingSelected={allMatchingSuggestionsSelected} loading={relationSuggestions.loading || suggestionSelectionLoading} onTogglePage={() => toggleCustomPageSelection(setSelectedSuggestionKeys, selectedSuggestionKeys, relationSuggestions.items, getSuggestionSelectionValue)} onToggleAllMatching={toggleAllMatchingSuggestions} onPrevPage={() => loadRelationSuggestions(Math.max(1, relationSuggestions.page - 1), search, relationMinScore)} onNextPage={() => loadRelationSuggestions(relationSuggestions.page + 1, search, relationMinScore)} disablePrev={relationSuggestions.page <= 1} disableNext={relationSuggestions.page >= Math.max(1, Math.ceil(Number(relationSuggestions.totalRows || 0) / Math.max(1, relationSuggestions.pageSize || 20)))} />
        <div className="flex flex-wrap gap-3">
          <ActionButton tone="primary" onClick={handleBulkSaveSuggestions} disabled={actionState.loading || !selectedSuggestionKeys.length}>Validar selecionadas</ActionButton>
          <ActionButton onClick={() => setSelectedSuggestionKeys([])} disabled={actionState.loading || !selectedSuggestionKeys.length}>Limpar selecao</ActionButton>
        </div>
        {relationSuggestions.loading ? <p className="text-sm opacity-60">Carregando sugestoes...</p> : null}
        {relationSuggestions.error ? <p className={`text-sm ${isLightTheme ? "text-red-700" : "text-red-300"}`}>{relationSuggestions.error}</p> : null}
        {!relationSuggestions.loading && !relationSuggestions.items.length ? <p className={`rounded-2xl border border-dashed px-4 py-6 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#6b7280]" : "border-[#2D2E2E] opacity-60"}`}>Nenhuma sugestao encontrada para os filtros atuais.</p> : null}
        <div className="space-y-4">{relationSuggestions.items.map((item) => <RelationSuggestionCard key={item.suggestion_key} item={item} checked={selectedSuggestionKeys.includes(getSuggestionSelectionValue(item))} onToggle={() => toggleCustomSelection(setSelectedSuggestionKeys, selectedSuggestionKeys, getSuggestionSelectionValue(item))} onUseSuggestion={useSuggestionInForm} />)}</div>
      </div>
    </Panel>

    <Panel title="Relacoes processuais cadastradas" eyebrow="Lista paginada">
      <div className="space-y-4">
        {relations.items.length ? <div className={`flex flex-wrap gap-2 text-xs uppercase tracking-[0.15em] ${isLightTheme ? "text-[#6b7280]" : "opacity-70"}`}>{Object.entries(relationTypeSummary).map(([key, value]) => <span key={key} className={`border px-2 py-1 ${isLightTheme ? "border-[#d7d4cb] bg-white" : "border-[#2D2E2E]"}`}>{key}: {value}</span>)}</div> : null}
        <RelationSelectionBar title="Cadastro de relacoes" helper="Voce pode ativar, inativar ou remover varias relacoes de uma vez, com paginacao e selecao global por filtro." page={relations.page} totalRows={relations.totalRows} pageSize={relations.pageSize} selectedCount={selectedRelations.length} allMatchingSelected={allMatchingRelationsSelected} loading={relations.loading || relationSelectionLoading} onTogglePage={() => toggleCustomPageSelection(setSelectedRelations, selectedRelations, relations.items, getRelationSelectionValue)} onToggleAllMatching={toggleAllMatchingRelations} onPrevPage={() => loadRelations(Math.max(1, relations.page - 1), search)} onNextPage={() => loadRelations(relations.page + 1, search)} disablePrev={relations.page <= 1} disableNext={relations.page >= Math.max(1, Math.ceil(Number(relations.totalRows || 0) / Math.max(1, relations.pageSize || 20)))} />
        <div className="flex flex-wrap gap-3">
          <ActionButton tone="primary" onClick={() => handleBulkRelationStatus("ativo")} disabled={actionState.loading || !selectedRelations.length}>Ativar selecionadas</ActionButton>
          <ActionButton onClick={() => handleBulkRelationStatus("inativo")} disabled={actionState.loading || !selectedRelations.length}>Inativar selecionadas</ActionButton>
          <ActionButton tone="danger" onClick={handleBulkRelationRemoval} disabled={actionState.loading || !selectedRelations.length}>Remover selecionadas</ActionButton>
        </div>
        {relations.loading ? <p className="text-sm opacity-60">Carregando relacoes...</p> : null}
        {relations.error ? <p className={`text-sm ${isLightTheme ? "text-red-700" : "text-red-300"}`}>{relations.error}</p> : null}
        {!relations.loading && !relations.items.length ? <p className={`rounded-2xl border border-dashed px-4 py-6 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#6b7280]" : "border-[#2D2E2E] opacity-60"}`}>Nenhuma relacao cadastrada ainda.</p> : null}
        <div className="space-y-4">{relations.items.map((item) => <RegisteredRelationCard key={item.id} item={item} checked={selectedRelations.includes(getRelationSelectionValue(item))} onToggle={() => toggleCustomSelection(setSelectedRelations, selectedRelations, getRelationSelectionValue(item))} onEdit={startEditing} onDelete={handleDeleteRelation} disabled={actionState.loading} />)}</div>
      </div>
    </Panel>
  </div>;
}
