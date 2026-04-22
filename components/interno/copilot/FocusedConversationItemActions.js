function ActionButton({ isLightTheme, label, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full border transition-all duration-200 ${
        isLightTheme
          ? "border-[#D7DEE8] bg-white text-[#687887] hover:border-[#9A6E2D] hover:text-[#9A6E2D]"
          : "border-[#22342F] text-[#AFC2BC] hover:border-[#C5A059] hover:text-[#C5A059]"
      }`}
    >
      {children}
    </button>
  );
}

export default function FocusedConversationItemActions({
  conversation,
  isLightTheme,
  onArchiveConversation,
  onDeleteConversation,
  onRenameConversation,
  onShareConversation,
}) {
  return (
    <div className="flex items-center gap-1">
      <ActionButton isLightTheme={isLightTheme} label="Renomear" onClick={() => onRenameConversation(conversation)}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
      </ActionButton>
      <ActionButton isLightTheme={isLightTheme} label="Compartilhar" onClick={() => onShareConversation(conversation)}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.59 13.51 6.83 3.98" /><path d="m15.41 6.51-6.82 3.98" /></svg>
      </ActionButton>
      <ActionButton isLightTheme={isLightTheme} label={conversation.archived ? "Desarquivar" : "Arquivar"} onClick={() => onArchiveConversation(conversation)}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
      </ActionButton>
      <ActionButton isLightTheme={isLightTheme} label="Excluir" onClick={() => onDeleteConversation(conversation)}>
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
      </ActionButton>
    </div>
  );
}
