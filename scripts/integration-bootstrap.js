#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { loadPreferredEnvFiles } = require("../lib/integration-kit/env");
const { buildRequiredChecks } = require("../lib/integration-kit/config");
const {
  buildEnvFromSetupFile,
  getSetupSecretsPath,
  materializeSetupTemplates,
  readJsonFile,
  writeBootstrapOutputs,
} = require("../lib/integration-kit/bootstrap");

loadPreferredEnvFiles(process.cwd(), process.env);

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32",
    ...options,
  });

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    command: [command, ...args].join(" "),
  };
}

function main() {
  const args = process.argv.slice(2);
  const executeSupabase = args.includes("--execute-supabase");
  const allowAmbientEnv = args.includes("--allow-ambient-env");
  const setupPathArg = args.find((item) => item.startsWith("--setup="));
  const setupFilePath = setupPathArg
    ? path.resolve(process.cwd(), setupPathArg.split("=")[1])
    : getSetupSecretsPath(process.cwd());

  const templates = materializeSetupTemplates(process.cwd());
  const setupJson = readJsonFile(setupFilePath);
  const usedAmbientEnvFallback = !setupJson && allowAmbientEnv;
  if (!setupJson && !allowAmbientEnv) {
    console.log(JSON.stringify({
      ok: false,
      generatedAt: new Date().toISOString(),
      setupFilePath,
      setupFilePresent: false,
      templates,
      error: "setup.secrets.json ausente. Salve o setup pela UI ou use --allow-ambient-env conscientemente.",
      nextSteps: [
        "Preencha e salve setup/integration-kit/setup.secrets.json.",
        "Ou rode novamente com --allow-ambient-env se quiser reutilizar o ambiente atual de forma explícita.",
      ],
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  const env = buildEnvFromSetupFile(setupJson || {}, process.env);
  const requiredChecks = buildRequiredChecks(env);
  const missingRequired = requiredChecks.filter((item) => !item.present);
  const output = writeBootstrapOutputs(env, process.cwd());

  const commands = [];
  if (executeSupabase && missingRequired.length === 0) {
    commands.push(runCommand("npx", ["supabase", "db", "push"]));
    commands.push(runCommand("npx", ["supabase", "functions", "deploy", "oauth"]));
    commands.push(runCommand("npx", ["supabase", "functions", "deploy", "freshworksAuthorizeUrlProbe"]));
    commands.push(runCommand("npx", ["supabase", "functions", "deploy", "freshworksOauthExchangeProbe"]));
  }

  const report = {
    ok: missingRequired.length === 0 && commands.every((item) => item.ok),
    generatedAt: new Date().toISOString(),
    setupFilePath,
    setupFilePresent: Boolean(setupJson && fs.existsSync(setupFilePath)),
    allowAmbientEnv,
    usedAmbientEnvFallback,
    templates,
    requiredChecks,
    missingRequired: missingRequired.map((item) => item.key),
    outputDir: output.outputDir,
    generatedFiles: output.files,
    authorizeUrlOk: Boolean(output.authorize?.ok),
    executeSupabase,
    commandResults: commands,
    nextSteps: missingRequired.length
      ? [
          "Preencha setup/integration-kit/setup.secrets.json ou use a tela /interno/setup-integracao.",
          "Rode novamente `npm run integration:bootstrap`.",
        ]
      : usedAmbientEnvFallback
      ? [
          "Bootstrap executado com --allow-ambient-env. Revise as credenciais para evitar reaproveitamento acidental entre projetos.",
          "Prefira salvar um setup/integration-kit/setup.secrets.json dedicado antes de seguir para ambientes novos.",
        ]
      : executeSupabase
      ? [
          "Validar no Supabase se migrations e edge functions subiram corretamente.",
          "Abrir authorize-url.json e concluir a autorização OAuth no Freshworks.",
        ]
      : [
          "Rode `npm run integration:go` para aplicar migrations e publicar edge functions.",
          "Abra o arquivo authorize-url.json gerado para concluir o OAuth da nova conta.",
        ],
  };

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

main();
