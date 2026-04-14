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
      for (const key of exportNames) this.setExport(key, exportsObject[key]);
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
  if (module.status !== "evaluated") await module.evaluate();
  return module;
}

async function loadNamespace(entryPath, mocks) {
  moduleCache.clear();
  const module = await evaluateModule(await loadEsmModule(entryPath, mocks), mocks);
  return module.namespace;
}

registerTest("handleProcessosPost falls back inline when job infra is unavailable", async () => {
  const logs = [];
  const namespace = await loadNamespace("D:/Github/newgit/lib/admin/processos-api-post.js", {
    "../../functions/lib/hmadv-ops.js": {
      backfillAudiencias: async () => ({}),
      createProcessAdminJob: async () => {
        throw new Error("PGRST205 Could not find the table operacao_jobs in the schema cache");
      },
      enrichProcessesViaDatajud: async () => ({ ok: true, synced: 3 }),
      getProcessAdminJob: async () => null,
      listAdminJobs: async () => ({ items: [] }),
      logAdminOperation: async (env, payload) => {
        logs.push(payload);
      },
      processProcessAdminJob: async () => ({}),
      pushOrphanAccounts: async () => ({}),
      repairFreshsalesAccounts: async () => ({}),
      runProcessAudit: async () => ({}),
      runSyncWorker: async () => ({}),
      syncMovementActivities: async () => ({}),
      syncProcessesSupabaseCrm: async () => ({}),
      syncPublicationActivities: async () => ({}),
      updateMonitoringStatus: async () => ({}),
    },
    "../../functions/lib/hmadv-contacts.js": {
      reconcilePartesContacts: async () => ({}),
    },
    "../../functions/lib/hmadv-runner.js": {
      drainHmadvQueues: async () => ({}),
    },
    "./hmadv-ops.js": {
      bulkSaveSuggestedRelations: async () => ({}),
      bulkUpdateProcessRelations: async () => ({}),
      deleteProcessRelation: async () => ({}),
      saveProcessRelation: async () => ({}),
    },
    "./processos-api-shared.js": {
      parseProcessNumbers: (value) => String(value || "").split(/\r?\n|,|;/).map((item) => item.trim()).filter(Boolean),
    },
  });

  const response = await namespace.handleProcessosPost({
    action: "create_job",
    jobAction: "enriquecer_datajud",
    processNumbers: "123,456",
    limit: 2,
    intent: "reenriquecer_gaps",
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.legacy_inline, true);
  assert.equal(response.data.action, "enriquecer_datajud");
  assert.equal(response.data.result.synced, 3);
  assert.equal(logs[0].acao, "enriquecer_datajud_reenriquecer_gaps_inline_fallback");
});

registerTest("handleProcessosPost drains pending process jobs", async () => {
  let processCalls = 0;
  const namespace = await loadNamespace("D:/Github/newgit/lib/admin/processos-api-post.js", {
    "../../functions/lib/hmadv-ops.js": {
      backfillAudiencias: async () => ({}),
      createProcessAdminJob: async () => ({}),
      enrichProcessesViaDatajud: async () => ({}),
      getProcessAdminJob: async () => ({ id: "job-1", status: "pending" }),
      listAdminJobs: async () => ({ items: [{ id: "job-1", status: processCalls === 0 ? "pending" : "completed" }] }),
      logAdminOperation: async () => ({}),
      processProcessAdminJob: async () => {
        processCalls += 1;
        return { id: "job-1", status: "completed", acao: "run_sync_worker" };
      },
      pushOrphanAccounts: async () => ({}),
      repairFreshsalesAccounts: async () => ({}),
      runProcessAudit: async () => ({}),
      runSyncWorker: async () => ({}),
      syncMovementActivities: async () => ({}),
      syncProcessesSupabaseCrm: async () => ({}),
      syncPublicationActivities: async () => ({}),
      updateMonitoringStatus: async () => ({}),
    },
    "../../functions/lib/hmadv-contacts.js": {
      reconcilePartesContacts: async () => ({}),
    },
    "../../functions/lib/hmadv-runner.js": {
      drainHmadvQueues: async () => ({}),
    },
    "./hmadv-ops.js": {
      bulkSaveSuggestedRelations: async () => ({}),
      bulkUpdateProcessRelations: async () => ({}),
      deleteProcessRelation: async () => ({}),
      saveProcessRelation: async () => ({}),
    },
    "./processos-api-shared.js": {
      parseProcessNumbers: () => [],
    },
  });

  const response = await namespace.handleProcessosPost({
    action: "run_pending_jobs",
    id: "job-1",
    maxChunks: 1,
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.chunksProcessed, 1);
  assert.equal(response.data.completedAll, true);
  assert.equal(response.data.job.status, "completed");
});

registerTest("handleProcessosPost executes sync_supabase_crm directly with logging", async () => {
  const logs = [];
  let receivedPayload = null;
  const namespace = await loadNamespace("D:/Github/newgit/lib/admin/processos-api-post.js", {
    "../../functions/lib/hmadv-ops.js": {
      backfillAudiencias: async () => ({}),
      createProcessAdminJob: async () => ({}),
      enrichProcessesViaDatajud: async () => ({}),
      getProcessAdminJob: async () => null,
      listAdminJobs: async () => ({ items: [] }),
      logAdminOperation: async (env, payload) => {
        logs.push(payload);
      },
      processProcessAdminJob: async () => ({}),
      pushOrphanAccounts: async () => ({}),
      repairFreshsalesAccounts: async () => ({}),
      runProcessAudit: async () => ({}),
      runSyncWorker: async () => ({}),
      syncMovementActivities: async () => ({}),
      syncProcessesSupabaseCrm: async (env, payload) => {
        receivedPayload = payload;
        return { sincronizados: 2 };
      },
      syncPublicationActivities: async () => ({}),
      updateMonitoringStatus: async () => ({}),
    },
    "../../functions/lib/hmadv-contacts.js": {
      reconcilePartesContacts: async () => ({}),
    },
    "../../functions/lib/hmadv-runner.js": {
      drainHmadvQueues: async () => ({}),
    },
    "./hmadv-ops.js": {
      bulkSaveSuggestedRelations: async () => ({}),
      bulkUpdateProcessRelations: async () => ({}),
      deleteProcessRelation: async () => ({}),
      saveProcessRelation: async () => ({}),
    },
    "./processos-api-shared.js": {
      parseProcessNumbers: (value) => String(value || "").split(/\r?\n|,|;/).map((item) => item.trim()).filter(Boolean),
    },
  });

  const response = await namespace.handleProcessosPost({
    action: "sync_supabase_crm",
    processNumbers: "111;222",
    limit: 4,
    intent: "datajud_plus_crm",
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.sincronizados, 2);
  assert.deepEqual(receivedPayload.processNumbers, ["111", "222"]);
  assert.equal(receivedPayload.intent, "datajud_plus_crm");
  assert.equal(logs[0].acao, "sync_supabase_crm");
});

registerTest("handleProcessosPost updates monitoramento with Freshsales tag sync payload", async () => {
  const logs = [];
  let receivedPayload = null;
  const namespace = await loadNamespace("D:/Github/newgit/lib/admin/processos-api-post.js", {
    "../../functions/lib/hmadv-ops.js": {
      backfillAudiencias: async () => ({}),
      createProcessAdminJob: async () => ({}),
      enrichProcessesViaDatajud: async () => ({}),
      getProcessAdminJob: async () => null,
      listAdminJobs: async () => ({ items: [] }),
      logAdminOperation: async (env, payload) => {
        logs.push(payload);
      },
      processProcessAdminJob: async () => ({}),
      pushOrphanAccounts: async () => ({}),
      repairFreshsalesAccounts: async () => ({}),
      runProcessAudit: async () => ({}),
      runSyncWorker: async () => ({}),
      syncMovementActivities: async () => ({}),
      syncProcessesSupabaseCrm: async () => ({}),
      syncPublicationActivities: async () => ({}),
      updateMonitoringStatus: async (env, payload) => {
        receivedPayload = payload;
        return { processosAtualizados: 2, crmTagged: 2 };
      },
    },
    "../../functions/lib/hmadv-contacts.js": {
      reconcilePartesContacts: async () => ({}),
    },
    "../../functions/lib/hmadv-runner.js": {
      drainHmadvQueues: async () => ({}),
    },
    "./hmadv-ops.js": {
      bulkSaveSuggestedRelations: async () => ({}),
      bulkUpdateProcessRelations: async () => ({}),
      deleteProcessRelation: async () => ({}),
      saveProcessRelation: async () => ({}),
    },
    "./processos-api-shared.js": {
      parseProcessNumbers: (value) => String(value || "").split(/\r?\n|,|;/).map((item) => item.trim()).filter(Boolean),
    },
  });

  const response = await namespace.handleProcessosPost({
    action: "monitoramento_status",
    processNumbers: "111\n222",
    limit: 2,
    active: true,
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.processosAtualizados, 2);
  assert.equal(receivedPayload.active, true);
  assert.deepEqual(receivedPayload.processNumbers, ["111", "222"]);
  assert.equal(logs[0].acao, "monitoramento_status");
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
