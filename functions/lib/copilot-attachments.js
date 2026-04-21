function getAttachmentsBucket(env) {
  return env.COPILOT_ATTACHMENTS_BUCKET || null;
}

function sanitizeFileName(fileName) {
  return String(fileName || "arquivo")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "arquivo";
}

function buildObjectKey(conversationId, fileName) {
  const cleanConversationId = String(conversationId || "sem-conversa").trim();
  return `copilot/${cleanConversationId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}

export async function uploadCopilotAttachment(env, { conversationId, file }) {
  const bucket = getAttachmentsBucket(env);
  if (!bucket) {
    throw new Error("Binding R2 COPILOT_ATTACHMENTS_BUCKET ausente no ambiente.");
  }
  if (!file) {
    throw new Error("Arquivo de anexo ausente.");
  }
  const key = buildObjectKey(conversationId, file.name);
  const contentType = file.type || "application/octet-stream";
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType },
  });
  return {
    key,
    conversationId: String(conversationId || ""),
    fileName: file.name,
    contentType,
    size: Number(file.size || 0),
    uploadedAt: new Date().toISOString(),
  };
}
