import { createAiTaskWorkspaceActions } from "./aiTaskWorkspaceActions";
import useAiTaskWorkspacePersistence from "./useAiTaskWorkspacePersistence";
import useAiTaskWorkspaceState from "./useAiTaskWorkspaceState";

export function useAiTaskWorkspace({ missionInputRef, normalizeAttachmentsFromEvent, trimRecentHistory, nowIso, maxThinking, maxLogs, profile }) {
  const state = useAiTaskWorkspaceState();

  useAiTaskWorkspacePersistence({
    profile,
    state: {
      mission: state.mission,
      mode: state.mode,
      provider: state.provider,
      selectedSkillId: state.selectedSkillId,
      automation: state.automation,
      approved: state.approved,
      tasks: state.tasks,
      thinking: state.thinking,
      logs: state.logs,
      missionHistory: state.missionHistory,
      attachments: state.attachments,
      showTasks: state.showTasks,
      showContext: state.showContext,
      contextSnapshot: state.contextSnapshot,
      selectedTaskId: state.selectedTaskId,
      latestResult: state.latestResult,
      executionSource: state.executionSource,
      executionModel: state.executionModel,
      paused: state.paused,
      search: state.search,
      selectedLogFilter: state.selectedLogFilter,
      eventsTotal: state.eventsTotal,
      activeRun: state.activeRun,
      lastQuickAction: state.lastQuickAction,
    },
    setters: {
      setMission: state.setMission,
      setMode: state.setMode,
      setProvider: state.setProvider,
      setSelectedSkillId: state.setSelectedSkillId,
      setAutomation: state.setAutomation,
      setApproved: state.setApproved,
      setTasks: state.setTasks,
      setThinking: state.setThinking,
      setLogs: state.setLogs,
      setMissionHistory: state.setMissionHistory,
      setAttachments: state.setAttachments,
      setShowTasks: state.setShowTasks,
      setShowContext: state.setShowContext,
      setContextSnapshot: state.setContextSnapshot,
      setSelectedTaskId: state.setSelectedTaskId,
      setLatestResult: state.setLatestResult,
      setExecutionSource: state.setExecutionSource,
      setExecutionModel: state.setExecutionModel,
      setPaused: state.setPaused,
      setSearch: state.setSearch,
      setSelectedLogFilter: state.setSelectedLogFilter,
      setEventsTotal: state.setEventsTotal,
      setActiveRun: state.setActiveRun,
      setLastQuickAction: state.setLastQuickAction,
    },
  });

  function patchThinking(updater) {
    state.setThinking((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return next.slice(0, maxThinking);
    });
  }

  function pushLog(entry) {
    state.setLogs((current) =>
      [
        ...current,
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          timestamp: nowIso(),
          ...entry,
        },
      ].slice(-maxLogs)
    );
  }

  const { handleAttachmentChange, handleAttachmentDrop, handleMissionChange, handleModuleAction, handleQuickMission, handleReplay, handleSelectRun, handleSendToDotobot } = createAiTaskWorkspaceActions({
    contextSnapshot: state.contextSnapshot,
    missionInputRef,
    normalizeAttachmentsFromEvent,
    nowIso,
    pushLog,
    setAttachments: state.setAttachments,
    setAutomation: state.setAutomation,
    setContextSnapshot: state.setContextSnapshot,
    setError: state.setError,
    setExecutionModel: state.setExecutionModel,
    setExecutionSource: state.setExecutionSource,
    setEventsTotal: state.setEventsTotal,
    setLastQuickAction: state.setLastQuickAction,
    setMission: state.setMission,
    setMode: state.setMode,
    setProvider: state.setProvider,
    setSelectedSkillId: state.setSelectedSkillId,
    setSelectedTaskId: state.setSelectedTaskId,
    setShowContext: state.setShowContext,
    setShowTasks: state.setShowTasks,
  });

  const recentHistory = trimRecentHistory(state.missionHistory);

  return {
    ...state,
    recentHistory,
    handleAttachmentChange,
    handleAttachmentDrop,
    handleMissionChange,
    handleModuleAction,
    handleQuickMission,
    handleReplay,
    handleSelectRun,
    handleSendToDotobot,
    patchThinking,
    pushLog,
  };
}
