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
  return new vm.SyntheticModule(exportNames, function () {
    for (const key of exportNames) {
      this.setExport(key, exportsObject[key]);
    }
  }, { identifier });
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
  await module.link(async (specifier, referencingModule) => loadResolvedModule(specifier, referencingModule.identifier, mocks));
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
    await module.link(async (specifier, referencingModule) => loadResolvedModule(specifier, referencingModule.identifier, mocks));
  }
  if (module.status !== "evaluated") {
    await module.evaluate();
  }
  return module;
}

async function loadHandlerWithMocks(mocks) {
  moduleCache.clear();
  const module = await evaluateModule(
    await loadEsmModule("D:/Github/newgit/pages/api/admin-lawdesk-providers.js", mocks),
    mocks
  );
  return module.namespace.default;
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
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
    end() {
      this.ended = true;
      return this;
    },
  };
}

registerTest("admin-lawdesk-providers returns fallback catalog when health probe fails", async () => {
  const handler = await loadHandlerWithMocks({
    "../../lib/admin/node-auth": {
      requireAdminNode: async () => ({ ok: true, user: { id: "1" } }),
    },
    "../../lib/lawdesk/providers": {
      getDefaultLawdeskProvider: () => "gpt",
      isLawdeskOfflineMode: () => false,
      listLawdeskProviders: () => [
        { id: "gpt", configured: true },
        { id: "custom", configured: false },
      ],
      runLawdeskProvidersHealth: async () => {
        throw new Error("probe failed");
      },
    },
  });

  const req = { method: "GET", query: { include_health: "1" } };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.equal(Array.isArray(res.body.data.providers), true);
  assert.equal(res.body.data.providers.length, 2);
  assert.equal(res.body.data.health.loaded, false);
  assert.equal(res.body.data.health.summary.total, 2);
  assert.equal(res.body.data.health.error, "probe failed");
});

registerTest("admin-lawdesk-providers preserves auth degradation details without throwing", async () => {
  const handler = await loadHandlerWithMocks({
    "../../lib/admin/node-auth": {
      requireAdminNode: async () => ({
        ok: false,
        status: 503,
        error: "Configuracao do Supabase incompleta para validar token administrativo.",
        errorType: "auth_provider_unavailable",
        details: { stage: "supabase_user" },
      }),
    },
    "../../lib/lawdesk/providers": {
      getDefaultLawdeskProvider: () => "gpt",
      isLawdeskOfflineMode: () => false,
      listLawdeskProviders: () => [],
      runLawdeskProvidersHealth: async () => null,
    },
  });

  const req = { method: "GET", query: { include_health: "1" } };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.errorType, "auth_provider_unavailable");
  assert.deepEqual(res.body.details, { stage: "supabase_user" });
});

registerTest("admin-lawdesk-providers returns 500 on unexpected handler failure", async () => {
  const handler = await loadHandlerWithMocks({
    "../../lib/admin/node-auth": {
      requireAdminNode: async () => {
        throw new Error("auth exploded");
      },
    },
    "../../lib/lawdesk/providers": {
      getDefaultLawdeskProvider: () => "gpt",
      isLawdeskOfflineMode: () => false,
      listLawdeskProviders: () => [],
      runLawdeskProvidersHealth: async () => null,
    },
  });

  const req = { method: "GET", query: {} };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error, "auth exploded");
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
