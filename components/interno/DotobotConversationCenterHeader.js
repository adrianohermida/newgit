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

function SyncBadge({ isLightTheme, remoteSyncSummary }) {
  const connected = remoteSyncSummary?.connected;
  const tone = connected
    ? isLightTheme ? "border-[#CFE3DB] bg-[#F5FBF8] text-[#2F7A62]" : "border-[#35554B] text-[#9FE0C7]"
    : isLightTheme ? "border-[#E6D29A] bg-[#FFF8E8] text-[#8A6217]" : "border-[#4B3F22] text-[#F1D39A]";
  return (
    <span className={`rounded-full border px-3 py-1.5 text-[11px] ${tone}`}>
      {connected ? `Cloudflare ${remoteSyncSummary.loading ? "sincronizando" : "ativo"}` : "Somente local"}
    </span>
  );
}

export default function DotobotConversationCenterHeader({ activeConversation, activeProjectLabel, isLightTheme, onQuickAction, remoteSyncSummary, visibleLegalActions }) {
  const totalAttachments = (remoteSyncSummary?.remoteAttachmentCount || 0) + (remoteSyncSummary?.pendingAttachmentCount || 0);
  return (
    <div className={`border-b px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Conversa</p>
          <p className={`mt-2 truncate text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeConversation?.title || "Nova conversa"}</p>
          <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Uma thread mais limpa para decidir, executar e seguir com clareza, sem competir com os modulos de apoio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{activeProjectLabel}</span>
          <SyncBadge isLightTheme={isLightTheme} remoteSyncSummary={remoteSyncSummary} />
          {totalAttachments ? <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>R2 {remoteSyncSummary.remoteAttachmentCount}/{totalAttachments}</span> : null}
          {visibleLegalActions.slice(0, 3).map((action) => <QuickActionButton key={action.label} action={action} isLightTheme={isLightTheme} onQuickAction={onQuickAction} />)}
        </div>
      </div>
    </div>
  );
}
