import { useEffect, useMemo, useState } from "react";
import { createAiTaskWorkspaceActions } from "./aiTaskWorkspaceActions";

const AI_TASK_STORAGE_PREFIX = "hmadv_ai_task_workspace_v1";
function buildWorkspaceStorageKey(profile) {
  const profileId = profile?.id || profile?.email || "anonymous";
  return `${AI_TASK_STORAGE_PREFIX}:${profileId}`;
}

function safeParseWorkspace(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeWorkspaceMode(value) {
  return ["assisted", "auto", "manual"].includes(String(value || "").trim()) ? String(value).trim() : "assisted";
}

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
  const storageKey = useMemo(() => buildWorkspaceStorageKey(profile), [profile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = safeParseWorkspace(window.localStorage.getItem(storageKey));
    if (!persisted) return;

    setMission(typeof persisted.mission === "string" ? persisted.mission : "");
    setMode(normalizeWorkspaceMode(persisted.mode));
    setProvider(typeof persisted.provider === "string" ? persisted.provider : "gpt");
    setSelectedSkillId(typeof persisted.selectedSkillId === "string" ? persisted.selectedSkillId : "");
    setAutomation(typeof persisted.automation === "string" ? persisted.automation : "idle");
    setApproved(Boolean(persisted.approved));
    setTasks(Array.isArray(persisted.tasks) ? persisted.tasks : []);
    setThinking(Array.isArray(persisted.thinking) ? persisted.thinking : []);
    setLogs(Array.isArray(persisted.logs) ? persisted.logs : []);
    setMissionHistory(Array.isArray(persisted.missionHistory) ? persisted.missionHistory : []);
    setAttachments(Array.isArray(persisted.attachments) ? persisted.attachments : []);
    setShowTasks(typeof persisted.showTasks === "boolean" ? persisted.showTasks : true);
    setShowContext(typeof persisted.showContext === "boolean" ? persisted.showContext : false);
    setContextSnapshot(persisted.contextSnapshot && typeof persisted.contextSnapshot === "object" ? persisted.contextSnapshot : null);
    setSelectedTaskId(typeof persisted.selectedTaskId === "string" ? persisted.selectedTaskId : null);
    setLatestResult(typeof persisted.latestResult === "string" ? persisted.latestResult : null);
    setExecutionSource(typeof persisted.executionSource === "string" ? persisted.executionSource : null);
    setExecutionModel(typeof persisted.executionModel === "string" ? persisted.executionModel : null);
    setPaused(Boolean(persisted.paused));
    setSearch(typeof persisted.search === "string" ? persisted.search : "");
    setSelectedLogFilter(typeof persisted.selectedLogFilter === "string" ? persisted.selectedLogFilter : "all");
    setEventsTotal(Number.isFinite(Number(persisted.eventsTotal)) ? Number(persisted.eventsTotal) : 0);
    setActiveRun(persisted.activeRun && typeof persisted.activeRun === "object" ? persisted.activeRun : null);
    setLastQuickAction(persisted.lastQuickAction && typeof persisted.lastQuickAction === "object" ? persisted.lastQuickAction : null);
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = {
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
    };
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [
    activeRun,
    approved,
    attachments,
    automation,
    contextSnapshot,
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
    selectedTaskId,
    showContext,
    showTasks,
    storageKey,
    tasks,
    thinking,
    lastQuickAction,
  ]);

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
