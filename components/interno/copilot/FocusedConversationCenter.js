import FocusedConversationComposer from "./FocusedConversationComposer";
import FocusedConversationHeader from "./FocusedConversationHeader";
import FocusedConversationThread from "./FocusedConversationThread";

export default function FocusedConversationCenter(props) {
  return (
    <section className={`flex min-h-0 flex-col ${props.centerShellClass}`}>
      <div className={`border-b px-4 py-4 md:px-5 ${props.isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
        <FocusedConversationHeader activeConversation={props.activeConversation} activeMode={props.activeMode} activeProjectLabel={props.activeProjectLabel} handleQuickAction={props.handleQuickAction} isLightTheme={props.isLightTheme} messages={props.messages} visibleLegalActions={props.visibleLegalActions} />
      </div>
      <FocusedConversationThread error={props.error} focusedConversationColumnClass={props.focusedConversationColumnClass} handleCopyMessage={props.handleCopyMessage} handleLocalStackAction={props.handleLocalStackAction} handleMessageAction={props.handleMessageAction} handleOpenMessageInAiTask={props.handleOpenMessageInAiTask} handleReuseMessage={props.handleReuseMessage} isLightTheme={props.isLightTheme} loading={props.loading} localInferenceAlert={props.localInferenceAlert} messages={props.messages} scrollRef={props.scrollRef} />
      <FocusedConversationComposer attachments={props.attachments} composerBlockedReason={props.composerBlockedReason} composerRef={props.composerRef} formatBytes={props.formatBytes} handleComposerKeyDown={props.handleComposerKeyDown} handleDrop={props.handleDrop} handleOpenFiles={props.handleOpenFiles} handlePaste={props.handlePaste} handleSlashCommand={props.handleSlashCommand} handleSubmit={props.handleSubmit} input={props.input} isComposerBlocked={props.isComposerBlocked} isLightTheme={props.isLightTheme} isRecording={props.isRecording} loading={props.loading} onOpenAiTask={props.onOpenAiTask} setInput={props.setInput} setShowSlashCommands={props.setShowSlashCommands} showSlashCommands={props.showSlashCommands} slashCommands={props.slashCommands} toggleVoiceInput={props.toggleVoiceInput} />
    </section>
  );
}
