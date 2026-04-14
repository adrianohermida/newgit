import { useEffect } from "react";
import { setModuleHistory } from "../../../lib/admin/activity-log";

export function useAiTaskModuleHistorySync(payload) {
  useEffect(() => {
    setModuleHistory("ai-task", {
      routePath: payload.routePath || "/interno/ai-task",
      mission: payload.mission,
      automation: payload.automation,
      provider: payload.provider,
      mode: payload.mode,
      approved: payload.approved,
      paused: payload.paused,
      error: payload.error || null,
      activeRun: payload.activeRun,
      latestResult: typeof payload.latestResult === "string" ? payload.latestResult.slice(0, 2000) : payload.latestResult,
      executionSource: payload.executionSource,
      executionModel: payload.executionModel,
      eventsTotal: payload.eventsTotal,
      contextSnapshot: payload.contextSnapshot,
      lastQuickAction: payload.lastQuickAction,
      recentHistory: payload.recentHistory.slice(0, 10),
      tasks: payload.tasks.slice(0, 20),
      thinking: payload.thinking.slice(0, 12),
      logs: payload.logs.slice(-40),
      attachments: payload.attachments,
      contact360: payload.contact360,
      ui: { showContext: payload.showContext, showTasks: payload.showTasks, selectedTaskId: payload.selectedTaskId, historyPage: payload.historyPage, taskVisibleCount: payload.taskVisibleCount },
    });
  }, [payload]);
}
