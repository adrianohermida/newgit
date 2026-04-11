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

  let requiredModule = null;
  if (specifier === "node:fs/promises") requiredModule = fs;
  if (specifier === "node:path") requiredModule = path;
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

async function loadAiTaskModules() {
  const stateModule = await evaluateModule(await loadEsmModule("D:/Github/newgit/components/interno/aitask/aiTaskState.js"));
  const adaptersModule = await evaluateModule(await loadEsmModule("D:/Github/newgit/components/interno/aitask/aiTaskAdapters.js"));
  return {
    state: stateModule.namespace,
    adapters: adaptersModule.namespace,
  };
}

registerTest("buildTaskColumns groups tasks by execution status", async () => {
  const { state } = await loadAiTaskModules();
  const result = state.buildTaskColumns([
    { id: "1", status: "running" },
    { id: "2", status: "done" },
    { id: "3", status: "failed" },
    { id: "4", status: "pending" },
    { id: "5", status: "queued" },
  ]);

  assert.equal(result.running.length, 1);
  assert.equal(result.done.length, 1);
  assert.equal(result.failed.length, 1);
  assert.equal(result.pending.length, 2);
});

registerTest("buildAgentLanes keeps a visible running count for running and pending tasks", async () => {
  const { state } = await loadAiTaskModules();
  const lanes = state.buildAgentLanes([
    { id: "1", assignedAgent: "Planner", status: "running" },
    { id: "2", assignedAgent: "Planner", status: "pending" },
    { id: "3", assignedAgent: "Planner", status: "done" },
    { id: "4", assignedAgent: "Critic", status: "failed" },
  ]);

  const planner = lanes.find((lane) => lane.agent === "Planner");
  const critic = lanes.find((lane) => lane.agent === "Critic");

  assert.equal(planner.runningCount, 2);
  assert.equal(planner.tasks.length, 3);
  assert.equal(critic.runningCount, 0);
});

registerTest("filter helpers and selected task resolution preserve operator focus", async () => {
  const { state } = await loadAiTaskModules();
  const logs = [
    { type: "planner", action: "Plano", result: "Criado" },
    { type: "backend", action: "Execucao", result: "Em andamento" },
    { type: "error", action: "Falha", result: "Timeout" },
  ];

  assert.equal(state.filterLogsByType(logs, "backend").length, 1);
  assert.equal(state.filterLogsBySearch(logs, "timeout").length, 1);
  assert.equal(state.findSelectedTask([{ id: "a" }, { id: "b" }], "b").id, "b");
  assert.equal(state.findSelectedTask([{ id: "a" }, { id: "b" }], "x").id, "a");
});

registerTest("attachment and history helpers enforce compact workspace limits", async () => {
  const { state } = await loadAiTaskModules();
  const files = Array.from({ length: 8 }, (_, index) => ({
    name: `file-${index}.txt`,
    type: "text/plain",
    size: index + 1,
  }));

  const attachments = state.normalizeAttachmentsFromEvent({ target: { files } });
  const recentHistory = state.trimRecentHistory(Array.from({ length: 10 }, (_, index) => ({ id: index })), 4);

  assert.equal(attachments.length, 6);
  assert.deepEqual(attachments[0], { name: "file-0.txt", type: "text/plain", size: 1 });
  assert.equal(recentHistory.length, 4);
});

registerTest("task run adapters normalize backend payloads and fallback fields", async () => {
  const { adapters } = await loadAiTaskModules();
  const payload = adapters.normalizeTaskRunPayload({
    ok: true,
    data: {
      run: {
        id: "run-1",
        status: "completed",
        result: {
          steps: [{ action: "Pesquisar", status: "ok" }],
          rag: { retrieval: { matches: [{ id: "m1" }] } },
        },
      },
      resultText: "Resposta final",
      source: "openai",
      model: "gpt-4o",
      eventsCursorSequence: "7",
      eventsTotal: "3",
      pollIntervalMs: "900",
    },
  });

  assert.equal(payload.run.id, "run-1");
  assert.equal(payload.resultText, "Resposta final");
  assert.equal(payload.source, "openai");
  assert.equal(payload.model, "gpt-4o");
  assert.equal(payload.eventsCursorSequence, 7);
  assert.equal(payload.eventsTotal, 3);
  assert.equal(payload.pollIntervalMs, 900);
  assert.equal(payload.steps.length, 1);
  assert.equal(adapters.extractTaskRunMemoryMatches(payload.rag).length, 1);
});

registerTest("adapter helpers classify mission intent and approval risk", async () => {
  const { adapters } = await loadAiTaskModules();

  assert.deepEqual(adapters.detectModules("Preparar peticao inicial"), ["documentos-juridicos"]);
  assert.deepEqual(adapters.detectModules("Revisar audiencia de processo"), ["processos"]);
  assert.deepEqual(adapters.detectModules("Atualizar contato do cliente"), ["clientes"]);
  assert.equal(adapters.requiresApproval("Excluir registro antigo"), true);
  assert.equal(adapters.normalizeMission("  revisar caso  "), "revisar caso");
  assert.equal(adapters.formatExecutionSourceLabel("cloudflare"), "Cloudflare Workers AI");
  assert.equal(adapters.extractTaskRunResultText({ result: { message: "OK" } }), "OK");
  assert.equal(adapters.classifyTaskAgent({ action: "Montar plano operacional" }), "Planner");
  assert.equal(adapters.classifyTaskAgent({ tool: "rag_lookup", action: "Recuperar contexto" }), "Retriever");
  assert.equal(adapters.classifyTaskAgent({ action: "Validar resposta final" }), "Critic");
  assert.equal(adapters.classifyTaskAgent({ tool: "workers_ai_direct", action: "Executar resposta" }), "Executor");
  assert.equal(adapters.classifyTaskAgent({ action: "Supervisor dispatch" }), "Supervisor");
  assert.equal(adapters.normalizeTaskStepStatus("queued"), "pending");
  assert.equal(adapters.normalizeTaskStepStatus("ok"), "done");
  assert.equal(adapters.normalizeTaskStepStatus("error"), "failed");
  assert.equal(adapters.inferTaskPriority({ action: "Recuperar contexto RAG" }), "medium");
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
