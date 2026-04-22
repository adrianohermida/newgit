import { useEffect, useRef } from "react";
import { adminFetch } from "../../../lib/admin/api";
import {
  getActiveRemoteConversation,
  getLastCreatedAt,
  mergeMessages,
  mergeRemoteConversations,
  resolveMessagesPayload,
  summarizeHydratedConversation,
} from "./remoteConversationSync";

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
  const liveCursorByRemoteIdRef = useRef(new Map());
  const activeMessagesRef = useRef([]);

  useEffect(() => {
    activeMessagesRef.current = Array.isArray(conversations)
      ? getActiveRemoteConversation(activeConversationId, conversations)?.messages || activeMessagesRef.current
      : activeMessagesRef.current;
  }, [activeConversationId, conversations]);

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
    const cursorMap = liveCursorByRemoteIdRef.current;
    if (!cursorMap.get(remoteId)) cursorMap.set(remoteId, getLastCreatedAt(activeRemoteConversation.messages || []));

    const loadLiveState = async () => {
      const liveCursor = cursorMap.get(remoteId) || "";
      const liveQuery = liveCursor ? `&liveCursor=${encodeURIComponent(liveCursor)}` : "";
      const payload = await adminFetch(
        `/api/admin-copilot-conversations?conversationId=${encodeURIComponent(remoteId)}&limit=100&includeLive=1${liveQuery}`,
        { method: "GET" },
        { allowFailurePayload: true }
      ).catch(() => null);
      if (!alive || !payload?.ok || !payload?.conversation) return;
      const mergedMessages = mergeMessages(activeMessagesRef.current, resolveMessagesPayload(payload));
      const nextCursor = getLastCreatedAt(mergedMessages);
      if (nextCursor) cursorMap.set(remoteId, nextCursor);
      activeMessagesRef.current = mergedMessages;
      setMessages(mergedMessages);
      setConversations((current) =>
        current.map((item) => (item.id === activeRemoteConversation.id
          ? summarizeHydratedConversation(item, payload, remoteId, mergedMessages)
          : item))
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
    const messages = resolveMessagesPayload(payload);
    liveCursorByRemoteIdRef.current.set(remoteId, getLastCreatedAt(messages));
    activeMessagesRef.current = messages;
    const hydratedConversation = summarizeHydratedConversation(conversation, payload, remoteId, messages);
    setConversations((current) => current.map((item) => (item.id === conversation.id ? hydratedConversation : item)));
    setActiveConversationId(hydratedConversation.id);
    setMessages(hydratedConversation.messages || []);
    setTaskHistory(hydratedConversation.taskHistory || []);
    setAttachments(hydratedConversation.attachments || []);
    if (hydratedConversation.metadata?.mode) setMode(hydratedConversation.metadata.mode);
    if (hydratedConversation.metadata?.provider) setProvider(hydratedConversation.metadata.provider);
    if (typeof hydratedConversation.metadata?.selectedSkillId === "string") setSelectedSkillId(hydratedConversation.metadata.selectedSkillId);
    if (typeof hydratedConversation.metadata?.contextEnabled === "boolean") setContextEnabled(hydratedConversation.metadata.contextEnabled);
  }

  return { selectRemoteConversation };
}
