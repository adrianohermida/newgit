function AttachmentChip({ attachment, formatBytes, isLightTheme }) {
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#C6D1CC]"}`}>
      {attachment.previewUrl ? (
        <img src={attachment.previewUrl} alt={attachment.name} className="h-7 w-7 rounded-lg object-cover" />
      ) : (
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] uppercase ${isLightTheme ? "border-[#D7DEE8] text-[#7B8B98]" : "border-[#22342F] text-[#9BAEA8]"}`}>
          {attachment.kind}
        </span>
      )}
      <div>
        <p className="max-w-[11rem] truncate">{attachment.name}</p>
        <p className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "opacity-70"}`}>
          {formatBytes(attachment.size)} - {attachment.remoteKey ? "R2 sincronizado" : "upload pendente"}
        </p>
      </div>
    </div>
  );
}

function ComposerActionButton({ isLightTheme, onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#52616C] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
    >
      {children}
    </button>
  );
}

export default function FocusedConversationComposer(props) {
  const { attachments, composerBlockedReason, composerRef, formatBytes, handleComposerKeyDown, handleDrop, handleOpenFiles, handlePaste, handleSubmit, input, isComposerBlocked, isLightTheme, isRecording, loading, onOpenAiTask, remoteSyncSummary, setInput, setShowSlashCommands, showSlashCommands, slashCommands, toggleVoiceInput } = props;
  const syncLabel = remoteSyncSummary?.connected ? (loading ? "Cloudflare sincronizando" : "Cloudflare ativo") : "Somente local";
  const syncTone = remoteSyncSummary?.connected
    ? isLightTheme ? "text-[#2F7A62]" : "text-[#9FE0C7]"
    : isLightTheme ? "text-[#8A6217]" : "text-[#F1D39A]";

  return (
    <div className={`shrink-0 border-t px-4 py-4 md:px-6 ${isLightTheme ? "border-[#E1E6EB] bg-[#F7F8FA]" : "border-[#22342F] bg-[#0E1211]"}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className={`rounded-[28px] border px-3 py-3 transition-all duration-200 ${isLightTheme ? "border-[#D7DEE8] bg-white focus-within:border-[#2F7A62] focus-within:shadow-[0_0_0_3px_rgba(47,122,98,0.08)]" : "border-[#1C2623] bg-[#101514] focus-within:border-[#7FC4AF] focus-within:shadow-[0_0_0_3px_rgba(127,196,175,0.08)]"}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          {attachments.length ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <AttachmentChip key={attachment.id} attachment={attachment} formatBytes={formatBytes} isLightTheme={isLightTheme} />
              ))}
            </div>
          ) : null}
          <textarea
            ref={composerRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setShowSlashCommands(event.target.value.trimStart().startsWith("/"));
            }}
            onKeyDown={handleComposerKeyDown}
            onPaste={handlePaste}
            rows={3}
            disabled={isComposerBlocked}
            placeholder="Escreva a proxima mensagem para continuar a thread..."
            className={`w-full resize-none border-0 bg-transparent px-2 py-1 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 ${isLightTheme ? "text-[#152421] placeholder:text-[#94A3B8]" : "text-[#F5F1E8] placeholder:text-[#60706A]"}`}
          />
          {showSlashCommands && input.trim().startsWith("/") ? (
            <div className={`mt-3 grid gap-2 rounded-[18px] border p-2 md:grid-cols-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
              {slashCommands.map((command) => (
                <button key={command.value} type="button" onClick={() => props.handleSlashCommand(command)} className={`rounded-[18px] border px-3 py-2 text-left text-xs transition-all duration-200 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>
                  <p className={`font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{command.label}</p>
                  <p className={`mt-1 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{command.hint}</p>
                </button>
              ))}
            </div>
          ) : null}
          {composerBlockedReason ? <p className={`mt-2 px-2 text-[11px] leading-5 ${isLightTheme ? "text-[#8A6217]" : "text-[#f1dfb5]"}`}>{composerBlockedReason}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ComposerActionButton isLightTheme={isLightTheme} onClick={handleOpenFiles} label="Anexar">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 1 1 5.66 5.66L9.4 17.43a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </ComposerActionButton>
            <ComposerActionButton isLightTheme={isLightTheme} onClick={toggleVoiceInput} label="Voz">
              {isRecording ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><rect x="7" y="7" width="10" height="10" rx="2" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><path d="M12 19v3" /></svg>
              )}
            </ComposerActionButton>
            <button type="button" onClick={onOpenAiTask} className={`rounded-full border px-3 py-2 text-xs transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>AI Task</button>
          </div>
          <div className="flex items-center gap-3">
            <p className={`text-xs ${syncTone}`}>{syncLabel}</p>
            <button type="submit" disabled={loading || !input.trim() || isComposerBlocked} className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition-all duration-200 active:scale-[0.98] disabled:opacity-40 ${isLightTheme ? "border-[#C79B2C] bg-[#FFF8E8] text-[#8A6217] hover:bg-[#FFF2D2]" : "border-[#C5A059] bg-[rgba(197,160,89,0.08)] text-[#F1D39A] hover:bg-[rgba(197,160,89,0.16)]"}`} aria-label="Enviar mensagem">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4Z" /></svg>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
