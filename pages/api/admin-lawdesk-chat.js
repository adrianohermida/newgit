import { requireAdminNode } from "../../lib/admin/node-auth";
import { buildAdminChatErrorPayload, normalizeAdminChatBody, resolveAdminChatResponse } from "../../lib/lawdesk/adminChatRuntime.js";
import { getRuntimeEnv } from "../../lib/runtime/local-env.js";

function sendJson(res, payload, status = 200) {
  res.status(status).json(payload);
}

function sendError(res, message, status = 500, extra = {}) {
  sendJson(res, buildAdminChatErrorPayload(message, extra), status);
}

function sendRuntimeError(res, message, extra = {}) {
  sendJson(res, buildAdminChatErrorPayload(message, {
    status: "failed",
    ...extra,
  }), 200);
}

function sendAdminAuthError(res, auth) {
  sendError(res, auth?.error || "Nao autorizado.", auth?.status || 401, {
    errorType: auth?.errorType || "authentication",
    details: auth?.details || null,
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    sendError(res, "Metodo nao permitido.", 405);
    return;
  }

  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    sendAdminAuthError(res, auth);
    return;
  }

  try {
    const body = normalizeAdminChatBody(req.body);
    const result = await resolveAdminChatResponse(getRuntimeEnv(), body);
    sendJson(res, result.payload, result.status);
  } catch (error) {
    sendRuntimeError(res, error?.message || "Falha ao processar requisicao administrativa.");
  }
}
