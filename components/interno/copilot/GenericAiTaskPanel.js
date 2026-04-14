function StatPill({ children, isLightTheme }) {
  return <span className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{children}</span>;
}

export default function GenericAiTaskPanel({
  activeTaskLabel,
  activeTaskProviderLabel,
  activeTaskStepCount,
  handleEnableNotifications,
  handlePause,
  handleResetTasks,
  handleRetry,
  isLightTheme,
  notificationsEnabled,
  onOpenAiTask,
  parseProviderPresentation,
  runningCount,
  taskHistory,
  TaskStatusChip,
  useCondensedRightRail,
}) {
  const visibleTasks = useCondensedRightRail ? taskHistory.slice(0, 2) : taskHistory;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{useCondensedRightRail ? "Execucoes em foco." : "Tarefas em andamento e proximos passos sugeridos."}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onOpenAiTask} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}>Abrir AI Task</button>
          {!useCondensedRightRail ? <button type="button" onClick={handleResetTasks} className={`rounded-2xl border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Limpar</button> : null}
        </div>
      </div>
      <div className={`grid gap-2 ${useCondensedRightRail ? "grid-cols-3" : "sm:grid-cols-3"}`}>
        <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}><p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Ativas</p><p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{runningCount}</p></div>
        <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}><p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Etapas</p><p className={`mt-2 text-lg font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeTaskStepCount}</p></div>
        <div className={`rounded-[16px] border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}><p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Provider</p><p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeTaskProviderLabel}</p></div>
      </div>
      <div className={`rounded-[18px] border ${useCondensedRightRail ? "p-3" : "p-4"} ${isLightTheme ? "border-[#D7DEE8] bg-[#F8FAFC]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Missao em foco</p>
        <p className={`mt-1.5 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeTaskLabel}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {!notificationsEnabled ? <button type="button" onClick={handleEnableNotifications} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Ativar notificacoes</button> : null}
          <button type="button" onClick={onOpenAiTask} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#2F7A62] hover:border-[#2F7A62]" : "border-[#35554B] text-[#B7D5CB] hover:border-[#7FC4AF] hover:text-[#7FC4AF]"}`}>Abrir workspace</button>
        </div>
      </div>
      {visibleTasks.length ? visibleTasks.map((task) => (
        <article key={task.id} className={`rounded-[18px] border ${useCondensedRightRail ? "p-3" : "p-4"} text-sm ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]"><TaskStatusChip status={task.status} /></p>
              <p className={`mt-2 line-clamp-3 font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{task.query}</p>
            </div>
            <span className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#9BAEA8]"}`}>{task.startedAt ? new Date(task.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "--"}</span>
          </div>
          <div className={`mt-3 flex flex-wrap gap-2 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
            <StatPill isLightTheme={isLightTheme}>{parseProviderPresentation(task.provider || "gpt").name}</StatPill>
            <StatPill isLightTheme={isLightTheme}>{task.steps?.length || 0} etapas</StatPill>
            {task.rag?.retrieval?.enabled ? <StatPill isLightTheme={isLightTheme}>RAG {task.rag.retrieval.matches?.length || 0}</StatPill> : null}
          </div>
          {!useCondensedRightRail ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => handlePause(task)} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>{task.status === "paused" ? "Retomar" : "Pausar"}</button><button type="button" onClick={() => handleRetry(task)} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Replay</button></div> : null}
        </article>
      )) : <div className={`rounded-[20px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#9BAEA8]"}`}>Nenhuma tarefa ainda.</div>}
    </div>
  );
}
