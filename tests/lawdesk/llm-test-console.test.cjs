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
  if (specifier.startsWith("node:")) {
    throw new Error(`Unsupported built-in import in test loader: ${specifier}`);
  }
  if (!specifier.startsWith(".")) {
    throw new Error(`Unsupported external import in test loader: ${specifier}`);
  }
  const parentPath = fileURLToPath(parentIdentifier);
  const resolvedPath = path.resolve(path.dirname(parentPath), specifier);
  return loadEsmModule(resolvedPath);
}

async function evaluateModule(module) {
  if (module.status === "unlinked") {
    await module.link(async (specifier, referencingModule) => loadResolvedModule(specifier, referencingModule.identifier));
  }
  if (module.status !== "evaluated") await module.evaluate();
  return module;
}

async function loadConsoleModule() {
  const module = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/lawdesk/llm-test-console.js"));
  return module.namespace;
}

registerTest("filterLlmTestActivityEntries keeps only llm test related entries", async () => {
  const utils = await loadConsoleModule();
  const result = utils.filterLlmTestActivityEntries([
    { id: "1", module: "llm-test", createdAt: "2026-04-11T10:00:00.000Z" },
    { id: "2", component: "LLMTestChat", createdAt: "2026-04-11T11:00:00.000Z" },
    { id: "3", module: "dotobot", createdAt: "2026-04-11T12:00:00.000Z" },
  ]);

  assert.deepEqual(result.map((entry) => entry.id), ["2", "1"]);
});

registerTest("buildLlmTestTimeline exposes telemetry, backend logs and errors", async () => {
  const utils = await loadConsoleModule();
  const result = utils.buildLlmTestTimeline({
    provider: "local",
    providerLabel: "LLM local",
    source: "local_llm_api",
    model: "aetherlab-legal-local-v1",
    requestedModel: "aetherlab-legal-local-v1",
    resolvedModel: "llama3.1:latest",
    durationMs: 420,
    telemetry: [{ event: "rag_lookup", matches: 0, status: "ok" }],
    logs: [{ phase: "request_sent" }],
    errors: ["falha secundaria"],
  });

  assert.ok(result.some((item) => item.label === "Provider selecionado"));
  assert.ok(result.some((item) => item.label === "Modelo solicitado"));
  assert.ok(result.some((item) => item.label === "Engine real"));
  assert.ok(result.some((item) => item.label === "rag_lookup"));
  assert.ok(result.some((item) => item.label === "backend_log_1"));
  assert.ok(result.some((item) => item.label === "backend_error_1"));
});

registerTest("applyLlmTestConsoleFilters narrows entries by provider status and source", async () => {
  const utils = await loadConsoleModule();
  const result = utils.applyLlmTestConsoleFilters([
    { id: "1", provider: "local", status: "error", source: "local_llm_api" },
    { id: "2", provider: "gpt", status: "success", source: "primary_api" },
    { id: "3", provider: "local", status: "success", source: "local_llm_api" },
  ], {
    provider: "local",
    status: "success",
    source: "local_llm_api",
  });

  assert.deepEqual(result.map((entry) => entry.id), ["3"]);
});

registerTest("classifyLlmTestError separates configuration auth and timeout failures", async () => {
  const utils = await loadConsoleModule();
  assert.equal(utils.classifyLlmTestError("Provider nao esta configurado no servidor."), "configuration");
  assert.equal(utils.classifyLlmTestError("Authentication error on embed secret"), "authentication");
  assert.equal(utils.classifyLlmTestError("Timeout na chamada administrativa."), "timeout");
  assert.equal(utils.classifyLlmTestError("Requested function was not found"), "missing_function");
  assert.equal(utils.classifyLlmTestError("Cloudflare worker exception (500) em custom_llm_api: Worker threw exception | Ray ID 123"), "execution");
});

registerTest("buildTechnicalDebugger includes recommendations and subsystem sections", async () => {
  const utils = await loadConsoleModule();
  const report = utils.buildTechnicalDebugger({
    errorMessage: "Requested function was not found",
    provider: "gpt",
    providerLabel: "Nuvem principal",
    durationMs: 7126,
    request: { provider: "gpt", prompt: "teste" },
    providersHealth: {
      providers: [{ id: "gpt", status: "failed", available: true }],
    },
    ragHealth: {
      status: "failed",
      signals: { appEmbedSecretMissing: true },
      report: { supabaseEmbedding: { error: "auth" } },
    },
    providerCatalog: [{ id: "gpt", label: "Nuvem principal" }],
  });

  assert.match(report, /Debugger técnico completo/);
  assert.match(report, /missing_function/);
  assert.match(report, /recommendations/);
  assert.match(report, /security_and_persistence/);
});

registerTest("buildProviderDebugMatrix combines catalog health and latest result", async () => {
  const utils = await loadConsoleModule();
  const matrix = utils.buildProviderDebugMatrix({
    providerCatalog: [
      {
        id: "local",
        label: "LLM local",
        available: false,
        configured: false,
        model: "local-model",
        diagnostics: {
          baseUrl: { configuredFrom: null, missing: ["LOCAL_LLM_BASE_URL", "LLM_BASE_URL"] },
        },
      },
    ],
    providersHealth: {
      providers: [
        {
          id: "local",
          status: "failed",
          reason: "Base URL ausente.",
          diagnostics: {
            baseUrl: { configuredFrom: null, missing: ["LOCAL_LLM_BASE_URL", "LLM_BASE_URL"] },
          },
        },
      ],
    },
    results: [
      { provider: "local", status: "error", error: "O provider selecionado (LLM local) nao esta configurado no servidor.", errorType: "configuration" },
    ],
  });

  assert.equal(matrix.length, 1);
  assert.equal(matrix[0].id, "local");
  assert.equal(matrix[0].healthStatus, "failed");
  assert.equal(matrix[0].errorType, "configuration");
  assert.match(matrix[0].failureReason, /nao esta configurado/i);
  assert.equal(matrix[0].diagnostics.baseUrl.configuredFrom, null);
  assert.equal(matrix[0].diagnostics.baseUrl.missing.includes("LOCAL_LLM_BASE_URL"), true);
});

(async () => {
  let failures = 0;
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${test.name}`);
      console.error(error);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  } else {
    console.log(`PASS ${tests.length} tests`);
  }
})();
