export default function FocusedConversationComposer(props) {
  const {
    attachments,
    composerBlockedReason,
    composerRef,
    formatBytes,
    handleComposerKeyDown,
    handleDrop,
    handleOpenFiles,
    handlePaste,
    handleSubmit,
    input,
    isComposerBlocked,
    isLightTheme,
    isRecording,
    loading,
    onOpenAiTask,
    setInput,
    setShowSlashCommands,
    showSlashCommands,
    slashCommands,
    toggleVoiceInput,
  } = props;

  return (
    <div className={`shrink-0 border-t px-4 py-4 md:px-5 ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.98))]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(8,10,9,0.98),rgba(10,13,12,0.98))]"}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className={`rounded-[24px] border p-3 transition-all duration-200 ${isLightTheme ? "border-[#D7DEE8] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.08),transparent_42%),white] focus-within:border-[#C79B2C] focus-within:shadow-[0_0_0_3px_rgba(197,160,89,0.10),0_18px_36px_rgba(148,163,184,0.12)]" : "border-[#1C2623] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.08),transparent_40%),rgba(7,9,8,0.98)] focus-within:border-[#C5A059] focus-within:shadow-[0_0_0_3px_rgba(197,160,89,0.10),0_18px_36px_rgba(0,0,0,0.20)]"}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
          <div className={`mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8EA] text-[#8A6217]" : "border-[#4B3F22] text-[#F1D39A]"}`}>
                resposta em contexto
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={handleOpenFiles} className={`rounded-full border px-2.5 py-1 transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:bg-[#FFF8EA] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:bg-[rgba(197,160,89,0.06)] hover:text-[#C5A059]"}`}>Anexar</button>
              <button type="button" onClick={toggleVoiceInput} className={`rounded-full border px-2.5 py-1 transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] hover:border-[#9A6E2D] hover:bg-[#FFF8EA] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:bg-[rgba(197,160,89,0.06)] hover:text-[#C5A059]"}`}>{isRecording ? "Parar voz" : "Voz"}</button>
            </div>
          </div>

          <textarea
            ref={composerRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setShowSlashCommands(event.target.value.trimStart().startsWith("/"));
            }}
            onKeyDown={handleComposerKeyDown}
            onPaste={handlePaste}
            rows={4}
            disabled={isComposerBlocked}
            placeholder="Escreva a proxima mensagem, continue a thread ou delegue uma acao..."
            className={`w-full resize-none border-0 bg-transparent px-1 py-1 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50 ${isLightTheme ? "text-[#152421] placeholder:text-[#94A3B8]" : "placeholder:text-[#60706A]"}`}
          />

          {composerBlockedReason ? <p className={`mt-2 px-1 text-[11px] leading-5 ${isLightTheme ? "text-[#8A6217]" : "text-[#f1dfb5]"}`}>{composerBlockedReason}</p> : null}

          {attachments.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map((attachment) => (
                <div key={attachment.id} className={`flex items-center gap-3 rounded-full border px-3 py-2 text-xs transition-all duration-200 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B] hover:border-[#C5A059]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#C6D1CC] hover:border-[#35554B]"}`}>
                  {attachment.previewUrl ? <img src={attachment.previewUrl} alt={attachment.name} className="h-8 w-8 rounded-lg object-cover" /> : <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-[10px] uppercase ${isLightTheme ? "border-[#D7DEE8] text-[#7B8B98]" : "border-[#22342F] text-[#9BAEA8]"}`}>{attachment.kind}</span>}
                  <div>
                    <p className="max-w-[12rem] truncate">{attachment.name}</p>
                    <p className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "opacity-60"}`}>{formatBytes(attachment.size)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {showSlashCommands && input.trim().startsWith("/") ? (
            <div className={`mt-3 grid gap-2 rounded-[18px] border p-2 md:grid-cols-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
              {slashCommands.map((command) => (
                <button key={command.value} type="button" onClick={() => props.handleSlashCommand(command)} className={`rounded-[20px] border px-4 py-3 text-left text-xs transition-all duration-200 active:scale-[0.99] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:-translate-y-[1px] hover:border-[#9A6E2D] hover:text-[#9A6E2D] hover:shadow-[0_12px_24px_rgba(148,163,184,0.12)]" : "border-[#22342F] text-[#D8DEDA] hover:-translate-y-[1px] hover:border-[#C5A059] hover:text-[#C5A059] hover:shadow-[0_12px_24px_rgba(0,0,0,0.20)]"}`}>
                  <p className={`font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{command.label}</p>
                  <p className={`mt-1 text-[11px] leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{command.hint}</p>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onOpenAiTask} className={`rounded-2xl border px-3 py-2 text-xs transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:-translate-y-[1px] hover:border-[#2F7A62] hover:bg-[#F5FBF8]" : "border-[#22342F] text-[#D8DEDA] hover:-translate-y-[1px] hover:border-[#C5A059] hover:bg-[rgba(197,160,89,0.06)] hover:text-[#C5A059]"}`}>AI Task</button>
          <button type="submit" disabled={loading || !input.trim() || isComposerBlocked} className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-40 ${isLightTheme ? "border-[#C79B2C] bg-[#FFF8E8] text-[#8A6217] hover:-translate-y-[1px] hover:bg-[#FFF2D2]" : "border-[#C5A059] bg-[rgba(197,160,89,0.08)] text-[#F1D39A] hover:-translate-y-[1px] hover:bg-[rgba(197,160,89,0.14)]"}`}>Enviar</button>
        </div>
      </form>
    </div>
  );
}
