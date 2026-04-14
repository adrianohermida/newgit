import { useInternalTheme } from "../InternalThemeProvider";

function ActionButton({ children, onClick, tone = "default" }) {
  const { isLightTheme } = useInternalTheme();
  const toneClass =
    tone === "primary"
      ? "border-[#C79B2C] bg-[#C79B2C] text-[#07110E]"
      : isLightTheme
        ? "border-[#D7DEE8] bg-white text-[#51606B]"
        : "border-[#22342F] text-[#D8DEDA]";

  return (
    <button type="button" onClick={onClick} className={`rounded-full border px-3 py-2 text-xs font-medium transition hover:border-[#C5A059] hover:text-[#07110E] ${toneClass}`}>
      {children}
    </button>
  );
}

function StatPill({ label, value }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
      {label} {value}
    </span>
  );
}

export default function AITaskActionBar({ activeRun, compactLogs, handleContinueLastRun, handleReplay, handleSendToDotobot, handleStart, paused, routePath, selectedTask, thinking }) {
  const { isLightTheme } = useInternalTheme();
  const handoffPayload = selectedTask
    ? {
        id: selectedTask.id,
        label: `Tarefa ${selectedTask.title}`,
        mission: selectedTask.goal || selectedTask.description || selectedTask.title,
        moduleKey: selectedTask.moduleKeys?.[0] || "ai-task",
        moduleLabel: "AI Task",
      }
    : null;

  return (
    <section className={`rounded-[22px] border p-4 ${isLightTheme ? "border-[#E4D3A4] bg-[#FFF8EA]" : "border-[#3C3320] bg-[rgba(40,32,19,0.28)]"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#8D6D1F]" : "text-[#D9BE7A]"}`}>Proxima acao</p>
          <p className={`mt-2 text-base font-semibold ${isLightTheme ? "text-[#3D3113]" : "text-[#F7EACB]"}`}>
            {paused ? "Retomar a execucao atual" : activeRun ? "Monitorar a run ativa" : selectedTask ? "Transformar a tarefa em execucao" : "Escolha uma tarefa para comecar"}
          </p>
          <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#6A5931]" : "text-[#D5C6A0]"}`}>
            {selectedTask ? "A tarefa selecionada precisa virar acao clara no prompt ou ser enviada ao Copilot com contexto limpo." : "A fila esta pronta, mas o centro precisa de uma tarefa selecionada para reduzir ambiguidade."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatPill label="Pensamento" value={thinking.length} />
          <StatPill label="Logs" value={compactLogs.length} />
          <StatPill label="Status" value={selectedTask?.status || "idle"} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {selectedTask ? <ActionButton tone="primary" onClick={() => handleReplay(selectedTask)}>Usar como missao</ActionButton> : null}
        <ActionButton onClick={paused ? handleContinueLastRun : handleStart}>{paused ? "Retomar run" : "Executar agora"}</ActionButton>
        {handoffPayload ? <ActionButton onClick={() => handleSendToDotobot(handoffPayload, routePath)}>Enviar ao Copilot</ActionButton> : null}
      </div>
    </section>
  );
}
