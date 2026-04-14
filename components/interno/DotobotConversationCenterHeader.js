function QuickActionButton({ action, isLightTheme, onQuickAction }) {
  return (
    <button
      type="button"
      onClick={() => onQuickAction(action.prompt)}
      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
    >
      {action.label}
    </button>
  );
}

export default function DotobotConversationCenterHeader({
  activeConversation,
  activeProjectLabel,
  isLightTheme,
  onQuickAction,
  visibleLegalActions,
}) {
  return (
    <div className={`border-b px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Conversa</p>
          <p className={`mt-2 truncate text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeConversation?.title || "Nova conversa"}</p>
          <p className={`mt-1 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Uma conversa central para decidir, executar e seguir com mais clareza.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{activeProjectLabel}</span>
          {visibleLegalActions.slice(0, 3).map((action) => (
            <QuickActionButton key={action.label} action={action} isLightTheme={isLightTheme} onQuickAction={onQuickAction} />
          ))}
        </div>
      </div>
    </div>
  );
}
