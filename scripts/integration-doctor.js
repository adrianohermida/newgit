#!/usr/bin/env node

const { loadPreferredEnvFiles } = require("../lib/integration-kit/env");
const { buildFreshworksDiagnostics } = require("../lib/integration-kit/freshworks");
const { buildEnvStatus, buildPortableIntegrationBundle, buildRequiredChecks } = require("../lib/integration-kit/config");

loadPreferredEnvFiles(process.cwd(), process.env);

const requiredChecks = buildRequiredChecks(process.env);
const missingRequired = requiredChecks.filter((item) => !item.present);
const bundle = buildPortableIntegrationBundle(process.env);

const report = {
  ok: missingRequired.length === 0,
  generatedAt: new Date().toISOString(),
  requiredChecks,
  missingRequired: missingRequired.map((item) => item.key),
  diagnostics: buildFreshworksDiagnostics(process.env),
  envStatus: buildEnvStatus(process.env),
  exportedFiles: Object.keys(bundle.files),
  nextSteps: missingRequired.length
    ? [
        "Preencha as variaveis obrigatorias ausentes.",
        "Gere a authorize URL com `npm run integration:authorize-url`.",
        "Revise os field mappings antes de rodar o init.",
      ]
    : [
        "Rodar `npm run integration:export-config` para materializar o bundle.",
        "Aplicar migrations do Supabase no novo projeto.",
        "Executar o checklist do docs/setup-integration-kit.md.",
      ],
};

console.log(JSON.stringify(report, null, 2));
