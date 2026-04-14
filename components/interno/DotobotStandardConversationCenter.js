import DotobotMessageBubble from "./DotobotMessageBubble";
import DotobotConversationCenterHeader from "./DotobotConversationCenterHeader";
import DotobotConversationComposer from "./DotobotConversationComposer";

function EmptyState({ isLightTheme }) {
  return (
    <div className={`rounded-[20px] border border-dashed p-5 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
      <p className={`text-base font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Pronto para conversar.</p>
      <p className="mt-2 leading-6">Escreva um pedido, continue um contexto existente ou delegue uma acao para o AI Task.</p>
    </div>
  );
}

function LocalInferenceAlert({ alert, handleLocalStackAction, isLightTheme }) {
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

export default function DotobotStandardConversationCenter(props) {
  const { centerShellClass, error, focusedConversationColumnClass, handleCopyMessage, handleLocalStackAction, handleMessageAction, handleOpenMessageInAiTask, handleReuseMessage, isLightTheme, loading, localInferenceAlert, messages, scrollRef } = props;

  return (
    <section className={`flex min-h-0 flex-col ${centerShellClass}`}>
      <DotobotConversationCenterHeader {...props} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
        <div className={`flex min-h-full flex-col justify-end space-y-3 ${focusedConversationColumnClass}`}>
          {messages.length ? messages.map((message, idx) => (
            <DotobotMessageBubble
              key={message.id || idx}
              message={message}
              isLightTheme={isLightTheme}
              onCopy={handleCopyMessage}
              onReuse={handleReuseMessage}
              onOpenAiTask={handleOpenMessageInAiTask}
              onAction={handleMessageAction}
            />
          )) : <EmptyState isLightTheme={isLightTheme} />}
          {loading ? <DotobotMessageBubble message={{ role: "assistant", text: "", createdAt: null }} isTyping={true} isLightTheme={isLightTheme} /> : null}
          {localInferenceAlert && !messages.length ? <LocalInferenceAlert alert={localInferenceAlert} handleLocalStackAction={handleLocalStackAction} isLightTheme={isLightTheme} /> : null}
          {error ? <div className={`rounded-[24px] border px-4 py-3 text-sm ${isLightTheme ? "border-[#E9B4B4] bg-[#FFF1F1] text-[#B94A48]" : "border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] text-[#f2b2b2]"}`}>{error}</div> : null}
        </div>
      </div>
      <DotobotConversationComposer {...props} />
    </section>
  );
}
