const express = require("express");
const { getConfigs } = require("../storage");
const { callLocal, callCloud, callCloudflare, diagnose } = require("../providers");

function createChatRouter() {
  const router = express.Router();

  router.get("/diagnostics/provider/:provider", async (req, res) => {
    const diagnosis = await diagnose(String(req.params.provider || "").trim());
    res.status(diagnosis.ok ? 200 : 502).json(diagnosis);
  });

  router.post("/chat", async (req, res) => {
    const { provider = "local", messages, model, context, sessionId } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) return res.status(400).json({ ok: false, error: "messages[] e obrigatorio." });

    const configs = getConfigs();
    const stringContext = typeof context === "string" ? context : "";
    const enrichedMessages = stringContext
      ? [...messages.slice(0, -1), { role: "user", content: `${stringContext}\n\n${messages[messages.length - 1].content}` }]
      : messages;

    try {
      if (provider === "local") return res.json(await callLocal(enrichedMessages, model || configs.local.model, { context, sessionId }));
      if (provider === "cloud") return res.json(await callCloud(enrichedMessages, model || configs.cloud.model));
      if (provider === "cloudflare") return res.json(await callCloudflare(enrichedMessages, model || configs.cloudflare.model));
      throw new Error(`Provider desconhecido: ${provider}`);
    } catch (error) {
      let diagnosis = null;
      try {
        diagnosis = await diagnose(provider);
      } catch {
        diagnosis = null;
      }
      res.status(500).json({
        ok: false,
        error: error?.message || "Falha ao chamar o LLM.",
        provider,
        target: error?.target || null,
        status: error?.responseStatus || null,
        details: error?.responseBody || null,
        diagnosis,
      });
    }
  });

  return router;
}

module.exports = {
  createChatRouter,
};
