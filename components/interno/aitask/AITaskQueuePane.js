import { useInternalTheme } from "../InternalThemeProvider";

function QueueItem({ active, onClick, task }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${active ? isLightTheme ? "border-[#C79B2C] bg-[#FFF8EA]" : "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : isLightTheme ? "border-[#D7DEE8] bg-white hover:border-[#BAC8D6]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#35554B]"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`truncate text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{task.title}</p>
          <p className={`mt-1 line-clamp-2 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{task.description}</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase ${isLightTheme ? "border-[#D7DEE8] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{task.status}</span>
      </div>
      <div className={`mt-3 flex flex-wrap gap-2 text-[10px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
        <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>{task.priority}</span>
        <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>{task.assignedAgent || "Dotobot"}</span>
      </div>
    </button>
  );
}

export default function AITaskQueuePane({ hasMoreTasks, onLoadMoreTasks, selectedTaskId, setSelectedTaskId, taskColumns, tasks }) {
  const { isLightTheme } = useInternalTheme();

  return (
    <aside className={`min-h-0 overflow-hidden rounded-[24px] border ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(255,255,255,0.8)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
      <div className={`border-b px-4 py-4 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Fila</p>
        <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Tarefas do fluxo</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <span className={`rounded-[14px] border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>Pendentes {taskColumns.pending.length}</span>
          <span className={`rounded-[14px] border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>Rodando {taskColumns.running.length}</span>
          <span className={`rounded-[14px] border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>Concluídas {taskColumns.done.length}</span>
          <span className={`rounded-[14px] border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>Falhas {taskColumns.failed.length}</span>
        </div>
      </div>
      <div className="max-h-[65vh] space-y-2 overflow-y-auto p-3">
        {tasks.length ? tasks.map((task) => <QueueItem key={task.id} active={selectedTaskId === task.id} onClick={() => setSelectedTaskId(task.id)} task={task} />) : <div className={`rounded-[18px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>Nenhuma tarefa disponível.</div>}
        {hasMoreTasks ? <button type="button" onClick={onLoadMoreTasks} className={`w-full rounded-[16px] border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Carregar mais tarefas</button> : null}
      </div>
    </aside>
  );
}
