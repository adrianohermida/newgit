#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { loadPreferredEnvFiles } = require("../lib/integration-kit/env");
const { buildPortableIntegrationBundle, buildRequiredChecks } = require("../lib/integration-kit/config");

loadPreferredEnvFiles(process.cwd(), process.env);

const bundle = buildPortableIntegrationBundle(process.env);
const requiredChecks = buildRequiredChecks(process.env);
const missingRequired = requiredChecks.filter((item) => !item.present);
const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
const migrations = fs.existsSync(migrationsDir)
  ? fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort()
  : [];

const report = {
  ok: missingRequired.length === 0,
  generatedAt: new Date().toISOString(),
  workspaceSlug: bundle.workspaceSlug,
  missingRequired: missingRequired.map((item) => item.key),
  migrations,
  commands: {
    doctor: "npm run integration:doctor",
    exportConfig: "npm run integration:export-config",
    authorizeUrl: "npm run integration:authorize-url",
    supabaseDbPush: "supabase db push",
    supabaseFunctionsDeploy: "supabase functions deploy oauth freshworksAuthorizeUrlProbe freshworksOauthExchangeProbe",
  },
  summary: missingRequired.length
    ? "Preencha as variaveis obrigatorias antes de continuar com o bootstrap."
    : "Ambiente minimo presente. Pode seguir para migrations, deploy das edge functions e autorizacao OAuth.",
};

console.log(JSON.stringify(report, null, 2));
if (missingRequired.length) {
  process.exitCode = 1;
}
