import DotobotCompactComposer from "./DotobotCompactComposer";
import DotobotCompactConversationCard from "./DotobotCompactConversationCard";
import DotobotCompactRuntimeDiagnostics from "./DotobotCompactRuntimeDiagnostics";
import DotobotConversationMenu from "./DotobotConversationMenu";

function RecentConversationItem({ activeConversationId, conversation, conversationMenuId, conversationMenuRef, isLightTheme, onSelect, onArchive, onDelete, onRename, onShare, setConversationMenuId }) {
  const isActive = conversation.id === activeConversationId;

  return (
    <article className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${isActive ? isLightTheme ? "border-[#D2B06A] bg-[#FFF8EA]" : "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] hover:border-[#BAC8D6]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#35554B]"}`}>
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onSelect(conversation)} className="min-w-0 flex-1 text-left">
          <p className={`truncate text-[12px] font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{conversation.title}</p>
          <p className={`mt-1 line-clamp-2 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{conversation.preview}</p>
        </button>
        <div className="flex items-start gap-2">
          <span className={`shrink-0 pt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#60706A]"}`}>{conversation.messages?.length || 0}</span>
          <DotobotConversationMenu compact={true} conversation={conversation} conversationMenuId={conversationMenuId} conversationMenuRef={conversationMenuRef} isLightTheme={isLightTheme} onArchive={onArchive} onDelete={onDelete} onRename={onRename} onShare={onShare} setConversationMenuId={setConversationMenuId} />
        </div>
      </div>
    </article>
  );
}

function CompactTranscript({ compactTranscript, isLightTheme, loading }) {
  return (
    <div className="mt-3 flex max-h-[34vh] min-h-[22vh] flex-col overflow-y-auto pr-1">
      <div className="flex min-h-full flex-col justify-end space-y-2">
        {compactTranscript.length ? compactTranscript.map((message, index) => (
          <div key={message.id || `${message.role}-${message.createdAt || index}`} className={`rounded-[18px] border px-3 py-3 ${message.role === "user" ? isLightTheme ? "border-[#E6D29A] bg-[#FFF8EA]" : "border-[#3B3523] bg-[rgba(197,160,89,0.08)]" : isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
            <div className="flex items-center justify-between gap-3">
              <span className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{message.role === "user" ? "Voce" : "Dotobot"}</span>
              {message.createdAt ? <span className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#60706A]"}`}>{new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span> : null}
            </div>
            <p className={`mt-2 line-clamp-4 whitespace-pre-wrap text-[12px] leading-6 ${isLightTheme ? "text-[#2B3A42]" : "text-[#D8DEDA]"}`}>{message.text || (message.role === "assistant" && loading ? "Processando resposta..." : "Sem texto")}</p>
          </div>
        )) : <div className={`rounded-[18px] border border-dashed px-3 py-4 text-[12px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>A conversa comeca aqui. Use um prompt curto e siga para o modo full quando precisar de trilha completa.</div>}
        {loading ? <div className={`rounded-[18px] border px-3 py-3 text-[12px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>Dotobot esta preparando a proxima resposta...</div> : null}
      </div>
    </div>
  );
}

export default function DotobotEmbeddedCompactRail(props) {
  const { activeConversation, activeConversationId, activeConversationPreview, activeConversationTimestamp, activeProviderPresentation, compactRecentConversations, compactTranscript, composerRef, contextEnabled, conversationMenuId, conversationMenuRef, createConversation, handleArchiveConversation, handleDeleteConversation, handleDrop, handlePaste, handleRenameConversation, handleShareConversation, handleSubmit, input, isLightTheme, loading, onChangeInput, onOpenFullscreen, onSelectConversation, ragAlert, refreshProps, selectedSkillId, setContextEnabled, setConversationMenuId, showCompactRuntimeDiagnostics, supabaseBootstrap } = props;

  return (
    <div className="flex h-full min-h-0 flex-col px-4 py-4">
      <DotobotCompactConversationCard activeConversation={activeConversation} activeConversationPreview={activeConversationPreview} activeConversationTimestamp={activeConversationTimestamp} activeProviderPresentation={activeProviderPresentation} contextEnabled={contextEnabled} createConversation={createConversation} isLightTheme={isLightTheme} selectedSkillId={selectedSkillId} setContextEnabled={setContextEnabled} />
      <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
        <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Conversas recentes</p>
              <p className={`mt-1 text-[12px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Leitura rapida no estilo sidebar de conversa.</p>
            </div>
            <button type="button" onClick={onOpenFullscreen} className={`rounded-full border px-3 py-1.5 text-[10px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Ver tudo</button>
          </div>
          <div className="mt-3 space-y-2">
            {compactRecentConversations.length ? compactRecentConversations.map((conversation) => <RecentConversationItem key={conversation.id} activeConversationId={activeConversationId} conversation={conversation} conversationMenuId={conversationMenuId} conversationMenuRef={conversationMenuRef} isLightTheme={isLightTheme} onSelect={onSelectConversation} onArchive={handleArchiveConversation} onDelete={handleDeleteConversation} onRename={handleRenameConversation} onShare={handleShareConversation} setConversationMenuId={setConversationMenuId} />) : <div className={`rounded-[18px] border border-dashed px-3 py-4 text-[12px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>Nenhuma conversa salva ainda.</div>}
          </div>
        </div>
        <div className={`min-h-0 flex-1 rounded-[24px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Chat rapido</p>
              <p className={`mt-1 text-[12px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Uma visao leve para conversar, revisar contexto e seguir em frente.</p>
            </div>
            <span className={`rounded-full border px-3 py-1.5 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{refreshProps.messageCount} mensagens</span>
          </div>
          <CompactTranscript compactTranscript={compactTranscript} isLightTheme={isLightTheme} loading={loading} />
        </div>
      </div>
      {showCompactRuntimeDiagnostics ? <DotobotCompactRuntimeDiagnostics {...refreshProps} isLightTheme={isLightTheme} ragAlert={ragAlert} supabaseBootstrap={supabaseBootstrap} /> : null}
      <DotobotCompactComposer composerRef={composerRef} handleComposerKeyDown={refreshProps.handleComposerKeyDown} handleDrop={handleDrop} handlePaste={handlePaste} handleSubmit={handleSubmit} input={input} isLightTheme={isLightTheme} loading={loading} onChangeInput={onChangeInput} onOpenFullscreen={onOpenFullscreen} />
    </div>
  );
}
