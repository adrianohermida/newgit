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

export default function useRemoteCopilotConversations({
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

  async function selectRemoteConversation(conversation, fallbackSelect) {
    const remoteId = conversation?.metadata?.remoteConversationId;
    if (!remoteId) {
      fallbackSelect(conversation);
      return;
    }
    const payload = await adminFetch(
      `/api/admin-copilot-conversations?conversationId=${encodeURIComponent(remoteId)}&limit=100`,
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
      messages: Array.isArray(payload.messages?.items)
        ? payload.messages.items.map((message) => ({
            role: message.role,
            text: message.text,
            createdAt: message.created_at || message.createdAt,
            metadata: message.metadata || {},
          }))
        : [],
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
