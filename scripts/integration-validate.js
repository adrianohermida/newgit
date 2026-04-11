#!/usr/bin/env node

const {
  buildCredentialChecklist,
  buildRequiredChecks,
} = require("../lib/integration-kit/config");
const {
  buildEnvFromSetupFile,
  getSetupSecretsPath,
  materializeSetupTemplates,
  readJsonFile,
} = require("../lib/integration-kit/bootstrap");
const { loadPreferredEnvFiles } = require("../lib/integration-kit/env");

loadPreferredEnvFiles(process.cwd(), process.env);

function main() {
  const args = process.argv.slice(2);
  const allowAmbientEnv = args.includes("--allow-ambient-env");
  const setupFilePath = getSetupSecretsPath(process.cwd());
  const setupJson = readJsonFile(setupFilePath);

  materializeSetupTemplates(process.cwd());

  if (!setupJson && !allowAmbientEnv) {
    console.log(JSON.stringify({
      ok: false,
      generatedAt: new Date().toISOString(),
      setupFilePath,
      setupFilePresent: false,
      error: "setup.secrets.json ausente. Salve o setup pela UI ou use --allow-ambient-env conscientemente.",
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const env = buildEnvFromSetupFile(setupJson || {}, process.env);
  const requiredChecks = buildRequiredChecks(env);
  const credentialChecklist = buildCredentialChecklist(env);
  const missingRequired = requiredChecks.filter((item) => !item.present);
  const missingChecklist = credentialChecklist.filter((item) => !item.present);

  console.log(JSON.stringify({
    ok: missingRequired.length === 0,
    generatedAt: new Date().toISOString(),
    setupFilePath,
    setupFilePresent: Boolean(setupJson),
    allowAmbientEnv,
    requiredChecks,
    credentialChecklist,
    missingRequired: missingRequired.map((item) => item.key),
    pendingCredentials: missingChecklist.map((item) => `${item.system}: ${item.item}`),
    nextSteps: missingChecklist.length
      ? missingChecklist.map((item) => `${item.system}: ${item.help}`)
      : ["Cobertura minima validada. Pode seguir para npm run integration:bootstrap."],
  }, null, 2));

  if (missingRequired.length > 0) {
    process.exitCode = 1;
  }
}

main();
