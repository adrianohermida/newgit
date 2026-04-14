import { LOG_PANES } from "./consoleSummary";
import InternoConsoleFilterBar from "./InternoConsoleFilterBar";
import InternoConsoleHistoryTab from "./InternoConsoleHistoryTab";
import InternoConsoleIssuePane from "./InternoConsoleIssuePane";
import InternoConsoleLogAnalytics from "./InternoConsoleLogAnalytics";
import InternoConsoleLogEntryCard from "./InternoConsoleLogEntryCard";
import InternoConsoleLogInsights from "./InternoConsoleLogInsights";
import InternoConsoleNotesPanel from "./InternoConsoleNotesPanel";
import InternoConsoleStickyBar from "./InternoConsoleStickyBar";
import InternoConsoleTagNotice from "./InternoConsoleTagNotice";

export default function InternoConsolePaneBody(props) {
  const { SPECIAL_LOG_PANES, TAG_LOG_PANES, activityLog, fingerprintStates, frontendForm, frontendIssues, getFingerprintStatusTone, getSeverityTone, handleAddFrontendIssue, handleAddNote, handleAddSchemaIssue, handleBulkFingerprintReset, handleBulkFingerprintStateChange, handleCopyAiTaskHistory, handleCopyContactsHistory, handleCopyDotobotHistory, handleCopyFrontendIssues, handleCopyProcessHistory, handleCopyPublicacoesHistory, handleCopySchemaIssues, handleFingerprintNote, handleFingerprintStateChange, isLightTheme, logExpanded, logFilters, logPane, logSearch, noteInput, operationalNotes, paneBulkGuardrail, paneEntries, paneFingerprintSummary, paneRecommendationSummary, paneRisk, paneSla, paneTagPlaybook, paneTimeline, processosLocalHistory, processosRemoteHistory, publicacoesLocalHistory, publicacoesRemoteHistory, schemaForm, schemaIssues, setFrontendForm, setLogExpanded, setLogSearch, setNoteInput, setSchemaForm, unclassifiedTagEntriesCount, updateFilters, aiTaskHistory, contactsHistory, dotobotHistory } = props;
  const activePane = LOG_PANES.find((pane) => pane.key === logPane);
  const noteClass = isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]";
  return <>
    {!SPECIAL_LOG_PANES.has(logPane) ? <InternoConsoleFilterBar isLightTheme={isLightTheme} logFilters={logFilters} logSearch={logSearch} setLogSearch={setLogSearch} updateFilters={updateFilters} /> : null}
    <InternoConsoleStickyBar activePaneLabel={activePane?.label || logPane} activityCount={activityLog.length} isLightTheme={isLightTheme} logFilters={logFilters} visibleCount={paneEntries.length} />
    {TAG_LOG_PANES.has(logPane) ? <InternoConsoleTagNotice activePaneLabel={activePane?.label || logPane} isLightTheme={isLightTheme} paneEntries={paneEntries} unclassifiedTagEntriesCount={unclassifiedTagEntriesCount} /> : null}
    {!SPECIAL_LOG_PANES.has(logPane) && paneEntries.length ? <div className="grid gap-3 xl:grid-cols-2">
      <InternoConsoleLogInsights getSeverityTone={getSeverityTone} isLightTheme={isLightTheme} logFilters={logFilters} logPane={logPane} noteClass={noteClass} paneBulkGuardrail={paneBulkGuardrail} paneRisk={paneRisk} paneSla={paneSla} paneTagPlaybook={paneTagPlaybook} updateFilters={updateFilters} />
      <InternoConsoleLogAnalytics getFingerprintStatusTone={getFingerprintStatusTone} getSeverityTone={getSeverityTone} handleBulkFingerprintReset={handleBulkFingerprintReset} handleBulkFingerprintStateChange={handleBulkFingerprintStateChange} handleFingerprintNote={handleFingerprintNote} handleFingerprintStateChange={handleFingerprintStateChange} isLightTheme={isLightTheme} paneFingerprintSummary={paneFingerprintSummary} paneRecommendationSummary={paneRecommendationSummary} paneTimeline={paneTimeline} />
    </div> : null}
    {logPane === "history" ? <InternoConsoleHistoryTab aiTaskHistory={aiTaskHistory} contactsHistory={contactsHistory} dotobotHistory={dotobotHistory} handleCopyAiTaskHistory={handleCopyAiTaskHistory} handleCopyContactsHistory={handleCopyContactsHistory} handleCopyDotobotHistory={handleCopyDotobotHistory} handleCopyProcessHistory={handleCopyProcessHistory} handleCopyPublicacoesHistory={handleCopyPublicacoesHistory} isLightTheme={isLightTheme} processosLocalHistory={processosLocalHistory} processosRemoteHistory={processosRemoteHistory} publicacoesLocalHistory={publicacoesLocalHistory} publicacoesRemoteHistory={publicacoesRemoteHistory} /> : null}
    <InternoConsoleIssuePane frontendForm={frontendForm} frontendIssues={frontendIssues} handleAddFrontendIssue={handleAddFrontendIssue} handleAddSchemaIssue={handleAddSchemaIssue} handleCopyFrontendIssues={handleCopyFrontendIssues} handleCopySchemaIssues={handleCopySchemaIssues} isLightTheme={isLightTheme} logPane={logPane} schemaForm={schemaForm} schemaIssues={schemaIssues} setFrontendForm={setFrontendForm} setSchemaForm={setSchemaForm} />
    {paneEntries.length ? <div className="space-y-2">{paneEntries.slice(0, 30).map((entry) => <InternoConsoleLogEntryCard key={entry.id} entry={entry} fingerprintStates={fingerprintStates} getFingerprintStatusTone={getFingerprintStatusTone} getSeverityTone={getSeverityTone} handleFingerprintNote={handleFingerprintNote} handleFingerprintStateChange={handleFingerprintStateChange} isLightTheme={isLightTheme} logExpanded={logExpanded} setLogExpanded={setLogExpanded} />)}</div> : !SPECIAL_LOG_PANES.has(logPane) ? <div className="text-[11px] opacity-60">{logPane === "debug" ? "Nenhum debug UI registrado." : `Nenhuma entrada classificada em ${activePane?.label || logPane}.`}</div> : null}
    {logPane === "notes" ? <InternoConsoleNotesPanel handleAddNote={handleAddNote} isLightTheme={isLightTheme} noteInput={noteInput} operationalNotes={operationalNotes} setNoteInput={setNoteInput} /> : null}
  </>;
}
