import { useDeferredValue } from "react";
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
  const taskColumns = buildTaskColumns(tasks);
  const visibleLogs = filterLogsByType(logs, selectedLogFilter);
  const deferredSearch = useDeferredValue(search);
  const compactLogs = filterLogsBySearch(visibleLogs, deferredSearch);
  const selectedTask = findSelectedTask(tasks, selectedTaskId);
  const historyMeta = paginateItems(recentHistory, historyPage, 6);
  const visibleTasks = tasks.slice(0, taskVisibleCount);
  const contextModuleEntries = resolveModuleEntries(
    contextSnapshot?.module ? extractModuleKeysFromContext(contextSnapshot.module) : detectModules(mission || "")
  );
  const moduleDrivenQuickMissions = Array.from(
    new Set(
      [
        ...QUICK_MISSIONS,
        ...contextModuleEntries.flatMap((entry) => [
          ...(entry?.quickMissions || []),
          ...((entry?.quickActions || []).map((action) => action.mission)),
        ]),
      ].filter(Boolean)
    )
  ).slice(0, 10);

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
