"use strict";

const { cleanValue } = require("./env");
const { buildFreshworksDiagnostics } = require("./freshworks");
const { ENV_DEFINITIONS } = require("./config-definitions");
const {
  buildBusinessRulesConfig,
  buildDotMcpFile,
  buildFieldMappingConfig,
  buildIntegrationConfig,
  buildMcpConfigFile,
  buildWorkspaceSlug,
} = require("./config-builders");

function buildCredentialChecklist(env = process.env) {
  return [
    { system: "Supabase", item: "Criar projeto e obter project ref", present: Boolean(cleanValue(env.SUPABASE_PROJECT_REF)), help: "Usado para gerar mcp.config.json e conectar o MCP do Supabase." },
    { system: "Supabase", item: "Service role key", present: Boolean(cleanValue(env.SUPABASE_SERVICE_ROLE_KEY)), help: "Necessaria para bootstrap, sync e admin APIs." },
    { system: "GitHub", item: "Owner e repo", present: Boolean(cleanValue(env.GITHUB_REPO_OWNER) && cleanValue(env.GITHUB_REPO_NAME)), help: "Usado para contextualizar integracoes GitHub/MCP e documentacao operacional." },
    { system: "Freshsales", item: "Criar app OAuth e gerar client id/client secret", present: Boolean(cleanValue(env.FRESHSALES_OAUTH_CLIENT_ID) && cleanValue(env.FRESHSALES_OAUTH_CLIENT_SECRET)), help: "No Freshsales Suite, criar app OAuth e copiar client id/client secret." },
    { system: "Freshsales", item: "Concluir authorize URL e obter refresh token", present: Boolean(cleanValue(env.FRESHSALES_REFRESH_TOKEN)), help: "Usar authorize-url.json para obter o code e trocar por refresh token." },
    { system: "Freshsales Contacts", item: "Concluir authorize URL de contacts e obter refresh token segmentado", present: Boolean(cleanValue(env.FRESHSALES_CONTACTS_REFRESH_TOKEN)), help: "Necessario para reconciliar partes e popular o espelho freshsales_contacts sem fallback." },
    { system: "Freshdesk", item: "Gerar API key", present: Boolean(cleanValue(env.FRESHDESK_API_KEY)), help: "Gerar API key do agente/admin e preencher FRESHDESK_API_KEY." },
  ];
}

function buildLocalOpsManifest(env = process.env) {
  return {
    mode: "optional-local-ops-backend",
    summary: "Frontend portatil pode rodar sozinho; backend local e opcional para salvar setup no repo e executar comandos operacionais.",
    requiredRuntime: { type: "desktop-local", cwdPrefixes: ["C:\\", "D:\\"], envHints: ["APPDATA", "LOCALAPPDATA"] },
    flags: {
      saveSetup: { env: "INTEGRATION_KIT_ALLOW_SERVER_FILE_WRITE", requiredValue: "true" },
      runCommands: { env: "INTEGRATION_KIT_COMMAND_RUNNER_ENABLED", requiredValue: "true" },
      allowProductionRunner: { env: "INTEGRATION_KIT_COMMAND_RUNNER_ALLOW_PRODUCTION", requiredValue: "true", optional: true },
    },
    endpoints: [
      { path: "/api/admin-integration-kit-preview", purpose: "enriquecer preview com capacidades do runtime e checks reais" },
      { path: "/api/admin-integration-kit-save-setup", purpose: "salvar setup.secrets.json no workspace local" },
      { path: "/api/admin-integration-kit-run", purpose: "executar validate/bootstrap/go/sync/ops em runtime local" },
      { path: "/api/admin-integration-kit-export", purpose: "exportar bundle baseado no ambiente real do projeto" },
    ],
    commands: ["npm run integration:validate", "npm run integration:bootstrap", "npm run integration:go", "npm run integration:sync", "npm run integration:ops"],
    securityRules: ["Nunca habilitar runner web por padrao em producao.", "Nunca persistir setup.secrets.json server-side fora de runtime local explicito.", "Bootstrap deve falhar fechado sem setup.secrets.json, exceto com --allow-ambient-env.", "Acoes destrutivas exigem confirmacao explicita na interface."],
    githubCloudflareGuidance: ["Em Cloudflare Pages puro, usar apenas o frontend portatil e downloads locais.", "Operacoes locais devem ser executadas via terminal ou backend local controlado.", "Manter secrets fora do repositorio e fora de storage serverless efemero."],
    repoContext: { owner: cleanValue(env.GITHUB_REPO_OWNER), repo: cleanValue(env.GITHUB_REPO_NAME), defaultBranch: cleanValue(env.GITHUB_DEFAULT_BRANCH) || "main" },
  };
}

function buildEnvStatus(env = process.env) {
  return ENV_DEFINITIONS.map((definition) => ({ key: definition.key, group: definition.group, required: Boolean(definition.required), secret: Boolean(definition.secret), present: Boolean(cleanValue(env[definition.key])) }));
}

function buildRequiredChecks(env = process.env) {
  return [
    { key: "SUPABASE_URL", label: "Supabase URL" },
    { key: "SUPABASE_PROJECT_REF", label: "Supabase project ref" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role key" },
    { key: "GITHUB_REPO_OWNER", label: "GitHub repo owner" },
    { key: "GITHUB_REPO_NAME", label: "GitHub repo name" },
    { key: "FRESHSALES_OAUTH_CLIENT_ID", label: "Freshworks client id" },
    { key: "FRESHSALES_OAUTH_CLIENT_SECRET", label: "Freshworks client secret" },
    { key: "FRESHDESK_DOMAIN", label: "Freshdesk domain" },
  ].map((item) => ({ ...item, present: Boolean(cleanValue(env[item.key])) }));
}

function buildPortableIntegrationBundle(env = process.env) {
  const workspaceSlug = buildWorkspaceSlug(env);
  return {
    generatedAt: new Date().toISOString(),
    workspaceSlug,
    diagnostics: buildFreshworksDiagnostics(env),
    setupChecklist: [
      "Criar um novo projeto Supabase e aplicar as migrations do diretorio supabase/migrations.",
      "Cadastrar as variaveis do Freshworks, Freshdesk e Freshchat no ambiente local e no deploy.",
      "Gerar a authorize URL OAuth, autorizar a conta e persistir o refresh token.",
      "Revisar os field mappings exportados e ajustar ids de owner, stage e pipeline para a nova conta.",
      "Executar o doctor e depois o init para validar o ambiente antes de sincronizar dados reais.",
    ],
    files: {
      "integration.config.json": buildIntegrationConfig(env),
      "field-mapping.json": buildFieldMappingConfig(env),
      "business-rules.json": buildBusinessRulesConfig(env),
      "mcp.config.json": buildMcpConfigFile(env),
      ".mcp.json": buildDotMcpFile(env),
      "credential-checklist.json": buildCredentialChecklist(env),
      "local-ops-manifest.json": buildLocalOpsManifest(env),
    },
  };
}

module.exports = {
  buildCredentialChecklist,
  buildEnvStatus,
  buildLocalOpsManifest,
  buildPortableIntegrationBundle,
  buildRequiredChecks,
};
