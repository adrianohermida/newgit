import { useRouter } from "next/router";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useSupabaseBrowser } from "../../lib/supabase";
import { useInternalTheme } from "./InternalThemeProvider";
import InternoConsoleDock from "./layout/InternoConsoleDock";
import InternoSettingsModal from "./layout/InternoSettingsModal";
import InternoShellContent from "./layout/InternoShellContent";
import InternoFloatingCopilotWidget from "./layout/InternoFloatingCopilotWidget";
import InternoShellRightRail from "./layout/InternoShellRightRail";
import InternoShellHeader from "./layout/InternoShellHeader";
import InternoSidebar from "./layout/InternoSidebar";
import {
  getFingerprintStatusTone,
  getSeverityTone,
} from "./layout/consoleSummary";
import { getConsoleHeightLimits } from "./layout/consolePlaybooks";
import { useInternoConsoleActions } from "./layout/useInternoConsoleActions";
import { useInternoConsoleAnalytics } from "./layout/useInternoConsoleAnalytics";
import useInternoConsoleState from "./layout/useInternoConsoleState";
import { useInternoLayoutDerived } from "./layout/useInternoLayoutDerived";
import { useInternoShellUi } from "./layout/useInternoShellUi";
import { useInternoShellState } from "./layout/useInternoShellState";
import {
  clearActivityLog,
  setFingerprintState,
  setActivityLogFilters,
} from "../../lib/admin/activity-log";
import {
  SPECIAL_LOG_PANES,
  TAG_LOG_PANES,
} from "../../lib/admin/console-log-utils.js";

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
  const shouldStartWithOpenRail = rightRailFullscreen || router.pathname === "/interno/agentlab/conversations" || isCopilotWorkspace;
  const {
    closeMobileSidebar,
    consoleExpanded,
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
    setConsoleExpanded,
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
  const [logSearch, setLogSearch] = useState("");
  const deferredLogSearch = useDeferredValue(logSearch);
  const [logExpanded, setLogExpanded] = useState(null);
  const dragStateRef = useRef({ dragging: false, startY: 0, startHeight: 260 });
  const headerSearchRef = useRef(null);
  const settingsModalRef = useRef(null);
  const userMenuRef = useRef(null);

  const {
    activityLog,
    archivedCount,
    coverageCards,
    coverageSummary,
    currentModuleKey,
    fingerprintStates,
    formattedArchiveHint,
    frontendIssues,
    logFilters,
    moduleAlerts,
    moduleHistory,
    operationalNotes,
    schemaIssues,
    setLogFilters,
  } = useInternoConsoleState({
    consoleOpen,
    consoleTab,
    copilotOpen,
    description,
    logPane,
    pathname: router.pathname,
    shouldRenderDotobotRail,
    title,
  });

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
  useEffect(() => {
    setLogExpanded(null);
  }, [logPane]);

  async function handleSignOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace("/interno/login");
  }

  const {
    aiTaskHistory,
    contactsHistory,
    copilotMainShellClass,
    copilotShellSidebarClass,
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
            onOpenSettings={() => setSettingsOpen(true)}
            onSignOut={handleSignOut}
            router={router}
            sidebarToneClass={copilotShellSidebarClass}
          />
        ) : null}
      {/* MAIN + COPILOT */}
        <div className={`${isCopilotWorkspace || isMobileShell || hideShellSidebar ? "ml-0" : "ml-2 md:ml-3"} flex h-full min-h-0 flex-1`}>
          {/* Conteudo principal */}
        <div className={`relative flex h-full min-h-0 flex-1 min-w-0 flex-col overflow-hidden ${
          isCopilotWorkspace
            ? copilotMainShellClass
            : `rounded-[26px] border shadow-[0_20px_56px_rgba(0,0,0,0.26),inset_0_1px_0_rgba(255,255,255,0.02)] ${copilotMainShellClass}`
        }`}>
          {!isCopilotWorkspace ? (
            <InternoShellHeader
              consoleOpen={consoleOpen}
              description={description}
              handleHeaderSearchSelect={handleHeaderSearchSelect}
              handleSignOut={handleSignOut}
              handleToggleCopilot={handleToggleCopilot}
              handleToggleRightRail={handleToggleRightRail}
              headerSearch={headerSearch}
              headerSearchRef={headerSearchRef}
              headerSearchResults={headerSearchResults}
              isCopilotWorkspace={isCopilotWorkspace}
              isLightTheme={isLightTheme}
              leftCollapsed={leftCollapsed}
              onChangeHeaderSearch={setHeaderSearch}
              onCloseConsole={() => setConsoleOpen(false)}
              onOpenSettings={() => setSettingsOpen(true)}
              onToggleConsole={() => setConsoleOpen((current) => !current)}
              onToggleLeftCollapsed={() => setLeftCollapsed((current) => !current)}
              onToggleUserMenu={() => setUserMenuOpen((current) => !current)}
              railChatOpen={copilotOpen && !rightCollapsed}
              profile={profile}
              rightRailOpen={!rightCollapsed}
              router={router}
              setUserMenuOpen={setUserMenuOpen}
              toggleTheme={toggleTheme}
              title={title}
              userMenuOpen={userMenuOpen}
              userMenuRef={userMenuRef}
            />
          ) : null}
          <InternoShellContent
            description={description}
            guide={integrationGuide}
            isCopilotWorkspace={isCopilotWorkspace}
            isLightTheme={isLightTheme}
            showModuleHeader={false}
            showExtensionManager={showExtensionManager}
            title={title}
          >
            {children}
          </InternoShellContent>
          <InternoConsoleDock
            activityLog={activityLog}
            archivedCount={archivedCount}
            clearActivityLog={clearActivityLog}
            consoleExpanded={consoleExpanded}
            consoleHeight={consoleHeight}
            consoleOpen={consoleOpen}
            consoleTab={consoleTab}
            coverageCards={coverageCards}
            coverageSummary={coverageSummary}
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
            setConsoleExpanded={setConsoleExpanded}
            setConsoleTab={setConsoleTab}
            setLogPane={setLogPane}
            setLogSearch={setLogSearch}
            updateFilters={updateFilters}
            visibleLogPaneGroups={visibleLogPaneGroups}
          />
          </div>
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
        <InternoFloatingCopilotWidget
          copilotOpen={copilotOpen}
          isLightTheme={isLightTheme}
          onClose={handleToggleCopilot}
          profile={profile}
          routePath={router.pathname}
          shouldRenderDotobotRail={shouldRenderDotobotRail}
        />
        {shouldRenderDotobotRail ? (
          <button
            type="button"
            onClick={handleToggleCopilot}
            className={`group fixed bottom-5 ${isCopilotWorkspace ? "right-4" : "left-4"} z-[80] flex items-center gap-3 rounded-[20px] border px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] shadow-[0_12px_32px_rgba(0,0,0,0.24)] ${isLightTheme ? "border-[#D4DEE8] bg-[linear-gradient(180deg,#FFFFFF,#EEF4F9)] text-[#21323C]" : "border-[#C5A059] bg-[linear-gradient(180deg,#C5A059,#B08B46)] text-[#07110E]"}`}
          >
            <span className={`inline-flex h-2.5 w-2.5 rounded-full ${copilotOpen && !rightCollapsed ? isLightTheme ? "bg-[#2F7A62]" : "bg-[#07110E]" : isLightTheme ? "bg-[#7B8B98]" : "bg-[#07110E]"}`} />
            <span>{copilotOpen && !rightCollapsed ? "Fechar chat" : "Abrir chat"}</span>
            {!isCopilotWorkspace ? <span className={`rounded-full border px-2 py-1 text-[10px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[rgba(7,17,14,0.18)] bg-[rgba(7,17,14,0.08)] text-[#07110E]"}`}>widget</span> : null}
          </button>
        ) : null}
        {settingsOpen ? <InternoSettingsModal isLightTheme={isLightTheme} onClose={() => setSettingsOpen(false)} preference={preference} setThemePreference={setThemePreference} settingsModalRef={settingsModalRef} /> : null}
      </div>
    </div>
  );
}
