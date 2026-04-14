const express = require("express");
const fs = require("fs");
const path = require("path");
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

  router.get("/settings/skills", (_req, res) => {
    const configs = getConfigs();
    const roots = Array.isArray(configs.local.skillRoots) ? configs.local.skillRoots : [];
    const discovered = discoverSkills(roots);
    const configured = Array.isArray(configs.local.skills) ? configs.local.skills : [];
    const merged = mergeDiscoveredSkills(discovered, configured);
    res.json({
      ok: true,
      roots,
      skills: merged,
      count: merged.length,
    });
  });

  return router;
}

function discoverSkills(roots) {
  const results = [];
  const seen = new Set();
  roots.forEach((rootPath) => walkSkillDir(rootPath, 0, results, seen));
  return results;
}

function walkSkillDir(rootPath, depth, results, seen) {
  const safeRoot = String(rootPath || "").trim();
  if (!safeRoot || depth > 4 || !fs.existsSync(safeRoot)) return;
  let entries = [];
  try {
    entries = fs.readdirSync(safeRoot, { withFileTypes: true });
  } catch {
    return;
  }
  entries.forEach((entry) => {
    const fullPath = path.join(safeRoot, entry.name);
    if (entry.isFile() && entry.name.toUpperCase() === "SKILL.MD") {
      if (seen.has(fullPath)) return;
      seen.add(fullPath);
      results.push(readSkillDescriptor(fullPath));
      return;
    }
    if (entry.isDirectory()) walkSkillDir(fullPath, depth + 1, results, seen);
  });
}

function readSkillDescriptor(filePath) {
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    content = "";
  }
  const lines = String(content || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const heading = lines.find((line) => line.startsWith("# "));
  const description = lines.find((line) => !line.startsWith("#"));
  return {
    name: heading ? heading.replace(/^#\s+/, "").trim() : path.basename(path.dirname(filePath)),
    path: filePath,
    description: description || "",
    enabled: true,
  };
}

function mergeDiscoveredSkills(discovered, configured) {
  const byPath = new Map();
  discovered.forEach((item) => byPath.set(item.path, item));
  configured.forEach((item) => {
    const existing = byPath.get(item.path);
    byPath.set(item.path, {
      ...(existing || {}),
      ...item,
      name: item.name || existing?.name || path.basename(path.dirname(item.path || "")),
      description: item.description || existing?.description || "",
      enabled: item.enabled !== false,
    });
  });
  return Array.from(byPath.values()).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

module.exports = {
  createSettingsRouter,
};
