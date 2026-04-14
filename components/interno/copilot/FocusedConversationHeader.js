export default function FocusedConversationHeader(props) {
  const {
    activeConversation,
    activeMode,
    activeProjectLabel,
    handleQuickAction,
    isLightTheme,
    messages,
    visibleLegalActions,
  } = props;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Conversa</p>
        <p className={`mt-2 truncate text-base font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
          {activeConversation?.title || "Nova conversa"}
        </p>
        <div className={`mt-2 flex flex-wrap items-center gap-2 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
          <span className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
            {activeProjectLabel}
          </span>
          <span>{messages.length} mensagem(ns)</span>
          <span>{activeMode.label}</span>
        </div>
        <p className={`mt-2 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
          Conduza a conversa principal com contexto e continuidade.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleLegalActions.slice(0, 3).map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => handleQuickAction(action.prompt)}
            className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
