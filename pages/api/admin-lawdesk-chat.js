import { requireAdminNode } from "../../lib/admin/node-auth.js";
import { runLawdeskChat } from "../../lib/lawdesk/chat.js";
import { buildDotobotRepositoryContext } from "../../lib/lawdesk/capabilities.js";

export default async function handler(req, res) {
  const auth = await requireAdminNode(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ ok: false, error: auth.error });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
  if (!query) {
    return res.status(400).json({ ok: false, error: "Campo query obrigatorio." });
  }

  try {
    const repositoryContext = buildDotobotRepositoryContext(req.body?.context || {});
    const data = await runLawdeskChat(process.env, {
      query,
      context: {
        ...(req.body?.context || {}),
        repositoryContext,
      },
    });
    return res.status(200).json({ ok: true, data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Falha ao executar chat administrativo Lawdesk.",
    });
  }
}
