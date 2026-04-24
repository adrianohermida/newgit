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
  if (moduleCache.has(identifier)) {
    return moduleCache.get(identifier);
  }

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
    return createBuiltinModule(specifier);
  }
  if (!specifier.startsWith(".")) {
    throw new Error(`Unsupported external import in test loader: ${specifier}`);
  }
  const parentPath = fileURLToPath(parentIdentifier);
  const resolvedPath = path.resolve(path.dirname(parentPath), specifier);
  return loadEsmModule(resolvedPath);
}

function createBuiltinModule(specifier) {
  if (moduleCache.has(specifier)) {
    return moduleCache.get(specifier);
  }

  const requiredModule =
    specifier === "node:fs/promises"
      ? require("node:fs/promises")
      : specifier === "node:path"
        ? require("node:path")
        : specifier === "node:crypto"
          ? require("node:crypto")
          : null;

  if (!requiredModule) {
    throw new Error(`Unsupported built-in import in test loader: ${specifier}`);
  }

  const exportNames = Object.keys(requiredModule);
  const synthetic = new vm.SyntheticModule([...exportNames, "default"], function () {
    for (const key of exportNames) {
      this.setExport(key, requiredModule[key]);
    }
    this.setExport("default", requiredModule);
  }, { identifier: specifier });

  moduleCache.set(specifier, synthetic);
  return synthetic;
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

async function loadRouterModule() {
  const module = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/lawdesk/direct_tool_router.js"));
  return module.namespace;
}

function createEdgeFunctionFetchStub() {
  const calls = [];
  const stub = async (url, init = {}) => {
    const href = String(url);
    calls.push({
      url: href,
      method: init.method || "GET",
      body: init.body || null,
    });
    const body =
      href.includes("/functions/v1/datajud-search")
        ? { processo_id: "proc-1", numero_cnj: "1234567-89.2024.8.26.0100", movimentos_persistidos: 12 }
        : href.includes("/functions/v1/advise-sync")
          ? { ok: true, total: 5 }
          : href.includes("/functions/v1/advise-ai-enricher")
            ? { ok: true, processadas: 7 }
            : href.includes("/functions/v1/processo-sync")
              ? { ok: true, action: "pipeline" }
              : href.includes("/functions/v1/publicacoes-audiencias")
                ? { ok: true, action: "extract_batch" }
                : href.includes("/functions/v1/publicacoes-freshsales")
                  ? { ok: true, processadas: 4 }
                  : href.includes("/functions/v1/publicacoes-prazos")
                    ? { ok: true, action: "calcular_batch" }
                    : href.includes("/functions/v1/fc-ingest-conversations")
                      ? { ok: true, imported: 10 }
                      : href.includes("/functions/v1/fc-last-conversation")
                        ? { conversation_id: "conv-123", status: "open" }
                        : href.includes("/functions/v1/fc-update-conversation")
                          ? { ok: true, conversation_id: "conv-123" }
                          : href.includes("/functions/v1/tpu-enricher")
                            ? { ok: true, enriched: 1 }
                            : href.includes("/functions/v1/tpu-sync")
                              ? { ok: true, status: "ok" }
                              : null;

    if (!body) {
      throw new Error(`Unexpected fetch in smoke test: ${href}`);
    }

    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { stub, calls };
}

function createEnv() {
  return {
    SUPABASE_URL: "https://sspvizogbcyigquqycsz.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test_value",
  };
}

registerTest("routeDotobotDirectTool answers current date deterministically", async () => {
  const { routeDotobotDirectTool } = await loadRouterModule();
  const result = await routeDotobotDirectTool({}, { query: "que dia é hoje?" });
  assert.equal(result.handled, true);
  assert.equal(result.response._metadata.route, "current_date");
  assert.match(result.response.resultText, /Hoje e /);
});

registerTest("routeDotobotDirectTool answers current time deterministically", async () => {
  const { routeDotobotDirectTool } = await loadRouterModule();
  const result = await routeDotobotDirectTool({}, { query: "que horas são?" });
  assert.equal(result.handled, true);
  assert.equal(result.response._metadata.route, "current_time");
  assert.match(result.response.resultText, /Agora sao /);
});

const edgeRoutes = [
  {
    name: "routes datajud-search by CNJ intent",
    query: "buscar processo no datajud 1234567-89.2024.8.26.0100",
    functionName: "datajud-search",
  },
  {
    name: "routes advise-sync by sync intent",
    query: "sincronizar advise",
    functionName: "advise-sync",
  },
  {
    name: "routes advise-ai-enricher by enrichment intent",
    query: "enriquecer publicações do advise",
    functionName: "advise-ai-enricher",
  },
  {
    name: "routes processo-sync by pipeline intent",
    query: "executar pipeline de processos",
    functionName: "processo-sync",
  },
  {
    name: "routes publicacoes-audiencias by audiencia extraction intent",
    query: "extrair audiências das publicações",
    functionName: "publicacoes-audiencias",
  },
  {
    name: "routes publicacoes-freshsales by CRM sync intent",
    query: "sincronizar publicacoes com freshsales",
    functionName: "publicacoes-freshsales",
  },
  {
    name: "routes publicacoes-prazos by deadline calculation intent",
    query: "calcular prazos das publicações",
    functionName: "publicacoes-prazos",
  },
  {
    name: "routes fc-ingest-conversations by ingest intent",
    query: "ingestao de conversas",
    functionName: "fc-ingest-conversations",
  },
  {
    name: "routes fc-last-conversation by last conversation intent",
    query: "ultima conversa 550e8400-e29b-41d4-a716-446655440000",
    functionName: "fc-last-conversation",
  },
  {
    name: "routes fc-update-conversation by update intent",
    query: "atualizar conversa 550e8400-e29b-41d4-a716-446655440000 para resolvida",
    functionName: "fc-update-conversation",
  },
  {
    name: "routes tpu-enricher by parse CNJ intent",
    query: "parse cnj 1234567-89.2024.8.26.0100",
    functionName: "tpu-enricher",
  },
  {
    name: "routes tpu-sync by gateway TPU intent",
    query: "sincronizar tpu movimento 12345",
    functionName: "tpu-sync",
  },
];

for (const scenario of edgeRoutes) {
  registerTest(scenario.name, async () => {
    const { routeDotobotDirectTool } = await loadRouterModule();
    const originalFetch = globalThis.fetch;
    const { stub, calls } = createEdgeFunctionFetchStub();
    globalThis.fetch = stub;

    try {
      const result = await routeDotobotDirectTool(createEnv(), { query: scenario.query });
      assert.equal(result.handled, true);
      assert.equal(result.response._metadata.functionName, scenario.functionName);
      assert.equal(calls.length, 1);
      assert.match(calls[0].url, new RegExp(`/functions/v1/${scenario.functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

async function main() {
  let failures = 0;

  for (const test of tests) {
    try {
      await test.fn();
      process.stdout.write(`ok - ${test.name}\n`);
    } catch (error) {
      failures += 1;
      process.stderr.write(`not ok - ${test.name}\n${error.stack || error}\n`);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
    throw new Error(`${failures} test(s) failed`);
  }

  process.stdout.write(`1..${tests.length}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
