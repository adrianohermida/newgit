import { adminFetch } from "../../../lib/admin/api";
import { summarizeConversation } from "../dotobotPanelState";

function toMetadata(params) {
  return {
    attachments: params.attachments || [],
    contextEnabled: Boolean(params.contextEnabled),
    mode: params.mode || "chat",
    provider: params.provider || "gpt",
    route: params.routePath || "/interno/copilot",
    selectedSkillId: params.selectedSkillId || "",
  };
}

export async function ensureRemoteConversation(params) {
  const remoteConversationId = params.activeConversation?.metadata?.remoteConversationId;
  if (remoteConversationId) return remoteConversationId;
  const payload = await adminFetch("/api/admin-copilot-conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: params.seedText || "",
      title: params.activeConversation?.title || "Nova conversa",
    }),
  });
  const createdId = String(payload?.conversation?.id || "").trim();
  if (!createdId || !params.activeConversationId) return createdId;
  params.setConversations((current) =>
    current.map((conversation) =>
      conversation.id !== params.activeConversationId
        ? conversation
        : summarizeConversation({
            ...conversation,
            metadata: {
              ...(conversation.metadata || {}),
              remoteConversationId: createdId,
              remoteOnly: false,
            },
          })
    )
  );
  return createdId;
}

export async function appendRemoteMessage(remoteConversationId, message) {
  if (!remoteConversationId || !String(message?.text || "").trim()) return null;
  return adminFetch("/api/admin-copilot-conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "append_message",
      conversationId: remoteConversationId,
      metadata: message.metadata || {},
      role: message.role,
      text: message.text,
    }),
  });
}

export async function uploadRemoteAttachments(remoteConversationId, attachments = []) {
  if (!remoteConversationId) return [];
  const pending = attachments.filter((attachment) => attachment?.file && !attachment?.remoteKey);
  if (!pending.length) return [];
  return Promise.all(
    pending.map(async (attachment) => {
      const form = new FormData();
      form.set("conversationId", remoteConversationId);
      form.set("file", attachment.file, attachment.name || attachment.file.name || "arquivo");
      const payload = await adminFetch("/api/admin-copilot-attachments", {
        method: "POST",
        body: form,
      });
      return {
        id: attachment.id,
        remoteConversationId,
        remoteKey: payload?.attachment?.key || "",
        uploadedAt: payload?.attachment?.uploadedAt || new Date().toISOString(),
      };
    })
  );
}

export function buildRemoteMessageMetadata(params) {
  return toMetadata(params);
}
