function QuickIconButton({ icon, isLightTheme, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-all duration-200 active:scale-[0.98] ${
        isLightTheme
          ? "border-[#D8E0E8] bg-white text-[#51606B] hover:border-[#2F7A62] hover:text-[#2F7A62]"
          : "border-[#24312D] bg-[#101514] text-[#AAB8B3] hover:border-[#7FC4AF] hover:text-[#E4ECE8]"
      }`}
    >
      {icon}
    </button>
  );
}

export default function FocusedWorkspaceTopbar({ isLightTheme, messageCount, onExportConversation, onOpenHelp, onOpenSettings }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className={`text-[10px] uppercase tracking-[0.24em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
          Copilot
        </p>
        <h1 className={`mt-1 text-base font-semibold tracking-[-0.02em] ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
          Conversa principal com apoio contextual
        </h1>
        <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
          Conversa central, contexto lateral e retomada continua. {messageCount} mensagem(ns).
        </p>
      </div>

      <div className="flex items-center gap-2">
        <QuickIconButton
          isLightTheme={isLightTheme}
          label="Ajuda"
          onClick={onOpenHelp}
          icon={(
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M9.25 9.25a3 3 0 1 1 5 2.25c-.82.55-1.25 1.05-1.25 2" />
              <path d="M12 16.5h.01" />
            </svg>
          )}
        />
        <QuickIconButton
          isLightTheme={isLightTheme}
          label="Exportar"
          onClick={onExportConversation}
          icon={(
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v11" />
              <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
              <path d="M5 20h14" />
            </svg>
          )}
        />
        <QuickIconButton
          isLightTheme={isLightTheme}
          label="Configuracoes"
          onClick={onOpenSettings}
          icon={(
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 1 1-4 0v-.1a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 1 1 0-4h.1a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a2 2 0 1 1 4 0v.1a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6h.1a2 2 0 1 1 0 4h-.1a1 1 0 0 0-.9.7Z" />
            </svg>
          )}
        />
      </div>
    </div>
  );
}
