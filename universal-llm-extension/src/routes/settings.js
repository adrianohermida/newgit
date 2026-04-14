const express = require("express");
const { mergeSettings, loadSettings, saveSettings } = require("../storage");
const { getConfigs } = require("../storage");
const { probeJsonGetEndpoint } = require("../http-client");
const { joinUrl } = require("../utils");

function parseCatalogProbe(body, parser) {
  if (parser === "openai") {
    return Array.isArray(body?.data)
      ? body.data.map((item) => item?.id || item?.model || item?.name || null).filter(Boolean)
      : [];
  }
  return Array.isArray(body?.models)
    ? body.models.map((item) => item?.name || item?.model || item?.id || null).filter(Boolean)
    : [];
}

function createSettingsRouter() {
  const router = express.Router();

  router.get("/settings", (_req, res) => {
    res.json({ ok: true, settings: loadSettings() });
  });

  router.post("/settings", (req, res) => {
    const current = loadSettings();
    const settings = saveSettings(mergeSettings(current, req.body?.settings || {}));
    res.json({ ok: true, settings });
  });

  router.get("/settings/local-models", async (_req, res) => {
    const configs = getConfigs();
    const candidates = (configs.local.runtimeCatalogCandidates || []).flatMap((baseUrl) => ([
      { url: joinUrl(baseUrl, "/v1/models"), parser: "openai" },
      { url: joinUrl(baseUrl, "/api/tags"), parser: "ollama" },
    ]));
    const seen = new Set();
    const attempts = [];
    for (const candidate of candidates) {
      if (!candidate?.url || seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      try {
        const probe = await probeJsonGetEndpoint(candidate.url, {}, { timeoutMs: 5000 });
        const models = parseCatalogProbe(probe.body, candidate.parser);
        attempts.push({ url: candidate.url, ok: probe.ok, count: models.length });
        if (probe.ok && models.length) {
          return res.json({
            ok: true,
            configuredModel: configs.local.model,
            models,
            catalogUrl: candidate.url,
            attempts,
          });
        }
      } catch (error) {
        attempts.push({ url: candidate.url, ok: false, error: error?.message || "Falha ao consultar catalogo." });
      }
    }
    return res.json({
      ok: false,
      configuredModel: configs.local.model,
      models: [],
      attempts,
      error: "Nenhum catalogo local de modelos respondeu com sucesso.",
    });
  });

  return router;
}

module.exports = {
  createSettingsRouter,
};
