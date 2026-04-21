const express = require("express");
const fs = require("fs");
const path = require("path");
const { mergeSettings, loadSettings, saveSettings } = require("../storage");
const { getConfigs } = require("../storage");
const { probeJsonGetEndpoint } = require("../http-client");
const { joinUrl } = require("../utils");
const { getLocalProviderLabel } = require("../local-provider");

function redactSecret(value) {
  return value ? "[configured]" : "";
}

function sanitizeSettings(settings) {
  return {
    local: {
      providerLabel: settings?.local?.providerLabel || "",
      runtimeUrl: settings?.local?.runtimeUrl || "",
      chatPath: settings?.local?.chatPath || "",
      executePath: settings?.local?.executePath || "",
      runtimeModel: settings?.local?.runtimeModel || "",
      alwaysAllowTabAccess: Boolean(settings?.local?.alwaysAllowTabAccess),
      trustedTabOrigins: Array.isArray(settings?.local?.trustedTabOrigins) ? settings.local.trustedTabOrigins : [],
      roots: Array.isArray(settings?.local?.roots) ? settings.local.roots : [],
      skillRoots: Array.isArray(settings?.local?.skillRoots) ? settings.local.skillRoots : [],
      skills: Array.isArray(settings?.local?.skills) ? settings.local.skills : [],
      apps: Array.isArray(settings?.local?.apps) ? settings.local.apps : [],
    },
    cloud: {
      appUrl: settings?.cloud?.appUrl || "",
      baseUrl: settings?.cloud?.baseUrl || "",
      model: settings?.cloud?.model || "",
      authToken: redactSecret(settings?.cloud?.authToken),
    },
    cloudflare: {
      model: settings?.cloudflare?.model || "",
      accountId: redactSecret(settings?.cloudflare?.accountId),
      apiToken: redactSecret(settings?.cloudflare?.apiToken),
    },
  };
}

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

function uniqueStrings(values) {
  return values.filter(Boolean).filter((item, index, list) => list.indexOf(item) === index);
}

function buildPreferredLocalProfiles(configs, discoveredModels) {
  const configured = String(configs.local.model || "").trim();
  const models = Array.isArray(discoveredModels) ? discoveredModels : [];
  const preferred = [];
  if (configured) preferred.push(configured);
  if (!preferred.includes("aetherlab-legal-local-v1")) preferred.push("aetherlab-legal-local-v1");
  if (models.includes("qwen3.5:cloud")) preferred.push("qwen3.5:cloud");
  return uniqueStrings(preferred);
}

function getRuntimeCatalogUrls(runtimeEndpoint) {
  const endpoint = String(runtimeEndpoint || "").trim();
  if (!endpoint) return [];
  const base = endpoint.replace(/\/v1\/chat\/completions$/i, "");
  return [
    { url: joinUrl(base, "/v1/models"), parser: "openai" },
    { url: joinUrl(base, "/api/tags"), parser: "ollama" },
  ];
}

async function discoverLocalProviderRuntimeCatalogs(configs) {
  const targets = [];
  const seen = new Set();
  for (const baseUrl of configs.local.candidates || []) {
    try {
      const probe = await probeJsonGetEndpoint(joinUrl(baseUrl, "/health"), {}, { timeoutMs: 5000 });
      const transportEndpoint = String(probe?.body?.providers?.local?.diagnostics?.transport_endpoint || "").trim();
      for (const target of getRuntimeCatalogUrls(transportEndpoint)) {
        if (!target?.url || seen.has(target.url)) continue;
        seen.add(target.url);
        targets.push(target);
      }
    } catch {}
  }
  return targets;
}

function buildWindowsLocalRuntimeCandidates(configs) {
  const defaults = [
    "http://127.0.0.1:11434",
    "http://127.0.0.1:1234",
    "http://127.0.0.1:8001",
    "http://127.0.0.1:8080",
  ];
  return uniqueStrings([...(configs.local.runtimeCatalogCandidates || []), ...defaults]).flatMap((baseUrl) => ([
    { url: joinUrl(baseUrl, "/v1/models"), parser: "openai", source: `runtime:${baseUrl}` },
    { url: joinUrl(baseUrl, "/api/tags"), parser: "ollama", source: `runtime:${baseUrl}` },
  ]));
}

function createSettingsRouter() {
  const router = express.Router();

  router.get("/settings", (_req, res) => {
    res.setHeader("X-Settings-Route", "router-safe");
    res.json({ ok: true, settings: sanitizeSettings(loadSettings()) });
  });

  router.post("/settings", (req, res) => {
    const current = loadSettings();
    const settings = saveSettings(mergeSettings(current, req.body?.settings || {}));
    res.setHeader("X-Settings-Route", "router-save");
    res.json({ ok: true, settings: sanitizeSettings(settings) });
  });

  router.get("/settings/local-models", async (_req, res) => {
    const configs = getConfigs();
    const healthTargets = await discoverLocalProviderRuntimeCatalogs(configs);
    const candidates = [
      ...healthTargets.map((item) => ({ ...item, source: "local-provider-health" })),
      ...buildWindowsLocalRuntimeCandidates(configs),
    ];
    const seen = new Set();
    const attempts = [];
    const sources = [];
    const allModels = [];
    for (const candidate of candidates) {
      if (!candidate?.url || seen.has(candidate.url)) continue;
      seen.add(candidate.url);
      try {
        const probe = await probeJsonGetEndpoint(candidate.url, {}, { timeoutMs: 5000 });
        const models = parseCatalogProbe(probe.body, candidate.parser);
        const sourceInfo = {
          url: candidate.url,
          parser: candidate.parser,
          source: candidate.source || "runtime",
          ok: probe.ok,
          count: models.length,
          models,
        };
        attempts.push({ url: candidate.url, ok: probe.ok, count: models.length });
        sources.push(sourceInfo);
        if (probe.ok && models.length) {
          allModels.push(...models);
        }
      } catch (error) {
        const sourceInfo = {
          url: candidate.url,
          parser: candidate.parser,
          source: candidate.source || "runtime",
          ok: false,
          count: 0,
          models: [],
          error: error?.message || "Falha ao consultar catalogo.",
        };
        attempts.push({ url: candidate.url, ok: false, error: sourceInfo.error });
        sources.push(sourceInfo);
      }
    }
    if (allModels.length) {
      const models = uniqueStrings([
        ...buildPreferredLocalProfiles(configs, allModels),
        ...allModels,
      ]);
      return res.json({
        ok: true,
        providerLabel: getLocalProviderLabel(configs),
        configuredModel: configs.local.model,
        models,
        catalogUrl: sources.find((item) => item.ok && item.count > 0)?.url || "",
        attempts,
        sources,
      });
    }
    return res.json({
      ok: false,
      providerLabel: getLocalProviderLabel(configs),
      configuredModel: configs.local.model,
      models: buildPreferredLocalProfiles(configs, []),
      attempts,
      sources,
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
