import {
  parseSlackFormEncoded,
  processSlackEvent,
  processSlackSlashCommand,
  verifySlackSignature,
} from "../../functions/lib/slack-bot.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

function getContentType(req) {
  return String(req.headers["content-type"] || "").toLowerCase();
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function buildWebRequest(req, rawBody) {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host || "localhost";
  const url = `${protocol}://${host}${req.url}`;
  return new Request(url, {
    method: req.method,
    headers: req.headers,
    body: req.method === "POST" ? rawBody : undefined,
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    const rawBody = await readRawBody(req);
    const webRequest = buildWebRequest(req, rawBody);
    const auth = await verifySlackSignature(webRequest, rawBody, process.env);
    if (!auth.ok) {
      return res.status(auth.status).json({ ok: false, error: auth.error });
    }

    if (req.headers["x-slack-retry-num"]) {
      return res.status(200).json({ ok: true, skipped: true, reason: "retry_ignored" });
    }

    const contentType = getContentType(req);
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = parseSlackFormEncoded(rawBody);
      processSlackSlashCommand(process.env, form).catch(() => null);
      return res.status(200).send("Processando sua solicitacao no Slack...");
    }

    const body = rawBody ? JSON.parse(rawBody) : {};
    if (body?.type === "url_verification") {
      return res.status(200).json({ challenge: body.challenge });
    }

    if (body?.type === "event_callback") {
      processSlackEvent(process.env, body).catch(() => null);
      return res.status(200).json({ ok: true, accepted: true });
    }

    return res.status(400).json({ ok: false, error: "Payload do Slack nao suportado." });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error?.message || "Falha na integracao Slack." });
  }
}
