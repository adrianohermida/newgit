import { useEffect, useMemo, useState } from "react";
import { appendActivityLog, appendOperationalNote, setModuleHistory } from "../../../lib/admin/activity-log";

const AI_TASK_STORAGE_PREFIX = "hmadv_ai_task_workspace_v1";
const AI_TASK_WORKSPACE_META = {
  consolePane: "ai-task",
  domain: "workspace",
  system: "task-planning",
};

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

export function useAiTaskWorkspace({ missionInputRef, normalizeAttachmentsFromEvent, trimRecentHistory, nowIso, maxThinking, maxLogs, profile }) {
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
  const [lastQuickAction, setLastQuickAction] = useState(null);
  const storageKey = useMemo(() => buildWorkspaceStorageKey(profile), [profile]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = safeParseWorkspace(window.localStorage.getItem(storageKey));
    if (!persisted) return;

    setMission(typeof persisted.mission === "string" ? persisted.mission : "");
    setMode(typeof persisted.mode === "string" ? persisted.mode : "assisted");
    setProvider(typeof persisted.provider === "string" ? persisted.provider : "gpt");
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

  function handleMissionChange(value) {
    setMission(value);
    setError(null);
  }

  function handleQuickMission(value) {
    setMission(value);
    setError(null);
    missionInputRef.current?.focus();
  }

  function handleModuleAction(action, moduleEntry, routePath) {
    if (!action?.mission) return;
    const createdAt = nowIso();
    const moduleLabel = moduleEntry?.label || moduleEntry?.key || "Modulo";
    const nextRoute = action.routePath || routePath || contextSnapshot?.route || "/interno/ai-task";
    const consoleTags = Array.from(new Set(["ai-task", ...(moduleEntry?.consoleTags || []), action.kind].filter(Boolean)));
    const nextQuickAction = {
      id: action.id || `${Date.now()}_quick_action`,
      label: action.label || "Playbook",
      mission: action.mission,
      moduleKey: moduleEntry?.key || null,
      moduleLabel,
      routePath: nextRoute,
      tags: consoleTags,
      kind: action.kind || "mission",
      createdAt,
    };

    setMission(action.mission);
    setMode("task");
    setShowContext(true);
    setShowTasks(true);
    setAutomation("idle");
    setError(null);
    setLastQuickAction(nextQuickAction);
    setContextSnapshot((current) => ({
      ...(current || {}),
      module: moduleEntry?.key || current?.module || "ai-task",
      moduleLabel,
      route: nextRoute,
      routePath: nextRoute,
      consoleTags,
      selectedAction: nextQuickAction,
      quickActions: moduleEntry?.quickActions || current?.quickActions || [],
      capabilities: moduleEntry?.capabilities || current?.capabilities || [],
    }));

    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      module: "ai-task",
      component: "AITaskQuickAction",
      label: "AI Task: playbook acionado",
      action: "ai_task_quick_action",
      method: "UI",
      path: nextRoute,
      ...AI_TASK_WORKSPACE_META,
      status: "success",
      tags: consoleTags,
      response: [
        `Playbook: ${nextQuickAction.label}`,
        `Modulo: ${moduleLabel}`,
        `Rota: ${nextRoute}`,
        `Missao: ${action.mission}`,
      ].join("\n"),
    });

    appendOperationalNote({
      type: "ai-task-playbook",
      text: `Playbook "${nextQuickAction.label}" preparado para ${moduleLabel}.`,
      meta: nextQuickAction,
    });
    setModuleHistory("dotobot", {
      handoffFromAiTask: nextQuickAction,
      consoleTags,
      routePath: routePath || "/interno",
    });

    pushLog({
      type: "control",
      action: "Playbook preparado",
      result: `${nextQuickAction.label} em ${moduleLabel} deixou a missao pronta para execucao no console.`,
    });
    missionInputRef.current?.focus();
  }

  function handleSendToDotobot(payload, routePath) {
    const missionText = typeof payload === "string" ? payload : payload?.mission;
    if (!missionText) return;
    const handoff = {
      id: typeof payload === "object" && payload?.id ? payload.id : `${Date.now()}_ai_task_to_dotobot`,
      label: typeof payload === "object" && payload?.label ? payload.label : "Missao enviada ao Dotobot",
      mission: missionText,
      moduleKey: typeof payload === "object" ? payload?.moduleKey || contextSnapshot?.module || "ai-task" : contextSnapshot?.module || "ai-task",
      moduleLabel: typeof payload === "object" ? payload?.moduleLabel || contextSnapshot?.moduleLabel || "AI Task" : contextSnapshot?.moduleLabel || "AI Task",
      routePath: routePath || contextSnapshot?.route || "/interno",
      tags: Array.from(new Set(["ai-task", "dotobot", ...((typeof payload === "object" && payload?.tags) || contextSnapshot?.consoleTags || [])])),
      createdAt: nowIso(),
    };

    setModuleHistory("dotobot", {
      handoffFromAiTask: handoff,
      consoleTags: handoff.tags,
      routePath: handoff.routePath,
      workspaceOpen: true,
    });
    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      module: "dotobot",
      component: "AITaskHandoff",
      label: "AI Task: handoff para Dotobot",
      action: "ai_task_to_dotobot_handoff",
      method: "UI",
      path: handoff.routePath,
      consolePane: ["dotobot", "ai-task"],
      domain: "handoff",
      system: "copilot",
      status: "success",
      tags: handoff.tags,
      response: [
        `Origem: AI Task`,
        `Modulo: ${handoff.moduleLabel}`,
        `Missao: ${handoff.mission}`,
      ].join("\n"),
    });
    appendOperationalNote({
      type: "ai-task-dotobot-handoff",
      text: `Missao enviada do AI Task para o Dotobot: ${handoff.label}.`,
      meta: handoff,
    });
    pushLog({
      type: "control",
      action: "Handoff para Dotobot",
      result: `${handoff.label} foi enviado ao copiloto com contexto compartilhado.`,
    });
  }

  function handleAttachmentChange(event) {
    setAttachments(normalizeAttachmentsFromEvent(event));
  }

  function handleAttachmentDrop(fileList) {
    const dropped = Array.from(fileList || [])
      .slice(0, 8)
      .map((file) => ({
        name: file.name,
        type: file.type || "file",
        size: file.size,
      }));
    setAttachments(dropped);
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

  function handleSelectRun(item) {
    if (!item) return;
    setMission(typeof item.mission === "string" ? item.mission : "");
    setMode(typeof item.mode === "string" ? item.mode : "assisted");
    setProvider(typeof item.provider === "string" ? item.provider : "gpt");
    setAutomation(typeof item.status === "string" ? item.status : "idle");
    setExecutionSource(typeof item.source === "string" ? item.source : null);
    setExecutionModel(typeof item.model === "string" ? item.model : null);
  }

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
    setSearch,
    setSelectedLogFilter,
    setSelectedTaskId,
    setShowContext,
    setShowTasks,
    setTasks,
    setThinking,
  };
}
