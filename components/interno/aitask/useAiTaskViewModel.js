import { useDeferredValue, useMemo } from "react";
import { extractModuleKeysFromContext, resolveModuleEntries } from "../../../lib/admin/module-registry.js";
import { buildTaskColumns, filterLogsBySearch, filterLogsByType, findSelectedTask, paginateItems, resolveAutomationLabel } from "./aiTaskState";

const QUICK_MISSIONS = [
  "Analise este processo e identifique os proximos passos",
  "Redija contestacao com base nas alegacoes do cliente",
  "Crie plano de execucao para audiencia agendada",
  "Resuma documentos e identifique riscos",
];

const MODE_LABELS = { assisted: "Assistido", auto: "Automatico", manual: "Manual" };

export function useAiTaskViewModel({ automation, contextSnapshot, detectModules, historyPage, logs, mission, mode, recentHistory, search, selectedLogFilter, selectedTaskId, taskVisibleCount, tasks }) {
  const taskColumns = useMemo(() => buildTaskColumns(tasks), [tasks]);
  const visibleLogs = useMemo(() => filterLogsByType(logs, selectedLogFilter), [logs, selectedLogFilter]);
  const deferredSearch = useDeferredValue(search);
  const compactLogs = useMemo(() => filterLogsBySearch(visibleLogs, deferredSearch), [visibleLogs, deferredSearch]);
  const selectedTask = useMemo(() => findSelectedTask(tasks, selectedTaskId), [tasks, selectedTaskId]);
  const historyMeta = useMemo(() => paginateItems(recentHistory, historyPage, 6), [historyPage, recentHistory]);
  const visibleTasks = useMemo(() => tasks.slice(0, taskVisibleCount), [taskVisibleCount, tasks]);
  const contextModuleEntries = useMemo(() => {
    const moduleKeys = contextSnapshot?.module ? extractModuleKeysFromContext(contextSnapshot.module) : detectModules(mission || "");
    return resolveModuleEntries(moduleKeys);
  }, [contextSnapshot?.module, detectModules, mission]);
  const moduleDrivenQuickMissions = useMemo(() => {
    const suggestions = contextModuleEntries.flatMap((entry) => [...(entry?.quickMissions || []), ...((entry?.quickActions || []).map((action) => action.mission))]);
    return Array.from(new Set([...QUICK_MISSIONS, ...suggestions].filter(Boolean))).slice(0, 10);
  }, [contextModuleEntries]);

  return {
    activeModeLabel: MODE_LABELS[mode] || MODE_LABELS.auto,
    compactLogs,
    contextModuleEntries,
    hasMoreTasks: visibleTasks.length < tasks.length,
    historyMeta,
    moduleDrivenQuickMissions,
    selectedTask,
    stateLabel: resolveAutomationLabel(automation),
    taskColumns,
    visibleTasks,
  };
}
