const express = require("express");
const { getConfigs } = require("../storage");
const { callLocal, callCloud, callCloudflare, diagnose } = require("../providers");
const { appendChatDebug, readChatDebug } = require("../chat-debug");
const { getLocalProviderLabel } = require("../local-provider");
const { ensureLocalRuntimeStarted } = require("../local-runtime-bootstrap");

function createChatRouter() {
  const router = express.Router();

  router.get("/diagnostics/provider/:provider", async (req, res) => {
    const diagnosis = await diagnose(String(req.params.provider || "").trim());
    res.status(diagnosis.ok ? 200 : 502).json(diagnosis);
  });

  router.get("/diagnostics/chat-debug", (_req, res) => {
    res.json({ ok: true, entries: readChatDebug() });
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
    const activeSkillNames = Array.isArray(objectContext.activeSkillNames)
      ? objectContext.activeSkillNames.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const filteredSkills = filterActiveSkills(configs.local.skills || [], activeSkillNames);
    const localExtensionContext = buildLocalContext(objectContext, configs, filteredSkills, activeSkillNames, provider);
    appendChatDebug({
      scope: "chat.request",
      provider,
      sessionId: sessionId || null,
      messageCount: messages.length,
      richContext: shouldUseRichLocalContext(objectContext, filteredSkills, activeSkillNames),
      activeSkillNames,
    });

    try {
      if (provider === "local") {
        await ensureLocalRuntimeStarted(configs, "chat_local");
        const result = await withRouteTimeout(
          callLocal(enrichedMessages, model || configs.local.model, { context: localExtensionContext, sessionId }),
          52000,
          "O chat local excedeu o tempo esperado. O provider local pode estar ocupado ou o contexto ficou pesado demais.",
        );
        appendChatDebug({
          scope: "chat.response",
          provider,
          sessionId: sessionId || null,
          ok: true,
          degraded: Boolean(result?.degraded),
          retryProfile: result?.metadata?.retryProfile || null,
          effectiveModel: result?.metadata?.effective_model || result?.model || null,
        });
        return res.json(result);
      }
      if (provider === "cloud") return res.json(await withRouteTimeout(callCloud(enrichedMessages, model || configs.cloud.model), 18000, "O provider cloud excedeu o tempo esperado."));
      if (provider === "cloudflare") return res.json(await withRouteTimeout(callCloudflare(enrichedMessages, model || configs.cloudflare.model), 18000, "O provider cloudflare excedeu o tempo esperado."));
      throw new Error(`Provider desconhecido: ${provider}`);
    } catch (error) {
      let diagnosis = null;
      if (shouldRunDiagnosis(error, provider)) {
        try {
          diagnosis = await diagnose(provider);
        } catch {
          diagnosis = null;
        }
      }
      appendChatDebug({
        scope: "chat.error",
        provider,
        sessionId: sessionId || null,
        message: error?.message || "Falha ao chamar o LLM.",
        target: error?.target || null,
        status: error?.responseStatus || null,
        diagnosisIssue: diagnosis?.issue || null,
      });
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

function withRouteTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeoutMs);
    }),
  ]);
}

function shouldRunDiagnosis(error, provider) {
  if (provider !== "local") return true;
  const message = String(error?.message || "").toLowerCase();
  if (!message) return true;
  if (message.includes("excedeu o tempo esperado")) return false;
  if (message.includes("timeout")) return false;
  return true;
}

function filterActiveSkills(skills, activeSkillNames = []) {
  const allSkills = Array.isArray(skills) ? skills.filter((item) => item?.enabled !== false) : [];
  const names = Array.isArray(activeSkillNames) ? activeSkillNames.filter(Boolean) : [];
  if (!names.length) return allSkills;
  return allSkills.filter((item) => names.includes(item.name));
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

function buildLocalContext(objectContext, configs, filteredSkills, activeSkillNames, provider) {
  const assistantProfile = buildOperationalProfile(provider, configs, objectContext);
  if (!shouldUseRichLocalContext(objectContext, filteredSkills, activeSkillNames)) {
    return { assistant_profile: assistantProfile };
  }
  return {
    ...objectContext,
    assistant_profile: assistantProfile,
    extension: {
      provider: getLocalProviderLabel(configs),
      browser_actions: ["ler_pagina", "usar_selecao", "capturar_tela", "anexar", "gravar", "replay", "ai_tasks", "click", "input", "extract", "navigate"],
      local_roots: configs.local.roots || [],
      local_apps: (configs.local.apps || []).map((item) => item.name),
      local_skills: filteredSkills.map((item) => ({
        name: item.name,
        path: item.path,
        description: item.description || "",
      })),
      active_skill_names: activeSkillNames,
    },
  };
}

function shouldUseRichLocalContext(objectContext, filteredSkills, activeSkillNames) {
  if (!objectContext || typeof objectContext !== "object") return false;
  if ((filteredSkills || []).length || (activeSkillNames || []).length) return true;
  const richKeys = ["pageText", "selectionText", "attachments", "image", "screenshot", "taskIntent", "taskContext", "pageScan", "browserState"];
  return richKeys.some((key) => {
    const value = objectContext[key];
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return Boolean(String(value || "").trim());
  });
}

module.exports = {
  createChatRouter,
};
