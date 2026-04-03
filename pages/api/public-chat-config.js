import { buildFreshchatPublicConfig } from "../../functions/lib/freshchat-web.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  try {
    return res.status(200).json(buildFreshchatPublicConfig(process.env));
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Falha ao montar configuracao publica do Freshchat.",
    });
  }
}
