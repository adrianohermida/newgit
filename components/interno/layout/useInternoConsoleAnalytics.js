import { useMemo } from "react";
import {
  calculateRiskScore,
  LOG_PANES,
  LOG_PANE_GROUPS,
  shouldShowLogPane,
  summarizeFingerprints,
  summarizeRecommendations,
  summarizeSla,
  summarizeTimeline,
} from "./consoleSummary";
import { getBulkGuardrail, getTagPlaybook } from "./consolePlaybooks";
import { buildOperationalRailData } from "./operationalRailData";
import {
  buildTagScopedLogs,
  countHistorySnapshots,
  countUnclassifiedEntries,
  entryMatchesConsoleFilters,
} from "../../../lib/admin/console-log-utils";

export function useInternoConsoleAnalytics({
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
}) {
  const filteredLog = useMemo(() => activityLog.filter((entry) => entryMatchesConsoleFilters(entry, logFilters, deferredLogSearch)), [activityLog, deferredLogSearch, logFilters]);
  const debugLog = useMemo(() => filteredLog.filter((entry) => entry.action === "debug_ui" || (entry.tags || []).includes("debug-ui")), [filteredLog]);
  const activityOnlyLog = useMemo(() => filteredLog.filter((entry) => !["debug_ui", "frontend_issue", "schema_issue"].includes(String(entry.action || "")) && !(entry.tags || []).includes("debug-ui")), [filteredLog]);
  const tagScopedLogs = useMemo(() => buildTagScopedLogs(filteredLog), [filteredLog]);
  const historyPaneCount = useMemo(() => countHistorySnapshots(moduleHistory), [moduleHistory]);
  const unclassifiedTagEntriesCount = useMemo(() => countUnclassifiedEntries(activityOnlyLog), [activityOnlyLog]);
  const paneEntries = useMemo(() => {
    if (logPane === "activity") return activityOnlyLog;
    if (logPane === "debug") return debugLog;
    return tagScopedLogs[logPane] || [];
  }, [activityOnlyLog, debugLog, logPane, tagScopedLogs]);
  const paneCounts = useMemo(() => ({
    activity: activityOnlyLog.length,
    debug: debugLog.length,
    history: historyPaneCount,
    frontend: frontendIssues.length,
    schema: schemaIssues.length,
    notes: operationalNotes.length,
    security: tagScopedLogs.security.length,
    functions: tagScopedLogs.functions.length,
    routes: tagScopedLogs.routes.length,
    jobs: tagScopedLogs.jobs.length,
    webhook: tagScopedLogs.webhook.length,
    crm: tagScopedLogs.crm.length,
    supabase: tagScopedLogs.supabase.length,
    dotobot: tagScopedLogs.dotobot.length,
    "ai-task": tagScopedLogs["ai-task"].length,
    "data-quality": tagScopedLogs["data-quality"].length,
  }), [activityOnlyLog.length, debugLog.length, frontendIssues.length, historyPaneCount, operationalNotes.length, schemaIssues.length, tagScopedLogs]);
  const visibleLogPaneGroups = useMemo(() => LOG_PANE_GROUPS.map((group) => ({ ...group, panes: LOG_PANES.filter((pane) => pane.group === group.key && shouldShowLogPane(pane, paneCounts, logPane)) })).filter((group) => group.panes.length > 0), [logPane, paneCounts]);
  const paneFingerprintSummary = useMemo(() => summarizeFingerprints(paneEntries, fingerprintStates), [fingerprintStates, paneEntries]);
  const paneRecommendationSummary = useMemo(() => summarizeRecommendations(paneEntries), [paneEntries]);
  const paneRisk = useMemo(() => calculateRiskScore(paneEntries, paneFingerprintSummary), [paneEntries, paneFingerprintSummary]);
  const paneTimeline = useMemo(() => summarizeTimeline(paneEntries), [paneEntries]);
  const paneSla = useMemo(() => summarizeSla(paneEntries, paneFingerprintSummary, fingerprintStates), [fingerprintStates, paneEntries, paneFingerprintSummary]);
  const paneTagPlaybook = useMemo(() => getTagPlaybook(logPane), [logPane]);
  const paneBulkGuardrail = useMemo(() => getBulkGuardrail(logPane, paneRisk, paneSla, paneEntries), [logPane, paneEntries, paneRisk, paneSla]);
  const currentOperationalRail = useMemo(() => buildOperationalRailData(currentModuleKey, moduleHistory?.[currentModuleKey] || null, activityLog), [activityLog, currentModuleKey, moduleHistory]);
  return {
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
  };
}
