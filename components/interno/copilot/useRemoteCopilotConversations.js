import { useEffect } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { summarizeConversation } from "../dotobotPanelState";

function toRemoteConversation(item) {
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
    role: message.role,
    text: message.text,
    createdAt: message.created_at || message.createdAt,
    metadata: message.metadata || {},
  };
}

function resolveMessagesPayload(payload) {
  const liveItems = Array.isArray(payload?.live?.items) ? payload.live.items : [];
  if (payload?.live?.ok && liveItems.length) return liveItems.map(toUiMessage);
  const dbItems = Array.isArray(payload?.messages?.items) ? payload.messages.items : [];
  return dbItems.map(toUiMessage);
}

function mergeRemoteConversations(localConversations, remoteItems) {
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
        metadata: {
          ...(existing.metadata || {}),
          ...remoteConversation.metadata,
        },
      });
      return;
    }
    next.push(remoteConversation);
  });

  return next
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
}

function getActiveRemoteConversation(activeConversationId, conversations) {
  if (!activeConversationId) return null;
  return conversations.find((item) => item.id === activeConversationId && item?.metadata?.remoteConversationId);
}

function buildMessagesSignature(messages) {
  if (!Array.isArray(messages) || !messages.length) return "empty";
  const last = messages[messages.length - 1];
  return `${messages.length}:${last?.createdAt || ""}:${last?.text || ""}`;
}

export default function useRemoteCopilotConversations({
  activeConversationId,
  conversations,
  setConversations,
  setActiveConversationId,
  setMessages,
  setTaskHistory,
  setAttachments,
  setMode,
  setProvider,
  setSelectedSkillId,
  setContextEnabled,
}) {
  useEffect(() => {
    let active = true;
    adminFetch("/api/admin-copilot-conversations?limit=50", { method: "GET" }, { allowFailurePayload: true })
      .then((payload) => {
        if (!active || !payload?.ok || !Array.isArray(payload.items)) return;
        setConversations((current) => mergeRemoteConversations(current, payload.items));
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, [setConversations]);

  useEffect(() => {
    const activeRemoteConversation = getActiveRemoteConversation(activeConversationId, conversations);
    const remoteId = activeRemoteConversation?.metadata?.remoteConversationId;
    if (!remoteId) return undefined;
    let alive = true;
    let previousSignature = null;
    const loadLiveState = async () => {
      const payload = await adminFetch(
        `/api/admin-copilot-conversations?conversationId=${encodeURIComponent(remoteId)}&limit=100&includeLive=1`,
        { method: "GET" },
        { allowFailurePayload: true }
      ).catch(() => null);
      if (!alive || !payload?.ok || !payload?.conversation) return;
      const nextMessages = resolveMessagesPayload(payload);
      const nextSignature = buildMessagesSignature(nextMessages);
      if (nextSignature === previousSignature) return;
      previousSignature = nextSignature;
      setMessages(nextMessages);
      setConversations((current) =>
        current.map((item) => {
          if (item.id !== activeRemoteConversation.id) return item;
          return summarizeConversation({
            ...item,
            title: payload.conversation.title || item.title,
            preview: payload.conversation.preview || item.preview,
            messages: nextMessages,
            metadata: {
              ...(item.metadata || {}),
              remoteConversationId: remoteId,
              remoteOnly: false,
            },
            updatedAt: payload.conversation.updated_at || payload.conversation.updatedAt || item.updatedAt,
            createdAt: payload.conversation.created_at || payload.conversation.createdAt || item.createdAt,
          });
        })
      );
    };
    loadLiveState();
    const intervalId = window.setInterval(loadLiveState, 4000);
    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [activeConversationId, conversations, setConversations, setMessages]);

  async function selectRemoteConversation(conversation, fallbackSelect) {
    const remoteId = conversation?.metadata?.remoteConversationId;
    if (!remoteId) {
      fallbackSelect(conversation);
      return;
    }
    const payload = await adminFetch(
      `/api/admin-copilot-conversations?conversationId=${encodeURIComponent(remoteId)}&limit=100&includeLive=1`,
      { method: "GET" },
      { allowFailurePayload: true }
    );
    if (!payload?.ok || !payload?.conversation) {
      fallbackSelect(conversation);
      return;
    }
    const hydratedConversation = summarizeConversation({
      ...conversation,
      title: payload.conversation.title || conversation.title,
      preview: payload.conversation.preview || conversation.preview,
      messages: resolveMessagesPayload(payload),
      metadata: {
        ...(conversation.metadata || {}),
        remoteConversationId: remoteId,
        remoteOnly: false,
      },
      updatedAt: payload.conversation.updated_at || payload.conversation.updatedAt || conversation.updatedAt,
      createdAt: payload.conversation.created_at || payload.conversation.createdAt || conversation.createdAt,
    });
    setConversations((current) =>
      current.map((item) => (item.id === conversation.id ? hydratedConversation : item))
    );
    setActiveConversationId(hydratedConversation.id);
    setMessages(hydratedConversation.messages || []);
    setTaskHistory(hydratedConversation.taskHistory || []);
    setAttachments(hydratedConversation.attachments || []);
    if (hydratedConversation.metadata?.mode) setMode(hydratedConversation.metadata.mode);
    if (hydratedConversation.metadata?.provider) setProvider(hydratedConversation.metadata.provider);
    if (typeof hydratedConversation.metadata?.selectedSkillId === "string") {
      setSelectedSkillId(hydratedConversation.metadata.selectedSkillId);
    }
    if (typeof hydratedConversation.metadata?.contextEnabled === "boolean") {
      setContextEnabled(hydratedConversation.metadata.contextEnabled);
    }
  }

  return { selectRemoteConversation };
}
