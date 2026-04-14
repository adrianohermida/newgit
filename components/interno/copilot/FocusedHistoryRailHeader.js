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
    <div
      className={`border-b px-4 py-4 md:px-5 ${
        isLightTheme
          ? "border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))]"
          : "border-[#22342F] bg-[linear-gradient(180deg,rgba(12,15,14,0.96),rgba(8,10,9,0.98))]"
      }`}
    >
      <div
        className={`rounded-[24px] border px-4 py-4 transition-shadow duration-200 ${
          isLightTheme
            ? "border-[#E4EAF1] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.10),transparent_42%),#FFFFFF] hover:shadow-[0_14px_28px_rgba(148,163,184,0.10)]"
            : "border-[#253833] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.10),transparent_38%),rgba(255,255,255,0.02)] hover:shadow-[0_14px_28px_rgba(0,0,0,0.18)]"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-[10px] uppercase tracking-[0.24em] ${isLightTheme ? "text-[#9A6E2D]" : "text-[#C5A059]"}`}>Copilot</p>
            <p className={`mt-1 text-base font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Conversas</p>
            <p className={`mt-1 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Retomada rapida de contexto, projetos e threads operacionais.</p>
          </div>
          <button
            type="button"
            onClick={onCreateConversation}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-all duration-200 active:scale-[0.98] ${
              isLightTheme
                ? "border-[#D7DEE8] bg-white text-[#51606B] hover:-translate-y-[1px] hover:border-[#9A6E2D] hover:text-[#9A6E2D]"
                : "border-[#22342F] text-[#D8DEDA] hover:-translate-y-[1px] hover:border-[#C5A059] hover:text-[#C5A059]"
            }`}
          >
            Nova
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
          <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8EA] text-[#8A6217]" : "border-[#4B3F22] text-[#F1D39A]"}`}>copilot ativo</span>
          <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>projetos {projectInsights.length}</span>
          <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>threads {filteredConversations.length}</span>
          <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB]"}`}>foco {activeProjectLabel}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        <div className={`flex items-center gap-3 rounded-[18px] border px-3 transition-all duration-200 ${isLightTheme ? "border-[#D7DEE8] bg-white focus-within:border-[#9A6E2D] focus-within:shadow-[0_0_0_3px_rgba(197,160,89,0.10)]" : "border-[#22342F] bg-[rgba(7,9,8,0.98)] focus-within:border-[#C5A059] focus-within:shadow-[0_0_0_3px_rgba(197,160,89,0.10)]"}`}>
          <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={conversationSearchInputRef}
            value={conversationSearch}
            onChange={(event) => setConversationSearch(event.target.value)}
            placeholder="Buscar conversa, projeto ou contexto"
            className={`h-11 w-full bg-transparent text-sm outline-none ${isLightTheme ? "text-[#152421] placeholder:text-[#7B8B98]" : "text-[#F5F1E8] placeholder:text-[#60706A]"}`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={conversationSort}
            onChange={(event) => setConversationSort(event.target.value)}
            className={`rounded-full border px-3 py-1.5 text-xs outline-none transition-all duration-200 ${
              isLightTheme
                ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#C5A059] focus:border-[#9A6E2D]"
                : "border-[#22342F] bg-[#181B19] text-[#C5A059] hover:border-[#35554B] focus:border-[#C5A059]"
            }`}
          >
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
            <option value="title">Titulo (A-Z)</option>
          </select>

          <select
            value={selectedProjectFilter}
            onChange={(event) => setSelectedProjectFilter(event.target.value)}
            className={`rounded-full border px-3 py-1.5 text-xs outline-none transition-all duration-200 ${
              isLightTheme
                ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#C5A059] focus:border-[#9A6E2D]"
                : "border-[#22342F] bg-[#181B19] text-[#C5A059] hover:border-[#35554B] focus:border-[#C5A059]"
            }`}
          >
            <option value="all">Todos os projetos</option>
            {projectInsights.map((project) => <option key={project.key} value={project.key}>{project.label}</option>)}
          </select>

          <label className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all duration-200 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88] hover:border-[#C5A059] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#C5A059] hover:border-[#35554B] hover:bg-[rgba(255,255,255,0.02)]"}`}>
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} className="accent-[#C5A059]" />
            Arquivadas
          </label>
        </div>
      </div>
    </div>
  );
}
