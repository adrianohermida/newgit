import { useInternalTheme } from "../InternalThemeProvider";

function summarizeOrchestration(orchestration) {
  const subagents = Array.isArray(orchestration?.subagents) ? orchestration.subagents : [];
  const tasks = Array.isArray(orchestration?.tasks) ? orchestration.tasks : [];
  const parallelGroups = new Set(tasks.map((task) => task?.parallel_group).filter(Boolean));
  return { enabled: Boolean(orchestration?.multi_agent || subagents.length || tasks.length), parallelGroups, subagents, tasks };
}

export default function RunHistoryCard({ item, isActive, onSelect, formatHistoryStatus, formatExecutionSourceLabel, nowIso }) {
  const { isLightTheme } = useInternalTheme();
  const orchestrationSummary = summarizeOrchestration(item?.orchestration);
  return (
    <button type="button" onClick={() => onSelect?.(item)} className={`w-full rounded-[20px] border p-4 text-left transition ${isActive ? isLightTheme ? "border-[#D2B06A] bg-[#FFF8EA]" : "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : isLightTheme ? "border-[#D7DEE8] bg-white hover:border-[#BAC8D6]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#35554B]"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{formatHistoryStatus(item.status)}</p>
        <p className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#9BAEA8]"}`}>{new Date(item.updated_at || item.created_at || nowIso()).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
      </div>
      <p className={`mt-2 line-clamp-2 text-sm leading-6 ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{String(item.mission || "Sem conversa registrada")}</p>
      <div className={`mt-3 flex flex-wrap gap-2 text-[10px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
        <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>{formatExecutionSourceLabel(item.source)}</span>
        <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>{item.model || "n/a"}</span>
        {orchestrationSummary.enabled ? <span className="rounded-full border border-[#35554B] px-2 py-1 text-[#B7D5CB]">{orchestrationSummary.subagents.length || 1} agentes / {orchestrationSummary.tasks.length} tarefas</span> : null}
        {orchestrationSummary.parallelGroups.size ? <span className="rounded-full border border-[#234034] px-2 py-1 text-[#8FCFA9]">paralelo {orchestrationSummary.parallelGroups.size}</span> : null}
      </div>
    </button>
  );
}
