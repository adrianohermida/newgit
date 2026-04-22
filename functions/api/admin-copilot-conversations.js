import { requireAdminAccess } from "../lib/admin-auth.js";
import { createCopilotSession } from "../lib/copilot-conversations-db.js";
import { appendCopilotRoomMessage, listCopilotRoomMessages } from "../lib/copilot-room-sync.js";
import {
  appendCopilotMessage,
  createCopilotConversation,
  getCopilotConversation,
  listCopilotConversations,
  listCopilotMessages,
} from "../lib/copilot-conversations-service.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function withBookmark(response, session) {
  const bookmark = session?.getBookmark?.();
  if (bookmark) {
    response.headers.set("x-d1-bookmark", bookmark);
  }
  return response;
}

function authError(auth) {
  return json({ ok: false, error: auth.error, errorType: auth.errorType || "authentication" }, auth.status || 401);
}

export async function onRequestOptions() {
  return new Response("", { status: 204, headers: JSON_HEADERS });
}

export async function onRequestGet(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return authError(auth);
  const url = new URL(context.request.url);
  const conversationId = url.searchParams.get("conversationId");
  const includeLive = url.searchParams.get("includeLive") === "1";
  const liveCursor = String(url.searchParams.get("liveCursor") || "").trim();
  const session = createCopilotSession(context.env, context.request.headers.get("x-d1-bookmark") || undefined);
  try {
    if (conversationId) {
      const messages = await listCopilotMessages(
        session,
        conversationId,
        Number(url.searchParams.get("cursor") || 0),
        Number(url.searchParams.get("limit") || 50)
      );
      const conversation = await getCopilotConversation(session, conversationId);
      let live = null;
      if (includeLive) {
        try {
          const payload = await listCopilotRoomMessages(
            context.env,
            conversationId,
            Number(url.searchParams.get("liveLimit") || 100),
            liveCursor
          );
          live = { ok: true, items: Array.isArray(payload?.items) ? payload.items : [] };
        } catch (error) {
          live = { ok: false, items: [], error: error?.message || "Falha ao carregar estado live." };
        }
      }
      return withBookmark(json({ ok: true, conversation, messages, live }), session);
    }
    const items = await listCopilotConversations(session, Number(url.searchParams.get("limit") || 50));
    return withBookmark(json({ ok: true, items }), session);
  } catch (error) {
    return json({ ok: false, error: error?.message || "Falha ao listar conversas do Copilot." }, 500);
  }
}

export async function onRequestPost(context) {
  const auth = await requireAdminAccess(context.request, context.env);
  if (!auth.ok) return authError(auth);
  const session = createCopilotSession(context.env, context.request.headers.get("x-d1-bookmark") || undefined);
  try {
    const body = await context.request.json().catch(() => ({}));
    const action = String(body.action || "create");
    if (action === "append_message") {
      const message = await appendCopilotMessage(session, String(body.conversationId || ""), {
        role: body.role,
        text: body.text,
        metadata: body.metadata,
      });
      try {
        await appendCopilotRoomMessage(context.env, String(body.conversationId || ""), {
          createdAt: message?.created_at || message?.createdAt,
          metadata: message?.metadata || body.metadata || {},
          role: message?.role || body.role,
          text: message?.text || body.text,
        });
      } catch {}
      return withBookmark(json({ ok: true, message }), session);
    }
    const conversation = await createCopilotConversation(session, {
      title: body.title,
      text: body.text,
    });
    if (String(body.text || "").trim()) {
      try {
        await appendCopilotRoomMessage(context.env, conversation?.id, {
          metadata: {},
          role: "user",
          text: String(body.text || "").trim(),
        });
      } catch {}
    }
    return withBookmark(json({ ok: true, conversation }, 201), session);
  } catch (error) {
    return json({ ok: false, error: error?.message || "Falha ao salvar conversa do Copilot." }, 500);
  }
}
