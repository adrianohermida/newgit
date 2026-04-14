function StatusPill({ children, isLightTheme }) {
  return (
    <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>
      {children}
    </span>
  );
}

export default function FocusedAiTaskPanel({
  activeTaskLabel,
  activeTaskProviderLabel,
  activeTaskStepCount,
  isLightTheme,
  onOpenAiTask,
  runningCount,
  taskHistory,
}) {
  const panelTone = isLightTheme ? "border-[#E1E6EB] bg-[rgba(255,255,255,0.84)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]";
  const mutedTone = isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]";

  return (
    <div className="space-y-3">
      <p className={`text-sm ${mutedTone}`}>Subtarefas e missão ativa, sem tirar o foco da conversa.</p>
      <div className="flex flex-wrap gap-2">
        <StatusPill isLightTheme={isLightTheme}>ativas {runningCount}</StatusPill>
        <StatusPill isLightTheme={isLightTheme}>etapas {activeTaskStepCount}</StatusPill>
        <StatusPill isLightTheme={isLightTheme}>{activeTaskProviderLabel}</StatusPill>
      </div>

      <div className={`rounded-[18px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[#F8FAFC]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${mutedTone}`}>Missão em foco</p>
        <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeTaskLabel}</p>
        <button
          type="button"
          onClick={onOpenAiTask}
          className={`mt-3 rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}
        >
          Abrir AI Task
        </button>
      </div>

      {taskHistory.length ? taskHistory.slice(0, 3).map((task) => (
        <article key={task.id} className={`rounded-[18px] border p-4 text-sm ${panelTone}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`text-[10px] uppercase tracking-[0.18em] ${mutedTone}`}>{task.status || "indefinido"}</p>
              <p className={`mt-2 line-clamp-3 font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{task.query}</p>
            </div>
            <span className={`text-[10px] ${mutedTone}`}>
              {task.startedAt ? new Date(task.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--"}
            </span>
          </div>
        </article>
      )) : (
        <div className={`rounded-[20px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>
          Nenhuma tarefa ainda.
        </div>
      )}
    </div>
  );
}
