import { useEffect } from "react";
import { normalizeWorkspaceProvider, PROVIDER_OPTIONS } from "./dotobotPanelConfig";
import { loadPersistedDotobotState } from "./dotobotPanelState";
import { safeLocalGet } from "./dotobotPanelUtils";

export default function useDotobotPersistedBootstrap({
  chatStorageKey,
  conversationStorageKey,
  initialRightPanelTab,
  initialWorkspaceOpen,
  isFullscreenCopilot,
  layoutStorageKey,
  prefStorageKey,
  setActiveConversationId,
  setAttachments,
  setContextEnabled,
  setConversations,
  setMessages,
  setMode,
  setProvider,
  setRightPanelTab,
  setSelectedSkillId,
  setTaskHistory,
  setWorkspaceLayoutMode,
  setWorkspaceOpen,
  taskStorageKey,
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const persistedState = loadPersistedDotobotState({
      chatStorageKey,
      taskStorageKey,
      prefStorageKey,
      conversationStorageKey,
      initialWorkspaceOpen,
    });
    setConversations(persistedState.conversations);
    setActiveConversationId(persistedState.activeConversationId);
    setMessages(persistedState.messages);
    setTaskHistory(persistedState.taskHistory);
    setAttachments(persistedState.attachments);
    if (persistedState.prefs.mode && !isFullscreenCopilot) setMode(persistedState.prefs.mode);
    if (persistedState.prefs.provider && !isFullscreenCopilot) {
      setProvider(normalizeWorkspaceProvider(persistedState.prefs.provider, PROVIDER_OPTIONS));
    }
    if (typeof persistedState.prefs.selectedSkillId === "string") setSelectedSkillId(persistedState.prefs.selectedSkillId);
    if (typeof persistedState.prefs.contextEnabled === "boolean") setContextEnabled(persistedState.prefs.contextEnabled);
    setWorkspaceOpen(persistedState.prefs.workspaceOpen);
    const persistedLayoutMode = safeLocalGet(layoutStorageKey, isFullscreenCopilot ? "immersive" : "snap");
    if (["snap", "balanced", "immersive"].includes(persistedLayoutMode)) {
      setWorkspaceLayoutMode(isFullscreenCopilot ? "immersive" : persistedLayoutMode);
    }
    if (isFullscreenCopilot) {
      setMode("chat");
      setProvider((current) => normalizeWorkspaceProvider(current || "gpt", PROVIDER_OPTIONS));
      setWorkspaceLayoutMode("immersive");
      setRightPanelTab(initialRightPanelTab);
    }
  }, [
    chatStorageKey,
    conversationStorageKey,
    initialRightPanelTab,
    initialWorkspaceOpen,
    isFullscreenCopilot,
    layoutStorageKey,
    prefStorageKey,
    setActiveConversationId,
    setAttachments,
    setContextEnabled,
    setConversations,
    setMessages,
    setMode,
    setProvider,
    setRightPanelTab,
    setSelectedSkillId,
    setTaskHistory,
    setWorkspaceLayoutMode,
    setWorkspaceOpen,
    taskStorageKey,
  ]);
}
