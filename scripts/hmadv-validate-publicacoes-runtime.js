const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function loadDotEnv(file) {
  const text = fs.readFileSync(file, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function importModule(relativePath) {
  const fullPath = path.resolve(relativePath);
  return import(pathToFileURL(fullPath).href);
}

async function safeRun(label, fn) {
  try {
    const value = await fn();
    return { ok: true, label, value };
  } catch (error) {
    return {
      ok: false,
      label,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeValidationMap(map) {
  return {
    total: Object.keys(map || {}).length,
    items: map || {},
  };
}

async function main() {
  loadDotEnv(path.resolve(".dev.vars"));

  const adminOps = await importModule("./lib/admin/hmadv-ops.js");
  const runtimeOps = await importModule("./functions/lib/hmadv-ops.js");
  const contacts = await importModule("./functions/lib/hmadv-contacts.js");

  const env = process.env;
  const sampleCnj = process.argv[2] || "00001454220218260286";

  const checks = await Promise.all([
    safeRun("admin_overview", () => adminOps.getPublicacoesOverview()),
    safeRun("admin_candidatos_processos", () => adminOps.listCreateProcessCandidates({ page: 1, pageSize: 5 })),
    safeRun("admin_candidatos_partes", () => adminOps.listPartesExtractionCandidates({ page: 1, pageSize: 5 })),
    safeRun("runtime_overview", () => runtimeOps.getPublicacoesOverview(env)),
    safeRun("runtime_validation_map", async () => summarizeValidationMap(await runtimeOps.getPublicacoesValidationMap(env, [sampleCnj]))),
    safeRun("runtime_coverage", () => runtimeOps.listProcessCoverage(env, { page: 1, pageSize: 5, query: sampleCnj, onlyPending: false })),
    safeRun("runtime_publicacoes_pendentes", () => runtimeOps.listPublicationActivityBacklog(env, { page: 1, pageSize: 5 })),
    safeRun("runtime_activity_types", () => runtimeOps.getPublicationActivityTypes(env)),
    safeRun("runtime_partes_vinculadas", () => contacts.listLinkedPartes(env, { page: 1, pageSize: 5, query: sampleCnj })),
    safeRun("runtime_partes_pendentes", () => contacts.listUnlinkedPartes(env, { page: 1, pageSize: 5, query: sampleCnj })),
  ]);

  const report = {
    checkedAt: new Date().toISOString(),
    sampleCnj,
    checks,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
