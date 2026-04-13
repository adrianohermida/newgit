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

async function loadHandlerWithMocks(mocks) {
  moduleCache.clear();
  const module = await evaluateModule(
    await loadEsmModule("D:/Github/newgit/pages/api/admin-lawdesk-chat.js", mocks),
    mocks
  );
  return module.namespace.default;
}

async function loadAliasHandlerWithMocks(mocks) {
  moduleCache.clear();
  const module = await evaluateModule(
    await loadEsmModule("D:/Github/newgit/pages/api/admin-dotobot-chat.js", mocks),
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

registerTest("admin-lawdesk-chat preserves auth degradation details", async () => {
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
    "../../lib/lawdesk/feature-flags": {
      buildFeatureFlags: () => ({}),
    },
    "../../lib/lawdesk/chat": {
      runLawdeskChat: async () => ({ ok: true }),
    },
    "../../lib/lawdesk/task_runs": {
      cancelTaskRun: async () => ({ ok: true }),
      continueTaskRun: async () => ({ ok: true }),
      getTaskRun: async () => ({ ok: true }),
      startTaskRun: async () => ({ ok: true }),
    },
  });

  const req = { method: "POST", body: { query: "teste" }, headers: {} };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.errorType, "auth_provider_unavailable");
  assert.deepEqual(res.body.details, { stage: "supabase_user" });
});

registerTest("admin-lawdesk-chat returns 405 for invalid method", async () => {
  const handler = await loadHandlerWithMocks({
    "../../lib/admin/node-auth": {
      requireAdminNode: async () => ({ ok: true, user: { id: "1" } }),
    },
    "../../lib/lawdesk/feature-flags": {
      buildFeatureFlags: () => ({}),
    },
    "../../lib/lawdesk/chat": {
      runLawdeskChat: async () => ({ ok: true }),
    },
    "../../lib/lawdesk/task_runs": {
      cancelTaskRun: async () => ({ ok: true }),
      continueTaskRun: async () => ({ ok: true }),
      getTaskRun: async () => ({ ok: true }),
      startTaskRun: async () => ({ ok: true }),
    },
  });

  const req = { method: "GET", headers: {} };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 405);
  assert.equal(res.body.ok, false);
  assert.equal(res.body.error, "Metodo nao permitido.");
});

registerTest("admin-dotobot-chat proxies to canonical handler", async () => {
  const handler = await loadAliasHandlerWithMocks({
    "./admin-lawdesk-chat": {
      default: async (_req, res) => {
        res.status(207).json({ ok: true, source: "canonical" });
      },
    },
  });

  const req = { method: "POST", headers: {}, body: { query: "teste alias" } };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 207);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.source, "canonical");
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
