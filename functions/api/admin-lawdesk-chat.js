import { requireAdminAccess } from "../lib/admin-auth.js";
import { runLawdeskChat } from "../../lib/lawdesk/chat.js";
import { buildDotobotRepositoryContext } from "../../lib/lawdesk/capabilities.js";

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function onRequestPost(context) {
  const { request, env } = context;
  const auth = await requireAdminAccess(request, env);
  if (!auth.ok) {
    return new Response(JSON.stringify({ ok: false, error: auth.error }), {
      status: auth.status,
      headers: JSON_HEADERS,
    });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Body JSON invalido." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) {
    return new Response(JSON.stringify({ ok: false, error: "Campo query obrigatorio." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  try {
    const repositoryContext = buildDotobotRepositoryContext(body?.context || {});
    const data = await runLawdeskChat(env, {
      query,
      context: {
        ...(body?.context || {}),
        repositoryContext,
      },
    });
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: JSON_HEADERS,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error?.message || "Falha ao executar chat administrativo Lawdesk.",
      }),
      {
        status: 500,
        headers: JSON_HEADERS,
      }
    );
  }
}
