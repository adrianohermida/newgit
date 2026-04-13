"use strict";

const fs = require("fs");
const path = require("path");

const { cleanValue, formatEnvFile } = require("./env");
const { buildAuthorizeUrl } = require("./freshworks");
const {
  ENV_DEFINITIONS,
  buildPortableIntegrationBundle,
  buildWorkspaceSlug,
} = require("./config");

function getSetupRoot(cwd = process.cwd()) {
  return path.join(cwd, "setup", "integration-kit");
}

function getSetupSecretsPath(cwd = process.cwd()) {
  return path.join(getSetupRoot(cwd), "setup.secrets.json");
}

function getSetupTemplatePath(cwd = process.cwd()) {
  return path.join(getSetupRoot(cwd), "setup.template.json");
}

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Falha ao ler JSON em ${filePath}: ${error.message}`);
  }
}

function buildEnvFromSetupFile(setup = {}, baseEnv = process.env) {
  const env = { ...baseEnv };
  const envEntries = setup.env && typeof setup.env === "object" ? setup.env : {};

  for (const [key, value] of Object.entries(envEntries)) {
    if (value === null || value === undefined) continue;
    env[key] = String(value);
  }

  const project = setup.project || {};
  if (cleanValue(project.slug)) env.INTEGRATION_WORKSPACE_SLUG = String(project.slug);
  if (cleanValue(project.vertical)) env.INTEGRATION_VERTICAL = String(project.vertical);
  if (cleanValue(project.packageName)) env.INTEGRATION_KIT_NAME = String(project.packageName);

  return env;
}

function ensureSetupStructure(cwd = process.cwd()) {
  const root = getSetupRoot(cwd);
  const templatesDir = path.join(root, "templates");
  const generatedDir = path.join(root, "generated");
  const localOpsDir = path.join(root, "local-ops");

  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(templatesDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.mkdirSync(localOpsDir, { recursive: true });

  return { root, templatesDir, generatedDir, localOpsDir };
}

function buildSetupTemplateObject() {
  return {
    project: {
      slug: "novo-workspace",
      vertical: "servicos",
      packageName: "freshworks-supabase-starter",
    },
    env: {
      SUPABASE_URL: "https://seu-projeto.supabase.co",
      SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      SUPABASE_SERVICE_ROLE_KEY: "",
      SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_URL: "https://seu-projeto.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      GITHUB_REPO_OWNER: "sua-org",
      GITHUB_REPO_NAME: "seu-repo",
      GITHUB_DEFAULT_BRANCH: "main",
      GITHUB_APP_INSTALLATION_ID: "",
      FRESHWORKS_ORG_BASE_URL: "https://sua-org.myfreshworks.com",
      FRESHSALES_API_BASE: "https://sua-org.myfreshworks.com/crm/sales/api",
      FRESHSALES_OAUTH_CLIENT_ID: "",
      FRESHSALES_OAUTH_CLIENT_SECRET: "",
      FRESHSALES_REFRESH_TOKEN: "",
      FRESHSALES_CONTACTS_REFRESH_TOKEN: "",
      FRESHSALES_CONTACTS_ACCESS_TOKEN: "",
      FRESHSALES_CONTACTS_SCOPES: "freshsales.contacts.view freshsales.contacts.create freshsales.contacts.edit freshsales.contacts.upsert freshsales.contacts.delete freshsales.contacts.fields.view freshsales.contacts.activities.view freshsales.contacts.filters.view",
      FRESHSALES_SCOPES: "freshsales.deals.view freshsales.deals.create freshsales.contacts.view freshsales.contacts.create freshsales.settings.fields.view",
      FRESHDESK_DOMAIN: "https://sua-conta.freshdesk.com",
      FRESHDESK_API_KEY: "",
      FRESHDESK_PORTAL_TICKET_BASE_URL: "https://sua-conta.freshdesk.com/support/tickets",
      FRESHDESK_NEW_TICKET_URL: "https://sua-conta.freshdesk.com/support/tickets/new",
      NEXT_PUBLIC_FRESHWORKS_WIDGET_SCRIPT_URL: "//fw-cdn.com/seu-widget.js",
      NEXT_PUBLIC_FRESHWORKS_WIDGET_CHAT: "false",
    },
  };
}

function buildCanonicalProductsTemplate() {
  return [
    {
      name: "Honorarios Unitarios",
      category: "honorarios",
      billing_type: "unitario",
      currency: "BRL",
      late_fee_percent_default: 10,
      interest_percent_month_default: 1,
      monetary_index_default: "IGP-M",
      status: "active",
    },
    {
      name: "Honorarios Recorrentes",
      category: "honorarios",
      billing_type: "recorrente",
      currency: "BRL",
      late_fee_percent_default: 10,
      interest_percent_month_default: 1,
      monetary_index_default: "IGP-M",
      status: "active",
    },
    {
      name: "Parcela Contratual",
      category: "parcelamento",
      billing_type: "parcelado",
      currency: "BRL",
      late_fee_percent_default: 10,
      interest_percent_month_default: 1,
      monetary_index_default: "IGP-M",
      status: "active",
    },
    {
      name: "Fatura Avulsa",
      category: "fatura",
      billing_type: "unitario",
      currency: "BRL",
      late_fee_percent_default: 10,
      interest_percent_month_default: 1,
      monetary_index_default: "IGP-M",
      status: "active",
    },
    {
      name: "Despesa do Cliente",
      category: "despesa",
      billing_type: "reembolso",
      currency: "BRL",
      late_fee_percent_default: 0,
      interest_percent_month_default: 0,
      monetary_index_default: "IGP-M",
      status: "active",
    },
    {
      name: "Encargos de Atraso",
      category: "encargos",
      billing_type: "encargo",
      currency: "BRL",
      late_fee_percent_default: 10,
      interest_percent_month_default: 1,
      monetary_index_default: "IGP-M",
      status: "active",
    },
  ];
}

function buildLocalOpsReadme() {
  return [
    "# Local Ops Backend",
    "",
    "Este pacote e opcional. Use apenas quando quiser habilitar o backend local do integration kit em uma maquina operacional controlada.",
    "",
    "O frontend portatil continua funcionando sem esta pasta.",
    "",
    "## O que este pacote habilita",
    "",
    "- Salvar `setup.secrets.json` no repo local via UI",
    "- Executar `validate`, `bootstrap`, `go`, `sync` e `ops` pela UI",
    "- Manter o frontend estatico separado do backend local",
    "",
    "## Variaveis obrigatorias",
    "",
    "- `INTEGRATION_KIT_ALLOW_SERVER_FILE_WRITE=true`",
    "- `INTEGRATION_KIT_COMMAND_RUNNER_ENABLED=true`",
    "",
    "## Variavel opcional e sensivel",
    "",
    "- `INTEGRATION_KIT_COMMAND_RUNNER_ALLOW_PRODUCTION=true`",
    "  Use apenas se houver um motivo operacional muito claro e temporario.",
    "",
    "## Sequencia sugerida",
    "",
    "1. Copiar `.env.local-ops.example` para o ambiente local da maquina operacional",
    "2. Rodar `run-validate.cmd` ou `run-validate.ps1`",
    "3. Rodar `run-bootstrap.cmd` ou `run-bootstrap.ps1`",
    "4. So depois disso considerar `run-go.*`, `run-sync.*` ou `run-ops.*`",
    "",
    "## Regras",
    "",
    "- Nunca expor esse backend em deploy estatico",
    "- Nunca persistir `setup.secrets.json` fora de runtime local explicito",
    "- Nunca habilitar o runner web em producao por padrao",
    "",
  ].join("\n");
}

function buildLocalOpsEnvExample() {
  return [
    "# Backend local opcional para o integration kit",
    "INTEGRATION_KIT_ALLOW_SERVER_FILE_WRITE=true",
    "INTEGRATION_KIT_COMMAND_RUNNER_ENABLED=true",
    "# INTEGRATION_KIT_COMMAND_RUNNER_ALLOW_PRODUCTION=false",
    "",
  ].join("\n");
}

function buildReplicationChecklist() {
  return [
    "# Replication Checklist",
    "",
    "Use este checklist para replicar o kit em um repo novo, um Supabase novo e contas novas do Freshsales Suite e Freshdesk.",
    "",
    "## 1. Novo repositorio",
    "",
    "- Copiar a pasta `setup/integration-kit/` para o novo repositorio",
    "- Confirmar que os scripts `integration:*` estao presentes no `package.json`",
    "- Confirmar que as rotas e telas do setup foram copiadas se o projeto usar o frontend interno",
    "- Definir owner, repo e branch padrao no setup",
    "",
    "## 2. Novo projeto Supabase",
    "",
    "- Criar o projeto no Supabase",
    "- Copiar `SUPABASE_URL`",
    "- Copiar `SUPABASE_PROJECT_REF`",
    "- Gerar `SUPABASE_SERVICE_ROLE_KEY`",
    "- Gerar `SUPABASE_ANON_KEY`",
    "- Revisar a redirect URI usada no OAuth",
    "- Rodar `npm run integration:go` apenas apos validate/bootstrap",
    "",
    "## 3. Nova conta GitHub / contexto MCP",
    "",
    "- Preencher `GITHUB_REPO_OWNER`",
    "- Preencher `GITHUB_REPO_NAME`",
    "- Preencher `GITHUB_DEFAULT_BRANCH`",
    "- Se houver GitHub App/MCP, preencher `GITHUB_APP_INSTALLATION_ID`",
    "- Revisar `mcp.config.json`, `.mcp.json` e `local-ops-manifest.json`",
    "",
    "## 4. Nova conta Freshsales Suite",
    "",
    "- Confirmar `FRESHWORKS_ORG_BASE_URL`",
    "- Confirmar `FRESHSALES_API_BASE`",
    "- Criar um app OAuth",
    "- Copiar `FRESHSALES_OAUTH_CLIENT_ID`",
    "- Copiar `FRESHSALES_OAUTH_CLIENT_SECRET`",
    "- Gerar a authorize URL",
    "- Autorizar a conta",
    "- Trocar o code por refresh token",
    "- Salvar `FRESHSALES_REFRESH_TOKEN`",
    "- Salvar `FRESHSALES_CONTACTS_REFRESH_TOKEN` quando houver app OAuth separado para contacts",
    "- Validar scopes exigidos",
    "",
    "## 5. Nova conta Freshdesk",
    "",
    "- Confirmar `FRESHDESK_DOMAIN`",
    "- Gerar `FRESHDESK_API_KEY`",
    "- Confirmar `FRESHDESK_PORTAL_TICKET_BASE_URL`",
    "- Confirmar `FRESHDESK_NEW_TICKET_URL`",
    "",
    "## 6. Frontend estatico vs backend local",
    "",
    "- Em Cloudflare Pages puro, usar apenas preview, checklist e downloads locais",
    "- Para salvar setup no repo e executar comandos pela UI, usar `setup/integration-kit/local-ops/`",
    "- Nunca expor o backend local opcional em producao por padrao",
    "",
    "## 7. Ordem recomendada",
    "",
    "1. Preencher `setup.secrets.json`",
    "2. Rodar `npm run integration:validate`",
    "3. Rodar `npm run integration:bootstrap`",
    "4. Revisar `credential-checklist.json`",
    "5. Revisar `local-ops-manifest.json`",
    "6. Revisar `authorize-url.json`",
    "7. Rodar `npm run integration:go`",
    "8. Rodar `npm run integration:seed-products`",
    "9. Rodar `npm run integration:sync`",
    "",
    "## 8. Gates finais antes de producao",
    "",
    "- Confirmar que nenhum secret foi commitado",
    "- Confirmar que `setup.secrets.json` esta fora do versionamento",
    "- Confirmar que o runner web nao esta habilitado em producao",
    "- Confirmar que `go` e `ops` continuam exigindo confirmacao explicita",
    "- Confirmar que o bootstrap falha fechado sem setup file, exceto com `--allow-ambient-env`",
    "",
  ].join("\n");
}

function buildHandoffSummary() {
  return [
    "# Handoff Summary",
    "",
    "Este repositorio contem um kit reutilizavel para onboarding e operacao da integracao entre Supabase, Freshsales Suite e Freshdesk.",
    "",
    "## O que ja esta pronto",
    "",
    "- Wizard de setup para coleta de credenciais e geracao de arquivos",
    "- Preview portatil que funciona ate em frontend estatico",
    "- Bundle com config, mappings, checklist e manifesto operacional",
    "- Backend local opcional para salvar setup no repo e executar comandos via UI",
    "- Guardrails para evitar vazamento entre projetos e uso inseguro de secrets",
    "",
    "## Onde comecar",
    "",
    "- Ler `setup/integration-kit/README.md`",
    "- Ler `setup/integration-kit/replication-checklist.md`",
    "- Se precisar de backend local, ler `setup/integration-kit/local-ops/README.md`",
    "- Usar `/interno/setup-integracao` para gerar o setup inicial",
    "",
    "## Fluxo minimo",
    "",
    "1. Preencher e baixar `setup.secrets.json`",
    "2. Rodar `npm run integration:validate`",
    "3. Rodar `npm run integration:bootstrap`",
    "4. Revisar os arquivos gerados em `setup/integration-kit/generated/<workspace>`",
    "5. Concluir OAuth do Freshsales com `authorize-url.json`",
    "6. Rodar `npm run integration:go` e depois `npm run integration:sync`",
    "",
    "## Regras criticas",
    "",
    "- Nao commitar `setup.secrets.json`",
    "- Nao habilitar runner web em producao por padrao",
    "- Nao usar persistencia server-side de secrets fora de runtime local explicito",
    "- O bootstrap deve falhar sem setup file, exceto com `--allow-ambient-env`",
    "",
    "## Entregaveis do kit",
    "",
    "- `integration.config.json`",
    "- `field-mapping.json`",
    "- `business-rules.json`",
    "- `mcp.config.json`",
    "- `.mcp.json`",
    "- `credential-checklist.json`",
    "- `local-ops-manifest.json`",
    "- `replication-checklist.md`",
    "",
    "## Objetivo final",
    "",
    "Permitir replicacao rapida para novos nichos e novos clientes sem reescrever a integracao e sem depender de memoria tribal da equipe.",
    "",
  ].join("\n");
}

function buildLocalOpsScript(command) {
  return [
    '$ErrorActionPreference = "Stop"',
    'Set-Location -LiteralPath (Resolve-Path "$PSScriptRoot\\..\\..\\..")',
    `npm run ${command}`,
    "",
  ].join("\n");
}

function buildLocalOpsCmd(command) {
  return [
    "@echo off",
    'cd /d "%~dp0\\..\\..\\.."',
    `npm run ${command}`,
    "",
  ].join("\n");
}

function materializeSetupTemplates(cwd = process.cwd()) {
  const { root, templatesDir, localOpsDir } = ensureSetupStructure(cwd);
  const templatePath = getSetupTemplatePath(cwd);
  const envTemplatePath = path.join(templatesDir, ".env.bootstrap.example");
  const canonicalProductsPath = path.join(templatesDir, "canonical-products.json");
  const readmePath = path.join(root, "README.md");
  const localOpsReadmePath = path.join(localOpsDir, "README.md");
  const localOpsEnvPath = path.join(localOpsDir, ".env.local-ops.example");
  const replicationChecklistPath = path.join(root, "replication-checklist.md");
  const handoffSummaryPath = path.join(root, "handoff-summary.md");
  const localOpsFiles = [
    { path: path.join(localOpsDir, "run-validate.ps1"), content: buildLocalOpsScript("integration:validate") },
    { path: path.join(localOpsDir, "run-bootstrap.ps1"), content: buildLocalOpsScript("integration:bootstrap") },
    { path: path.join(localOpsDir, "run-go.ps1"), content: buildLocalOpsScript("integration:go") },
    { path: path.join(localOpsDir, "run-sync.ps1"), content: buildLocalOpsScript("integration:sync") },
    { path: path.join(localOpsDir, "run-ops.ps1"), content: buildLocalOpsScript("integration:ops") },
    { path: path.join(localOpsDir, "run-validate.cmd"), content: buildLocalOpsCmd("integration:validate") },
    { path: path.join(localOpsDir, "run-bootstrap.cmd"), content: buildLocalOpsCmd("integration:bootstrap") },
    { path: path.join(localOpsDir, "run-go.cmd"), content: buildLocalOpsCmd("integration:go") },
    { path: path.join(localOpsDir, "run-sync.cmd"), content: buildLocalOpsCmd("integration:sync") },
    { path: path.join(localOpsDir, "run-ops.cmd"), content: buildLocalOpsCmd("integration:ops") },
  ];

  if (!fs.existsSync(templatePath)) {
    fs.writeFileSync(templatePath, `${JSON.stringify(buildSetupTemplateObject(), null, 2)}\n`, "utf8");
  }

  if (!fs.existsSync(envTemplatePath)) {
    fs.writeFileSync(envTemplatePath, formatEnvFile(ENV_DEFINITIONS, buildSetupTemplateObject().env), "utf8");
  }

  if (!fs.existsSync(canonicalProductsPath)) {
    fs.writeFileSync(canonicalProductsPath, `${JSON.stringify(buildCanonicalProductsTemplate(), null, 2)}\n`, "utf8");
  }

  if (!fs.existsSync(readmePath)) {
    const readme = [
      "# Setup Integration Kit",
      "",
      "- Preencha `setup.secrets.json` a partir de `setup.template.json`.",
      "- Ou use a tela `/interno/setup-integracao` para gerar o arquivo localmente.",
      "- Depois rode `npm run integration:bootstrap`.",
      "",
      "Arquivos importantes:",
      "",
      "- `setup.template.json`: modelo versionado.",
      "- `setup.secrets.json`: arquivo local com segredos reais. Nao commitar.",
      "- `generated/`: saida do bootstrap guiado.",
      "",
    ].join("\n");
    fs.writeFileSync(readmePath, `${readme}\n`, "utf8");
  }

  if (!fs.existsSync(localOpsReadmePath)) {
    fs.writeFileSync(localOpsReadmePath, `${buildLocalOpsReadme()}\n`, "utf8");
  }

  if (!fs.existsSync(localOpsEnvPath)) {
    fs.writeFileSync(localOpsEnvPath, buildLocalOpsEnvExample(), "utf8");
  }

  if (!fs.existsSync(replicationChecklistPath)) {
    fs.writeFileSync(replicationChecklistPath, `${buildReplicationChecklist()}\n`, "utf8");
  }

  if (!fs.existsSync(handoffSummaryPath)) {
    fs.writeFileSync(handoffSummaryPath, `${buildHandoffSummary()}\n`, "utf8");
  }

  for (const file of localOpsFiles) {
    if (!fs.existsSync(file.path)) {
      fs.writeFileSync(file.path, file.content, "utf8");
    }
  }

  return {
    root,
    templatesDir,
    localOpsDir,
    templatePath,
    envTemplatePath,
    canonicalProductsPath,
    readmePath,
    localOpsReadmePath,
    localOpsEnvPath,
    replicationChecklistPath,
    handoffSummaryPath,
  };
}

function writeBootstrapOutputs(env, cwd = process.cwd()) {
  const { generatedDir } = ensureSetupStructure(cwd);
  const workspaceSlug = buildWorkspaceSlug(env);
  const bundle = buildPortableIntegrationBundle(env);
  const authorize = buildAuthorizeUrl(env, "freshsales");
  const outputDir = path.join(generatedDir, workspaceSlug);

  fs.mkdirSync(outputDir, { recursive: true });

  const files = Object.fromEntries(Object.entries(bundle.files).map(([fileName, content]) => [
    fileName,
    JSON.stringify(content, null, 2),
  ]));

  Object.assign(files, {
    ".env.bootstrap": formatEnvFile(ENV_DEFINITIONS, env),
    "bundle.json": JSON.stringify(bundle, null, 2),
    "authorize-url.json": JSON.stringify(authorize, null, 2),
  });

  const canonicalProductsPath = path.join(getSetupRoot(cwd), "templates", "canonical-products.json");
  if (fs.existsSync(canonicalProductsPath)) {
    files["canonical-products.json"] = fs.readFileSync(canonicalProductsPath, "utf8").trim();
  }

  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outputDir, fileName), `${content}\n`, "utf8");
  }

  return { outputDir, files: Object.keys(files), workspaceSlug, authorize, bundle };
}

function buildSetupPreview(setup = {}, baseEnv = process.env) {
  const env = buildEnvFromSetupFile(setup, baseEnv);
  const bundle = buildPortableIntegrationBundle(env);
  const authorize = buildAuthorizeUrl(env, "freshsales");

  return {
    env,
    bundle,
    authorize,
    envBootstrap: formatEnvFile(ENV_DEFINITIONS, env),
    credentialChecklist: bundle.files["credential-checklist.json"] || [],
    setupFile: {
      project: setup.project || {},
      env: setup.env || {},
    },
  };
}

module.exports = {
  buildSetupPreview,
  buildEnvFromSetupFile,
  ensureSetupStructure,
  getSetupRoot,
  getSetupSecretsPath,
  materializeSetupTemplates,
  readJsonFile,
  writeBootstrapOutputs,
};
