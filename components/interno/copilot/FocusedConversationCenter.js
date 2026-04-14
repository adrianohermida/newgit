import FocusedConversationComposer from "./FocusedConversationComposer";
import FocusedConversationHeader from "./FocusedConversationHeader";
import DotobotMessageBubble from "../DotobotMessageBubble";

function EmptyState({ isLightTheme }) {
  return (
    <div className={`rounded-[24px] border border-dashed p-6 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-[#F8FAFC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
      <p className={`text-base font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Pronto para conversar.</p>
      <p className="mt-2 leading-6">Escreva um pedido, retome um contexto existente ou delegue uma acao para o AI Task.</p>
    </div>
  );
}

function LocalAlert({ alert, handleLocalStackAction, isLightTheme }) {
  return (
    <div className={`rounded-[20px] border p-5 text-sm ${isLightTheme ? "border-[#E6D29A] bg-[#FFF8E8] text-[#8A6217]" : "border-[#6f5a2d] bg-[rgba(98,79,34,0.16)] text-[#f1dfb5]"}`}>
      <p className={`text-base font-semibold ${isLightTheme ? "text-[#6A4B12]" : "text-[#F5F1E8]"}`}>{alert.title}</p>
      <p className="mt-2 leading-6">{alert.body}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => handleLocalStackAction("open_runtime_config")} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}>Editar runtime local</button>
        <button type="button" onClick={() => handleLocalStackAction("open_ai_task")} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}>Continuar via AI Task</button>
      </div>
    </div>
  );
}

function FocusedConversationThread(props) {
  const { error, focusedConversationColumnClass, handleCopyMessage, handleLocalStackAction, handleMessageAction, handleOpenMessageInAiTask, handleReuseMessage, isLightTheme, loading, localInferenceAlert, messages, scrollRef } = props;
  const handleScrollToTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const handleScrollToBottom = () => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });

  return <div className={`relative min-h-0 flex-1 ${isLightTheme ? "bg-[#F7F8FA]" : "bg-[#0E1211]"}`}><div ref={scrollRef} className="h-full overflow-y-auto px-4 py-5 md:px-6"><div className={`flex min-h-full flex-col justify-end space-y-4 ${focusedConversationColumnClass}`}>{messages.length ? messages.map((message, idx) => <DotobotMessageBubble key={message.id || idx} message={message} onCopy={handleCopyMessage} onReuse={handleReuseMessage} onOpenAiTask={handleOpenMessageInAiTask} onAction={handleMessageAction} />) : <EmptyState isLightTheme={isLightTheme} />}{loading ? <DotobotMessageBubble message={{ role: "assistant", text: "", createdAt: null }} isTyping={true} /> : null}{localInferenceAlert && !messages.length ? <LocalAlert alert={localInferenceAlert} handleLocalStackAction={handleLocalStackAction} isLightTheme={isLightTheme} /> : null}{error ? <div className={`rounded-[24px] border px-4 py-3 text-sm ${isLightTheme ? "border-[#E9B4B4] bg-[#FFF1F1] text-[#B94A48]" : "border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] text-[#f2b2b2]"}`}>{error}</div> : null}</div></div><div className="pointer-events-none absolute bottom-4 right-4 flex flex-col gap-2"><button type="button" onClick={handleScrollToTop} aria-label="Voltar ao inicio" className={`pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D8E0E8] bg-white text-[#52616C] hover:border-[#2F7A62]" : "border-[#24312D] bg-[#101514] text-[#D8DEDA] hover:border-[#7FC4AF]"}`}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg></button><button type="button" onClick={handleScrollToBottom} aria-label="Ir para o final" className={`pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-all duration-200 active:scale-[0.98] ${isLightTheme ? "border-[#D8E0E8] bg-white text-[#52616C] hover:border-[#2F7A62]" : "border-[#24312D] bg-[#101514] text-[#D8DEDA] hover:border-[#7FC4AF]"}`}><svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button></div></div>;
}

export default function FocusedConversationCenter(props) {
  return (
    <section className={`flex h-full min-h-0 flex-col ${props.centerShellClass}`}>
      <div className={`border-b px-4 py-4 md:px-6 ${props.isLightTheme ? "border-[#E1E6EB] bg-[#F7F8FA]" : "border-[#22342F] bg-[#0E1211]"}`}>
        <FocusedConversationHeader activeConversation={props.activeConversation} activeMode={props.activeMode} activeProjectLabel={props.activeProjectLabel} handleQuickAction={props.handleQuickAction} isLightTheme={props.isLightTheme} messages={props.messages} visibleLegalActions={props.visibleLegalActions} />
      </div>
      <FocusedConversationThread error={props.error} focusedConversationColumnClass={props.focusedConversationColumnClass} handleCopyMessage={props.handleCopyMessage} handleLocalStackAction={props.handleLocalStackAction} handleMessageAction={props.handleMessageAction} handleOpenMessageInAiTask={props.handleOpenMessageInAiTask} handleReuseMessage={props.handleReuseMessage} isLightTheme={props.isLightTheme} loading={props.loading} localInferenceAlert={props.localInferenceAlert} messages={props.messages} scrollRef={props.scrollRef} />
      <FocusedConversationComposer attachments={props.attachments} composerBlockedReason={props.composerBlockedReason} composerRef={props.composerRef} formatBytes={props.formatBytes} handleComposerKeyDown={props.handleComposerKeyDown} handleDrop={props.handleDrop} handleOpenFiles={props.handleOpenFiles} handlePaste={props.handlePaste} handleSlashCommand={props.handleSlashCommand} handleSubmit={props.handleSubmit} input={props.input} isComposerBlocked={props.isComposerBlocked} isLightTheme={props.isLightTheme} isRecording={props.isRecording} loading={props.loading} onOpenAiTask={props.onOpenAiTask} setInput={props.setInput} setShowSlashCommands={props.setShowSlashCommands} showSlashCommands={props.showSlashCommands} slashCommands={props.slashCommands} toggleVoiceInput={props.toggleVoiceInput} />
    </section>
  );
}
