"use strict";

const { cleanValue, parseJsonEnv, toEnvKey } = require("./env");
const { buildFreshworksDiagnostics, resolveFreshworksConfig, resolveFreshworksRedirectUri, resolveFreshworksScopes } = require("./freshworks");

const ENV_DEFINITIONS = [
  { key: "INTEGRATION_KIT_NAME", group: "Integration Kit", description: "Nome curto do pacote replicavel.", placeholder: "freshworks-supabase-starter" },
  { key: "INTEGRATION_WORKSPACE_SLUG", group: "Integration Kit", description: "Slug do workspace ou nicho atual.", placeholder: "meu-workspace" },
  { key: "INTEGRATION_VERTICAL", group: "Integration Kit", description: "Vertical do projeto que sera replicado.", placeholder: "servicos" },
  { key: "SUPABASE_URL", group: "Supabase", description: "URL do projeto Supabase.", placeholder: "https://seu-projeto.supabase.co" },
  { key: "SUPABASE_PROJECT_REF", group: "Supabase", description: "Project ref usado no MCP do Supabase.", placeholder: "abcdefghijklmnopqrst" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", group: "Supabase", description: "Service role para bootstrap, sync e admin APIs.", secret: true },
  { key: "SUPABASE_ANON_KEY", group: "Supabase", description: "Chave anonima usada no frontend.", secret: true },
  { key: "NEXT_PUBLIC_SUPABASE_URL", group: "Supabase", description: "Alias frontend da URL do Supabase.", placeholder: "https://seu-projeto.supabase.co" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", group: "Supabase", description: "Alias frontend da anon key.", secret: true },
  { key: "GITHUB_REPO_OWNER", group: "GitHub", description: "Owner da organizacao ou usuario do repositorio.", placeholder: "sua-org" },
  { key: "GITHUB_REPO_NAME", group: "GitHub", description: "Nome do repositorio alvo.", placeholder: "seu-repo" },
  { key: "GITHUB_DEFAULT_BRANCH", group: "GitHub", description: "Branch principal padrao.", placeholder: "main" },
  { key: "GITHUB_APP_INSTALLATION_ID", group: "GitHub", description: "Opcional para integrações GitHub App/MCP.", placeholder: "12345678" },
  { key: "FRESHWORKS_ORG_BASE_URL", group: "Freshworks", description: "Base principal da org no Freshworks.", placeholder: "https://sua-org.myfreshworks.com" },
  { key: "FRESHSALES_API_BASE", group: "Freshworks", description: "Base do CRM Sales API.", placeholder: "https://sua-org.myfreshworks.com/crm/sales/api" },
  { key: "FRESHSALES_API_KEY", group: "Freshworks", description: "Token legado do Freshsales, opcional quando usar OAuth.", secret: true },
  { key: "FRESHSALES_OAUTH_CLIENT_ID", group: "Freshworks", description: "Client id OAuth do Freshsales/Freshworks.", secret: true },
  { key: "FRESHSALES_OAUTH_CLIENT_SECRET", group: "Freshworks", description: "Client secret OAuth do Freshsales/Freshworks.", secret: true },
  { key: "FRESHSALES_REFRESH_TOKEN", group: "Freshworks", description: "Refresh token para automatizar syncs.", secret: true },
  { key: "FRESHSALES_ACCESS_TOKEN", group: "Freshworks", description: "Access token opcional para diagnostico manual.", secret: true },
  { key: "FRESHSALES_REDIRECT_URI", group: "Freshworks", description: "Callback OAuth. Se vazio, usa a Edge Function /functions/v1/oauth.", placeholder: "" },
  { key: "FRESHSALES_SCOPES", group: "Freshworks", description: "Scopes OAuth do Freshsales.", placeholder: "freshsales.deals.view freshsales.deals.create freshsales.contacts.view freshsales.contacts.create freshsales.settings.fields.view" },
  { key: "FRESHDESK_DOMAIN", group: "Freshdesk", description: "Dominio/base da conta Freshdesk.", placeholder: "https://sua-conta.freshdesk.com" },
  { key: "FRESHDESK_API_KEY", group: "Freshdesk", description: "API key do Freshdesk.", secret: true },
  { key: "FRESHDESK_PORTAL_TICKET_BASE_URL", group: "Freshdesk", description: "Base para links de tickets no portal.", placeholder: "https://sua-conta.freshdesk.com/support/tickets" },
  { key: "FRESHDESK_NEW_TICKET_URL", group: "Freshdesk", description: "URL do formulario novo ticket.", placeholder: "https://sua-conta.freshdesk.com/support/tickets/new" },
  { key: "FRESHCHAT_API_BASE", group: "Freshchat", description: "Base API do Freshchat.", placeholder: "https://msdk.eu.freshchat.com" },
  { key: "FRESHCHAT_API_KEY", group: "Freshchat", description: "API key do Freshchat quando aplicavel.", secret: true },
  { key: "FRESHCHAT_APP_TOKEN", group: "Freshchat", description: "App token do Freshchat.", secret: true },
  { key: "NEXT_PUBLIC_FRESHWORKS_WIDGET_SCRIPT_URL", group: "Frontend", description: "Script embed do widget Freshworks.", placeholder: "//fw-cdn.com/seu-widget.js" },
  { key: "NEXT_PUBLIC_FRESHWORKS_WIDGET_CHAT", group: "Frontend", description: "Habilita o widget de chat.", placeholder: "false" },
];

function buildWorkspaceSlug(env = process.env) {
  return (
    cleanValue(env.INTEGRATION_WORKSPACE_SLUG) ||
    cleanValue(env.HMADV_WORKSPACE_ID) ||
    cleanValue(env.PROJECT_SLUG) ||
    "workspace-template"
  );
}

function buildIntegrationConfig(env = process.env) {
  const workspaceSlug = buildWorkspaceSlug(env);
  const freshworks = resolveFreshworksConfig(env);
  const fieldMapping = parseJsonEnv(env.FRESHSALES_BILLING_DEAL_FIELD_MAP, {});
  const dealTypeMapping = parseJsonEnv(env.FRESHSALES_BILLING_DEAL_TYPE_ID_MAP, {});
  const stageMapping = parseJsonEnv(env.FRESHSALES_FINANCIAL_EVENT_STAGE_MAP, {});

  return {
    starterVersion: 1,
    packageName: cleanValue(env.INTEGRATION_KIT_NAME) || "freshworks-supabase-starter",
    workspace: {
      slug: workspaceSlug,
      displayName: cleanValue(env.INTEGRATION_VERTICAL) || workspaceSlug,
      domainModel: {
        entityPrefix: toEnvKey(workspaceSlug).toLowerCase(),
        sourceSystem: "supabase",
        crmSystem: "freshsales",
        supportSystem: "freshdesk",
      },
    },
    providers: {
      supabase: {
        url: cleanValue(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL),
        projectRef: cleanValue(env.SUPABASE_PROJECT_REF),
        redirectUri: resolveFreshworksRedirectUri(env),
        migrationsPath: "supabase/migrations",
      },
      github: {
        owner: cleanValue(env.GITHUB_REPO_OWNER),
        repo: cleanValue(env.GITHUB_REPO_NAME),
        defaultBranch: cleanValue(env.GITHUB_DEFAULT_BRANCH) || "main",
        installationId: cleanValue(env.GITHUB_APP_INSTALLATION_ID),
      },
      freshworks: {
        orgBaseUrl: freshworks.orgBaseUrl,
        freshsalesApiBase: freshworks.freshsalesApiBase,
        freshdeskDomain: freshworks.freshdeskDomain,
        freshchatBaseUrl: freshworks.freshchatBaseUrl,
        oauth: {
          authorizeUrl: freshworks.authorizeUrl,
          tokenUrl: freshworks.tokenUrl,
          scopes: resolveFreshworksScopes(env, "freshsales").split(/\s+/).filter(Boolean),
        },
      },
    },
    mappings: {
      dealFieldMap: fieldMapping,
      dealTypeMap: dealTypeMapping,
      eventStageMap: stageMapping,
    },
    defaults: {
      dealStageId: cleanValue(env.FRESHSALES_DEFAULT_DEAL_STAGE_ID),
      ownerId: cleanValue(env.FRESHSALES_OWNER_ID),
      supportChannel: cleanValue(env.NEXT_PUBLIC_SUPPORT_CHANNEL),
      widgetChatEnabled: String(cleanValue(env.NEXT_PUBLIC_FRESHWORKS_WIDGET_CHAT) || "false").toLowerCase() === "true",
    },
  };
}

function buildFieldMappingConfig(env = process.env) {
  return {
    freshsales: {
      dealFieldMap: parseJsonEnv(env.FRESHSALES_BILLING_DEAL_FIELD_MAP, {}),
      dealTypeMap: parseJsonEnv(env.FRESHSALES_BILLING_DEAL_TYPE_ID_MAP, {}),
      financialEventStageMap: parseJsonEnv(env.FRESHSALES_FINANCIAL_EVENT_STAGE_MAP, {}),
      financeAccountProcessFields: parseJsonEnv(env.FRESHSALES_FINANCE_ACCOUNT_PROCESS_FIELDS, []),
      financeAccountStatusFields: parseJsonEnv(env.FRESHSALES_FINANCE_ACCOUNT_STATUS_FIELDS, []),
      financeDealStageFields: parseJsonEnv(env.FRESHSALES_FINANCE_DEAL_STAGE_FIELDS, []),
      financeDealTypeFields: parseJsonEnv(env.FRESHSALES_FINANCE_DEAL_TYPE_FIELDS, []),
    },
  };
}

function buildBusinessRulesConfig(env = process.env) {
  return {
    bootstrap: {
      allowMissingBillingIndices: String(cleanValue(env.HMADV_ALLOW_MISSING_BILLING_INDICES) || "false").toLowerCase() === "true",
      seedProductsScript: "npm run integration:seed-products",
      validateScript: "npm run integration:validate",
    },
    sync: {
      contactsScript: "npm run sync:freshsales-contacts",
      dealsScript: "npm run sync:freshsales-deals",
      productsScript: "npm run sync:freshsales-products",
      bidirectionalDealsScript: "npm run sync:hmadv-deals-bidirectional",
    },
    github: {
      repoSlug: [cleanValue(env.GITHUB_REPO_OWNER), cleanValue(env.GITHUB_REPO_NAME)].filter(Boolean).join("/"),
      defaultBranch: cleanValue(env.GITHUB_DEFAULT_BRANCH) || "main",
    },
    support: {
      ticketPortalBaseUrl: cleanValue(env.FRESHDESK_PORTAL_TICKET_BASE_URL),
      newTicketUrl: cleanValue(env.FRESHDESK_NEW_TICKET_URL),
    },
  };
}

function buildMcpConfigFile(env = process.env) {
  const projectRef = cleanValue(env.SUPABASE_PROJECT_REF);
  return {
    servers: {
      supabase: projectRef
        ? {
            type: "http",
            url: `https://mcp.supabase.com/mcp?project_ref=${encodeURIComponent(projectRef)}&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching%2Cstorage`,
          }
        : {
            type: "http",
            url: "https://mcp.supabase.com/mcp?project_ref=SET_SUPABASE_PROJECT_REF",
          },
    },
  };
}

function buildDotMcpFile(env = process.env) {
  return {
    mcpServers: {
      stitch: {
        type: "http",
        url: "https://stitch.googleapis.com/mcp",
        headers: {
          "X-Goog-Api-Key": "SET_LOCAL_GOOGLE_API_KEY",
        },
      },
      github_context: {
        type: "note",
        repo: [cleanValue(env.GITHUB_REPO_OWNER), cleanValue(env.GITHUB_REPO_NAME)].filter(Boolean).join("/") || "SET_GITHUB_OWNER/SET_GITHUB_REPO",
      },
    },
  };
}

function buildCredentialChecklist(env = process.env) {
  const checks = [
    {
      system: "Supabase",
      item: "Criar projeto e obter project ref",
      present: Boolean(cleanValue(env.SUPABASE_PROJECT_REF)),
      help: "Usado para gerar mcp.config.json e conectar o MCP do Supabase.",
    },
    {
      system: "Supabase",
      item: "Service role key",
      present: Boolean(cleanValue(env.SUPABASE_SERVICE_ROLE_KEY)),
      help: "Necessária para bootstrap, sync e admin APIs.",
    },
    {
      system: "GitHub",
      item: "Owner e repo",
      present: Boolean(cleanValue(env.GITHUB_REPO_OWNER) && cleanValue(env.GITHUB_REPO_NAME)),
      help: "Usado para contextualizar integrações GitHub/MCP e documentação operacional.",
    },
    {
      system: "Freshsales",
      item: "Criar app OAuth e gerar client id/client secret",
      present: Boolean(cleanValue(env.FRESHSALES_OAUTH_CLIENT_ID) && cleanValue(env.FRESHSALES_OAUTH_CLIENT_SECRET)),
      help: "No Freshsales Suite, criar app OAuth e copiar client id/client secret.",
    },
    {
      system: "Freshsales",
      item: "Concluir authorize URL e obter refresh token",
      present: Boolean(cleanValue(env.FRESHSALES_REFRESH_TOKEN)),
      help: "Usar authorize-url.json para obter o code e trocar por refresh token.",
    },
    {
      system: "Freshdesk",
      item: "Gerar API key",
      present: Boolean(cleanValue(env.FRESHDESK_API_KEY)),
      help: "Gerar API key do agente/admin e preencher FRESHDESK_API_KEY.",
    },
  ];

  return checks;
}

function buildLocalOpsManifest(env = process.env) {
  return {
    mode: "optional-local-ops-backend",
    summary: "Frontend portatil pode rodar sozinho; backend local e opcional para salvar setup no repo e executar comandos operacionais.",
    requiredRuntime: {
      type: "desktop-local",
      cwdPrefixes: ["C:\\", "D:\\"],
      envHints: ["APPDATA", "LOCALAPPDATA"],
    },
    flags: {
      saveSetup: {
        env: "INTEGRATION_KIT_ALLOW_SERVER_FILE_WRITE",
        requiredValue: "true",
      },
      runCommands: {
        env: "INTEGRATION_KIT_COMMAND_RUNNER_ENABLED",
        requiredValue: "true",
      },
      allowProductionRunner: {
        env: "INTEGRATION_KIT_COMMAND_RUNNER_ALLOW_PRODUCTION",
        requiredValue: "true",
        optional: true,
      },
    },
    endpoints: [
      { path: "/api/admin-integration-kit-preview", purpose: "enriquecer preview com capacidades do runtime e checks reais" },
      { path: "/api/admin-integration-kit-save-setup", purpose: "salvar setup.secrets.json no workspace local" },
      { path: "/api/admin-integration-kit-run", purpose: "executar validate/bootstrap/go/sync/ops em runtime local" },
      { path: "/api/admin-integration-kit-export", purpose: "exportar bundle baseado no ambiente real do projeto" },
    ],
    commands: [
      "npm run integration:validate",
      "npm run integration:bootstrap",
      "npm run integration:go",
      "npm run integration:sync",
      "npm run integration:ops",
    ],
    securityRules: [
      "Nunca habilitar runner web por padrao em producao.",
      "Nunca persistir setup.secrets.json server-side fora de runtime local explicito.",
      "Bootstrap deve falhar fechado sem setup.secrets.json, exceto com --allow-ambient-env.",
      "Acoes destrutivas exigem confirmacao explicita na interface.",
    ],
    githubCloudflareGuidance: [
      "Em Cloudflare Pages puro, usar apenas o frontend portatil e downloads locais.",
      "Operacoes locais devem ser executadas via terminal ou backend local controlado.",
      "Manter secrets fora do repositório e fora de storage serverless efemero.",
    ],
    repoContext: {
      owner: cleanValue(env.GITHUB_REPO_OWNER),
      repo: cleanValue(env.GITHUB_REPO_NAME),
      defaultBranch: cleanValue(env.GITHUB_DEFAULT_BRANCH) || "main",
    },
  };
}

function buildEnvStatus(env = process.env) {
  return ENV_DEFINITIONS.map((definition) => ({
    key: definition.key,
    group: definition.group,
    required: Boolean(definition.required),
    secret: Boolean(definition.secret),
    present: Boolean(cleanValue(env[definition.key])),
  }));
}

function buildRequiredChecks(env = process.env) {
  const checks = [
    { key: "SUPABASE_URL", label: "Supabase URL" },
    { key: "SUPABASE_PROJECT_REF", label: "Supabase project ref" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role key" },
    { key: "GITHUB_REPO_OWNER", label: "GitHub repo owner" },
    { key: "GITHUB_REPO_NAME", label: "GitHub repo name" },
    { key: "FRESHSALES_OAUTH_CLIENT_ID", label: "Freshworks client id" },
    { key: "FRESHSALES_OAUTH_CLIENT_SECRET", label: "Freshworks client secret" },
    { key: "FRESHDESK_DOMAIN", label: "Freshdesk domain" },
  ];

  return checks.map((item) => ({
    ...item,
    present: Boolean(cleanValue(env[item.key])),
  }));
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
  ENV_DEFINITIONS,
  buildBusinessRulesConfig,
  buildCredentialChecklist,
  buildDotMcpFile,
  buildEnvStatus,
  buildFieldMappingConfig,
  buildIntegrationConfig,
  buildLocalOpsManifest,
  buildMcpConfigFile,
  buildPortableIntegrationBundle,
  buildRequiredChecks,
  buildWorkspaceSlug,
};
