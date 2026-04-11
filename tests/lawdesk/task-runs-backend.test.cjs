const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const nodeCrypto = require("node:crypto");
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
      ? fs
      : specifier === "node:path"
        ? path
        : specifier === "node:crypto"
          ? nodeCrypto
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

async function loadTaskRunModule() {
  const module = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/lawdesk/task_runs.js"));
  return {
    startTaskRun: module.namespace.startTaskRun,
  };
}

registerTest("startTaskRun enriches completed steps with multiagent metadata", async () => {
  const { startTaskRun } = await loadTaskRunModule();
  const originalFetch = globalThis.fetch;
  const env = {
    PROCESS_AI_BASE: "https://ai.example.test",
  };

  globalThis.fetch = async (url) => {
    if (String(url) !== "https://ai.example.test/execute") {
      throw new Error(`Unexpected fetch call during task run test: ${url}`);
    }

    return new Response(JSON.stringify({
      status: "ok",
      result: {
        message: "Fluxo concluído com sucesso.",
      },
      session_id: "session-task-run",
      steps: [
        { action: "Montar plano da execução", tool: "planner", status: "running", dependsOn: ["briefing"] },
        { action: "Buscar contexto no vault", tool: "rag_search", status: "pending" },
        { action: "Executar resposta final", tool: "executor", status: "ok" },
      ],
      logs: [{ level: "info", message: "execução concluída" }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await startTaskRun(
      env,
      {
        query: "Analise o processo e sugira próximos passos.",
        mode: "assisted",
        provider: "gpt",
        context: { route: "/interno/ai-task" },
        waitForCompletion: true,
      },
      { chat: { skillsDetection: false } }
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, 200);
    assert.equal(result.data.run.status, "completed");
    assert.equal(result.data.run.result.steps.length, 3);

    const [planner, retriever, executor] = result.data.run.result.steps;
    assert.equal(planner.agent_role, "Planner");
    assert.equal(planner.stage, "planning");
    assert.equal(planner.priority, "high");
    assert.deepEqual(planner.dependencies, ["briefing"]);

    assert.equal(retriever.agent_role, "Retriever");
    assert.equal(retriever.stage, "retrieval");
    assert.equal(retriever.priority, "medium");

    assert.equal(executor.agent_role, "Executor");
    assert.equal(executor.stage, "execution");
    assert.equal(executor.priority, "high");

    const completedEvent = (result.data.events || []).find((event) => event.type === "run.completed");
    assert.ok(completedEvent);
    assert.deepEqual(completedEvent.data.stages, ["planning", "retrieval", "execution"]);
    assert.deepEqual(completedEvent.data.agents, ["Planner", "Retriever", "Executor"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
