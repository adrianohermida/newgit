import { requireAdminAccess } from "../lib/admin-auth.js";
import { buildAdminChatErrorPayload, resolveAdminChatResponse } from "../../lib/lawdesk/adminChatRuntime.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function jsonError(message, status = 500, extra = {}) {
  return jsonResponse(buildAdminChatErrorPayload(message, extra), status);
}

function jsonAdminAuthError(auth) {
  return jsonError(auth?.error || "Nao autorizado.", auth?.status || 401, {
    errorType: auth?.errorType || "authentication",
    details: auth?.details || null,
  });
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response("", { status: 204 });
  }

  if (context.request.method !== "POST") {
    return jsonError("Metodo nao permitido.", 405);
  }

  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) {
    return jsonAdminAuthError(auth);
  }

  try {
    const body = await context.request.json();
    const result = await resolveAdminChatResponse(context.env, body);
    return jsonResponse(result.payload, result.status);
  } catch (error) {
    return jsonError(error?.message || "Falha ao processar requisicao administrativa.", 500);
  }
}
