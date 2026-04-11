const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL, fileURLToPath } = require("node:url");

const moduleCache = new Map();
const tests = [];

function registerTest(name, fn) {
  tests.push({ name, fn });
}

async function loadEsmModule(entryPath) {
  const absolutePath = path.resolve(entryPath);
  const identifier = pathToFileURL(absolutePath).href;
  if (moduleCache.has(identifier)) return moduleCache.get(identifier);

  const source = await fs.readFile(absolutePath, "utf8");
  const module = new vm.SourceTextModule(source, {
    identifier,
    initializeImportMeta(meta) {
      meta.url = identifier;
    },
    importModuleDynamically: async (specifier, referencingModule) => {
      const child = await loadResolvedModule(specifier, referencingModule.identifier);
      await evaluateModule(child);
      return child;
    },
  });

  moduleCache.set(identifier, module);
  await module.link(async (specifier, referencingModule) => loadResolvedModule(specifier, referencingModule.identifier));
  return module;
}

async function loadResolvedModule(specifier, parentIdentifier) {
  if (specifier.startsWith("node:")) throw new Error(`Unsupported builtin import: ${specifier}`);
  if (!specifier.startsWith(".")) throw new Error(`Unsupported external import: ${specifier}`);
  const parentPath = fileURLToPath(parentIdentifier);
  const resolvedPath = path.resolve(path.dirname(parentPath), specifier);
  return loadEsmModule(resolvedPath);
}

async function evaluateModule(module) {
  if (module.status === "unlinked") {
    await module.link(async (specifier, referencingModule) => loadResolvedModule(specifier, referencingModule.identifier));
  }
  if (module.status !== "evaluated") {
    await module.evaluate();
  }
  return module;
}

async function loadProvidersModule() {
  const module = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/lawdesk/providers.js"));
  return module.namespace;
}

registerTest("listLawdeskProviders exposes diagnostics for local and custom providers", async () => {
  const providers = await loadProvidersModule();
  const catalog = providers.listLawdeskProviders({
    LOCAL_LLM_BASE_URL: "http://localhost:1234",
    CUSTOM_LLM_MODEL: "custom-a",
  });

  const local = catalog.find((item) => item.id === "local");
  const custom = catalog.find((item) => item.id === "custom");

  assert.equal(local.configured, true);
  assert.equal(local.diagnostics.baseUrl.configuredFrom, "LOCAL_LLM_BASE_URL");
  assert.equal(custom.configured, false);
  assert.equal(custom.diagnostics.baseUrl.configuredFrom, null);
  assert.ok(custom.diagnostics.baseUrl.missing.includes("CUSTOM_LLM_BASE_URL"));
});

registerTest("runLawdeskProvidersHealth returns actionable missing base URL message", async () => {
  const providers = await loadProvidersModule();
  const health = await providers.runLawdeskProvidersHealth({});
  const custom = health.providers.find((item) => item.id === "custom");
  const local = health.providers.find((item) => item.id === "local");

  assert.match(custom.reason, /CUSTOM_LLM_BASE_URL/);
  assert.match(local.reason, /LOCAL_LLM_BASE_URL/);
  assert.equal(custom.diagnostics.baseUrl.configuredFrom, null);
});

registerTest("runLawdeskProvidersHealth marks gpt degraded when health is ok but execute route is missing", async () => {
  const providers = await loadProvidersModule();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url) === "https://ai.example.test/health") {
      return new Response(JSON.stringify({ ok: true, service: "hmadv-process-ai" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url) === "https://ai.example.test/execute" || String(url) === "https://ai.example.test/v1/execute") {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch in gpt execute probe test: ${url}`);
  };

  try {
    const health = await providers.runLawdeskProvidersHealth({
      PROCESS_AI_BASE: "https://ai.example.test",
    });
    const gpt = health.providers.find((item) => item.id === "gpt");

    assert.equal(gpt.status, "degraded");
    assert.match(gpt.reason, /execute/i);
    assert.equal(gpt.details.executeProbe.ok, false);
    assert.equal(gpt.details.executeProbe.failedRoutes.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runLawdeskProvidersHealth marks gpt degraded when execute routes diverge", async () => {
  const providers = await loadProvidersModule();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url) === "https://ai.example.test/health") {
      return new Response(JSON.stringify({ ok: true, service: "hmadv-process-ai" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url) === "https://ai.example.test/execute") {
      return new Response(JSON.stringify({ ok: true, status: "ok", resultText: "pong" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url) === "https://ai.example.test/v1/execute") {
      return new Response(JSON.stringify({ error: "not_found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch in gpt route divergence test: ${url}`);
  };

  try {
    const health = await providers.runLawdeskProvidersHealth({
      PROCESS_AI_BASE: "https://ai.example.test",
    });
    const gpt = health.providers.find((item) => item.id === "gpt");

    assert.equal(gpt.status, "degraded");
    assert.match(gpt.reason, /divergencia/i);
    assert.equal(gpt.details.executeProbe.ok, false);
    assert.equal(gpt.details.executeProbe.partiallyOk, true);
    assert.deepEqual(gpt.details.executeProbe.successfulRoutes, ["https://ai.example.test/execute"]);
    assert.deepEqual(gpt.details.executeProbe.failedRoutes, ["https://ai.example.test/v1/execute"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

registerTest("runLawdeskProvidersHealth exposes resolved primary backend config metadata", async () => {
  const providers = await loadProvidersModule();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url) === "https://ai.hermidamaia.adv.br/health") {
      return new Response(JSON.stringify({
        ok: true,
        service: "hmadv-process-ai",
        routes: ["/health", "/execute", "/v1/execute"],
        auth_configured: true,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url) === "https://ai.hermidamaia.adv.br/execute") {
      return new Response(JSON.stringify({ ok: true, status: "ok", resultText: "pong" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (String(url) === "https://ai.hermidamaia.adv.br/v1/execute") {
      return new Response(JSON.stringify({ ok: true, status: "ok", resultText: "pong" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch in primary backend metadata test: ${url}`);
  };

  try {
    const health = await providers.runLawdeskProvidersHealth({
      PROCESS_AI_BASE: "https://ai.hermidamaia.adv.br/",
      HMDAV_AI_SHARED_SECRET: "secret-value",
    });
    const gpt = health.providers.find((item) => item.id === "gpt");

    assert.equal(gpt.status, "operational");
    assert.equal(gpt.details.config.baseUrl, "https://ai.hermidamaia.adv.br");
    assert.equal(gpt.details.config.host, "ai.hermidamaia.adv.br");
    assert.equal(gpt.details.config.baseUrlSource, "PROCESS_AI_BASE");
    assert.equal(gpt.details.health.auth_configured, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

async function run() {
  let failures = 0;
  for (const entry of tests) {
    try {
      await entry.fn();
      console.log(`PASS ${entry.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${entry.name}`);
      console.error(error);
    }
  }
  if (failures > 0) {
    process.exitCode = 1;
    return;
  }
  console.log(`PASS ${tests.length} tests`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
