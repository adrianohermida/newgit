import { useState } from "react";

function GroupCard({ activeConversationId, collapsed, group, isLightTheme, onConcatConversation, onSelectConversation, onToggle, renderConversationMenu }) {
  return (
    <section key={group.key} className={`rounded-[22px] border px-2 pb-3 pt-2 transition-colors duration-200 ${isLightTheme ? "border-[#E3E8EF] bg-[rgba(255,255,255,0.58)]" : "border-[#17211E] bg-[rgba(255,255,255,0.015)]"}`}>
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{group.label}</p>
          <p className={`text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#60706A]"}`}>{group.items.length} conversa(s)</p>
        </button>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
            {group.updatedAt ? new Date(group.updatedAt).toLocaleDateString("pt-BR") : "sem data"}
          </span>
          <button type="button" onClick={onToggle} aria-label={collapsed ? "Expandir secao" : "Recolher secao"} className={`inline-flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-200 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#C5A059]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#35554B]"}`}>
            <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform duration-200 ${collapsed ? "-rotate-90" : "rotate-0"}`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      {!collapsed ? <div className="space-y-2">
        {group.items.map((conversation) => {
          const active = conversation.id === activeConversationId;
          return (
            <article key={conversation.id} className={`rounded-[18px] border px-3 py-3 transition-all duration-200 ease-out will-change-transform ${active ? isLightTheme ? "border-[#D2B06A] bg-[#FFF8EA] shadow-[0_12px_28px_rgba(197,160,89,0.12)] ring-1 ring-[#E6D29A]/50" : "border-[#C5A059] bg-[rgba(197,160,89,0.08)] shadow-[0_12px_28px_rgba(0,0,0,0.24)] ring-1 ring-[#C5A059]/25" : isLightTheme ? "border-transparent bg-transparent hover:-translate-y-[1px] hover:border-[#D7DEE8] hover:bg-white hover:shadow-[0_12px_24px_rgba(148,163,184,0.12)]" : "border-transparent bg-transparent hover:-translate-y-[1px] hover:border-[#22342F] hover:bg-[rgba(255,255,255,0.02)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.18)]"}`}>
              <div className="flex items-start justify-between gap-3">
                <button type="button" onClick={() => onSelectConversation(conversation)} className="min-w-0 flex-1 text-left transition-transform duration-200 active:scale-[0.995]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold transition-colors duration-200 ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{conversation.title}</p>
                      <p className={`mt-1 line-clamp-2 text-xs leading-5 transition-colors duration-200 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{conversation.preview}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`text-[10px] uppercase tracking-[0.16em] transition-colors duration-200 ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{conversation.messages?.length || 0}</span>
                      <p className={`mt-1 text-[10px] transition-colors duration-200 ${isLightTheme ? "text-[#7B8B98]" : "text-[#60706A]"}`}>{conversation.updatedAt ? new Date(conversation.updatedAt).toLocaleDateString("pt-BR") : ""}</p>
                    </div>
                  </div>
                </button>
                <div className="shrink-0">{renderConversationMenu(conversation)}</div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors duration-200 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB]"}`}>{conversation.projectLabel || "Geral"}</span>
                {active ? <span className={`rounded-full border px-2.5 py-1 text-[10px] transition-all duration-200 ${isLightTheme ? "border-[#E6D29A] bg-[#FFF6DF] text-[#8A6217]" : "border-[#4B3F22] text-[#F1D39A]"}`}>ativa</span> : null}
                <button type="button" onClick={() => onConcatConversation(conversation)} className={`rounded-full border px-2.5 py-1 text-[11px] transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62] hover:bg-[#F5FBF8]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:bg-[rgba(127,196,175,0.06)] hover:text-[#7FC4AF]"}`}>Concatenar</button>
              </div>
            </article>
          );
        })}
      </div> : null}
    </section>
  );
}

export default function FocusedConversationGroups(props) {
  const {
    activeConversationId,
    conversationProjectGroups,
    handleDrop,
    isLightTheme,
    onConcatConversation,
    onSelectConversation,
    renderConversationMenu,
  } = props;
  const [collapsedGroups, setCollapsedGroups] = useState({});

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 md:px-4" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <div className="px-1 pb-1">
        <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Inbox</p>
        <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Threads persistidas, agrupadas por projeto e prontas para retomada.</p>
      </div>

      {conversationProjectGroups.length ? conversationProjectGroups.map((group) => (
        <GroupCard
          key={group.key}
          activeConversationId={activeConversationId}
          collapsed={collapsedGroups[group.key] === true}
          group={group}
          isLightTheme={isLightTheme}
          onConcatConversation={onConcatConversation}
          onSelectConversation={onSelectConversation}
          onToggle={() => setCollapsedGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}
          renderConversationMenu={renderConversationMenu}
        />
      )) : (
        <div className={`rounded-[24px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
          Nenhuma conversa encontrada.
        </div>
      )}
    </div>
  );
}
