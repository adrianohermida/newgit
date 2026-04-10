import {
  jsonError,
  jsonOk,
  parseSlackFormEncoded,
  processSlackEvent,
  processSlackSlashCommand,
  verifySlackSignature,
} from "../lib/slack-bot.js";

function getContentType(request) {
  return String(request.headers.get("content-type") || "").toLowerCase();
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const rawBody = await request.text().catch(() => "");

  const auth = await verifySlackSignature(request, rawBody, env);
  if (!auth.ok) {
    return jsonError(auth.error, auth.status);
  }

  if (request.headers.get("x-slack-retry-num")) {
    return jsonOk({ skipped: true, reason: "retry_ignored" });
  }

  const contentType = getContentType(request);
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = parseSlackFormEncoded(rawBody);
    context.waitUntil(processSlackSlashCommand(env, form));
    return new Response("Processando sua solicitacao no Slack...", { status: 200 });
  }

  const body = rawBody ? JSON.parse(rawBody) : {};

  if (body?.type === "url_verification") {
    return new Response(JSON.stringify({ challenge: body.challenge }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (body?.type === "event_callback") {
    context.waitUntil(processSlackEvent(env, body));
    return jsonOk({ accepted: true });
  }

  return jsonError("Payload do Slack nao suportado.", 400);
}

export async function onRequestOptions() {
  return new Response("", { status: 204 });
}
