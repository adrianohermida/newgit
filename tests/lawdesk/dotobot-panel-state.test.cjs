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
  if (module.status !== "evaluated") {
    await module.evaluate();
  }
  return module;
}

async function loadDotobotStateModule() {
  const stateModule = await evaluateModule(await loadEsmModule("D:/Github/newgit/components/interno/dotobotPanelState.js"));
  return stateModule.namespace;
}

registerTest("summarizeConversation infers project from route metadata", async () => {
  const state = await loadDotobotStateModule();
  const conversation = state.summarizeConversation({
    id: "conv-1",
    title: "Caso CNJ",
    messages: [{ role: "user", text: "Revisar processo 123" }],
    metadata: {
      routePath: "/interno/processos",
    },
  });

  assert.equal(conversation.projectKey, "processos");
  assert.equal(conversation.projectLabel, "Processos");
});

registerTest("groupConversationsByProject keeps related conversations together", async () => {
  const state = await loadDotobotStateModule();
  const grouped = state.groupConversationsByProject([
    state.summarizeConversation({
      id: "conv-a",
      title: "Conta com lead",
      messages: [{ role: "user", text: "Lead do escritório" }],
      metadata: { routePath: "/interno/leads" },
    }),
    state.summarizeConversation({
      id: "conv-b",
      title: "Processo com audiência",
      messages: [{ role: "user", text: "Preparar audiência" }],
      metadata: { routePath: "/interno/processos" },
    }),
    state.summarizeConversation({
      id: "conv-c",
      title: "Segundo processo",
      messages: [{ role: "user", text: "Analisar petição" }],
      metadata: { routePath: "/interno/processos" },
    }),
  ]);

  const processos = grouped.find((group) => group.key === "processos");
  const leads = grouped.find((group) => group.key === "leads");

  assert.equal(processos.items.length, 2);
  assert.equal(leads.items.length, 1);
});

registerTest("filterVisibleConversations matches project metadata during contextual search", async () => {
  const state = await loadDotobotStateModule();
  const filtered = state.filterVisibleConversations([
    state.summarizeConversation({
      id: "conv-1",
      title: "Financeiro do cliente",
      messages: [{ role: "user", text: "Cobrança em aberto" }],
      metadata: { routePath: "/interno/financeiro" },
    }),
    state.summarizeConversation({
      id: "conv-2",
      title: "Roteiro editorial",
      messages: [{ role: "user", text: "Planejar artigo" }],
      metadata: { routePath: "/interno/posts" },
    }),
  ], "financeiro");

  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].projectKey, "financeiro");
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
