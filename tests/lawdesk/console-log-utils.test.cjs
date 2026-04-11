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
  if (specifier.startsWith("node:")) return createBuiltinModule(specifier);
  if (!specifier.startsWith(".")) throw new Error(`Unsupported external import in test loader: ${specifier}`);
  const parentPath = fileURLToPath(parentIdentifier);
  const resolvedPath = path.resolve(path.dirname(parentPath), specifier);
  return loadEsmModule(resolvedPath);
}

function createBuiltinModule(specifier) {
  if (moduleCache.has(specifier)) return moduleCache.get(specifier);

  let requiredModule = null;
  if (specifier === "node:fs/promises") requiredModule = fs;
  if (specifier === "node:path") requiredModule = path;
  if (!requiredModule) throw new Error(`Unsupported built-in import in test loader: ${specifier}`);

  const exportNames = Object.keys(requiredModule);
  const synthetic = new vm.SyntheticModule([...exportNames, "default"], function () {
    for (const key of exportNames) this.setExport(key, requiredModule[key]);
    this.setExport("default", requiredModule);
  }, { identifier: specifier });

  moduleCache.set(specifier, synthetic);
  return synthetic;
}

async function evaluateModule(module) {
  if (module.status === "unlinked") {
    await module.link(async (specifier, referencingModule) => loadResolvedModule(specifier, referencingModule.identifier));
  }
  if (module.status !== "evaluated") await module.evaluate();
  return module;
}

async function loadConsoleUtils() {
  const module = await evaluateModule(await loadEsmModule("D:/Github/newgit/lib/admin/console-log-utils.js"));
  return module.namespace;
}

registerTest("normalizeConsoleFilters removes empty values", async () => {
  const utils = await loadConsoleUtils();
  const result = utils.normalizeConsoleFilters({
    module: "financeiro",
    page: "",
    tag: "  ",
    status: "error",
  });

  assert.deepEqual(result, {
    module: "financeiro",
    status: "error",
  });
});

registerTest("entryMatchesConsoleFilters matches page against page path and url", async () => {
  const utils = await loadConsoleUtils();
  const entry = {
    page: "/interno/financeiro",
    path: "/api/admin-hmadv-financeiro",
    url: "https://example.com/interno/financeiro?tab=deals",
    component: "Painel",
    status: "error",
    tags: ["crm", "supabase"],
    response: "Falha na publicacao",
  };

  assert.equal(utils.entryMatchesConsoleFilters(entry, { page: "admin-hmadv-financeiro" }), true);
  assert.equal(utils.entryMatchesConsoleFilters(entry, { tag: "crm" }), true);
  assert.equal(utils.entryMatchesConsoleFilters(entry, { status: "success" }), false);
  assert.equal(utils.entryMatchesConsoleFilters(entry, {}, "publicacao"), true);
});

registerTest("buildTagScopedLogs and counters keep console taxonomy consistent", async () => {
  const utils = await loadConsoleUtils();
  const entries = [
    { id: "1", tags: ["crm", "supabase"] },
    { id: "2", tags: ["jobs"] },
    { id: "3", tags: ["manual"] },
  ];
  const history = {
    "interno-shell": { routePath: "/interno" },
    financeiro: { routePath: "/interno/financeiro" },
    vazio: null,
  };

  const scoped = utils.buildTagScopedLogs(entries);

  assert.equal(scoped.crm.length, 1);
  assert.equal(scoped.supabase.length, 1);
  assert.equal(scoped.jobs.length, 1);
  assert.equal(utils.countHistorySnapshots(history), 2);
  assert.equal(utils.countUnclassifiedEntries(entries), 1);
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
