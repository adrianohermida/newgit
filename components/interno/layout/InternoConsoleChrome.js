import { formatPaneCountLabel } from "./consoleSummary";

export default function InternoConsoleChrome({
  activityLogCount,
  consoleOpen,
  consoleTab,
  formatClass,
  handleStartResize,
  isLightTheme,
  isMobileShell,
  logPane,
  onToggleConsole,
  onToggleTab,
  paneCounts,
  visibleLogPaneGroups,
}) {
  const activeLogPane = visibleLogPaneGroups
    .flatMap((group) => group.panes || [])
    .find((pane) => pane.key === logPane);

  return <>
    {consoleOpen ? <div onMouseDown={isMobileShell ? undefined : handleStartResize} className={`shrink-0 flex h-3 items-center justify-center border-b text-[#60706A] ${isMobileShell ? "cursor-default" : "cursor-row-resize"} ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(210,219,229,0.55)]" : "border-[#1E2E29] bg-[rgba(255,255,255,0.02)]"}`} title={isMobileShell ? "Console mobile" : "Arraste para redimensionar"}>
      <span className={`h-1 w-10 rounded-full ${isLightTheme ? "bg-[#A5B4C3]" : "bg-[#22342F]"}`} />
    </div> : null}
    <div className={`shrink-0 border-b px-4 py-3 ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(255,255,255,0.82)]" : "border-[#1A2421] bg-[rgba(7,9,8,0.88)]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#6F837B]"}`}>Painel inferior</p>
            <p className={`mt-1 text-sm font-semibold normal-case tracking-[0.01em] ${isLightTheme ? "text-[#13201D]" : "text-[#F5F1E8]"}`}>
              {consoleTab === "console" ? "Console operacional" : `Log ${activeLogPane?.label ? `· ${activeLogPane.label}` : "global"}`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[#C5A059]">
            <button type="button" onClick={() => onToggleTab("console")} className={`rounded-[14px] border px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition ${consoleTab === "console" ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)] text-[#C5A059]" : formatClass}`}>Console</button>
            <button type="button" onClick={() => onToggleTab("log")} className={`rounded-[14px] border px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition ${consoleTab === "log" ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)] text-[#C5A059]" : formatClass}`}>Log</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {consoleTab === "log" ? <div className="flex max-w-[70vw] flex-wrap items-start gap-2">
          <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${formatClass}`}>{activityLogCount} entradas</span>
          {visibleLogPaneGroups.map((group) => <div key={group.key} className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#60706A]"}`}>{group.label}</span>
            {group.panes.map((pane) => <button key={pane.key} type="button" onClick={() => onToggleTab("log", pane.key)} className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${logPane === pane.key ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)] text-[#C5A059]" : formatClass}`}>{pane.label} {formatPaneCountLabel(paneCounts[pane.key] || 0)}</button>)}
          </div>)}
        </div> : null}
          <button type="button" onClick={onToggleConsole} className={`rounded-[14px] border px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${formatClass}`} title={consoleOpen ? "Recolher console" : "Expandir console"}>{consoleOpen ? "Recolher" : "Expandir"}</button>
        </div>
      </div>
    </div>
  </>;
}
