"use strict";

function cleanValue(value) {
  const text = String(value || "").trim();
  return text || null;
}

function toEnvKey(label) {
  return String(label || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ensureHttps(value, fallback = null) {
  const text = cleanValue(value);
  if (!text) return fallback;
  if (/^https?:\/\//i.test(text)) return text.replace(/\/+$/, "");
  return `https://${text.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function hostOnly(value) {
  const text = cleanValue(value);
  if (!text) return null;
  return text.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function firstEnv(names, env = {}) {
  for (const name of names) {
    const value = cleanValue(env[name]);
    if (value) return value;
  }
  return null;
}

function parseJsonEnv(value, fallback) {
  const text = cleanValue(value);
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

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
  { key: "GITHUB_APP_INSTALLATION_ID", group: "GitHub", description: "Opcional para integracoes GitHub App/MCP.", placeholder: "12345678" },
  { key: "FRESHWORKS_ORG_BASE_URL", group: "Freshworks", description: "Base principal da org no Freshworks.", placeholder: "https://sua-org.myfreshworks.com" },
  { key: "FRESHSALES_API_BASE", group: "Freshworks", description: "Base do CRM Sales API.", placeholder: "https://sua-org.myfreshworks.com/crm/sales/api" },
  { key: "FRESHSALES_API_KEY", group: "Freshworks", description: "Token legado do Freshsales, opcional quando usar OAuth.", secret: true },
  { key: "FRESHSALES_OAUTH_CLIENT_ID", group: "Freshworks", description: "Client id OAuth do Freshsales/Freshworks.", secret: true },
  { key: "FRESHSALES_OAUTH_CLIENT_SECRET", group: "Freshworks", description: "Client secret OAuth do Freshsales/Freshworks.", secret: true },
  { key: "FRESHSALES_REFRESH_TOKEN", group: "Freshworks", description: "Refresh token para automatizar syncs.", secret: true },
  { key: "FRESHSALES_ACCESS_TOKEN", group: "Freshworks", description: "Access token opcional para diagnostico manual.", secret: true },
  { key: "FRESHSALES_CONTACTS_REFRESH_TOKEN", group: "Freshworks", description: "Refresh token segmentado para o app OAuth de contacts.", secret: true },
  { key: "FRESHSALES_CONTACTS_ACCESS_TOKEN", group: "Freshworks", description: "Access token segmentado para diagnostico do app OAuth de contacts.", secret: true },
  { key: "FRESHSALES_CONTACTS_SCOPES", group: "Freshworks", description: "Scopes OAuth especificos do app de contacts.", placeholder: "freshsales.contacts.view freshsales.contacts.create freshsales.contacts.edit freshsales.contacts.upsert freshsales.contacts.delete freshsales.contacts.fields.view freshsales.contacts.activities.view freshsales.contacts.filters.view" },
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

function formatEnvFile(definitions, env = {}) {
  const lines = [];
  let currentGroup = null;

  for (const definition of definitions) {
    if (definition.group !== currentGroup) {
      currentGroup = definition.group;
      if (lines.length) lines.push("");
      lines.push(`# ${currentGroup}`);
    }

    if (definition.description) lines.push(`# ${definition.description}`);
    const currentValue = cleanValue(env[definition.key]);
    const value = definition.secret ? "" : currentValue || definition.placeholder || definition.defaultValue || "";
    lines.push(`${definition.key}=${value}`);
  }

  return `${lines.join("\n")}\n`;
}

function resolveFreshsalesApiBase(rawValue, orgHost = null) {
  const raw = cleanValue(rawValue);
  if (raw) {
    const ensured = ensureHttps(raw, null);
    if (ensured.includes("/crm/sales/api")) return ensured.replace(/\/+$/, "");
    if (ensured.includes("/api")) return ensured.replace(/\/api\/?$/i, "/crm/sales/api");
    return `${ensured}/crm/sales/api`;
  }
  if (!orgHost) return null;
  return `https://${orgHost}/crm/sales/api`;
}

function resolveFreshworksConfig(env = {}) {
  const orgBaseUrl = ensureHttps(firstEnv([
    "FRESHWORKS_ORG_BASE_URL",
    "FRESHWORKS_BASE_URL",
    "FRESHSALES_ALIAS_DOMAIN",
    "FRESHSALES_BASE_DOMAIN",
    "FRESHSALES_DOMAIN",
    "FRESHWORKS_DOMAIN",
    "FRESHSALES_ORG_DOMAIN",
  ], env), null);
  const orgHost = hostOnly(orgBaseUrl);
  const freshsalesApiBase = resolveFreshsalesApiBase(firstEnv(["FRESHSALES_API_BASE", "FRESHSALES_BASE_URL", "FRESHSALES_DOMAIN", "FRESHSALES_ALIAS_DOMAIN"], env), orgHost);
  return {
    orgBaseUrl,
    orgHost,
    freshsalesApiBase,
    freshdeskDomain: ensureHttps(firstEnv(["FRESHDESK_DOMAIN"], env), null),
    freshchatBaseUrl: ensureHttps(firstEnv(["FRESHCHAT_API_BASE", "FRESHCHAT_BASE_URL", "FRESHCHAT_DOMAIN", "FRESHCHAT_SERVER"], env), "https://msdk.eu.freshchat.com"),
    authorizeUrl: firstEnv(["FRESHWORKS_OAUTH_AUTHORIZE_URL", "FRESHSALES_OAUTH_AUTHORIZE_URL", "FRESHSALES_AUTHORIZE_URL"], env) || (orgBaseUrl ? `${orgBaseUrl}/org/oauth/v2/authorize` : null),
    tokenUrl: firstEnv(["FRESHWORKS_OAUTH_TOKEN_URL", "FRESHSALES_OAUTH_TOKEN_URL", "ACCESS_TOKEN_URL"], env) || (orgBaseUrl ? `${orgBaseUrl}/org/oauth/v2/token` : null),
    clientId: firstEnv(["FRESHWORKS_OAUTH_CLIENT_ID", "FRESHSALES_OAUTH_CLIENT_ID"], env),
    clientSecret: firstEnv(["FRESHWORKS_OAUTH_CLIENT_SECRET", "FRESHSALES_OAUTH_CLIENT_SECRET"], env),
    accessToken: firstEnv(["FRESHWORKS_ACCESS_TOKEN", "FRESHSALES_ACCESS_TOKEN"], env),
    refreshToken: firstEnv(["FRESHWORKS_REFRESH_TOKEN", "FRESHSALES_REFRESH_TOKEN"], env),
  };
}

function resolveFreshworksRedirectUri(env = {}) {
  const explicit = firstEnv(["FRESHWORKS_REDIRECT_URI", "FRESHSALES_REDIRECT_URI", "REDIRECT_URI", "OAUTH_CALLBACK_URL"], env);
  if (explicit) return explicit;
  const supabaseUrl = firstEnv(["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"], env);
  return supabaseUrl ? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/oauth` : null;
}

function resolveFreshworksScopes(env = {}) {
  return firstEnv(["FRESHSALES_SCOPES", "FRESHWORKS_SCOPES"], env) || [
    "freshsales.deals.view",
    "freshsales.deals.create",
    "freshsales.contacts.view",
    "freshsales.contacts.create",
    "freshsales.settings.fields.view",
  ].join(" ");
}

function buildAuthorizeUrl(env = {}) {
  const config = resolveFreshworksConfig(env);
  const clientId = config.clientId;
  const authorizeUrl = config.authorizeUrl;
  const redirectUri = resolveFreshworksRedirectUri(env);
  const scopes = resolveFreshworksScopes(env);
  const state = firstEnv(["FRESHWORKS_OAUTH_STATE", "FRESHSALES_OAUTH_STATE"], env) || "integration-kit";

  if (!clientId || !authorizeUrl || !redirectUri || !scopes) {
    return {
      ok: false,
      error: "Configuracao OAuth incompleta para gerar a URL de autorizacao.",
    };
  }

  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", `freshsales:${state}`);

  return {
    ok: true,
    authorizeUrl: url.toString(),
    redirectUri,
    scopes: scopes.split(/\s+/).filter(Boolean),
    state: `freshsales:${state}`,
    orgBaseUrl: config.orgBaseUrl,
  };
}

function buildWorkspaceSlug(env = {}) {
  return cleanValue(env.INTEGRATION_WORKSPACE_SLUG) || cleanValue(env.PROJECT_SLUG) || "workspace-template";
}

function buildIntegrationConfig(env = {}) {
  const workspaceSlug = buildWorkspaceSlug(env);
  const freshworks = resolveFreshworksConfig(env);
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
          scopes: resolveFreshworksScopes(env).split(/\s+/).filter(Boolean),
        },
      },
    },
    mappings: {
      dealFieldMap: parseJsonEnv(env.FRESHSALES_BILLING_DEAL_FIELD_MAP, {}),
      dealTypeMap: parseJsonEnv(env.FRESHSALES_BILLING_DEAL_TYPE_ID_MAP, {}),
      eventStageMap: parseJsonEnv(env.FRESHSALES_FINANCIAL_EVENT_STAGE_MAP, {}),
    },
    defaults: {
      dealStageId: cleanValue(env.FRESHSALES_DEFAULT_DEAL_STAGE_ID),
      ownerId: cleanValue(env.FRESHSALES_OWNER_ID),
      supportChannel: cleanValue(env.NEXT_PUBLIC_SUPPORT_CHANNEL),
      widgetChatEnabled: String(cleanValue(env.NEXT_PUBLIC_FRESHWORKS_WIDGET_CHAT) || "false").toLowerCase() === "true",
    },
  };
}

function buildFieldMappingConfig(env = {}) {
  return {
    freshsales: {
      dealFieldMap: parseJsonEnv(env.FRESHSALES_BILLING_DEAL_FIELD_MAP, {}),
      dealTypeMap: parseJsonEnv(env.FRESHSALES_BILLING_DEAL_TYPE_ID_MAP, {}),
      financialEventStageMap: parseJsonEnv(env.FRESHSALES_FINANCIAL_EVENT_STAGE_MAP, {}),
    },
  };
}

function buildBusinessRulesConfig(env = {}) {
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

function buildMcpConfigFile(env = {}) {
  const projectRef = cleanValue(env.SUPABASE_PROJECT_REF);
  return {
    servers: {
      supabase: projectRef
        ? { type: "http", url: `https://mcp.supabase.com/mcp?project_ref=${encodeURIComponent(projectRef)}&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching%2Cstorage` }
        : { type: "http", url: "https://mcp.supabase.com/mcp?project_ref=SET_SUPABASE_PROJECT_REF" },
    },
  };
}

function buildDotMcpFile(env = {}) {
  return {
    mcpServers: {
      stitch: {
        type: "http",
        url: "https://stitch.googleapis.com/mcp",
        headers: { "X-Goog-Api-Key": "SET_LOCAL_GOOGLE_API_KEY" },
      },
      github_context: {
        type: "note",
        repo: [cleanValue(env.GITHUB_REPO_OWNER), cleanValue(env.GITHUB_REPO_NAME)].filter(Boolean).join("/") || "SET_GITHUB_OWNER/SET_GITHUB_REPO",
      },
    },
  };
}

function buildCredentialChecklist(env = {}) {
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

function buildLocalOpsManifest(env = {}) {
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
      "Manter secrets fora do repositorio e fora de storage serverless efemero.",
    ],
    repoContext: {
      owner: cleanValue(env.GITHUB_REPO_OWNER),
      repo: cleanValue(env.GITHUB_REPO_NAME),
      defaultBranch: cleanValue(env.GITHUB_DEFAULT_BRANCH) || "main",
    },
  };
}

function buildRequiredChecks(env = {}) {
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

function buildPortableIntegrationBundle(env = {}) {
  const workspaceSlug = buildWorkspaceSlug(env);
  return {
    generatedAt: new Date().toISOString(),
    workspaceSlug,
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

function buildEnvFromSetupFile(setup = {}, baseEnv = {}) {
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

function buildPortableSetupPreview(setup = {}, baseEnv = {}) {
  const env = buildEnvFromSetupFile(setup, baseEnv);
  const bundle = buildPortableIntegrationBundle(env);
  return {
    bundle,
    authorize: buildAuthorizeUrl(env),
    credentialChecklist: buildCredentialChecklist(env),
    envBootstrap: formatEnvFile(ENV_DEFINITIONS, env),
    setupFile: {
      project: setup.project || {},
      env: setup.env || {},
    },
    requiredChecks: buildRequiredChecks(env),
  };
}

module.exports = {
  ENV_DEFINITIONS,
  buildLocalOpsManifest,
  buildPortableIntegrationBundle,
  buildRequiredChecks,
  formatEnvFile,
  buildPortableSetupPreview,
};
