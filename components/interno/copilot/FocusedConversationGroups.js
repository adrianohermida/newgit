import { useState } from "react";
import FocusedConversationItem from "./FocusedConversationItem";

function GroupCard({
  activeConversationId,
  collapsed,
  group,
  isLightTheme,
  onArchiveConversation,
  onConcatConversation,
  onDeleteConversation,
  onRenameConversation,
  onRenameInline,
  onSelectConversation,
  onShareConversation,
  onToggle,
}) {
  return (
    <section className={`rounded-[22px] border px-2 pb-3 pt-2 transition-colors duration-200 ${isLightTheme ? "border-[#E3E8EF] bg-[rgba(255,255,255,0.7)]" : "border-[#17211E] bg-[rgba(255,255,255,0.015)]"}`}>
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
      {!collapsed ? (
        <div className="space-y-2">
          {group.items.map((conversation) => (
            <FocusedConversationItem
              key={conversation.id}
              active={conversation.id === activeConversationId}
              conversation={conversation}
              isLightTheme={isLightTheme}
              onArchiveConversation={onArchiveConversation}
              onConcatConversation={onConcatConversation}
              onDeleteConversation={onDeleteConversation}
              onRenameConversation={onRenameConversation}
              onRenameInline={onRenameInline}
              onSelectConversation={onSelectConversation}
              onShareConversation={onShareConversation}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

export default function FocusedConversationGroups(props) {
  const {
    activeConversationId,
    conversationProjectGroups = [],
    handleDrop,
    isLightTheme,
    onArchiveConversation,
    onConcatConversation,
    onDeleteConversation,
    onRenameConversation,
    onRenameInline,
    onSelectConversation,
    onShareConversation,
  } = props;
  const [collapsedGroups, setCollapsedGroups] = useState({});

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 md:px-4" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <div className="px-1 pb-1">
        <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Inbox</p>
        <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Threads persistidas, agrupadas por projeto e prontas para retomada.</p>
      </div>
      {conversationProjectGroups.length ? (
        conversationProjectGroups.map((group) => (
          <GroupCard
            key={group.key}
            activeConversationId={activeConversationId}
            collapsed={collapsedGroups[group.key] === true}
            group={group}
            isLightTheme={isLightTheme}
            onArchiveConversation={onArchiveConversation}
            onConcatConversation={onConcatConversation}
            onDeleteConversation={onDeleteConversation}
            onRenameConversation={onRenameConversation}
            onRenameInline={onRenameInline}
            onSelectConversation={onSelectConversation}
            onShareConversation={onShareConversation}
            onToggle={() => setCollapsedGroups((current) => ({ ...current, [group.key]: !current[group.key] }))}
          />
        ))
      ) : (
        <div className={`rounded-[24px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
          Nenhuma conversa encontrada.
        </div>
      )}
    </div>
  );
}
