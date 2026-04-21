import { normalizeWorkspaceProvider } from "./dotobotPanelConfig";
import { buildDotobotGlobalContext, isTaskCommand, nowIso } from "./dotobotPanelState";
import { executeDotobotChatMessage } from "./dotobotSubmitChatMessage";
import { executeDotobotTaskRun } from "./dotobotSubmitTaskRun";
import { appendRemoteMessage, buildRemoteMessageMetadata, ensureRemoteConversation, uploadRemoteAttachments } from "./copilot/remoteCopilotPersistence";
async function syncRemoteUserMessage(params) {
  try {
    const remoteConversationId = await ensureRemoteConversation({
      activeConversation: params.activeConversation,
      activeConversationId: params.activeConversationId,
      seedText: params.trimmedQuestion,
      setConversations: params.setConversations,
    });
    const uploadedAttachments = await uploadRemoteAttachments(remoteConversationId, params.nextAttachments);
    const syncedAttachments = params.nextAttachments.map((attachment) => {
      const uploaded = uploadedAttachments.find((item) => item.id === attachment.id);
      return uploaded ? { ...attachment, ...uploaded } : attachment;
    });
    if (uploadedAttachments.length) {
      params.setAttachments((current) =>
        current.map((attachment) => {
          const uploaded = uploadedAttachments.find((item) => item.id === attachment.id);
          return uploaded ? { ...attachment, ...uploaded } : attachment;
        })
      );
      params.setConversations((current) =>
        current.map((conversation) =>
          conversation.id !== params.activeConversationId ? conversation : { ...conversation, attachments: syncedAttachments }
        )
      );
    }
    await appendRemoteMessage(remoteConversationId, {
      role: "user",
      text: params.trimmedQuestion,
      metadata: buildRemoteMessageMetadata({
        attachments: syncedAttachments.map((attachment) => ({
          id: attachment.id,
          kind: attachment.kind,
          name: attachment.name,
          remoteKey: attachment.remoteKey || null,
          type: attachment.type,
        })),
        contextEnabled: params.nextContextEnabled,
        mode: params.nextMode,
        provider: params.nextProvider,
        routePath: params.routePath,
        selectedSkillId: params.selectedSkillId,
      }),
    });
    return remoteConversationId;
  } catch {
    return "";
  }
}

export default function useDotobotComposerActions(params) {
  async function submitQuery(question, submitOptions = {}) {
    const trimmedQuestion = String(question || "").trim();
    if (!trimmedQuestion || params.loading) return;
    const nextAttachments = submitOptions.attachments || params.attachments;
    const nextMode = submitOptions.mode || params.mode;
    const nextProvider = normalizeWorkspaceProvider(submitOptions.provider || params.provider, params.providerCatalog);
    const nextContextEnabled = typeof submitOptions.contextEnabled === "boolean" ? submitOptions.contextEnabled : params.contextEnabled;
    params.setError(null);
    params.setLoading(true);
    params.setUiState("responding");
    params.setMessages((msgs) => [...msgs, { role: "user", text: trimmedQuestion, createdAt: nowIso() }]);
    setTimeout(() => params.scrollConversationToBottom(), 100);
    const remoteConversationId = await syncRemoteUserMessage({
      activeConversation: params.activeConversation,
      activeConversationId: params.activeConversationId,
      nextAttachments,
      nextContextEnabled,
      nextMode,
      nextProvider,
      routePath: params.routePath,
      selectedSkillId: params.selectedSkillId,
      setAttachments: params.setAttachments,
      setConversations: params.setConversations,
      trimmedQuestion,
    });
    const globalContext = buildDotobotGlobalContext({
      routePath: params.routePath,
      profile: params.profile,
      mode: nextMode,
      provider: nextProvider,
      selectedSkillId: params.selectedSkillId,
      contextEnabled: nextContextEnabled,
      activeConversationId: params.activeConversationId,
      messages: params.messages,
      attachments: nextAttachments,
    });
    if (isTaskCommand(trimmedQuestion)) {
      await executeDotobotTaskRun({ ...params, globalContext, nextContextEnabled, nextMode, nextProvider, nowIso, trimmedQuestion });
      params.setLoading(false);
      params.setUiState("idle");
      return;
    }
    const assistantText = await executeDotobotChatMessage({
      ...params,
      globalContext,
      nextAttachments,
      nextContextEnabled,
      nextMode,
      nextProvider,
      nowIso,
      trimmedQuestion,
    });
    try {
      await appendRemoteMessage(remoteConversationId, {
        role: "assistant",
        text: assistantText,
        metadata: buildRemoteMessageMetadata({
          attachments: [],
          contextEnabled: nextContextEnabled,
          mode: nextMode,
          provider: nextProvider,
          routePath: params.routePath,
          selectedSkillId: params.selectedSkillId,
        }),
      });
    } catch {}
    params.setLoading(false);
    params.setUiState("idle");
  }

  function handleComposerKeyDown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      params.setWorkspaceOpen(true);
      params.composerRef.current?.focus();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
      return;
    }
    params.setShowSlashCommands(event.currentTarget.value.trimStart().startsWith("/"));
  }

  function handleFileDrop(fileList) {
    const files = Array.from(fileList || []).slice(0, params.maxAttachments - params.attachments.length);
    if (!files.length) return;
    const normalized = files.map((file) => params.normalizeAttachment(file));
    params.setAttachments((current) => [...current, ...normalized].slice(0, params.maxAttachments));
    if (params.activeConversationId) {
      params.setConversations((current) => params.mergeConversationAttachments(current, params.activeConversationId, normalized));
    }
  }

  return { handleComposerKeyDown, handleFileDrop, submitQuery };
}
