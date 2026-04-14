import { useEffect, useMemo, useState } from "react";
import {
  buildCoverageCards,
  deriveModuleSafeWindow,
  PRIORITY_MODULE_KEYS,
  summarizeModuleAlert,
} from "./moduleCoverage";
import {
  getActivityLogFilters,
  getFingerprintStates,
  getFrontendIssues,
  getSchemaIssues,
  setModuleHistory as persistModuleHistory,
  subscribeActivityLog,
} from "../../../lib/admin/activity-log";
import { inferModuleKeyFromPathname } from "../../../lib/admin/module-registry.js";

export default function useInternoConsoleState(params) {
  const { consoleOpen, consoleTab, copilotOpen, description, logPane, pathname, shouldRenderDotobotRail, title } = params;
  const [activityLog, setActivityLog] = useState([]);
  const [archivedLogs, setArchivedLogs] = useState([]);
  const [operationalNotes, setOperationalNotes] = useState([]);
  const [frontendIssues, setFrontendIssues] = useState(() => getFrontendIssues());
  const [fingerprintStates, setFingerprintStates] = useState(() => getFingerprintStates());
  const [schemaIssues, setSchemaIssues] = useState(() => getSchemaIssues());
  const [moduleHistory, setModuleHistory] = useState({});
  const [logFilters, setLogFilters] = useState(() => getActivityLogFilters());

  useEffect(() => subscribeActivityLog((entries, archives, notes, filters, frontendItems, schemaItems, moduleSnapshot, fingerprintSnapshot) => {
    setActivityLog(entries);
    setArchivedLogs(archives || []);
    setOperationalNotes(notes || []);
    setFrontendIssues(frontendItems || []);
    setSchemaIssues(schemaItems || []);
    setFingerprintStates(fingerprintSnapshot && typeof fingerprintSnapshot === "object" ? fingerprintSnapshot : {});
    if (moduleSnapshot && typeof moduleSnapshot === "object") setModuleHistory(moduleSnapshot);
    setLogFilters(filters && typeof filters === "object" ? filters : {});
  }), []);

  const archivedCount = archivedLogs.length;
  const formattedArchiveHint = useMemo(() => {
    if (!archivedLogs[0]?.createdAt) return "Sem arquivos ainda";
    return `Ultimo arquivo: ${new Date(archivedLogs[0].createdAt).toLocaleString("pt-BR")}`;
  }, [archivedLogs]);
  const coverageCards = useMemo(() => buildCoverageCards(moduleHistory), [moduleHistory]);
  const currentModuleKey = useMemo(() => inferModuleKeyFromPathname(pathname), [pathname]);
  const coverageSummary = useMemo(() => ({
    routeCount: new Set(coverageCards.map((item) => item.routePath).filter(Boolean)).size,
    errorCount: coverageCards.filter((item) => item.tone === "danger").length,
  }), [coverageCards]);
  const moduleAlerts = useMemo(() => {
    const map = new Map();
    for (const card of coverageCards) {
      if (!PRIORITY_MODULE_KEYS.has(card.key)) continue;
      const alert = summarizeModuleAlert(card.key, activityLog, fingerprintStates);
      map.set(card.key, { ...alert, safeWindow: deriveModuleSafeWindow(card.key, card.snapshot, alert) });
    }
    return map;
  }, [activityLog, coverageCards, fingerprintStates]);

  useEffect(() => {
    persistModuleHistory("interno-shell", {
      routePath: pathname,
      shell: "interno",
      title,
      description,
      consoleOpen,
      consoleTab,
      logPane,
      copilotOpen,
      archivedCount,
      recentLogCount: activityLog.length,
      frontendIssueCount: frontendIssues.length,
      schemaIssueCount: schemaIssues.length,
      updatedAt: new Date().toISOString(),
    });
  }, [activityLog.length, archivedCount, consoleOpen, consoleTab, copilotOpen, description, frontendIssues.length, logPane, pathname, schemaIssues.length, title]);

  useEffect(() => {
    if (!currentModuleKey) return;
    persistModuleHistory(currentModuleKey, {
      routePath: pathname,
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
  }, [consoleOpen, consoleTab, copilotOpen, currentModuleKey, description, logPane, pathname, shouldRenderDotobotRail, title]);

  return {
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
  };
}
