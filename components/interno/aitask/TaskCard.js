import { useInternalTheme } from "../InternalThemeProvider";

export default function TaskCard({ task, isSelected, onSelect, compact = false, draggable = false, onDragStart = null }) {
  const { isLightTheme } = useInternalTheme();
  const statusTone = {
    pending: isLightTheme ? "text-[#6B7C88] border-[#D7DEE8]" : "text-[#9BAEA8] border-[#22342F]",
    running: "text-[#D9B46A] border-[#8b6f33]",
    done: "text-[#8FCFA9] border-[#234034]",
    failed: "text-[#f2b2b2] border-[#5b2d2d]",
  };

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={() => onSelect(task.id)}
      className={`w-full rounded-[22px] border p-4 text-left transition ${
        isSelected
          ? isLightTheme
            ? "border-[#C79B2C] bg-[#FFF8EA] shadow-[0_10px_26px_rgba(197,160,89,0.12)]"
            : "border-[#C5A059] bg-[linear-gradient(180deg,rgba(197,160,89,0.12),rgba(197,160,89,0.06))] shadow-[0_10px_26px_rgba(197,160,89,0.12)]"
          : isLightTheme
            ? "border-[#D7DEE8] bg-white hover:border-[#BAC8D6]"
            : "border-[#22342F] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] hover:border-[#35554B]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] uppercase tracking-[0.18em] ${statusTone[task.status] || "text-[#9BAEA8]"}`}>{task.status}</p>
          <h4 className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{task.title}</h4>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>{task.priority}</span>
      </div>
      <p className={`mt-2 text-sm leading-6 ${compact ? "line-clamp-3" : ""} ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{task.description}</p>
      <div className={`mt-3 flex flex-wrap gap-2 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
        <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>Agente: {task.assignedAgent}</span>
        {task.dependencies?.length ? <span className={`rounded-full border px-2.5 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F]"}`}>Depende: {task.dependencies.join(", ")}</span> : null}
      </div>
    </button>
  );
}
