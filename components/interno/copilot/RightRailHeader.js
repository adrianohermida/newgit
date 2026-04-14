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

export default function RightRailHeader(props) {
  const {
    activeRightPanelMeta,
    availableRightPanelTabs,
    isLightTheme,
    rightPanelTab,
    setRightPanelTab,
  } = props;

  return (
    <div className={`border-b px-4 py-4 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
      <div className="flex flex-col gap-3">
        <div>
          <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Painel lateral</p>
          <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activeRightPanelMeta.title}</p>
          <p className={`mt-1 max-w-[19rem] text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#7F928C]"}`}>{activeRightPanelMeta.detail}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {availableRightPanelTabs.includes("modules") ? <TabButton active={rightPanelTab === "modules"} isLightTheme={isLightTheme} label="Módulos" onClick={() => setRightPanelTab("modules")} /> : null}
          {availableRightPanelTabs.includes("ai-task") ? <TabButton active={rightPanelTab === "ai-task"} isLightTheme={isLightTheme} label="AI Task" onClick={() => setRightPanelTab("ai-task")} /> : null}
          {availableRightPanelTabs.includes("agentlabs") ? <TabButton active={rightPanelTab === "agentlabs"} isLightTheme={isLightTheme} label="AgentLabs" onClick={() => setRightPanelTab("agentlabs")} /> : null}
          {availableRightPanelTabs.includes("context") ? <TabButton active={rightPanelTab === "context"} isLightTheme={isLightTheme} label="Contexto" onClick={() => setRightPanelTab("context")} /> : null}
        </div>
      </div>
    </div>
  );
}
