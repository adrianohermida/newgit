import {
  buildConversationSelectionState,
  createConversationSnapshot,
  createEmptyConversation,
  deleteConversationFromCollection,
  inferConversationTitle,
  mergeConversationAttachments,
  updateConversationCollection,
} from "./dotobotPanelState";
import { buildConversationRuntimeMetadata, buildContextualModuleHref } from "./dotobotPanelContext";
import { buildConversationConcatBlock } from "./dotobotPanelFallback";
import { normalizeWorkspaceProvider } from "./dotobotPanelConfig";

export default function useDotobotConversationActions(params) {
  function updateConversationById(conversationId, updater) {
    if (!conversationId) return;
    params.setConversations((current) => updateConversationCollection(current, conversationId, updater));
  }

  function createConversationFromCurrentState(title = inferConversationTitle(params.messages)) {
    const nextConversation = createConversationSnapshot({
      title,
      messages: params.messages,
      taskHistory: params.taskHistory,
      attachments: params.attachments,
      metadata: buildConversationRuntimeMetadata({
        mode: params.mode,
        provider: params.provider,
        selectedSkillId: params.selectedSkillId,
        contextEnabled: params.contextEnabled,
        routePath: params.routePath,
      }),
    });
    params.setConversations((current) => [nextConversation, ...current].slice(0, params.maxConversations));
    params.setActiveConversationId(nextConversation.id);
    return nextConversation;
  }

  function selectConversation(conversation) {
    const selectionState = buildConversationSelectionState(conversation);
    params.setActiveConversationId(selectionState.activeConversationId);
    params.setMessages(selectionState.messages);
    params.setTaskHistory(selectionState.taskHistory);
    params.setAttachments(selectionState.attachments);
    if (selectionState.metadata?.mode) params.setMode(selectionState.metadata.mode);
    if (selectionState.metadata?.provider) {
      params.setProvider(normalizeWorkspaceProvider(selectionState.metadata.provider, params.providerCatalog));
    }
    if (typeof selectionState.metadata?.selectedSkillId === "string") params.setSelectedSkillId(selectionState.metadata.selectedSkillId);
    if (typeof selectionState.metadata?.contextEnabled === "boolean") params.setContextEnabled(selectionState.metadata.contextEnabled);
    params.setError(null);
    params.setWorkspaceOpen(true);
    setTimeout(() => params.scrollConversationToBottom(), 80);
  }

  function handleConcatConversation(conversation) {
    const nextBlock = buildConversationConcatBlock(conversation);
    params.setInput((current) => [current, nextBlock].filter(Boolean).join("\n\n---\n\n"));
    params.setWorkspaceOpen(true);
    setTimeout(() => params.composerRef.current?.focus(), 60);
  }

  function renameConversation(conversation) {
    params.setRenameModal({
      open: true,
      conversationId: conversation?.id || null,
      value: conversation?.title || inferConversationTitle(conversation?.messages || []),
    });
  }

  function renameConversationInline(conversationId, nextTitle) {
    const normalizedTitle = String(nextTitle || "").trim();
    if (!conversationId || !normalizedTitle) return;
    updateConversationById(conversationId, () => ({ title: normalizedTitle }));
  }

  function archiveConversation(conversation) {
    updateConversationById(conversation.id, (current) => ({ archived: !current.archived }));
  }

  async function shareConversation(conversation) {
    const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}${params.routePath || "/interno/copilot"}?conversation=${conversation.id}`;
    const shareText = `${conversation.title || "Conversa"}\n${shareUrl}`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      }
      params.pushUiToast({ tone: "success", title: "Conversa copiada", body: "O link e o título da conversa foram copiados para compartilhamento interno." });
    } catch {
      params.pushUiToast({ tone: "warn", title: "Compartilhamento manual", body: "Não foi possível copiar automaticamente. Use o menu do navegador para copiar a URL atual." });
    }
  }

  function deleteConversation(conversation) {
    params.setConfirmModal({
      title: "Excluir conversa",
      body: `Deseja excluir a conversa "${conversation.title || "sem título"}"?`,
      confirmLabel: "Excluir",
      onConfirm: () => {
        const remaining = deleteConversationFromCollection(params.conversations, conversation.id);
        if (remaining.length) {
          params.setConversations(remaining);
          if (conversation.id === params.activeConversationId) selectConversation(remaining[0]);
          params.setConfirmModal(null);
          return;
        }
        const replacement = createEmptyConversation("Nova conversa", buildConversationRuntimeMetadata({
          mode: params.mode,
          provider: params.provider,
          selectedSkillId: params.selectedSkillId,
          contextEnabled: params.contextEnabled,
          routePath: params.routePath,
        }));
        params.setConversations([replacement]);
        params.setActiveConversationId(replacement.id);
        params.setMessages([]);
        params.setTaskHistory([]);
        params.setAttachments([]);
        if (conversation.id === params.activeConversationId) selectConversation(replacement);
        params.setConfirmModal(null);
      },
    });
  }

  function attachFilesToConversation(conversationId, files) {
    const attachmentsToAdd = Array.from(files || []).slice(0, params.maxAttachments).map((file) => params.normalizeAttachment(file));
    if (!attachmentsToAdd.length) return;
    if (!conversationId) {
      params.setAttachments((current) => [...current, ...attachmentsToAdd].slice(0, params.maxAttachments));
      return;
    }
    params.setConversations((current) => mergeConversationAttachments(current, conversationId, attachmentsToAdd));
    if (conversationId === params.activeConversationId) {
      params.setAttachments((current) => [...current, ...attachmentsToAdd].slice(0, params.maxAttachments));
    }
  }

  return {
    archiveConversation,
    attachFilesToConversation,
    createConversationFromCurrentState,
    deleteConversation,
    handleConcatConversation,
    renameConversation,
    renameConversationInline,
    selectConversation,
    shareConversation,
    updateConversationById,
  };
}
