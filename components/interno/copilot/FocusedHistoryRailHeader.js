export default function FocusedHistoryRailHeader(props) {
  const {
    conversationSearch,
    conversationSearchInputRef,
    conversationSort,
    isLightTheme,
    projectInsights,
    selectedProjectFilter,
    setConversationSearch,
    setConversationSort,
    setSelectedProjectFilter,
    showArchived,
    setShowArchived,
    activeProjectLabel,
    filteredConversations,
    onCreateConversation,
  } = props;

  return (
    <div className={`border-b px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Histórico</p>
          <p className={`mt-1 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Conversas e projetos</p>
          <p className={`mt-1 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Histórico, busca e retomada de contexto.</p>
        </div>
        <button type="button" onClick={onCreateConversation} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Nova</button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Buscar conversa</p>
        <input ref={conversationSearchInputRef} value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} placeholder="Buscar conversa, projeto ou contexto" className={`h-11 w-full rounded-[18px] border px-4 text-sm outline-none transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#152421] placeholder:text-[#7B8B98] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[rgba(7,9,8,0.98)] text-[#F5F1E8] placeholder:text-[#60706A] focus:border-[#C5A059]"}`} />
        <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
          <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>projetos {projectInsights.length}</span>
          <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>conversas {filteredConversations.length}</span>
          <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB]"}`}>foco {activeProjectLabel}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <select value={conversationSort} onChange={(event) => setConversationSort(event.target.value)} className={`rounded-xl border px-2 py-1 text-xs outline-none transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[#181B19] text-[#C5A059] focus:border-[#C5A059]"}`}>
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
            <option value="title">Título (A-Z)</option>
          </select>
          <select value={selectedProjectFilter} onChange={(event) => setSelectedProjectFilter(event.target.value)} className={`rounded-xl border px-2 py-1 text-xs outline-none transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] focus:border-[#9A6E2D]" : "border-[#22342F] bg-[#181B19] text-[#C5A059] focus:border-[#C5A059]"}`}>
            <option value="all">Todos os projetos</option>
            {projectInsights.map((project) => <option key={project.key} value={project.key}>{project.label}</option>)}
          </select>
          <label className={`flex cursor-pointer items-center gap-1 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#C5A059]"}`}>
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="accent-[#C5A059]" />
            Arquivadas
          </label>
        </div>
      </div>
    </div>
  );
}
