import { useState } from "react";
import { createAiTaskWorkspaceActions } from "./aiTaskWorkspaceActions";
import useAiTaskWorkspacePersistence from "./useAiTaskWorkspacePersistence";

export function useAiTaskWorkspace({ missionInputRef, normalizeAttachmentsFromEvent, trimRecentHistory, nowIso, maxThinking, maxLogs, profile }) {
  const [mission, setMission] = useState("");
  const [mode, setMode] = useState("assisted");
  const [provider, setProvider] = useState("gpt");
  const [selectedSkillId, setSelectedSkillId] = useState("");
  const [automation, setAutomation] = useState("idle");
  const [approved, setApproved] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [thinking, setThinking] = useState([]);
  const [logs, setLogs] = useState([]);
  const [missionHistory, setMissionHistory] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [showTasks, setShowTasks] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [contextSnapshot, setContextSnapshot] = useState(null);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [executionSource, setExecutionSource] = useState(null);
  const [executionModel, setExecutionModel] = useState(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [selectedLogFilter, setSelectedLogFilter] = useState("all");
  const [eventsTotal, setEventsTotal] = useState(0);
  const [activeRun, setActiveRun] = useState(null);
  const [lastQuickAction, setLastQuickAction] = useState(null);
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
    selectedSkillId,
    recentHistory,
    search,
    selectedLogFilter,
    selectedTaskId,
    showContext,
    showTasks,
    tasks,
    thinking,
    lastQuickAction,
    handleAttachmentChange,
    handleAttachmentDrop,
    handleMissionChange,
    handleModuleAction,
    handleQuickMission,
    handleReplay,
    handleSendToDotobot,
    handleSelectRun,
    patchThinking,
    pushLog,
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
    setLastQuickAction,
    setMission,
    setMissionHistory,
    setMode,
    setPaused,
    setProvider,
    setSelectedSkillId,
    setSearch,
    setSelectedLogFilter,
    setSelectedTaskId,
    setShowContext,
    setShowTasks,
    setTasks,
    setThinking,
  };
}
