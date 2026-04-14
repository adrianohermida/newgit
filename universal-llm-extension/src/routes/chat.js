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
    const objectContext = context && typeof context === "object" && !Array.isArray(context) ? context : {};
    const enrichedMessages = stringContext
      ? [...messages.slice(0, -1), { role: "user", content: `${stringContext}\n\n${messages[messages.length - 1].content}` }]
      : messages;
    const localExtensionContext = {
      ...objectContext,
      assistant_profile: buildOperationalProfile(provider, configs, objectContext),
      extension: {
        provider: "Ai-Core Local",
        browser_actions: ["ler_pagina", "usar_selecao", "capturar_tela", "anexar", "gravar", "replay", "ai_tasks", "click", "input", "extract", "navigate"],
        local_roots: configs.local.roots || [],
        local_apps: (configs.local.apps || []).map((item) => item.name),
        local_skills: (configs.local.skills || []).filter((item) => item.enabled !== false).map((item) => ({
          name: item.name,
          path: item.path,
          description: item.description || "",
        })),
      },
    };

    try {
      if (provider === "local") return res.json(await callLocal(enrichedMessages, model || configs.local.model, { context: localExtensionContext, sessionId }));
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

function buildOperationalProfile(provider, configs, context) {
  const roots = Array.isArray(configs.local.roots) ? configs.local.roots.filter(Boolean) : [];
  const apps = Array.isArray(configs.local.apps) ? configs.local.apps.map((item) => item?.name).filter(Boolean) : [];
  const skills = Array.isArray(configs.local.skills)
    ? configs.local.skills.filter((item) => item?.enabled !== false).map((item) => item?.name).filter(Boolean)
    : [];
  const browserActions = Array.isArray(context?.extension?.browser_actions) ? context.extension.browser_actions : [];
  return {
    persona: "assistente_operacional_navegador",
    provider_mode: provider,
    style: "humano_claro_objetivo",
    mention_context_sources: true,
    requires_approval_explanation: true,
    browser_actions: browserActions,
    local_roots: roots,
    local_apps: apps,
    local_skills: skills,
  };
}

module.exports = {
  createChatRouter,
};
