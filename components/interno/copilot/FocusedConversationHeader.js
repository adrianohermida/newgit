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
        <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#9A6E2D]" : "text-[#C5A059]"}`}>Thread ativa</p>
        <p className={`mt-2 truncate text-base font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
          {activeConversation?.title || "Nova conversa"}
        </p>
        <div className={`mt-2 flex flex-wrap items-center gap-2 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
          <span className={`rounded-full border px-3 py-1.5 ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8EA] text-[#8A6217]" : "border-[#4B3F22] text-[#F1D39A]"}`}>
            {activeProjectLabel}
          </span>
          <span>{messages.length} mensagens</span>
          <span>modo {activeMode.label}</span>
        </div>
        <p className={`mt-2 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
          Continue a thread com contexto, decisoes e historico preservados.
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
