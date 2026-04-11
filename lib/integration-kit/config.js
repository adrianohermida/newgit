"use strict";

const { cleanValue, parseJsonEnv, toEnvKey } = require("./env");
const { buildFreshworksDiagnostics, resolveFreshworksConfig, resolveFreshworksRedirectUri, resolveFreshworksScopes } = require("./freshworks");

const ENV_DEFINITIONS = [
  { key: "INTEGRATION_KIT_NAME", group: "Integration Kit", description: "Nome curto do pacote replicavel.", placeholder: "freshworks-supabase-starter" },
  { key: "INTEGRATION_WORKSPACE_SLUG", group: "Integration Kit", description: "Slug do workspace ou nicho atual.", placeholder: "meu-workspace" },
  { key: "INTEGRATION_VERTICAL", group: "Integration Kit", description: "Vertical do projeto que sera replicado.", placeholder: "servicos" },
  { key: "SUPABASE_URL", group: "Supabase", description: "URL do projeto Supabase.", placeholder: "https://seu-projeto.supabase.co" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", group: "Supabase", description: "Service role para bootstrap, sync e admin APIs.", secret: true },
  { key: "SUPABASE_ANON_KEY", group: "Supabase", description: "Chave anonima usada no frontend.", secret: true },
  { key: "NEXT_PUBLIC_SUPABASE_URL", group: "Supabase", description: "Alias frontend da URL do Supabase.", placeholder: "https://seu-projeto.supabase.co" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", group: "Supabase", description: "Alias frontend da anon key.", secret: true },
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
        redirectUri: resolveFreshworksRedirectUri(env),
        migrationsPath: "supabase/migrations",
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
      seedProductsScript: "npm run seed:hmadv-products",
    },
    sync: {
      contactsScript: "npm run sync:freshsales-contacts",
      dealsScript: "npm run sync:freshsales-deals",
      productsScript: "npm run sync:freshsales-products",
      bidirectionalDealsScript: "npm run sync:hmadv-deals-bidirectional",
    },
    support: {
      ticketPortalBaseUrl: cleanValue(env.FRESHDESK_PORTAL_TICKET_BASE_URL),
      newTicketUrl: cleanValue(env.FRESHDESK_NEW_TICKET_URL),
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
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role key" },
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
    },
  };
}

module.exports = {
  ENV_DEFINITIONS,
  buildBusinessRulesConfig,
  buildEnvStatus,
  buildFieldMappingConfig,
  buildIntegrationConfig,
  buildPortableIntegrationBundle,
  buildRequiredChecks,
  buildWorkspaceSlug,
};
