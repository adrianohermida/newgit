import { useState } from "react";

export function useAiTaskWorkspace({ missionInputRef, normalizeAttachmentsFromEvent, trimRecentHistory, nowIso, maxThinking, maxLogs }) {
  const [mission, setMission] = useState("");
  const [mode, setMode] = useState("assisted");
  const [provider, setProvider] = useState("gpt");
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

  function handleMissionChange(value) {
    setMission(value);
    setError(null);
  }

  function handleQuickMission(value) {
    setMission(value);
    setError(null);
    missionInputRef.current?.focus();
  }

  function handleAttachmentChange(event) {
    setAttachments(normalizeAttachmentsFromEvent(event));
  }

  function handleReplay(task) {
    if (!task?.goal) return;
    setMission(task.goal);
    setSelectedTaskId(task.id);
    setMode("assisted");
    setAutomation("idle");
    pushLog({
      type: "control",
      action: "Replay selecionado",
      result: `A missao "${task.title}" foi carregada novamente para execucao.`,
    });
    missionInputRef.current?.focus();
  }

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
    recentHistory,
    search,
    selectedLogFilter,
    selectedTaskId,
    showContext,
    showTasks,
    tasks,
    thinking,
    handleAttachmentChange,
    handleMissionChange,
    handleQuickMission,
    handleReplay,
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
    setMission,
    setMissionHistory,
    setMode,
    setPaused,
    setProvider,
    setSearch,
    setSelectedLogFilter,
    setSelectedTaskId,
    setShowContext,
    setShowTasks,
    setTasks,
    setThinking,
  };
}
