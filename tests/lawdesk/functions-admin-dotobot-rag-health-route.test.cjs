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

async function loadRouteWithMocks(mocks) {
  moduleCache.clear();
  const module = await evaluateModule(
    await loadEsmModule("D:/Github/newgit/functions/api/admin-dotobot-rag-health.js", mocks),
    mocks
  );
  return module.namespace;
}

function createContext(url = "https://example.test/api/admin-dotobot-rag-health?include_upsert=0", env = {}) {
  return {
    request: new Request(url, { method: "GET" }),
    env,
  };
}

registerTest("functions admin-dotobot-rag-health exports onRequestGet and preserves auth metadata", async () => {
  const route = await loadRouteWithMocks({
    "../lib/admin-auth.js": {
      requireAdminAccess: async () => ({
        ok: false,
        status: 401,
        error: "Token administrativo ausente.",
        errorType: "missing_token",
        details: { stage: "auth_header" },
      }),
    },
    "../../lib/lawdesk/rag.js": {
      runDotobotRagHealth: async () => ({ ok: true }),
    },
  });

  assert.equal(typeof route.onRequestGet, "function");
  const response = await route.onRequestGet(createContext());
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.ok, false);
  assert.equal(body.errorType, "missing_token");
  assert.deepEqual(body.details, { stage: "auth_header" });
});

registerTest("functions admin-dotobot-rag-health returns health payload", async () => {
  const route = await loadRouteWithMocks({
    "../lib/admin-auth.js": {
      requireAdminAccess: async () => ({ ok: true, user: { id: "1" } }),
    },
    "../../lib/lawdesk/rag.js": {
      runDotobotRagHealth: async () => ({ ok: true, status: "operational" }),
    },
  });

  const response = await route.onRequestGet(createContext());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.status, "operational");
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
