import FocusedAiTaskPanel from "./FocusedAiTaskPanel";
import FocusedContextPanel from "./FocusedContextPanel";

function TabButton({ active, isLightTheme, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${active ? "border-[#C5A059] bg-[rgba(197,160,89,0.10)] text-[#9A6E2D] shadow-[0_8px_24px_rgba(197,160,89,0.10)]" : isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88] hover:border-[#9A6E2D] hover:text-[#9A6E2D]" : "border-[#22342F] text-[#9BAEA8] hover:border-[#35554B] hover:text-[#D8DEDA]"}`}
    >
      {label}
    </button>
  );
}

export default function FocusedCopilotAside(props) {
  const { activeRightPanelMeta, isLightTheme, rightPanelTab, rightRailShellClass, setRightPanelTab } = props;

  return (
    <aside className={`hidden h-full min-h-0 flex-col overflow-hidden xl:flex ${rightRailShellClass || ""}`}>
      <div className={`border-b px-4 py-3 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Apoio lateral</p>
        <p className={`mt-1.5 text-[13px] font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeRightPanelMeta.title}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <TabButton active={rightPanelTab === "context"} isLightTheme={isLightTheme} label="Contexto" onClick={() => setRightPanelTab("context")} />
          <TabButton active={rightPanelTab === "ai-task"} isLightTheme={isLightTheme} label="AI Task" onClick={() => setRightPanelTab("ai-task")} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {rightPanelTab === "ai-task" ? <FocusedAiTaskPanel {...props} /> : <FocusedContextPanel {...props} />}
      </div>
    </aside>
  );
}
