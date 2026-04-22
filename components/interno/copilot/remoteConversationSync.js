import { summarizeConversation } from "../dotobotPanelState";

export function toRemoteConversation(item) {
  const remoteId = String(item?.id || "").trim();
  if (!remoteId) return null;
  return summarizeConversation({
    id: `remote:${remoteId}`,
    title: item.title || "Nova conversa",
    preview: item.preview || "",
    messages: [],
    taskHistory: [],
    attachments: [],
    metadata: {
      remoteConversationId: remoteId,
      remoteOnly: true,
      route: "/interno/copilot",
      mode: "chat",
      provider: "gpt",
      contextEnabled: true,
    },
    createdAt: item.created_at || item.createdAt,
    updatedAt: item.updated_at || item.updatedAt,
  });
}

function toUiMessage(message) {
  return {
    id: message.id || null,
    role: message.role,
    text: message.text,
    createdAt: message.created_at || message.createdAt,
    metadata: message.metadata || {},
  };
}

export function resolveMessagesPayload(payload) {
  const liveItems = Array.isArray(payload?.live?.items) ? payload.live.items : [];
  if (payload?.live?.ok && liveItems.length) return liveItems.map(toUiMessage);
  const dbItems = Array.isArray(payload?.messages?.items) ? payload.messages.items : [];
  return dbItems.map(toUiMessage);
}

export function mergeRemoteConversations(localConversations, remoteItems) {
  const byRemoteId = new Map();
  const next = [...localConversations];
  next.forEach((conversation, index) => {
    const remoteId = conversation?.metadata?.remoteConversationId;
    if (remoteId) byRemoteId.set(remoteId, index);
  });
  remoteItems.forEach((item) => {
    const remoteConversation = toRemoteConversation(item);
    if (!remoteConversation) return;
    const existingIndex = byRemoteId.get(remoteConversation.metadata.remoteConversationId);
    if (typeof existingIndex === "number") {
      const existing = next[existingIndex];
      next[existingIndex] = summarizeConversation({
        ...existing,
        title: remoteConversation.title,
        preview: remoteConversation.preview,
        updatedAt: remoteConversation.updatedAt,
        createdAt: existing.createdAt || remoteConversation.createdAt,
        metadata: { ...(existing.metadata || {}), ...remoteConversation.metadata },
      });
      return;
    }
    next.push(remoteConversation);
  });
  return next.slice().sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
}

export function getActiveRemoteConversation(activeConversationId, conversations) {
  if (!activeConversationId) return null;
  return conversations.find((item) => item.id === activeConversationId && item?.metadata?.remoteConversationId);
}

function buildMessageKey(message) {
  return `${message?.id || ""}:${message?.createdAt || ""}:${message?.role || ""}:${message?.text || ""}`;
}

export function mergeMessages(existingMessages, incomingMessages) {
  if (!Array.isArray(incomingMessages) || !incomingMessages.length) return existingMessages || [];
  const base = Array.isArray(existingMessages) ? [...existingMessages] : [];
  const known = new Set(base.map(buildMessageKey));
  for (const message of incomingMessages) {
    const key = buildMessageKey(message);
    if (known.has(key)) continue;
    known.add(key);
    base.push(message);
  }
  base.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
  return base;
}

export function getLastCreatedAt(messages) {
  if (!Array.isArray(messages) || !messages.length) return "";
  const last = messages[messages.length - 1];
  return String(last?.createdAt || "").trim();
}

export function summarizeHydratedConversation(conversation, payload, remoteId, messages) {
  return summarizeConversation({
    ...conversation,
    title: payload.conversation.title || conversation.title,
    preview: payload.conversation.preview || conversation.preview,
    messages,
    metadata: {
      ...(conversation.metadata || {}),
      remoteConversationId: remoteId,
      remoteOnly: false,
    },
    updatedAt: payload.conversation.updated_at || payload.conversation.updatedAt || conversation.updatedAt,
    createdAt: payload.conversation.created_at || payload.conversation.createdAt || conversation.createdAt,
  });
}
