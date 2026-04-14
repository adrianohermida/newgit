import { useRouter } from "next/router";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSupabaseBrowser } from "../../lib/supabase";
import { useInternalTheme } from "./InternalThemeProvider";
import InternoConsoleDock from "./layout/InternoConsoleDock";
import InternoSettingsModal from "./layout/InternoSettingsModal";
import InternoShellContent from "./layout/InternoShellContent";
import InternoShellRightRail from "./layout/InternoShellRightRail";
import InternoShellHeader from "./layout/InternoShellHeader";
import RailPanel from "./layout/RailPanel";
import {
  buildCoverageCards,
  deriveModuleSafeWindow,
  PRIORITY_MODULE_KEYS,
  summarizeModuleAlert,
} from "./layout/moduleCoverage";
import InternoSidebar from "./layout/InternoSidebar";
import {
  getFingerprintStatusTone,
  getSeverityTone,
} from "./layout/consoleSummary";
import { getConsoleHeightLimits } from "./layout/consolePlaybooks";
import { NAV_ITEMS, normalizeDisplayName } from "./layout/sidebarConfig";
import { useInternoConsoleActions } from "./layout/useInternoConsoleActions";
import { useInternoConsoleAnalytics } from "./layout/useInternoConsoleAnalytics";
import { useInternoLayoutDerived } from "./layout/useInternoLayoutDerived";
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

  const {
    aiTaskHistory,
    contactsHistory,
    copilotConsoleInset,
    copilotMainShellClass,
    copilotShellSidebarClass,
    desktopConsoleStyle,
    dotobotHistory,
    integrationGuide,
    mobileConsoleHeight,
    paneBodyProps,
    processosLocalHistory,
    processosRemoteHistory,
    publicacoesHistory,
    publicacoesLocalHistory,
    publicacoesRemoteHistory,
    resolvedRightRail,
    rightRailConversationFirst,
    showExtensionManager,
    showSupplementalRightRail,
  } = useInternoLayoutDerived({
    activityLog,
    consoleHeight,
    consoleOpen,
    currentModuleKey,
    currentOperationalRail,
    handleActions: {
      SPECIAL_LOG_PANES,
      TAG_LOG_PANES,
      fingerprintStates,
      frontendForm,
      frontendIssues,
      getFingerprintStatusTone,
      getSeverityTone,
      handleAddFrontendIssue,
      handleAddNote,
      handleAddSchemaIssue,
      handleBulkFingerprintReset,
      handleBulkFingerprintStateChange,
      handleCopyAiTaskHistory,
      handleCopyContactsHistory,
      handleCopyDotobotHistory,
      handleCopyFrontendIssues,
      handleCopyProcessHistory,
      handleCopyPublicacoesHistory,
      handleCopySchemaIssues,
      handleFingerprintNote,
      handleFingerprintStateChange,
      isLightTheme,
      logExpanded,
      logFilters,
      logPane,
      logSearch,
      noteInput,
      operationalNotes,
      paneBulkGuardrail,
      paneEntries,
      paneFingerprintSummary,
      paneRecommendationSummary,
      paneRisk,
      paneSla,
      paneTagPlaybook,
      paneTimeline,
      schemaForm,
      schemaIssues,
      setFrontendForm,
      setLogExpanded,
      setLogSearch,
      setNoteInput,
      setSchemaForm,
      unclassifiedTagEntriesCount,
      updateFilters,
    },
    hideShellSidebar,
    isCopilotWorkspace,
    isLightTheme,
    isMobileShell,
    leftCollapsed,
    logState: {},
    moduleHistory,
    rightCollapsed,
    rightRail,
    rightRailFullscreen,
    rightRailMode,
    router,
    shouldRenderDotobotRail,
  });
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
          {/* CONTEUDO PRINCIPAL */}
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
          <InternoConsoleDock
            activityLog={activityLog}
            archivedCount={archivedCount}
            clearActivityLog={clearActivityLog}
            consoleHeight={consoleHeight}
            consoleOpen={consoleOpen}
            consoleTab={consoleTab}
            coverageCards={coverageCards}
            coverageSummary={coverageSummary}
            desktopConsoleStyle={desktopConsoleStyle}
            formattedArchiveHint={formattedArchiveHint}
            frontendIssues={frontendIssues}
            handleArchive={handleArchive}
            handleCopyLog={handleCopyLog}
            handleExportLog={handleExportLog}
            handleOpenModuleAlert={handleOpenModuleAlert}
            handlePageDebug={handlePageDebug}
            handleStartResize={handleStartResize}
            isCopilotWorkspace={isCopilotWorkspace}
            isLightTheme={isLightTheme}
            isMobileShell={isMobileShell}
            logPane={logPane}
            mobileConsoleHeight={mobileConsoleHeight}
            moduleAlerts={moduleAlerts}
            paneBodyProps={paneBodyProps}
            paneCounts={paneCounts}
            schemaIssues={schemaIssues}
            setConsoleOpen={setConsoleOpen}
            setConsoleTab={setConsoleTab}
            setLogPane={setLogPane}
            setLogSearch={setLogSearch}
            updateFilters={updateFilters}
            visibleLogPaneGroups={visibleLogPaneGroups}
          />
        </div>
        <InternoShellRightRail
          copilotOpen={copilotOpen}
          currentModuleKey={currentModuleKey}
          currentOperationalRail={currentOperationalRail}
          isLightTheme={isLightTheme}
          onOpenConsole={() => {
            setConsoleOpen(true);
            setConsoleTab("console");
          }}
          onOpenJobsLog={(moduleKey) => {
            setConsoleOpen(true);
            setConsoleTab("log");
            setLogPane("jobs");
            updateFilters({ module: moduleKey, tag: "jobs" });
          }}
          profile={profile}
          resolvedRightRail={resolvedRightRail}
          rightCollapsed={rightCollapsed}
          rightRailConversationFirst={rightRailConversationFirst}
          rightRailFullscreen={rightRailFullscreen}
          routePath={router.pathname}
          shouldRenderDotobotRail={shouldRenderDotobotRail}
          showSupplementalRightRail={showSupplementalRightRail}
        />
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
        {settingsOpen ? <InternoSettingsModal isLightTheme={isLightTheme} onClose={() => setSettingsOpen(false)} preference={preference} setThemePreference={setThemePreference} settingsModalRef={settingsModalRef} /> : null}
      </div>
    </div>
  );
}
