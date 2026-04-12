export const CHAT_STORAGE_PREFIX = "dotobot_internal_chat_v3";
export const TASK_STORAGE_PREFIX = "dotobot_internal_tasks_v2";
export const PREF_STORAGE_PREFIX = "dotobot_internal_prefs_v1";
export const CONVERSATIONS_STORAGE_PREFIX = "dotobot_internal_conversations_v2";
export const MAX_HISTORY = 80;
export const MAX_TASKS = 80;
export const MAX_ATTACHMENTS = 8;
export const MAX_CONVERSATIONS = 30;

export function buildStorageKey(prefix, profile) {
  const profileId = profile?.id || profile?.email || "anonymous";
  return `${prefix}:${profileId}`;
}

export function buildConversationStorageKey(profile) {
  return buildStorageKey(CONVERSATIONS_STORAGE_PREFIX, profile);
}

export function nowIso() {
  return new Date().toISOString();
}

export function safeParseArray(raw, max = MAX_HISTORY) {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.slice(-max) : [];
  } catch {
    return [];
  }
}

export function safeParseObject(raw, fallback) {
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeMessage(item) {
  return item && typeof item.role === "string" && typeof item.text === "string";
}

export function safeText(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function inferConversationTitle(messages = []) {
  const firstUser = messages.find((item) => item.role === "user" && item.text);
  if (!firstUser) return "Nova conversa";
  const text = firstUser.text.replace(/\s+/g, " ").trim();
  return text.length > 48 ? `${text.slice(0, 48).trim()}...` : text;
}

export function summarizeConversation(conversation) {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const lastMessage = messages[messages.length - 1];
  const attachments = Array.isArray(conversation?.attachments) ? conversation.attachments : [];
  const taskHistory = Array.isArray(conversation?.taskHistory) ? conversation.taskHistory : [];
  return {
    id: conversation?.id || `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: safeText(conversation?.title, inferConversationTitle(messages)),
    archived: Boolean(conversation?.archived),
    createdAt: conversation?.createdAt || nowIso(),
    updatedAt: conversation?.updatedAt || nowIso(),
    tags: Array.isArray(conversation?.tags) ? conversation.tags : [],
    messages,
    taskHistory,
    attachments,
    metadata: conversation?.metadata || {},
    preview: safeText(conversation?.preview, lastMessage?.text || "Sem mensagens ainda"),
  };
}

export function createConversationFromState(state) {
  return summarizeConversation({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: "Nova conversa",
    messages: state.messages || [],
    taskHistory: state.taskHistory || [],
    attachments: state.attachments || [],
    tags: state.tags || [],
    metadata: state.metadata || {},
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

export function buildDotobotGlobalContext({
  routePath,
  profile,
  mode,
  provider,
  contextEnabled,
  activeConversationId,
  messages,
  attachments,
}) {
  return {
    route: routePath,
    profile: profile || null,
    mode,
    provider,
    contextEnabled,
    device: typeof window !== "undefined" && window.navigator ? window.navigator.userAgent : "server",
    time: nowIso(),
    conversationId: activeConversationId,
    messages: messages.slice(-10),
    attachments: attachments.map((attachment) => ({
      kind: attachment.kind,
      type: attachment.type,
      name: attachment.file?.name || null,
    })),
  };
}

export function isTaskCommand(question) {
  const trimmedQuestion = String(question || "").trim();
  return (
    trimmedQuestion.startsWith("/peticao") ||
    trimmedQuestion.startsWith("/analise") ||
    trimmedQuestion.startsWith("/plano") ||
    trimmedQuestion.startsWith("/tarefas")
  );
}

export function extractAssistantResponseText(payload) {
  return (
    payload?.data?.result?.message ||
    payload?.data?.resultText ||
    payload?.data?.result ||
    payload?.data ||
    "(sem resposta)"
  );
}

export function loadPersistedDotobotState({
  chatStorageKey,
  taskStorageKey,
  prefStorageKey,
  conversationStorageKey,
  initialWorkspaceOpen,
}) {
  const savedMessages = safeParseArray(window.localStorage.getItem(chatStorageKey), MAX_HISTORY).filter(normalizeMessage);
  const savedTasks = safeParseArray(window.localStorage.getItem(taskStorageKey), MAX_TASKS);
  const savedPrefs = safeParseObject(window.localStorage.getItem(prefStorageKey), {});
  const savedConversations = safeParseArray(window.localStorage.getItem(conversationStorageKey), MAX_CONVERSATIONS)
    .map(summarizeConversation)
    .filter(Boolean);

  const fallbackConversation = createConversationFromState({
    messages: savedMessages,
    taskHistory: savedTasks,
    attachments: [],
    metadata: {},
  });

  const conversations = savedConversations.length ? savedConversations : [fallbackConversation];
  const activeConversationId = savedPrefs.activeConversationId || conversations[0]?.id || fallbackConversation.id;
  const activeConversation =
    conversations.find((item) => item.id === activeConversationId) || conversations[0] || fallbackConversation;
  const activeConversationMetadata = activeConversation?.metadata || {};

  return {
    conversations,
    activeConversationId: activeConversation.id,
    messages:
      Array.isArray(activeConversation.messages) && activeConversation.messages.length
        ? activeConversation.messages
        : savedMessages,
    taskHistory:
      Array.isArray(activeConversation.taskHistory) && activeConversation.taskHistory.length
        ? activeConversation.taskHistory
        : savedTasks,
    attachments: Array.isArray(activeConversation.attachments) ? activeConversation.attachments : [],
    prefs: {
      mode: activeConversationMetadata.mode || savedPrefs.mode,
      provider: activeConversationMetadata.provider || savedPrefs.provider,
      contextEnabled:
        typeof activeConversationMetadata.contextEnabled === "boolean"
          ? activeConversationMetadata.contextEnabled
          : savedPrefs.contextEnabled,
      workspaceOpen: Boolean(savedPrefs.workspaceOpen || initialWorkspaceOpen),
    },
  };
}

export function syncConversationSnapshots({
  conversations,
  activeConversationId,
  messages,
  taskHistory,
  attachments,
  metadata,
}) {
  return conversations
    .map((conversation) => ({
      ...summarizeConversation(conversation),
      messages: conversation.id === activeConversationId ? messages.slice(-MAX_HISTORY) : conversation.messages || [],
      taskHistory:
        conversation.id === activeConversationId ? taskHistory.slice(-MAX_TASKS) : conversation.taskHistory || [],
      attachments:
        conversation.id === activeConversationId
          ? attachments.slice(0, MAX_ATTACHMENTS)
          : conversation.attachments || [],
      metadata:
        conversation.id === activeConversationId
          ? {
              ...(conversation.metadata || {}),
              ...(metadata || {}),
            }
          : conversation.metadata || {},
      updatedAt: conversation.id === activeConversationId ? nowIso() : conversation.updatedAt || nowIso(),
      title: safeText(conversation.title, inferConversationTitle(conversation.messages || [])),
      preview:
        conversation.id === activeConversationId
          ? safeText(messages[messages.length - 1]?.text, conversation.preview)
          : conversation.preview,
    }))
    .slice(0, MAX_CONVERSATIONS);
}

export function updateConversationCollection(conversations, conversationId, updater) {
  if (!conversationId) return conversations;
  return conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    const next = typeof updater === "function" ? updater(conversation) : updater;
    return summarizeConversation({
      ...conversation,
      ...next,
      updatedAt: nowIso(),
    });
  });
}

export function createConversationSnapshot({ title, messages, taskHistory, attachments, metadata }) {
  return summarizeConversation({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    messages: messages.slice(-MAX_HISTORY),
    taskHistory: taskHistory.slice(-MAX_TASKS),
    attachments: attachments.slice(0, MAX_ATTACHMENTS),
    metadata: metadata || {},
    tags: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

export function createEmptyConversation(title = "Nova conversa", metadata = {}) {
  return summarizeConversation({
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    messages: [],
    taskHistory: [],
    attachments: [],
    metadata,
    tags: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

export function deleteConversationFromCollection(conversations, conversationId) {
  return conversations.filter((conversation) => conversation.id !== conversationId);
}

export function filterVisibleConversations(conversations, conversationSearch) {
  return conversations.filter((conversation) => {
    if (conversation.archived) return false;
    if (!String(conversationSearch || "").trim()) return true;
    const haystack = [
      conversation.title,
      conversation.preview,
      ...(conversation.tags || []),
      ...(Array.isArray(conversation.messages) ? conversation.messages.map((message) => message.text) : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(String(conversationSearch).toLowerCase());
  });
}

export function buildConversationSelectionState(conversation) {
  if (!conversation) {
    return {
      activeConversationId: null,
      messages: [],
      taskHistory: [],
      attachments: [],
      metadata: {},
    };
  }

  return {
    activeConversationId: conversation.id,
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
    taskHistory: Array.isArray(conversation.taskHistory) ? conversation.taskHistory : [],
    attachments: Array.isArray(conversation.attachments) ? conversation.attachments : [],
    metadata: conversation.metadata || {},
  };
}

export function mergeConversationAttachments(conversations, conversationId, attachmentsToAdd) {
  return conversations.map((conversation) =>
    conversation.id === conversationId
      ? summarizeConversation({
          ...conversation,
          attachments: [...(conversation.attachments || []), ...attachmentsToAdd].slice(0, MAX_ATTACHMENTS),
          updatedAt: nowIso(),
        })
      : conversation
  );
}
