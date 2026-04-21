import { adminFetch } from "../../lib/admin/api";
import { appendActivityLog, updateActivityLog } from "../../lib/admin/activity-log";
import { invokeBrowserLocalExecute, invokeBrowserLocalMessages, isBrowserLocalProvider } from "../../lib/lawdesk/browser-local-runtime";
import { buildLocalFallbackActions, buildLocalFallbackResponse } from "./dotobotPanelFallback";
import { extractAssistantResponseText } from "./dotobotPanelState";
import { buildDiagnosticReport, DOTOBOT_TASK_CONSOLE_META } from "./dotobotPanelUtils";
function buildFallbackErrorMessage(errorCode) {
  if (errorCode === "LOCAL_RUNTIME_INSUFFICIENT_MEMORY") {
    return "LLM local sem memoria suficiente. O Copilot respondeu com um playbook operacional de contingencia.";
  }
  return "O runtime local falhou na inferencia. O Copilot respondeu com um playbook operacional de contingencia.";
}
export async function executeDotobotChatMessage(params) {
  const localProvider = isBrowserLocalProvider(params.nextProvider);
  const requestPath = localProvider ? "browser://local-ai-core/v1/messages" : "/api/admin-lawdesk-chat";
  const chatLogId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const chatStartedAt = Date.now();
  appendActivityLog({
    id: chatLogId,
    module: "dotobot",
    component: "DotobotChat",
    label: "Dotobot: enviar mensagem",
    action: "dotobot_chat_submit",
    method: "POST",
    path: requestPath,
    ...DOTOBOT_TASK_CONSOLE_META,
    expectation: "Enviar pergunta ao backend conversacional",
    request: buildDiagnosticReport({
      title: "Dotobot chat",
      summary: params.trimmedQuestion,
      sections: [
        { label: "query", value: params.trimmedQuestion },
        { label: "mode", value: params.nextMode },
        { label: "provider", value: params.nextProvider },
        { label: "contextEnabled", value: params.nextContextEnabled },
        { label: "selectedSkillId", value: params.selectedSkillId || null },
        { label: "attachments", value: params.nextAttachments },
        { label: "context", value: params.globalContext },
      ],
    }),
    status: "running",
    startedAt: chatStartedAt,
  });
  params.setMessages((msgs) => [...msgs, { role: "assistant", text: "", createdAt: params.nowIso(), status: "thinking" }]);
  params.setUiState("thinking");
  try {
    const data = localProvider
      ? await invokeBrowserLocalMessages({
          context: params.globalContext,
          contextEnabled: params.nextContextEnabled,
          mode: params.nextMode,
          query: params.trimmedQuestion,
          routePath: params.routePath,
        })
      : await adminFetch("/api/admin-lawdesk-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: params.globalContext,
            contextEnabled: params.nextContextEnabled,
            mode: params.nextMode,
            provider: params.nextProvider,
            query: params.trimmedQuestion,
            selectedSkillId: params.selectedSkillId,
          }),
        });
    const assistantText = extractAssistantResponseText(data);
    params.setMessages((msgs) => {
      const last = msgs[msgs.length - 1];
      return [...msgs.slice(0, -1), { ...last, text: assistantText, status: "ok" }];
    });
    updateActivityLog(chatLogId, {
      status: "success",
      durationMs: Date.now() - chatStartedAt,
      response: buildDiagnosticReport({
        title: "Dotobot chat response",
        summary: "Resposta concluida",
        sections: [
          { label: "endpoint", value: requestPath },
          { label: "payload", value: data },
        ],
      }),
      error: "",
    });
    return assistantText;
  } catch (err) {
    const fallbackAllowed =
      localProvider &&
      (err?.code === "LOCAL_RUNTIME_INSUFFICIENT_MEMORY" || err?.code === "LOCAL_RUNTIME_INFERENCE_FAILED");
    if (fallbackAllowed) {
      let fallbackText = "";
      if (err?.code === "LOCAL_RUNTIME_INFERENCE_FAILED") {
        try {
          const executePayload = await invokeBrowserLocalExecute({
            query: params.trimmedQuestion,
            context: {
              ...params.globalContext,
              browserLocalRuntime: {
                surface: "copilot",
                mode: String(params.nextMode || "chat"),
                routePath: params.routePath || "/interno/copilot",
                contextEnabled: Boolean(params.nextContextEnabled),
                fallback: "execute_after_inference_failure",
              },
            },
          });
          fallbackText = executePayload?.result?.message || executePayload?.resultText || "";
        } catch {}
      }
      if (!fallbackText) {
        fallbackText = buildLocalFallbackResponse({
          query: params.trimmedQuestion,
          routePath: params.routePath,
          activeConversation: params.activeConversation,
          activeTask: params.activeTask,
          globalContext: params.globalContext,
          selectedSkillId: params.selectedSkillId,
          failureMode: err?.code === "LOCAL_RUNTIME_INSUFFICIENT_MEMORY" ? "memory" : "inference",
        });
      }
      params.setMessages((msgs) => {
        const last = msgs[msgs.length - 1];
        return [
          ...msgs.slice(0, -1),
          {
            ...last,
            text: fallbackText,
            status: "ok",
            fallback: true,
            actions: buildLocalFallbackActions({
              routePath: params.routePath,
              activeConversation: params.activeConversation,
              activeTask: params.activeTask,
            }),
          },
        ];
      });
      params.setError(buildFallbackErrorMessage(err?.code));
      return fallbackText;
    }
    params.setError(err.message || "Erro ao conectar ao backend.");
    params.setMessages((msgs) => {
      const last = msgs[msgs.length - 1];
      return last?.role === "assistant" && !last?.text && last?.status === "thinking" ? msgs.slice(0, -1) : msgs;
    });
    return null;
  }
}
