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

function createSyntheticModule(identifier, exportsObject) {
  const exportNames = Object.keys(exportsObject);
  return new vm.SyntheticModule(
    exportNames,
    function init() {
      for (const key of exportNames) {
        this.setExport(key, exportsObject[key]);
      }
    },
    { identifier }
  );
}

async function loadEsmModule(entryPath, mocks = {}) {
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
      const child = await loadResolvedModule(specifier, referencingModule.identifier, mocks);
      await evaluateModule(child, mocks);
      return child;
    },
  });

  moduleCache.set(identifier, module);
  await module.link(async (specifier, referencingModule) =>
    loadResolvedModule(specifier, referencingModule.identifier, mocks)
  );
  return module;
}

async function loadResolvedModule(specifier, parentIdentifier, mocks = {}) {
  if (mocks[specifier]) {
    const key = `mock:${specifier}`;
    if (!moduleCache.has(key)) moduleCache.set(key, createSyntheticModule(key, mocks[specifier]));
    return moduleCache.get(key);
  }
  if (!specifier.startsWith(".")) throw new Error(`Unsupported external import: ${specifier}`);
  const parentPath = fileURLToPath(parentIdentifier);
  const resolvedPath = path.resolve(path.dirname(parentPath), specifier);
  return loadEsmModule(resolvedPath, mocks);
}

async function evaluateModule(module, mocks = {}) {
  if (module.status === "unlinked") {
    await module.link(async (specifier, referencingModule) =>
      loadResolvedModule(specifier, referencingModule.identifier, mocks)
    );
  }
  if (module.status !== "evaluated") {
    await module.evaluate();
  }
  return module;
}

async function loadHandler(entryPath, mocks) {
  moduleCache.clear();
  const module = await evaluateModule(await loadEsmModule(entryPath, mocks), mocks);
  return module.namespace.default;
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

registerTest("admin-hmadv-processos returns degraded overview on auth provider unavailable", async () => {
  const handler = await loadHandler("D:/Github/newgit/pages/api/admin-hmadv-processos.js", {
    "../../lib/admin/node-auth.js": {
      requireAdminNode: async () => ({
        ok: false,
        status: 503,
        error: "Configuracao do Supabase incompleta para validar token administrativo.",
        errorType: "auth_provider_unavailable",
        details: { stage: "supabase_user" },
      }),
    },
    "../../lib/admin/hmadv-ops.js": {
      backfillAudiencias: async () => ({}),
      bulkSaveSuggestedRelations: async () => ({}),
      bulkUpdateProcessRelations: async () => ({}),
      deleteProcessRelation: async () => ({}),
      getProcessosOverview: async () => ({}),
      inspectAudiencias: async () => ({}),
      listAdminJobs: async () => ({ items: [] }),
      listAdminOperations: async () => ({ items: [] }),
      listProcessRelations: async () => ({ items: [], totalRows: 0 }),
      runSyncWorker: async () => ({}),
      scanOrphanProcesses: async () => ({ items: [], totalRows: 0 }),
      saveProcessRelation: async () => ({}),
      searchProcesses: async () => ({ items: [] }),
      suggestProcessRelations: async () => ({ items: [], totalRows: 0 }),
    },
  });

  const req = { method: "GET", query: { action: "overview" }, headers: {} };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.degraded, true);
  assert.equal(res.body.data.limited, true);
});

registerTest("admin-hmadv-publicacoes returns degraded queue on auth provider unavailable", async () => {
  const handler = await loadHandler("D:/Github/newgit/pages/api/admin-hmadv-publicacoes.js", {
    "../../lib/admin/node-auth.js": {
      requireAdminNode: async () => ({
        ok: false,
        status: 503,
        error: "Configuracao do Supabase incompleta para validar token administrativo.",
        errorType: "auth_provider_unavailable",
        details: { stage: "supabase_user" },
      }),
    },
    "../../lib/admin/hmadv-ops.js": {
      backfillPartesFromPublicacoes: async () => ({}),
      getPublicacoesOverview: async () => ({}),
      listAdminJobs: async () => ({ items: [] }),
      listAdminOperations: async () => ({ items: [] }),
      listCreateProcessCandidates: async () => ({ items: [], totalRows: 0 }),
      listPartesExtractionCandidates: async () => ({ items: [], totalRows: 0 }),
      runAdviseBackfill: async () => ({}),
      runAdviseSync: async () => ({}),
      runSyncWorker: async () => ({}),
    },
    "../../functions/lib/hmadv-ops.js": {
      createProcessesFromPublicacoes: async () => ({}),
      createPublicacoesAdminJob: async () => ({}),
      getPublicationActivityTypes: async () => ({ items: [] }),
      getPublicacoesAdminJob: async () => null,
      getPublicacoesValidationMap: async () => ({}),
      listPublicacoesQueueSnapshot: async () => ({ items: [], totalRows: 0, hasMore: false }),
      listPublicationActivityBacklog: async () => ({ items: [], totalRows: 0 }),
      listProcessCoverage: async () => ({ items: [], totalRows: 0 }),
      logAdminOperation: async () => ({}),
      processPublicacoesAdminJob: async () => ({}),
      rebuildPublicacoesQueueSnapshot: async () => ({}),
      savePublicacoesValidation: async () => ({}),
      syncPartesFromPublicacoes: async () => ({}),
      syncPublicationActivities: async () => ({}),
      runPublicacoesOperationalPipeline: async () => ({}),
    },
    "../../functions/lib/hmadv-contacts.js": {
      getContactDetail: async () => null,
      listLinkedPartes: async () => ({ items: [], totalRows: 0 }),
      listUnlinkedPartes: async () => ({ items: [], totalRows: 0 }),
      reconcilePartesContacts: async () => ({}),
    },
  });

  const req = { method: "GET", query: { action: "mesa_integrada", page: "1", pageSize: "12", source: "todos" }, headers: {} };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.data.limited, true);
  assert.equal(Array.isArray(res.body.data.items), true);
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
