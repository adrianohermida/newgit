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
  if (module.status !== "evaluated") {
    await module.evaluate();
  }
  return module;
}

async function loadLawdeskModules() {
  const chatModule = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/lawdesk/chat.js"));
  const ragModule = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/lawdesk/rag.js"));
  return {
    runLawdeskChat: chatModule.namespace.runLawdeskChat,
    persistDotobotMemory: ragModule.namespace.persistDotobotMemory,
    retrieveDotobotRagContext: ragModule.namespace.retrieveDotobotRagContext,
    runDotobotRagHealth: ragModule.namespace.runDotobotRagHealth,
  };
}

registerTest("retrieveDotobotRagContext returns disabled when no providers are configured", async () => {
  const { retrieveDotobotRagContext } = await loadLawdeskModules();
  const result = await retrieveDotobotRagContext({}, { query: "teste", topK: 3 });
  assert.deepEqual(result, { enabled: false, matches: [] });
});

registerTest("persistDotobotMemory skips persistence when no providers are configured", async () => {
  const { persistDotobotMemory } = await loadLawdeskModules();
  const result = await persistDotobotMemory({}, {
    sessionId: "session-1",
    query: "Qual o status?",
    responseText: "Ainda sem contexto persistente.",
  });
  assert.equal(result.stored, false);
});

registerTest("runDotobotRagHealth reports disabled providers when no backend is configured", async () => {
  const { runDotobotRagHealth } = await loadLawdeskModules();
  const result = await runDotobotRagHealth({}, { includeUpsert: false });
  assert.equal(result.ok, false);
  assert.match(result.error, /RAG Dotobot nao habilitado/i);
});

registerTest("runLawdeskChat falls back to Workers AI direct execution", async () => {
  const { runLawdeskChat } = await loadLawdeskModules();
  const env = {
    AI: {
      async run(model, payload) {
        assert.equal(model, "@cf/meta/llama-3.1-8b-instruct");
        assert.equal(payload.messages[1].role, "user");
        return { response: "Resposta do fallback local." };
      },
    },
  };

  const result = await runLawdeskChat(env, {
    query: "Resuma o caso",
    context: { route: "/interno/processos" },
  });

  assert.equal(result.status, "ok");
  assert.equal(result.resultText, "Resposta do fallback local.");
  assert.equal(result._metadata.source, "workers_ai_direct");
  assert.equal(result.rag.retrieval.enabled, false);
});

registerTest("runLawdeskChat retries transient primary backend failures", async () => {
  const { runLawdeskChat } = await loadLawdeskModules();
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ error: "temporary failure" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        status: "ok",
        result: { message: "Resposta do backend primario." },
        session_id: "session-primary",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  };

  try {
    const result = await runLawdeskChat(
      { PROCESS_AI_BASE: "https://ai.example.test" },
      { query: "Gerar resumo", context: { route: "/interno" } }
    );

    assert.equal(calls.length, 2);
    assert.equal(result.status, "ok");
    assert.equal(result.resultText, "Resposta do backend primario.");
    assert.equal(result._metadata.source, "primary_api");
    assert.equal(result._metadata.retriesUsed, 1);
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
