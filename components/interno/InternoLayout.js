import { useRouter } from "next/router";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSupabaseBrowser } from "../../lib/supabase";
import { useInternalTheme } from "./InternalThemeProvider";
import DotobotCopilot from "./DotobotPanel";
import InternoConsoleChrome from "./layout/InternoConsoleChrome";
import InternoConsoleIssuePane from "./layout/InternoConsoleIssuePane";
import InternoConsoleLogAnalytics from "./layout/InternoConsoleLogAnalytics";
import InternoConsoleLogEntryCard from "./layout/InternoConsoleLogEntryCard";
import InternoConsoleLogInsights from "./layout/InternoConsoleLogInsights";
import InternoConsoleNotesPanel from "./layout/InternoConsoleNotesPanel";
import InternoConsoleOverviewTab from "./layout/InternoConsoleOverviewTab";
import InternoShellContent from "./layout/InternoShellContent";
import InternoShellHeader from "./layout/InternoShellHeader";
import RailPanel from "./layout/RailPanel";
import {
  buildCoverageCards,
  deriveModuleSafeWindow,
  PRIORITY_MODULE_KEYS,
  summarizeModuleAlert,
} from "./layout/moduleCoverage";
import OperationalRightRail from "./layout/OperationalRightRail";
import InternoSidebar from "./layout/InternoSidebar";
import {
  getFingerprintStatusTone,
  getSeverityTone,
} from "./layout/consoleSummary";
import { getConsoleHeightLimits } from "./layout/consolePlaybooks";
import { getModuleIntegrationGuide as getExternalModuleIntegrationGuide } from "./layout/IntegrationGuideCard";
import { NAV_ITEMS, normalizeDisplayName } from "./layout/sidebarConfig";
import { useInternoConsoleActions } from "./layout/useInternoConsoleActions";
import { useInternoConsoleAnalytics } from "./layout/useInternoConsoleAnalytics";
import { useInternoShellUi } from "./layout/useInternoShellUi";
import { useInternoShellState } from "./layout/useInternoShellState";
import {
  clearActivityLog,
  getActivityLogFilters,
  getFrontendIssues,
  getFingerprintStates,
  getSchemaIssues,
  setModuleHistory as persistModuleHistory,
  setFingerprintState,
  subscribeActivityLog,
  setActivityLogFilters,
} from "../../lib/admin/activity-log";
import {
  SPECIAL_LOG_PANES,
  TAG_LOG_PANES,
} from "../../lib/admin/console-log-utils.js";
import { inferModuleKeyFromPathname } from "../../lib/admin/module-registry.js";

export default function InternoLayout({
  title,
  description,
  profile,
  children,
  hideDotobotRail = false,
  forceDotobotRail = false,
  rightRailFullscreen = false,
  rightRail,
  hideShellSidebar = false,
}) {
  const router = useRouter();
  const { supabase } = useSupabaseBrowser();
  const { isLightTheme, preference, setThemePreference, toggleTheme } = useInternalTheme();
  const isCopilotWorkspace = router.pathname === "/interno/copilot";
  const shouldRenderDotobotRail = !hideDotobotRail || forceDotobotRail;
  const initialWorkspaceOpen = true;
  const shouldStartWithOpenRail = rightRailFullscreen || router.pathname === "/interno/agentlab/conversations" || shouldRenderDotobotRail;
  const {
    closeMobileSidebar,
    consoleHeight,
    consoleOpen,
    consoleTab,
    copilotOpen,
    handleToggleCopilot,
    handleToggleRightRail,
    isMobileShell,
    leftCollapsed,
    logPane,
    rightCollapsed,
    rightRailMode,
    setConsoleHeight,
    setConsoleOpen,
    setConsoleTab,
    setLeftCollapsed,
    setLogPane,
    toggleRightRailMode,
  } = useInternoShellState({
    getConsoleHeightLimits,
    isCopilotWorkspace,
    shouldRenderDotobotRail,
    shouldStartWithOpenRail,
  });
  const [activityLog, setActivityLog] = useState([]);
  const [archivedLogs, setArchivedLogs] = useState([]);
  const [operationalNotes, setOperationalNotes] = useState([]);
  const [frontendIssues, setFrontendIssues] = useState(() => getFrontendIssues());
  const [fingerprintStates, setFingerprintStates] = useState(() => getFingerprintStates());
  const [schemaIssues, setSchemaIssues] = useState(() => getSchemaIssues());
  const [moduleHistory, setModuleHistory] = useState({});
  const [noteInput, setNoteInput] = useState("");
  const [frontendForm, setFrontendForm] = useState({
    page: "",
    component: "",
    detail: "",
    status: "aberto",
  });
  const [schemaForm, setSchemaForm] = useState({
    type: "",
    table: "",
    column: "",
    code: "",
    detail: "",
  });
  const [headerSearch, setHeaderSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [headerLlm, setHeaderLlm] = useState("gpt");
  const [logFilters, setLogFilters] = useState(() => getActivityLogFilters());
  const [logSearch, setLogSearch] = useState("");
  const deferredLogSearch = useDeferredValue(logSearch);
  const [logExpanded, setLogExpanded] = useState(null);
  const dragStateRef = useRef({ dragging: false, startY: 0, startHeight: 260 });
  const headerSearchRef = useRef(null);
  const settingsModalRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    return subscribeActivityLog((entries, archives, notes, filters, frontendItems, schemaItems, moduleSnapshot, fingerprintSnapshot) => {
      setActivityLog(entries);
      setArchivedLogs(archives || []);
      setOperationalNotes(notes || []);
      setFrontendIssues(frontendItems || []);
      setSchemaIssues(schemaItems || []);
      setFingerprintStates(fingerprintSnapshot && typeof fingerprintSnapshot === "object" ? fingerprintSnapshot : {});
      if (moduleSnapshot && typeof moduleSnapshot === "object") {
        setModuleHistory(moduleSnapshot);
      }
      setLogFilters(filters && typeof filters === "object" ? filters : {});
    });
  }, []);

  const archivedCount = archivedLogs.length;
  const lastArchiveAt = archivedLogs[0]?.createdAt || null;
  const formattedArchiveHint = useMemo(() => {
    if (!lastArchiveAt) return "Sem arquivos ainda";
    const date = new Date(lastArchiveAt);
    return `Ultimo arquivo: ${date.toLocaleString("pt-BR")}`;
  }, [lastArchiveAt]);
  const coverageCards = useMemo(() => buildCoverageCards(moduleHistory), [moduleHistory]);
  const currentModuleKey = useMemo(() => inferModuleKeyFromPathname(router.pathname), [router.pathname]);
  const coverageSummary = useMemo(() => ({
    routeCount: new Set(coverageCards.map((item) => item.routePath).filter(Boolean)).size,
    errorCount: coverageCards.filter((item) => item.tone === "danger").length,
  }), [coverageCards]);
  const moduleAlerts = useMemo(() => {
    const map = new Map();
    for (const card of coverageCards) {
      if (!PRIORITY_MODULE_KEYS.has(card.key)) continue;
      const alert = summarizeModuleAlert(card.key, activityLog, fingerprintStates);
      map.set(card.key, {
        ...alert,
        safeWindow: deriveModuleSafeWindow(card.key, card.snapshot, alert),
      });
    }
    return map;
  }, [activityLog, coverageCards, fingerprintStates]);

  useEffect(() => {
    persistModuleHistory("interno-shell", {
      routePath: router.pathname,
      shell: "interno",
      title,
      description,
      consoleOpen,
      consoleTab,
      logPane,
      copilotOpen,
      navItems: NAV_ITEMS.length,
      archivedCount,
      recentLogCount: activityLog.length,
      frontendIssueCount: frontendIssues.length,
      schemaIssueCount: schemaIssues.length,
      updatedAt: new Date().toISOString(),
    });
  }, [
    activityLog.length,
    archivedCount,
    consoleOpen,
    consoleTab,
    copilotOpen,
    description,
    frontendIssues.length,
    logPane,
    router.pathname,
    schemaIssues.length,
    title,
  ]);

  useEffect(() => {
    if (!currentModuleKey) return;
    persistModuleHistory(currentModuleKey, {
      routePath: router.pathname,
      title,
      description,
      shell: "interno-page",
      consoleOpen,
      consoleTab,
      logPane,
      copilotOpen,
      coverage: {
        routeTracked: true,
        consoleIntegrated: true,
        rightRailEnabled: shouldRenderDotobotRail,
      },
    });
  }, [
    consoleOpen,
    consoleTab,
    copilotOpen,
    currentModuleKey,
    description,
    logPane,
    router.pathname,
    shouldRenderDotobotRail,
    title,
  ]);

  const { handleHeaderSearchSelect, handleStartResize, headerSearchResults } = useInternoShellUi({
    consoleHeight,
    consoleOpen,
    coverageCards,
    dragStateRef,
    getConsoleHeightLimits,
    headerSearch,
    headerSearchRef,
    operationalNotes,
    router,
    setConsoleHeight,
    setHeaderSearch,
    setSettingsOpen,
    setUserMenuOpen,
    settingsModalRef,
    userMenuRef,
  });

  const processosHistory = moduleHistory?.processos || null;
  const processosLocalHistory = processosHistory?.executionHistory || [];
  const processosRemoteHistory = processosHistory?.remoteHistory || [];
  const publicacoesHistory = moduleHistory?.publicacoes || null;
  const publicacoesLocalHistory = publicacoesHistory?.executionHistory || [];
  const publicacoesRemoteHistory = publicacoesHistory?.remoteHistory || [];
  const dotobotHistory = moduleHistory?.dotobot || null;
  const aiTaskHistory = moduleHistory?.["ai-task"] || null;
  const contactsHistory = moduleHistory?.contacts || null;
  const {
    handleAddFrontendIssue,
    handleAddNote,
    handleAddSchemaIssue,
    handleArchive,
    handleBulkFingerprintReset,
    handleBulkFingerprintStateChange,
    handleCopyAiTaskHistory,
    handleCopyContactsHistory,
    handleCopyDotobotHistory,
    handleCopyFrontendIssues,
    handleCopyLog,
    handleCopyProcessHistory,
    handleCopyPublicacoesHistory,
    handleCopySchemaIssues,
    handleExportLog,
    handleFingerprintNote,
    handleFingerprintStateChange,
    handleOpenModuleAlert,
    handlePageDebug,
    updateFilters,
  } = useInternoConsoleActions({
    activityLog,
    fingerprintStates,
    frontendForm,
    frontendIssues,
    logPane,
    moduleHistory,
    noteInput,
    operationalNotes,
    paneFingerprintSummary,
    processosLocalHistory,
    processosRemoteHistory,
    publicacoesHistory,
    publicacoesLocalHistory,
    publicacoesRemoteHistory,
    router,
    schemaForm,
    schemaIssues,
    setConsoleOpen,
    setConsoleTab,
    setFrontendForm,
    setLogFilters,
    setLogPane,
    setLogSearch,
    setNoteInput,
    setSchemaForm,
    title,
  });
  const integrationGuide = useMemo(() => getExternalModuleIntegrationGuide(router.pathname), [router.pathname]);

  const {
    activityOnlyLog,
    currentOperationalRail,
    debugLog,
    filteredLog,
    historyPaneCount,
    paneBulkGuardrail,
    paneCounts,
    paneEntries,
    paneFingerprintSummary,
    paneRecommendationSummary,
    paneRisk,
    paneSla,
    paneTagPlaybook,
    paneTimeline,
    tagScopedLogs,
    unclassifiedTagEntriesCount,
    visibleLogPaneGroups,
  } = useInternoConsoleAnalytics({
    activityLog,
    currentModuleKey,
    deferredLogSearch,
    fingerprintStates,
    frontendIssues,
    logFilters,
    logPane,
    moduleHistory,
    operationalNotes,
    schemaIssues,
  });
  useEffect(() => {
    setLogExpanded(null);
  }, [logPane]);

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/interno/login");
  }

  function handleFocusCopilotComposer() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("hmadv:copilot-focus-composer"));
  }

  const showExtensionManager = router.pathname === "/interno/ai-task" || router.pathname === "/interno/agentlab";
  const resolvedRightRail = useMemo(() => (
    typeof rightRail === "function"
      ? rightRail({ moduleKey: currentModuleKey, moduleHistory, activityLog })
      : rightRail
  ), [activityLog, currentModuleKey, moduleHistory, rightRail]);
  const desktopConsoleBarHeight = consoleOpen ? consoleHeight : 60;
  const consoleDockInset = isCopilotWorkspace ? 0 : isMobileShell ? 8 : 12;
  const copilotConsoleInset = isMobileShell ? 0 : desktopConsoleBarHeight + consoleDockInset + (isCopilotWorkspace ? 0 : 10);
  const consoleDockLeft = hideShellSidebar ? 0 : isMobileShell ? 0 : leftCollapsed ? 88 : 272;
  const desktopRightRailWidth = rightRailMode === "compact" ? 356 : 404;
  const consoleDockRight = !isMobileShell && shouldRenderDotobotRail && !rightCollapsed ? desktopRightRailWidth : 0;
  const mobileConsoleHeight = Math.min(Math.max(consoleHeight, 320), 560);
  const desktopConsoleStyle = !isMobileShell
    ? {
        left: `${consoleDockLeft + consoleDockInset}px`,
        right: `${consoleDockRight + consoleDockInset}px`,
        bottom: `${consoleDockInset}px`,
        height: consoleOpen ? `${consoleHeight}px` : "60px",
      }
    : undefined;
  const showSupplementalRightRail = rightRailFullscreen && Boolean(currentOperationalRail || resolvedRightRail);
  const rightRailConversationFirst = !showSupplementalRightRail;
  const copilotShellSidebarClass = isCopilotWorkspace
    ? isLightTheme
      ? "rounded-none border-y-0 border-l-0 border-r border-[#C9D5E2] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.98))] shadow-none"
      : "rounded-none border-y-0 border-l-0 border-r border-[#22342F] bg-[linear-gradient(180deg,rgba(11,18,16,0.995),rgba(8,14,13,0.985))] shadow-none"
    : isLightTheme
      ? "rounded-[26px] border-[#C9D5E2] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.98))]"
      : "rounded-[26px] border-[#22342F] bg-[linear-gradient(180deg,rgba(11,18,16,0.98),rgba(8,14,13,0.95))]";
  const copilotMainShellClass = isCopilotWorkspace
    ? isLightTheme
      ? "border-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,247,251,0.96))] shadow-none"
      : "border-0 bg-[linear-gradient(180deg,rgba(6,8,7,0.98),rgba(8,10,9,0.985))] shadow-none"
    : isLightTheme
      ? "border-[#CBD5E1] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,247,250,0.96))]"
      : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(8,10,9,0.985),rgba(7,9,8,0.95))]";
  return (
    <div className={`relative flex h-screen w-full flex-col overflow-hidden text-[Arial,sans-serif] ${isCopilotWorkspace ? "p-0" : "p-2 md:p-3"} ${isLightTheme ? "bg-[linear-gradient(180deg,#EEF2F6_0%,#E4EAF1_100%)] text-[#13201D]" : "bg-[radial-gradient(circle_at_top_left,rgba(30,24,13,0.16),transparent_24%),linear-gradient(180deg,#040605_0%,#070A09_100%)] text-[#F4F1EA]"}`}>
      {isMobileShell && !leftCollapsed && !hideShellSidebar ? (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setLeftCollapsed(true)}
          className="absolute inset-0 z-30 bg-[rgba(5,8,9,0.5)] backdrop-blur-[2px]"
        />
      ) : null}
      {isMobileShell && consoleOpen ? (
        <button
          type="button"
          aria-label="Fechar console"
          onClick={() => setConsoleOpen(false)}
          className="absolute inset-0 z-20 bg-[rgba(5,8,9,0.34)] backdrop-blur-[1px]"
        />
      ) : null}
      <div className="flex min-h-0 flex-1">
      {/* SIDEBAR */}
        {!hideShellSidebar ? (
          <InternoSidebar
            profile={profile}
            pathname={router.pathname}
            isLightTheme={isLightTheme}
            isMobileShell={isMobileShell}
            isCopilotWorkspace={isCopilotWorkspace}
            leftCollapsed={leftCollapsed}
            onNavigate={closeMobileSidebar}
            onSignOut={handleSignOut}
            sidebarToneClass={copilotShellSidebarClass}
          />
        ) : null}
      {/* MAIN + COPILOT */}
        <div className={`${isCopilotWorkspace || isMobileShell || hideShellSidebar ? "ml-0" : "ml-2 md:ml-3"} flex h-full min-h-0 flex-1`}>
        {/* CONTEÃšDO PRINCIPAL */}
        <div className={`relative flex h-full min-h-0 flex-1 min-w-0 flex-col overflow-hidden ${
          isCopilotWorkspace
            ? copilotMainShellClass
            : `rounded-[26px] border shadow-[0_20px_56px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.02)] ${copilotMainShellClass}`
        }`}>
          <InternoShellHeader
            handleFocusCopilotComposer={handleFocusCopilotComposer}
            handleHeaderSearchSelect={handleHeaderSearchSelect}
            handleSignOut={handleSignOut}
            handleToggleCopilot={handleToggleCopilot}
            handleToggleRightRail={handleToggleRightRail}
            headerLlm={headerLlm}
            headerSearch={headerSearch}
            headerSearchRef={headerSearchRef}
            headerSearchResults={headerSearchResults}
            isCopilotWorkspace={isCopilotWorkspace}
            isLightTheme={isLightTheme}
            onChangeHeaderLlm={setHeaderLlm}
            onChangeHeaderSearch={setHeaderSearch}
            onOpenSettings={() => setSettingsOpen(true)}
            onToggleConsole={() => setConsoleOpen((current) => !current)}
            onToggleLeftCollapsed={() => setLeftCollapsed((current) => !current)}
            onToggleUserMenu={() => setUserMenuOpen((current) => !current)}
            profile={profile}
            router={router}
            setUserMenuOpen={setUserMenuOpen}
            toggleTheme={toggleTheme}
            userMenuOpen={userMenuOpen}
            userMenuRef={userMenuRef}
          />
          <InternoShellContent
            copilotConsoleInset={copilotConsoleInset}
            description={description}
            guide={integrationGuide}
            isCopilotWorkspace={isCopilotWorkspace}
            isLightTheme={isLightTheme}
            showExtensionManager={showExtensionManager}
            title={title}
          >
            {children}
          </InternoShellContent>
          </div>
          <div
            className={`z-30 min-h-[52px] shrink-0 overflow-hidden border transition-all ${
              isCopilotWorkspace
                ? `${isLightTheme ? "border-x-0 border-b-0 border-t-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(241,245,249,0.985))]" : "border-x-0 border-b-0 border-t-[#1E2E29] bg-[linear-gradient(180deg,rgba(10,12,11,0.99),rgba(6,8,7,0.99))]"} rounded-none shadow-none`
                : `${isLightTheme ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.98))]" : "border-[#1E2E29] bg-[linear-gradient(180deg,rgba(10,12,11,0.985),rgba(6,8,7,0.98))]"} rounded-[24px] shadow-[0_-12px_38px_rgba(0,0,0,0.16),inset_0_1px_0_rgba(255,255,255,0.02)]`
            } ${consoleOpen ? "flex flex-col" : "block h-[60px]"} ${isMobileShell ? "fixed inset-x-2 bottom-2" : "fixed"}`}
            style={isMobileShell ? { height: consoleOpen ? `${mobileConsoleHeight}px` : undefined } : desktopConsoleStyle}
          >
            <InternoConsoleChrome
              activityLogCount={activityLog.length}
              consoleOpen={consoleOpen}
              consoleTab={consoleTab}
              formatClass={isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88] hover:border-[#C5A059] hover:text-[#C5A059]" : "border-[#22342F] text-[#9BAEA8] hover:border-[#C5A059] hover:text-[#C5A059]"}
              handleStartResize={handleStartResize}
              isLightTheme={isLightTheme}
              isMobileShell={isMobileShell}
              logPane={logPane}
              onToggleConsole={() => setConsoleOpen((current) => !current)}
              onToggleTab={(tab, pane) => {
                setConsoleTab(tab);
                if (pane) setLogPane(pane);
              }}
              paneCounts={paneCounts}
              visibleLogPaneGroups={visibleLogPaneGroups}
            />
            {consoleOpen ? (
              <div className={`min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 text-xs md:px-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>
                {consoleTab === "console" ? (
                  <InternoConsoleOverviewTab
                    coverageCards={coverageCards}
                    coverageSummary={coverageSummary}
                    frontendIssues={frontendIssues}
                    handleOpenModuleAlert={handleOpenModuleAlert}
                    isLightTheme={isLightTheme}
                    moduleAlerts={moduleAlerts}
                    schemaIssues={schemaIssues}
                    setConsoleOpen={setConsoleOpen}
                    setConsoleTab={setConsoleTab}
                    setLogPane={setLogPane}
                    setLogSearch={setLogSearch}
                    updateFilters={updateFilters}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className={`rounded-xl border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#7B8B98]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.45)] text-[#7F928C]"}`}>
                      Itens organizados por grupos de visao, auditoria, integracoes, IA e governanca para reduzir mistura entre tipo de evento e origem tecnica.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => clearActivityLog()}
                        className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}
                      >
                        Limpar (arquivar)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleArchive("Arquivo manual")}
                        className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}
                      >
                        Arquivar
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyLog}
                        className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}
                      >
                        Copiar log
                      </button>
                      <button
                        type="button"
                        onClick={handleExportLog}
                        className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}
                      >
                        Exportar MD
                      </button>
                      <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                        Arquivos: {archivedCount}
                      </span>
                      <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
                        {formattedArchiveHint}
                      </span>
                    </div>
                    {!SPECIAL_LOG_PANES.has(logPane) ? <div className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#7B8B98]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)] text-[#7F928C]"}`}>
                      <span>Filtros</span>
                      <input
                        value={logFilters.module || ""}
                        onChange={(event) => updateFilters({ ...logFilters, module: event.target.value })}
                        placeholder="Modulo"
                        className={`h-7 w-[110px] rounded-full border bg-transparent px-2 text-[10px] outline-none ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] placeholder:text-[#93A1AD]" : "border-[#22342F] text-[#E6E0D3] placeholder:text-[#53625C]"}`}
                      />
                      <input
                        value={logFilters.page || ""}
                        onChange={(event) => updateFilters({ ...logFilters, page: event.target.value })}
                        placeholder="Pagina"
                        className={`h-7 w-[140px] rounded-full border bg-transparent px-2 text-[10px] outline-none ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] placeholder:text-[#93A1AD]" : "border-[#22342F] text-[#E6E0D3] placeholder:text-[#53625C]"}`}
                      />
                      <input
                        value={logFilters.component || ""}
                        onChange={(event) => updateFilters({ ...logFilters, component: event.target.value })}
                        placeholder="Componente"
                        className={`h-7 w-[140px] rounded-full border bg-transparent px-2 text-[10px] outline-none ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] placeholder:text-[#93A1AD]" : "border-[#22342F] text-[#E6E0D3] placeholder:text-[#53625C]"}`}
                      />
                      <input
                        value={logFilters.status || ""}
                        onChange={(event) => updateFilters({ ...logFilters, status: event.target.value })}
                        placeholder="Status"
                        className={`h-7 w-[90px] rounded-full border bg-transparent px-2 text-[10px] outline-none ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] placeholder:text-[#93A1AD]" : "border-[#22342F] text-[#E6E0D3] placeholder:text-[#53625C]"}`}
                      />
                      <input
                        value={logFilters.tag || ""}
                        onChange={(event) => updateFilters({ ...logFilters, tag: event.target.value })}
                        placeholder="Tag"
                        className={`h-7 w-[90px] rounded-full border bg-transparent px-2 text-[10px] outline-none ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] placeholder:text-[#93A1AD]" : "border-[#22342F] text-[#E6E0D3] placeholder:text-[#53625C]"}`}
                      />
                      <input
                        value={logSearch}
                        onChange={(event) => setLogSearch(event.target.value)}
                        placeholder="Buscar detalhes"
                        className={`h-7 flex-1 min-w-[160px] rounded-full border bg-transparent px-2 text-[10px] outline-none ${isLightTheme ? "border-[#D7DEE8] text-[#51606B] placeholder:text-[#93A1AD]" : "border-[#22342F] text-[#E6E0D3] placeholder:text-[#53625C]"}`}
                      />
                      <button
                        type="button"
                        onClick={() => updateFilters({ ...logFilters, tag: "severity:error" })}
                        className="rounded-full border border-[#5B2D2D] px-3 py-1 text-[10px] text-[#FECACA] transition hover:border-[#FCA5A5]"
                      >
                        So erro
                      </button>
                      <button
                        type="button"
                        onClick={() => updateFilters({ ...logFilters, tag: "severity:warn" })}
                        className="rounded-full border border-[#6E5630] px-3 py-1 text-[10px] text-[#FDE68A] transition hover:border-[#FDE68A]"
                      >
                        So warn
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setLogSearch("");
                          updateFilters({});
                        }}
                        className={`rounded-full border px-3 py-1 text-[10px] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}
                      >
                        Limpar filtros
                      </button>
                    </div> : null}
                    <div className={`sticky top-0 z-10 -mx-4 border-b px-4 py-3 backdrop-blur md:-mx-5 md:px-5 ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(247,249,252,0.94)]" : "border-[#1E2E29] bg-[rgba(8,10,9,0.92)]"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#6F837B]"}`}>Fluxo ativo</p>
                          <p className={`mt-1 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{LOG_PANES.find((pane) => pane.key === logPane)?.label || logPane}</p>
                        </div>
                        <div className={`flex flex-wrap items-center gap-2 font-mono text-[11px] ${isLightTheme ? "text-[#51606B]" : "text-[#C7D0CA]"}`}>
                          <span>{paneEntries.length} visiveis</span>
                          <span className="opacity-45">/</span>
                          <span>{activityLog.length} totais</span>
                          {logFilters?.module ? <span className={`rounded-full border px-2 py-1 font-sans text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>modulo {logFilters.module}</span> : null}
                          {logFilters?.tag ? <span className={`rounded-full border px-2 py-1 font-sans text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>tag {logFilters.tag}</span> : null}
                        </div>
                      </div>
                    </div>
                    {TAG_LOG_PANES.has(logPane) ? <div className={`rounded-xl border p-3 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)] text-[#9BAEA8]"}`}>
                      Trilha automatica por tag: <span className="text-[#F4E7C2]">{LOG_PANES.find((pane) => pane.key === logPane)?.label || logPane}</span>. Os eventos entram aqui pela taxonomia do console.
                      {!paneEntries.length && unclassifiedTagEntriesCount ? (
                        <span className={`block mt-2 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>
                          Nenhuma entrada classificada nesta trilha. Existem {unclassifiedTagEntriesCount} evento(s) ainda sem tag automatica compativel.
                        </span>
                      ) : null}
                    </div> : null}
                    {!SPECIAL_LOG_PANES.has(logPane) && paneEntries.length ? <div className="grid gap-3 xl:grid-cols-2">
                      <InternoConsoleLogInsights
                        getSeverityTone={getSeverityTone}
                        isLightTheme={isLightTheme}
                        logFilters={logFilters}
                        logPane={logPane}
                        noteClass={isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}
                        paneBulkGuardrail={paneBulkGuardrail}
                        paneRisk={paneRisk}
                        paneSla={paneSla}
                        paneTagPlaybook={paneTagPlaybook}
                        updateFilters={updateFilters}
                      />
                      <InternoConsoleLogAnalytics
                        getFingerprintStatusTone={getFingerprintStatusTone}
                        getSeverityTone={getSeverityTone}
                        handleBulkFingerprintReset={handleBulkFingerprintReset}
                        handleBulkFingerprintStateChange={handleBulkFingerprintStateChange}
                        handleFingerprintNote={handleFingerprintNote}
                        handleFingerprintStateChange={handleFingerprintStateChange}
                        isLightTheme={isLightTheme}
                        paneFingerprintSummary={paneFingerprintSummary}
                        paneRecommendationSummary={paneRecommendationSummary}
                        paneTimeline={paneTimeline}
                      />
                    </div> : null}
                    {logPane === "history" ? <div className="space-y-3">
                      <div className={`rounded-xl border p-3 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)] text-[#9BAEA8]"}`}>
                        Historicos e snapshots operacionais separados por modulo.
                      </div>
                      <div className={`rounded-xl border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(8,10,9,0.5)]"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Historico de execucao</p>
                          <p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Consolidado do modulo Processos no console.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyProcessHistory}
                          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}
                        >
                          Copiar historico
                        </button>
                      </div>
                      {processosRemoteHistory.length ? (
                        <div className="mt-3 space-y-2">
                          {processosRemoteHistory.slice(0, 6).map((entry) => (
                            <div key={entry.id} className={`rounded-lg border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}`}>
                              <div className="flex items-center justify-between">
                                <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>{entry.acao || "acao"}</span>
                                <span className={entry.status === "error" ? (isLightTheme ? "text-[#B25E5E]" : "text-red-200") : "text-[#11D473]"}>
                                  {entry.status}
                                </span>
                              </div>
                              <div className={`mt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>
                                {entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR") : "sem data"}
                              </div>
                              {entry.resumo ? <div className={`mt-1 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{entry.resumo}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem historico remoto disponÃ­vel.</div>
                      )}
                      {processosLocalHistory.length ? (
                        <div className="mt-3">
                          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Memoria local</p>
                          <div className="mt-2 space-y-2">
                            {processosLocalHistory.slice(0, 6).map((entry) => (
                              <div key={entry.id} className={`rounded-lg border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}`}>
                                <div className="flex items-center justify-between">
                                  <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>{entry.label || entry.action}</span>
                                  <span className={isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}>{entry.status || "status"}</span>
                                </div>
                                <div className={`mt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>
                                  {entry.startedAt ? new Date(entry.startedAt).toLocaleString("pt-BR") : "sem data"}
                                </div>
                                {entry.preview ? <div className={`mt-1 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{entry.preview}</div> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem historico local registrado.</div>
                      )}
                    </div>
                    <div className={`rounded-xl border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(8,10,9,0.5)]"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Historico de publicacoes</p>
                          <p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Consolidado do modulo Publicacoes no console.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyPublicacoesHistory}
                          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}
                        >
                          Copiar historico
                        </button>
                      </div>
                      {publicacoesRemoteHistory.length ? (
                        <div className="mt-3 space-y-2">
                          {publicacoesRemoteHistory.slice(0, 6).map((entry) => (
                            <div key={entry.id} className={`rounded-lg border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}`}>
                              <div className="flex items-center justify-between">
                                <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>{entry.acao || "acao"}</span>
                                <span className={entry.status === "error" ? (isLightTheme ? "text-[#B25E5E]" : "text-red-200") : "text-[#11D473]"}>
                                  {entry.status}
                                </span>
                              </div>
                              <div className={`mt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>
                                {entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR") : "sem data"}
                              </div>
                              {entry.resumo ? <div className={`mt-1 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{entry.resumo}</div> : null}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem historico remoto disponÃ­vel.</div>
                      )}
                      {publicacoesLocalHistory.length ? (
                        <div className="mt-3">
                          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Memoria local</p>
                          <div className="mt-2 space-y-2">
                            {publicacoesLocalHistory.slice(0, 6).map((entry) => (
                              <div key={entry.id} className={`rounded-lg border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}`}>
                                <div className="flex items-center justify-between">
                                  <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>{entry.label || entry.action}</span>
                                  <span className={isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}>{entry.status || "status"}</span>
                                </div>
                                <div className={`mt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>
                                  {entry.startedAt ? new Date(entry.startedAt).toLocaleString("pt-BR") : "sem data"}
                                </div>
                                {entry.preview ? <div className={`mt-1 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{entry.preview}</div> : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem historico local registrado.</div>
                      )}
                    </div>
                    <div className={`rounded-xl border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(8,10,9,0.5)]"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Contacts</p>
                          <p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Snapshot de qualidade da base, bulk actions e persistencia do modulo.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyContactsHistory}
                          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}
                        >
                          Copiar snapshot
                        </button>
                      </div>
                      {contactsHistory ? (
                        <div className="mt-3 space-y-2 text-[11px]">
                          <div className={`rounded-lg border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}`}>
                            <div className="flex items-center justify-between">
                                <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>Contato em foco</span>
                              <span className={contactsHistory.actionState?.error ? (isLightTheme ? "text-[#B25E5E]" : "text-red-200") : "text-[#11D473]"}>
                                {contactsHistory.selectedContact?.name || "nenhum"}
                              </span>
                            </div>
                            <div className={`mt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>
                              total {contactsHistory.overview?.total || 0} Â· duplicados {contactsHistory.overview?.duplicados || 0} Â· partes sem contato {contactsHistory.overview?.partesSemContato || 0}
                            </div>
                            <div className={`mt-1 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>
                              sync {contactsHistory.settings?.syncLimit || 0} Â· reconcile {contactsHistory.settings?.reconcileLimit || 0} Â· pendentes selecionadas {contactsHistory.partesPendentes?.selected || 0} Â· vinculadas selecionadas {contactsHistory.partesVinculadas?.selected || 0}
                            </div>
                            {contactsHistory.actionState?.preview ? <div className={`mt-1 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>Ultima acao: {contactsHistory.actionState.preview}</div> : null}
                            {contactsHistory.actionState?.error ? <div className={`mt-1 ${isLightTheme ? "text-[#B25E5E]" : "text-red-200"}`}>Erro: {contactsHistory.actionState.error}</div> : null}
                          </div>
                          {Array.isArray(contactsHistory.executionHistory) && contactsHistory.executionHistory.length ? (
                            <div className="space-y-2">
                              {contactsHistory.executionHistory.slice(0, 4).map((entry) => (
                                <div key={entry.id} className={`rounded-lg border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}`}>
                                  <div className="flex items-center justify-between">
                                      <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>{entry.label || entry.action}</span>
                                    <span className={entry.status === "error" ? (isLightTheme ? "text-[#B25E5E]" : "text-red-200") : entry.status === "success" ? "text-[#11D473]" : "text-[#D9B46A]"}>
                                      {entry.status || "running"}
                                    </span>
                                  </div>
                                  {entry.preview ? <div className={`mt-1 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{entry.preview}</div> : null}
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem snapshot de Contacts.</div>
                      )}
                    </div>
                    <div className={`rounded-xl border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(8,10,9,0.5)]"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Dotobot</p>
                          <p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Snapshot do copilot, chat e task runs locais.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyDotobotHistory}
                          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}
                        >
                          Copiar snapshot
                        </button>
                      </div>
                      {dotobotHistory ? (
                        <div className="mt-3 space-y-2 text-[11px]">
                          <div className={`rounded-lg border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}`}>
                            <div className="flex items-center justify-between">
                                <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>Estado</span>
                              <span className={dotobotHistory.error ? (isLightTheme ? "text-[#B25E5E]" : "text-red-200") : "text-[#11D473]"}>
                                {dotobotHistory.uiState || "idle"}
                              </span>
                            </div>
                            <div className={`mt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>
                              modo {dotobotHistory.mode || "n/a"} Â· provider {dotobotHistory.provider || "n/a"} Â· conversas {dotobotHistory.conversationCount || 0}
                            </div>
                            {dotobotHistory.activeTask ? <div className={`mt-1 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>Task ativa: {dotobotHistory.activeTask.query || dotobotHistory.activeTask.id}</div> : null}
                            {dotobotHistory.error ? <div className={`mt-1 ${isLightTheme ? "text-[#B25E5E]" : "text-red-200"}`}>Erro: {dotobotHistory.error}</div> : null}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem snapshot do Dotobot.</div>
                      )}
                    </div>
                    <div className={`rounded-xl border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(8,10,9,0.5)]"}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>AI Task</p>
                          <p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Run ativa, trilha de logs e contexto persistido do orquestrador.</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyAiTaskHistory}
                          className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}
                        >
                          Copiar snapshot
                        </button>
                      </div>
                      {aiTaskHistory ? (
                        <div className="mt-3 space-y-2 text-[11px]">
                          <div className={`rounded-lg border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]"}`}>
                            <div className="flex items-center justify-between">
                                <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>Automacao</span>
                              <span className={aiTaskHistory.error ? (isLightTheme ? "text-[#B25E5E]" : "text-red-200") : "text-[#11D473]"}>
                                {aiTaskHistory.automation || "idle"}
                              </span>
                            </div>
                            <div className={`mt-1 text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>
                              modo {aiTaskHistory.mode || "n/a"} Â· provider {aiTaskHistory.provider || "n/a"} Â· eventos {aiTaskHistory.eventsTotal || 0}
                            </div>
                            {aiTaskHistory.activeRun?.id ? <div className={`mt-1 ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>Run: {aiTaskHistory.activeRun.id}</div> : null}
                            {aiTaskHistory.error ? <div className={`mt-1 ${isLightTheme ? "text-[#B25E5E]" : "text-red-200"}`}>Erro: {aiTaskHistory.error}</div> : null}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] opacity-60">Sem snapshot do AI Task.</div>
                      )}
                    </div>
                    </div> : null}
                    <InternoConsoleIssuePane
                      frontendForm={frontendForm}
                      frontendIssues={frontendIssues}
                      handleAddFrontendIssue={handleAddFrontendIssue}
                      handleAddSchemaIssue={handleAddSchemaIssue}
                      handleCopyFrontendIssues={handleCopyFrontendIssues}
                      handleCopySchemaIssues={handleCopySchemaIssues}
                      isLightTheme={isLightTheme}
                      logPane={logPane}
                      schemaForm={schemaForm}
                      schemaIssues={schemaIssues}
                      setFrontendForm={setFrontendForm}
                      setSchemaForm={setSchemaForm}
                    />
                    {paneEntries.length ? (
                      <div className="space-y-2">
                        {paneEntries.slice(0, 30).map((entry) => (
                          <InternoConsoleLogEntryCard
                            key={entry.id}
                            entry={entry}
                            fingerprintStates={fingerprintStates}
                            getFingerprintStatusTone={getFingerprintStatusTone}
                            getSeverityTone={getSeverityTone}
                            handleFingerprintNote={handleFingerprintNote}
                            handleFingerprintStateChange={handleFingerprintStateChange}
                            isLightTheme={isLightTheme}
                            logExpanded={logExpanded}
                            setLogExpanded={setLogExpanded}
                          />
                        ))}
                      </div>
                    ) : !SPECIAL_LOG_PANES.has(logPane) ? (
                      <div className="text-[11px] opacity-60">
                        {logPane === "debug" ? "Nenhum debug UI registrado." : `Nenhuma entrada classificada em ${LOG_PANES.find((pane) => pane.key === logPane)?.label || logPane}.`}
                      </div>
                    ) : null}
                    {logPane === "notes" ? <InternoConsoleNotesPanel handleAddNote={handleAddNote} isLightTheme={isLightTheme} noteInput={noteInput} operationalNotes={operationalNotes} setNoteInput={setNoteInput} /> : null}
                  </div>
                )}
              </div>
            ) : null}
            {consoleOpen ? (
              <div className={`shrink-0 border-t px-4 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(255,255,255,0.88)]" : "border-[#1E2E29] bg-[rgba(8,10,9,0.72)]"}`}>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={handlePageDebug}
                    className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D4DEE8] bg-white text-[#60706A]" : "border-[#22342F] text-[#9BAEA8]"}`}
                    title="Registrar debug desta pagina"
                  >
                    Debug
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {shouldRenderDotobotRail && !rightCollapsed ? (
          <div
            className={`fixed inset-y-3 right-3 z-40 flex w-[min(100vw-0.75rem,432px)] flex-col overflow-hidden rounded-[30px] border shadow-[-24px_0_56px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.02)] xl:relative xl:inset-y-auto xl:right-auto xl:z-auto xl:h-full xl:min-w-[332px] xl:max-w-[432px] xl:rounded-[30px] xl:shadow-none ${
              isLightTheme
                ? "border-[#D4DEE8] bg-[linear-gradient(180deg,rgba(255,255,255,0.985),rgba(243,247,251,0.98))]"
                : "border-[#22342F] bg-[linear-gradient(180deg,rgba(8,10,9,0.985),rgba(7,9,8,0.96))]"
            } ${rightRailFullscreen ? "xl:w-[404px]" : "xl:w-[356px]"}`}
          >
            {!rightRailConversationFirst && showSupplementalRightRail ? (
              <div className={`max-h-[42%] shrink-0 overflow-auto border-b p-4 xl:max-h-[48%] ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(247,249,252,0.92)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                {currentOperationalRail ? (
                  <OperationalRightRail
                    data={currentOperationalRail}
                    onOpenConsole={() => {
                      setConsoleOpen(true);
                      setConsoleTab("console");
                    }}
                    onOpenJobsLog={() => {
                      setConsoleOpen(true);
                      setConsoleTab("log");
                      setLogPane("jobs");
                      updateFilters({ module: currentModuleKey, tag: "jobs" });
                    }}
                  />
                ) : null}
                {resolvedRightRail ? <div className={currentOperationalRail ? "mt-4" : ""}>{resolvedRightRail}</div> : null}
              </div>
            ) : null}
            <div className="min-h-0 flex-1">
              {copilotOpen ? (
                <DotobotCopilot
                  profile={profile}
                  routePath={router.pathname}
                  initialWorkspaceOpen={true}
                  defaultCollapsed={false}
                  compactRail={!rightRailFullscreen}
                  showCollapsedTrigger={false}
                  embeddedInInternoShell={true}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[#9BAEA8]">
                  Painel direito fechado.
                </div>
              )}
            </div>
            {rightRailConversationFirst && showSupplementalRightRail ? (
              <div className={`max-h-[34%] shrink-0 overflow-auto border-t p-4 ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(247,249,252,0.92)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                {currentOperationalRail ? (
                  <OperationalRightRail
                    data={currentOperationalRail}
                    onOpenConsole={() => {
                      setConsoleOpen(true);
                      setConsoleTab("console");
                    }}
                    onOpenJobsLog={() => {
                      setConsoleOpen(true);
                      setConsoleTab("log");
                      setLogPane("jobs");
                      updateFilters({ module: currentModuleKey, tag: "jobs" });
                    }}
                  />
                ) : null}
                {resolvedRightRail ? <div className={currentOperationalRail ? "mt-4" : ""}>{resolvedRightRail}</div> : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {shouldRenderDotobotRail ? (
          <button
            type="button"
            onClick={handleToggleCopilot}
            className="group fixed bottom-24 right-4 z-[80] flex items-center gap-2 rounded-[18px] border border-[#C5A059] bg-[linear-gradient(180deg,#C5A059,#B08B46)] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#07110E] shadow-[0_10px_30px_rgba(197,160,89,0.3)]"
          >
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#07110E]" />
            <span>{copilotOpen && !rightCollapsed ? "Fechar painel" : "Abrir copilot"}</span>
          </button>
        ) : null}
        {settingsOpen ? (
          <div className="absolute inset-0 z-[95] flex items-center justify-center bg-[rgba(4,7,8,0.48)] px-4 backdrop-blur-sm">
            <div ref={settingsModalRef} className={`w-full max-w-lg rounded-[28px] border p-5 shadow-[0_24px_70px_rgba(0,0,0,0.24)] ${isLightTheme ? "border-[#D7DEE8] bg-[linear-gradient(180deg,#FFFFFF,#F7F9FC)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(12,16,15,0.98),rgba(8,11,10,0.98))]"}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C5A059]">ConfiguraÃ§Ãµes</p>
                  <h3 className={`mt-2 text-xl font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>PreferÃªncias do sistema</h3>
                  <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Tema, preferÃªncias visuais e comportamento do shell interno.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className={`rounded-full border px-3 py-1 text-[11px] transition ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}
                >
                  Fechar
                </button>
              </div>
              <div className="mt-5 space-y-4">
                <div className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Tema</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { key: "light", label: "Claro" },
                      { key: "system", label: "Sistema" },
                      { key: "dark", label: "Escuro" },
                    ].map((option) => {
                      const active = preference === option.key;
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setThemePreference(option.key)}
                          className={`rounded-[12px] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] transition ${
                            active
                              ? "bg-[linear-gradient(180deg,#C5A059,#B08B46)] text-[#07110E] shadow-[0_6px_18px_rgba(197,160,89,0.18)]"
                              : isLightTheme
                                ? "border border-[#D7DEE8] bg-white text-[#60706A] hover:border-[#C5A059]"
                                : "border border-[#22342F] text-[#9BAEA8] hover:border-[#C5A059] hover:text-[#F5E6C5]"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
                  <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>PersistÃªncia</p>
                  <p className={`mt-3 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>O tema e as preferÃªncias do shell sÃ£o persistidos localmente e sincronizados com o modo do sistema quando â€œSistemaâ€ estiver ativo.</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
