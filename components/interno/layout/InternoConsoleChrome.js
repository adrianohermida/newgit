import { formatActivityCountLabel, formatPaneCountLabel } from "./consoleSummary";

function ConsoleTabButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[12px] border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] transition-all duration-150 ${
        active
          ? "border-[#C5A059] bg-[rgba(197,160,89,0.1)] text-[#E8C783]"
          : "border-transparent text-[#7F928C] hover:border-[#22342F] hover:text-[#E6E0D3]"
      }`}
    >
      {children}
    </button>
  );
}

export default function InternoConsoleChrome({
  activityLogCount,
  consoleExpanded,
  consoleOpen,
  consoleTab,
  formatClass,
  handleStartResize,
  isLightTheme,
  isMobileShell,
  logPane,
  onToggleConsoleExpanded,
  onToggleConsole,
  onToggleTab,
  paneCounts,
  visibleLogPaneGroups,
}) {
  const activeLogPane = visibleLogPaneGroups
    .flatMap((group) => group.panes || [])
    .find((pane) => pane.key === logPane);
  const activeGroup = visibleLogPaneGroups.find((group) => (group.panes || []).some((pane) => pane.key === logPane));
  const railTextClass = isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]";
  const groupTextClass = isLightTheme ? "text-[#7B8B98]" : "text-[#60706A]";

  return (
    <>
      {consoleOpen ? (
        <div
          onMouseDown={isMobileShell ? undefined : handleStartResize}
          className={`shrink-0 flex h-3 items-center justify-center border-b ${
            isMobileShell ? "cursor-default" : "cursor-row-resize"
          } ${isLightTheme ? "border-[#D4DEE8] bg-[rgba(210,219,229,0.4)]" : "border-[#1E2E29] bg-[rgba(255,255,255,0.015)]"}`}
          title={isMobileShell ? "Console mobile" : "Arraste para redimensionar"}
        >
          <span className={`h-1 w-12 rounded-full ${isLightTheme ? "bg-[#A5B4C3]" : "bg-[#22342F]"}`} />
        </div>
      ) : null}

      <div
        className={`shrink-0 border-b px-4 py-2.5 ${
          isLightTheme
            ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(244,247,250,0.92))]"
            : "border-[#1A2421] bg-[linear-gradient(180deg,rgba(9,11,10,0.98),rgba(6,8,7,0.96))]"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`hidden rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.2em] md:inline-flex ${formatClass}`}>
              Footer dock
            </span>
            <div className="flex items-center gap-1">
              <ConsoleTabButton active={consoleTab === "console"} onClick={() => onToggleTab("console")}>
                Console
              </ConsoleTabButton>
              <ConsoleTabButton active={consoleTab === "log"} onClick={() => onToggleTab("log")}>
                Log
              </ConsoleTabButton>
            </div>
            <div className={`min-w-0 text-[11px] ${railTextClass}`}>
              <span className="font-medium text-[#C5A059]">{consoleTab === "console" ? "Overview" : activeLogPane?.label || "Global"}</span>
              <span className="mx-2 opacity-40">/</span>
              <span>{formatActivityCountLabel(activityLogCount)}</span>
              {consoleTab === "log" && activeGroup?.label ? <span className={`ml-2 uppercase tracking-[0.16em] ${groupTextClass}`}>{activeGroup.label}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {consoleTab === "log" ? (
              <div className="flex max-w-[72vw] flex-wrap items-center gap-2">
                {visibleLogPaneGroups.map((group) => (
                  <div key={group.key} className="flex flex-wrap items-center gap-1.5">
                    <span className={`pr-1 text-[10px] uppercase tracking-[0.16em] ${groupTextClass}`}>{group.label}</span>
                    {group.panes.map((pane) => {
                      const countLabel = formatPaneCountLabel(paneCounts[pane.key] || 0);
                      const active = logPane === pane.key;
                      return (
                        <button
                          key={pane.key}
                          type="button"
                          onClick={() => onToggleTab("log", pane.key)}
                          className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] transition-all duration-150 ${
                            active
                              ? "border-[#C5A059] bg-[rgba(197,160,89,0.1)] text-[#E8C783]"
                              : formatClass
                          }`}
                        >
                          {pane.label}
                          {countLabel ? ` ${countLabel}` : ""}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}

            {consoleOpen ? (
              <button
                type="button"
                onClick={onToggleConsoleExpanded}
                className={`rounded-[12px] border px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-all duration-150 hover:border-[#C5A059] hover:text-[#C5A059] ${formatClass}`}
                title={consoleExpanded ? "Voltar ao modo compacto" : "Expandir console"}
              >
                {consoleExpanded ? "Compactar" : "Expandir"}
              </button>
            ) : null}

            <button
              type="button"
              onClick={onToggleConsole}
              className={`rounded-[12px] border px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] transition-all duration-150 hover:border-[#C5A059] hover:text-[#C5A059] ${formatClass}`}
              title={consoleOpen ? "Ocultar console" : "Abrir console"}
            >
              {consoleOpen ? "Fechar" : "Abrir"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
