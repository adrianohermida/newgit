import InternoConsoleChrome from "./InternoConsoleChrome";
import InternoConsoleOverviewTab from "./InternoConsoleOverviewTab";
import InternoConsolePaneBody from "./InternoConsolePaneBody";

export default function InternoConsoleDock(props) {
  const {
    activityLog,
    archivedCount,
    formattedArchiveHint,
    handleArchive,
    handleCopyLog,
    handleExportLog,
    handlePageDebug,
    handleStartResize,
    isCopilotWorkspace,
    isLightTheme,
    isMobileShell,
    mobileConsoleHeight,
    consoleOpen,
    consoleHeight,
    desktopConsoleStyle,
    consoleTab,
    logPane,
    paneCounts,
    visibleLogPaneGroups,
    setConsoleOpen,
    setConsoleTab,
    setLogPane,
    coverageCards,
    coverageSummary,
    frontendIssues,
    handleOpenModuleAlert,
    moduleAlerts,
    schemaIssues,
    setLogSearch,
    updateFilters,
    clearActivityLog,
    paneBodyProps,
  } = props;
  const formatClass = isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88] hover:border-[#C5A059] hover:text-[#C5A059]" : "border-[#22342F] text-[#9BAEA8] hover:border-[#C5A059] hover:text-[#C5A059]";

  return <div className={`z-30 min-h-[52px] shrink-0 overflow-hidden border transition-all ${isCopilotWorkspace ? `${isLightTheme ? "border-x-0 border-b-0 border-t-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(241,245,249,0.985))]" : "border-x-0 border-b-0 border-t-[#1E2E29] bg-[linear-gradient(180deg,rgba(10,12,11,0.99),rgba(6,8,7,0.99))]"} rounded-none shadow-none` : `${isLightTheme ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.98))]" : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(10,12,11,0.985),rgba(6,8,7,0.98))]"} rounded-[24px] shadow-[0_-12px_38px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.02)]`} ${consoleOpen ? "flex flex-col" : "block h-[60px]"} ${isMobileShell ? "fixed inset-x-2 bottom-2" : "fixed"}`} style={isMobileShell ? { height: consoleOpen ? `${mobileConsoleHeight}px` : undefined } : desktopConsoleStyle}>
    <InternoConsoleChrome activityLogCount={activityLog.length} consoleOpen={consoleOpen} consoleTab={consoleTab} formatClass={formatClass} handleStartResize={handleStartResize} isLightTheme={isLightTheme} isMobileShell={isMobileShell} logPane={logPane} onToggleConsole={() => setConsoleOpen((current) => !current)} onToggleTab={(tab, pane) => { setConsoleTab(tab); if (pane) setLogPane(pane); }} paneCounts={paneCounts} visibleLogPaneGroups={visibleLogPaneGroups} />
    {consoleOpen ? <div className={`min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 text-xs md:px-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
      {consoleTab === "console" ? <InternoConsoleOverviewTab coverageCards={coverageCards} coverageSummary={coverageSummary} frontendIssues={frontendIssues} handleOpenModuleAlert={handleOpenModuleAlert} isLightTheme={isLightTheme} moduleAlerts={moduleAlerts} schemaIssues={schemaIssues} setConsoleOpen={setConsoleOpen} setConsoleTab={setConsoleTab} setLogPane={setLogPane} setLogSearch={setLogSearch} updateFilters={updateFilters} /> : <div className="space-y-3">
        <div className={`rounded-xl border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#7B8B98]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.45)] text-[#7F928C]"}`}>Itens organizados por grupos de visao, auditoria, integracoes, IA e governanca para reduzir mistura entre tipo de evento e origem tecnica.</div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => clearActivityLog()} className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${formatClass}`}>Limpar (arquivar)</button>
          <button type="button" onClick={() => handleArchive("Arquivo manual")} className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${formatClass}`}>Arquivar</button>
          <button type="button" onClick={handleCopyLog} className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${formatClass}`}>Copiar log</button>
          <button type="button" onClick={handleExportLog} className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${formatClass}`}>Exportar MD</button>
          <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${formatClass}`}>Arquivos: {archivedCount}</span>
          <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${formatClass}`}>{formattedArchiveHint}</span>
        </div>
        <InternoConsolePaneBody {...paneBodyProps} />
      </div>}
    </div> : null}
    {consoleOpen ? <div className={`shrink-0 border-t px-4 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(255,255,255,0.88)]" : "border-[#1E2E29] bg-[rgba(8,10,9,0.72)]"}`}><div className="flex items-center justify-end"><button type="button" onClick={handlePageDebug} className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-white text-[#60706A]" : "border-[#22342F] text-[#9BAEA8]"}`} title="Registrar debug desta pagina">Debug</button></div></div> : null}
  </div>;
}
