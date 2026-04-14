import { useEffect } from "react";

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
  const normalized = String(value || "").trim();
  return ["assisted", "auto", "manual"].includes(normalized) ? normalized : "assisted";
}

function hydrateWorkspaceState(persisted, setters) {
  setters.setMission(typeof persisted.mission === "string" ? persisted.mission : "");
  setters.setMode(normalizeWorkspaceMode(persisted.mode));
  setters.setProvider(typeof persisted.provider === "string" ? persisted.provider : "gpt");
  setters.setSelectedSkillId(typeof persisted.selectedSkillId === "string" ? persisted.selectedSkillId : "");
  setters.setAutomation(typeof persisted.automation === "string" ? persisted.automation : "idle");
  setters.setApproved(Boolean(persisted.approved));
  setters.setTasks(Array.isArray(persisted.tasks) ? persisted.tasks : []);
  setters.setThinking(Array.isArray(persisted.thinking) ? persisted.thinking : []);
  setters.setLogs(Array.isArray(persisted.logs) ? persisted.logs : []);
  setters.setMissionHistory(Array.isArray(persisted.missionHistory) ? persisted.missionHistory : []);
  setters.setAttachments(Array.isArray(persisted.attachments) ? persisted.attachments : []);
  setters.setShowTasks(typeof persisted.showTasks === "boolean" ? persisted.showTasks : true);
  setters.setShowContext(typeof persisted.showContext === "boolean" ? persisted.showContext : false);
  setters.setContextSnapshot(persisted.contextSnapshot && typeof persisted.contextSnapshot === "object" ? persisted.contextSnapshot : null);
  setters.setSelectedTaskId(typeof persisted.selectedTaskId === "string" ? persisted.selectedTaskId : null);
  setters.setLatestResult(typeof persisted.latestResult === "string" ? persisted.latestResult : null);
  setters.setExecutionSource(typeof persisted.executionSource === "string" ? persisted.executionSource : null);
  setters.setExecutionModel(typeof persisted.executionModel === "string" ? persisted.executionModel : null);
  setters.setPaused(Boolean(persisted.paused));
  setters.setSearch(typeof persisted.search === "string" ? persisted.search : "");
  setters.setSelectedLogFilter(typeof persisted.selectedLogFilter === "string" ? persisted.selectedLogFilter : "all");
  setters.setEventsTotal(Number.isFinite(Number(persisted.eventsTotal)) ? Number(persisted.eventsTotal) : 0);
  setters.setActiveRun(persisted.activeRun && typeof persisted.activeRun === "object" ? persisted.activeRun : null);
  setters.setLastQuickAction(persisted.lastQuickAction && typeof persisted.lastQuickAction === "object" ? persisted.lastQuickAction : null);
}

export default function useAiTaskWorkspacePersistence({ profile, state, setters }) {
  const storageKey = buildWorkspaceStorageKey(profile);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = safeParseWorkspace(window.localStorage.getItem(storageKey));
    if (persisted) hydrateWorkspaceState(persisted, setters);
  }, [setters, storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  }, [state, storageKey]);
}
