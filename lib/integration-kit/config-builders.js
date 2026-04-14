"use strict";

const { cleanValue, parseJsonEnv, toEnvKey } = require("./env");
const { resolveFreshworksConfig, resolveFreshworksRedirectUri, resolveFreshworksScopes } = require("./freshworks");

function buildWorkspaceSlug(env = process.env) {
  return cleanValue(env.INTEGRATION_WORKSPACE_SLUG) || cleanValue(env.HMADV_WORKSPACE_ID) || cleanValue(env.PROJECT_SLUG) || "workspace-template";
}

function buildIntegrationConfig(env = process.env) {
  const workspaceSlug = buildWorkspaceSlug(env);
  const freshworks = resolveFreshworksConfig(env);
  return {
    starterVersion: 1,
    packageName: cleanValue(env.INTEGRATION_KIT_NAME) || "freshworks-supabase-starter",
    workspace: {
      slug: workspaceSlug,
      displayName: cleanValue(env.INTEGRATION_VERTICAL) || workspaceSlug,
      domainModel: { entityPrefix: toEnvKey(workspaceSlug).toLowerCase(), sourceSystem: "supabase", crmSystem: "freshsales", supportSystem: "freshdesk" },
    },
    providers: {
      supabase: { url: cleanValue(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL), projectRef: cleanValue(env.SUPABASE_PROJECT_REF), redirectUri: resolveFreshworksRedirectUri(env), migrationsPath: "supabase/migrations" },
      github: { owner: cleanValue(env.GITHUB_REPO_OWNER), repo: cleanValue(env.GITHUB_REPO_NAME), defaultBranch: cleanValue(env.GITHUB_DEFAULT_BRANCH) || "main", installationId: cleanValue(env.GITHUB_APP_INSTALLATION_ID) },
      freshworks: {
        orgBaseUrl: freshworks.orgBaseUrl,
        freshsalesApiBase: freshworks.freshsalesApiBase,
        freshdeskDomain: freshworks.freshdeskDomain,
        freshchatBaseUrl: freshworks.freshchatBaseUrl,
        oauth: { authorizeUrl: freshworks.authorizeUrl, tokenUrl: freshworks.tokenUrl, scopes: resolveFreshworksScopes(env, "freshsales").split(/\s+/).filter(Boolean) },
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
    bootstrap: { allowMissingBillingIndices: String(cleanValue(env.HMADV_ALLOW_MISSING_BILLING_INDICES) || "false").toLowerCase() === "true", seedProductsScript: "npm run integration:seed-products", validateScript: "npm run integration:validate" },
    sync: { contactsScript: "npm run sync:freshsales-contacts", dealsScript: "npm run sync:freshsales-deals", productsScript: "npm run sync:freshsales-products", bidirectionalDealsScript: "npm run sync:hmadv-deals-bidirectional" },
    github: { repoSlug: [cleanValue(env.GITHUB_REPO_OWNER), cleanValue(env.GITHUB_REPO_NAME)].filter(Boolean).join("/"), defaultBranch: cleanValue(env.GITHUB_DEFAULT_BRANCH) || "main" },
    support: { ticketPortalBaseUrl: cleanValue(env.FRESHDESK_PORTAL_TICKET_BASE_URL), newTicketUrl: cleanValue(env.FRESHDESK_NEW_TICKET_URL) },
  };
}

function buildMcpConfigFile(env = process.env) {
  const projectRef = cleanValue(env.SUPABASE_PROJECT_REF);
  return { servers: { supabase: projectRef ? { type: "http", url: `https://mcp.supabase.com/mcp?project_ref=${encodeURIComponent(projectRef)}&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching%2Cstorage` } : { type: "http", url: "https://mcp.supabase.com/mcp?project_ref=SET_SUPABASE_PROJECT_REF" } } };
}

function buildDotMcpFile(env = process.env) {
  return { mcpServers: { stitch: { type: "http", url: "https://stitch.googleapis.com/mcp", headers: { "X-Goog-Api-Key": "SET_LOCAL_GOOGLE_API_KEY" } }, github_context: { type: "note", repo: [cleanValue(env.GITHUB_REPO_OWNER), cleanValue(env.GITHUB_REPO_NAME)].filter(Boolean).join("/") || "SET_GITHUB_OWNER/SET_GITHUB_REPO" } } };
}

module.exports = {
  buildBusinessRulesConfig,
  buildDotMcpFile,
  buildFieldMappingConfig,
  buildIntegrationConfig,
  buildMcpConfigFile,
  buildWorkspaceSlug,
};
