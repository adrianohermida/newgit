import { buildDotobotGlobalContext, isTaskCommand, nowIso } from "./dotobotPanelState";
import { normalizeWorkspaceProvider } from "./dotobotPanelConfig";
import { executeDotobotChatMessage } from "./dotobotSubmitChatMessage";
import { executeDotobotTaskRun } from "./dotobotSubmitTaskRun";

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
    await executeDotobotChatMessage({ ...params, globalContext, nextAttachments, nextContextEnabled, nextMode, nextProvider, nowIso, trimmedQuestion });
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
