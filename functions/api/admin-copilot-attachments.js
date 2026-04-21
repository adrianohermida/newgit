import { requireAdminAccess } from "../lib/admin-auth.js";
import { uploadCopilotAttachment } from "../lib/copilot-attachments.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function authError(auth) {
  return json({ ok: false, error: auth.error, errorType: auth.errorType || "authentication" }, auth.status || 401);
}

export async function onRequestOptions() {
  return new Response("", { status: 204, headers: JSON_HEADERS });
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return authError(auth);
  try {
    const form = await context.request.formData();
    const file = form.get("file");
    const conversationId = String(form.get("conversationId") || "").trim();
    if (!(file instanceof File)) {
      return json({ ok: false, error: "Arquivo invalido ou ausente." }, 400);
    }
    if (!conversationId) {
      return json({ ok: false, error: "conversationId obrigatorio." }, 400);
    }
    const attachment = await uploadCopilotAttachment(context.env, { conversationId, file });
    return json({ ok: true, attachment }, 201);
  } catch (error) {
    return json({ ok: false, error: error?.message || "Falha ao enviar anexo do Copilot." }, 500);
  }
}
