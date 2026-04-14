import { createAiTaskWorkspaceActions } from "./aiTaskWorkspaceActions";
import useAiTaskWorkspacePersistence from "./useAiTaskWorkspacePersistence";
import useAiTaskWorkspaceState from "./useAiTaskWorkspaceState";

export function useAiTaskWorkspace({ missionInputRef, normalizeAttachmentsFromEvent, trimRecentHistory, nowIso, maxThinking, maxLogs, profile }) {
  const state = useAiTaskWorkspaceState();
  const {
    activeRun,
    approved,
    attachments,
    automation,
    contextSnapshot,
    error,
    eventsTotal,
    executionModel,
    executionSource,
    latestResult,
    logs,
    mission,
    missionHistory,
    mode,
    paused,
    provider,
    search,
    selectedLogFilter,
    selectedSkillId,
    selectedTaskId,
    showContext,
    showTasks,
    tasks,
    thinking,
    lastQuickAction,
    setActiveRun,
    setApproved,
    setAttachments,
    setAutomation,
    setContextSnapshot,
    setError,
    setEventsTotal,
    setExecutionModel,
    setExecutionSource,
    setLatestResult,
    setLogs,
    setMission,
    setMissionHistory,
    setMode,
    setPaused,
    setProvider,
    setSearch,
    setSelectedLogFilter,
    setSelectedSkillId,
    setSelectedTaskId,
    setShowContext,
    setShowTasks,
    setTasks,
    setThinking,
    setLastQuickAction,
  } = state;
  useAiTaskWorkspacePersistence({
    profile,
    state: {
      mission,
      mode,
      provider,
      selectedSkillId,
      automation,
      approved,
      tasks,
      thinking,
      logs,
      missionHistory,
      attachments,
      showTasks,
      showContext,
      contextSnapshot,
      selectedTaskId,
      latestResult,
      executionSource,
      executionModel,
      paused,
      search,
      selectedLogFilter,
      eventsTotal,
      activeRun,
      lastQuickAction,
    },
    setters: {
      setMission,
      setMode,
      setProvider,
      setSelectedSkillId,
      setAutomation,
      setApproved,
      setTasks,
      setThinking,
      setLogs,
      setMissionHistory,
      setAttachments,
      setShowTasks,
      setShowContext,
      setContextSnapshot,
      setSelectedTaskId,
      setLatestResult,
      setExecutionSource,
      setExecutionModel,
      setPaused,
      setSearch,
      setSelectedLogFilter,
      setEventsTotal,
      setActiveRun,
      setLastQuickAction,
    },
  });

  function patchThinking(updater) {
    setThinking((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      return next.slice(0, maxThinking);
    });
  }

  function pushLog(entry) {
    setLogs((current) =>
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
    contextSnapshot,
    missionInputRef,
    normalizeAttachmentsFromEvent,
    nowIso,
    pushLog,
    setAttachments,
    setAutomation,
    setContextSnapshot,
    setError,
    setExecutionModel,
    setExecutionSource,
    setEventsTotal,
    setLastQuickAction,
    setMission,
    setMode,
    setProvider,
    setSelectedSkillId,
    setSelectedTaskId,
    setShowContext,
    setShowTasks,
  });

  const recentHistory = trimRecentHistory(missionHistory);

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
