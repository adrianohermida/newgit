export default function DotobotConversationMenu({ compact = false, conversation, conversationMenuId, conversationMenuRef, isLightTheme, onArchive, onDelete, onRename, onShare, setConversationMenuId }) {
  const open = conversationMenuId === conversation.id;

  return (
    <div ref={open ? conversationMenuRef : null} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setConversationMenuId((current) => (current === conversation.id ? null : conversation.id));
        }}
        className={`rounded-full border px-2 py-1 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
        aria-label="Ações da conversa"
        aria-expanded={open}
      >
        ⋮
      </button>
      {open ? (
        <div className={`absolute ${compact ? "right-0 top-[calc(100%+6px)]" : "right-0 top-[calc(100%+8px)]"} z-20 w-44 overflow-hidden rounded-[16px] border shadow-[0_18px_38px_rgba(0,0,0,0.18)] ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(12,15,14,0.98)]"}`}>
          {[
            { key: "share", label: "Compartilhar", action: () => onShare(conversation) },
            { key: "archive", label: conversation.archived ? "Desarquivar" : "Arquivar", action: () => onArchive(conversation) },
            { key: "rename", label: "Renomear", action: () => onRename(conversation) },
            { key: "delete", label: "Excluir", action: () => onDelete(conversation) },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setConversationMenuId(null);
                item.action();
              }}
              className={`flex w-full items-center justify-between px-3 py-2.5 text-left text-[12px] transition ${isLightTheme ? "text-[#22312F] hover:bg-[#F7F9FC]" : "text-[#D8DEDA] hover:bg-[rgba(255,255,255,0.03)]"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
