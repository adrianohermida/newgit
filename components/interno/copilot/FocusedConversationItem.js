import { useState } from "react";

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

export default function FocusedConversationItem({
  active,
  conversation,
  isLightTheme,
  onArchiveConversation,
  onConcatConversation,
  onDeleteConversation,
  onRenameConversation,
  onRenameInline,
  onSelectConversation,
  onShareConversation,
}) {
  const [inlineEditing, setInlineEditing] = useState(false);
  const [inlineTitle, setInlineTitle] = useState(conversation.title || "");

  function startInlineEdit() {
    setInlineTitle(conversation.title || "");
    setInlineEditing(true);
  }

  function cancelInlineEdit() {
    setInlineEditing(false);
    setInlineTitle(conversation.title || "");
  }

  function commitInlineEdit() {
    const normalized = String(inlineTitle || "").trim();
    setInlineEditing(false);
    if (!normalized || normalized === conversation.title) return;
    onRenameInline?.(conversation.id, normalized);
  }

  return (
    <article
      className={`group rounded-[18px] border px-3 py-3 transition-all duration-200 ease-out will-change-transform ${
        active
          ? isLightTheme
            ? "border-[#D2B06A] bg-[#FFF8EA] shadow-[0_12px_28px_rgba(197,160,89,0.12)] ring-1 ring-[#E6D29A]/50"
            : "border-[#C5A059] bg-[rgba(197,160,89,0.08)] shadow-[0_12px_28px_rgba(0,0,0,0.24)] ring-1 ring-[#C5A059]/25"
          : isLightTheme
            ? "border-transparent bg-transparent hover:-translate-y-[1px] hover:border-[#D7DEE8] hover:bg-white hover:shadow-[0_12px_24px_rgba(148,163,184,0.12)]"
            : "border-transparent bg-transparent hover:-translate-y-[1px] hover:border-[#22342F] hover:bg-[rgba(255,255,255,0.02)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.18)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onSelectConversation(conversation)}
          onDoubleClick={() => startInlineEdit()}
          className="min-w-0 flex-1 text-left transition-transform duration-200 active:scale-[0.995]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${active ? "bg-[#C5A059]" : isLightTheme ? "bg-[#CBD5E1]" : "bg-[#35554B]"}`} />
                {inlineEditing ? (
                  <input
                    value={inlineTitle}
                    onChange={(event) => setInlineTitle(event.target.value)}
                    onBlur={commitInlineEdit}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        commitInlineEdit();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        cancelInlineEdit();
                      }
                    }}
                    className={`h-7 min-w-0 flex-1 rounded-md border px-2 text-sm outline-none ${
                      isLightTheme
                        ? "border-[#D7DEE8] bg-white text-[#152421]"
                        : "border-[#22342F] bg-[#0F1513] text-[#F5F1E8]"
                    }`}
                  />
                ) : (
                  <p className={`truncate text-sm font-semibold transition-colors duration-200 ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>
                    {conversation.title}
                  </p>
                )}
              </div>
              <p className={`mt-1 line-clamp-2 text-xs leading-5 transition-colors duration-200 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                {conversation.preview}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className={`text-[10px] uppercase tracking-[0.16em] transition-colors duration-200 ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
                {conversation.messages?.length || 0}
              </span>
              <p className={`mt-1 text-[10px] transition-colors duration-200 ${isLightTheme ? "text-[#7B8B98]" : "text-[#60706A]"}`}>
                {conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleDateString("pt-BR") : ""}
              </p>
            </div>
          </div>
        </button>
        <div className="shrink-0">
          <div className={`flex items-center gap-1 transition-opacity duration-200 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            <ActionButton isLightTheme={isLightTheme} label="Renomear" onClick={() => onRenameConversation(conversation)}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </ActionButton>
            <ActionButton isLightTheme={isLightTheme} label="Compartilhar" onClick={() => onShareConversation(conversation)}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.59 13.51 6.83 3.98" />
                <path d="m15.41 6.51-6.82 3.98" />
              </svg>
            </ActionButton>
            <ActionButton
              isLightTheme={isLightTheme}
              label={conversation.archived ? "Desarquivar" : "Arquivar"}
              onClick={() => onArchiveConversation(conversation)}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8v13H3V8" />
                <path d="M1 3h22v5H1z" />
                <path d="M10 12h4" />
              </svg>
            </ActionButton>
            <ActionButton isLightTheme={isLightTheme} label="Excluir" onClick={() => onDeleteConversation(conversation)}>
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M8 6V4h8v2" />
                <path d="M19 6l-1 14H6L5 6" />
              </svg>
            </ActionButton>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors duration-200 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB]"}`}>
          {conversation.projectLabel || "Geral"}
        </span>
        {active ? <span className={`rounded-full border px-2.5 py-1 text-[10px] transition-all duration-200 ${isLightTheme ? "border-[#E6D29A] bg-[#FFF6DF] text-[#8A6217]" : "border-[#4B3F22] text-[#F1D39A]"}`}>ativa</span> : null}
        <button
          type="button"
          onClick={() => onConcatConversation(conversation)}
          className={`rounded-full border px-2.5 py-1 text-[11px] transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62] hover:bg-[#F5FBF8]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:bg-[rgba(127,196,175,0.06)] hover:text-[#7FC4AF]"}`}
        >
          Concatenar
        </button>
      </div>
    </article>
  );
}
