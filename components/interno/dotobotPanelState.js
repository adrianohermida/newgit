import { CONVERSATIONS_STORAGE_PREFIX, MAX_ATTACHMENTS, MAX_CONVERSATIONS, MAX_HISTORY, MAX_TASKS, buildConversationSelectionState, createConversationFromState, createConversationSnapshot, createEmptyConversation, deleteConversationFromCollection, filterVisibleConversations, groupConversationsByProject, inferConversationTitle, loadPersistedDotobotState, mergeConversationAttachments, normalizeMessage, nowIso, resolveConversationProject, safeParseArray, safeParseObject, safeText, summarizeConversation, syncConversationSnapshots, updateConversationCollection } from "./dotobotConversationState";

export const CHAT_STORAGE_PREFIX = "dotobot_internal_chat_v3";
export const TASK_STORAGE_PREFIX = "dotobot_internal_tasks_v2";
export const PREF_STORAGE_PREFIX = "dotobot_internal_prefs_v1";

export { CONVERSATIONS_STORAGE_PREFIX, MAX_ATTACHMENTS, MAX_CONVERSATIONS, MAX_HISTORY, MAX_TASKS, buildConversationSelectionState, createConversationSnapshot, createEmptyConversation, deleteConversationFromCollection, filterVisibleConversations, groupConversationsByProject, inferConversationTitle, loadPersistedDotobotState, mergeConversationAttachments, nowIso, normalizeMessage, resolveConversationProject, safeParseArray, safeParseObject, safeText, summarizeConversation, syncConversationSnapshots, updateConversationCollection };

export function buildStorageKey(prefix, profile) {
  const profileId = profile?.id || profile?.email || "anonymous";
  return `${prefix}:${profileId}`;
}

export function buildConversationStorageKey(profile) {
  return buildStorageKey(CONVERSATIONS_STORAGE_PREFIX, profile);
}

export function buildDotobotGlobalContext({ routePath, profile, mode, provider, selectedSkillId, contextEnabled, activeConversationId, messages, attachments }) {
  return {
    route: routePath,
    profile: profile || null,
    mode,
    provider,
    selectedSkillId: selectedSkillId || "",
    forceIntent: selectedSkillId ? "skill" : undefined,
    selectedSkill: selectedSkillId ? { id: selectedSkillId } : undefined,
    contextEnabled,
    device: typeof window !== "undefined" && window.navigator ? window.navigator.userAgent : "server",
    time: nowIso(),
    conversationId: activeConversationId,
    messages: messages.slice(-10),
    attachments: attachments.map((attachment) => ({ kind: attachment.kind, type: attachment.type, name: attachment.file?.name || null })),
  };
}

export function isTaskCommand(question) {
  const trimmedQuestion = String(question || "").trim();
  return trimmedQuestion.startsWith("/peticao") || trimmedQuestion.startsWith("/analise") || trimmedQuestion.startsWith("/plano") || trimmedQuestion.startsWith("/tarefas");
}

export function extractAssistantResponseText(payload) {
  return payload?.data?.result?.message || payload?.data?.resultText || payload?.data?.result || payload?.data || "(sem resposta)";
}

export { createConversationFromState };
