function ComposerBadge({ children, isLightTheme }) {
  return <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>{children}</span>;
}

function AttachmentChip({ attachment, formatBytes, isLightTheme }) {
  return (
    <div className={`flex items-center gap-3 rounded-full border px-3 py-2 text-xs ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#C6D1CC]"}`}>
      {attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.name} className="h-8 w-8 rounded-lg object-cover" /> : <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-[10px] uppercase ${isLightTheme ? "border-[#D7DEE8] text-[#7B8B98]" : "border-[#22342F] text-[#9BAEA8]"}`}>{attachment.kind}</span>}
      <div>
        <p className="max-w-[12rem] truncate">{attachment.name}</p>
        <p className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "opacity-60"}`}>{formatBytes(attachment.size)} · {attachment.remoteKey ? "R2 sincronizado" : "upload pendente"}</p>
      </div>
    </div>
  );
}

export default function DotobotConversationComposer(props) {
  const { activeMode, attachments, composerBlockedReason, composerRef, focusedConversationColumnClass, formatBytes, handleComposerKeyDown, handleDrop, handleOpenFiles, handlePaste, handleResetChat, handleSlashCommand, handleSubmit, input, isComposerBlocked, isConversationCentricShell, isLightTheme, isRecording, loading, onChangeInput, onOpenAiTask, onOpenLlmTest, provider, remoteSyncSummary, showSlashCommands, slashCommands, toggleVoiceInput, visibleQuickPrompts } = props;
  const syncedAttachments = remoteSyncSummary?.remoteAttachmentCount || 0;
  return (
    <div className={`shrink-0 border-t px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
      <div className={focusedConversationColumnClass}>
        {!isConversationCentricShell ? <div className="mb-3 flex flex-wrap gap-2">{visibleQuickPrompts.map((prompt) => <button key={prompt} type="button" onClick={() => onChangeInput(prompt)} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#C6D1CC] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>{prompt}</button>)}</div> : null}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className={`rounded-[20px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1C2623] bg-[rgba(7,9,8,0.98)]"}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
            <div className={`mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <ComposerBadge isLightTheme={isLightTheme}>{isConversationCentricShell ? `${activeMode.label} · contexto ativo` : `/${showSlashCommands ? "comandos ativos" : "comandos"}`}</ComposerBadge>
                {!isConversationCentricShell ? <ComposerBadge isLightTheme={isLightTheme}>Enter envia</ComposerBadge> : null}
                {!isConversationCentricShell ? <ComposerBadge isLightTheme={isLightTheme}>Shift+Enter quebra</ComposerBadge> : null}
                <ComposerBadge isLightTheme={isLightTheme}>{remoteSyncSummary?.connected ? loading ? "Cloudflare sync" : "Cloudflare online" : "salvo localmente"}</ComposerBadge>
                {attachments.length ? <ComposerBadge isLightTheme={isLightTheme}>R2 {syncedAttachments}/{attachments.length}</ComposerBadge> : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={handleOpenFiles} className={`rounded-full border px-2.5 py-1 transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Anexar</button>
                <button type="button" onClick={toggleVoiceInput} className={`rounded-full border px-2.5 py-1 transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>{isRecording ? "Parar voz" : "Voz"}</button>
              </div>
            </div>
            <textarea ref={composerRef} value={input} onChange={(event) => onChangeInput(event.target.value)} onKeyDown={handleComposerKeyDown} onPaste={handlePaste} rows={4} disabled={isComposerBlocked} placeholder={isConversationCentricShell ? "Pergunte ao Dotobot, continue a thread ou delegue uma acao..." : "Pergunte, delegue uma tarefa ou cole o contexto que precisa operar..."} className={`w-full resize-none border-0 bg-transparent px-1 py-1 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 ${isLightTheme ? "text-[#152421] placeholder:text-[#94A3B8]" : "text-[#F5F1E8] placeholder:text-[#60706A]"}`} />
            {composerBlockedReason ? <p className={`mt-2 px-1 text-[11px] leading-5 ${isLightTheme ? "text-[#8A6217]" : "text-[#f1dfb5]"}`}>{composerBlockedReason}</p> : null}
            {attachments.length ? <div className="mt-3 flex flex-wrap gap-2">{attachments.map((attachment) => <AttachmentChip key={attachment.id} attachment={attachment} formatBytes={formatBytes} isLightTheme={isLightTheme} />)}</div> : null}
            {showSlashCommands && input.trim().startsWith("/") ? <div className={`mt-3 grid gap-2 rounded-[18px] border p-2 md:grid-cols-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>{slashCommands.map((command) => <button key={command.value} type="button" onClick={() => handleSlashCommand(command)} className={`rounded-[20px] border px-4 py-3 text-left text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}><p className={`font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{command.label}</p><p className={`mt-1 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{command.hint}</p></button>)}</div> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {!isConversationCentricShell ? <button type="button" onClick={handleResetChat} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Limpar</button> : null}
              <button type="button" onClick={onOpenAiTask} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>AI Task</button>
              {!isConversationCentricShell ? <button type="button" onClick={() => onOpenLlmTest(provider, input)} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>LLM Test</button> : null}
            </div>
            <button type="submit" disabled={loading || isComposerBlocked || !input.trim()} className="rounded-2xl border border-[#C5A059] px-4 py-2 text-sm font-semibold text-[#C5A059] transition disabled:opacity-40">{loading ? "Enviando..." : "Enviar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
