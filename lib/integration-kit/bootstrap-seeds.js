"use strict";

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
    { name: "Honorarios Unitarios", category: "honorarios", billing_type: "unitario", currency: "BRL", late_fee_percent_default: 10, interest_percent_month_default: 1, monetary_index_default: "IGP-M", status: "active" },
    { name: "Honorarios Recorrentes", category: "honorarios", billing_type: "recorrente", currency: "BRL", late_fee_percent_default: 10, interest_percent_month_default: 1, monetary_index_default: "IGP-M", status: "active" },
    { name: "Parcela Contratual", category: "parcelamento", billing_type: "parcelado", currency: "BRL", late_fee_percent_default: 10, interest_percent_month_default: 1, monetary_index_default: "IGP-M", status: "active" },
    { name: "Fatura Avulsa", category: "fatura", billing_type: "unitario", currency: "BRL", late_fee_percent_default: 10, interest_percent_month_default: 1, monetary_index_default: "IGP-M", status: "active" },
    { name: "Despesa do Cliente", category: "despesa", billing_type: "reembolso", currency: "BRL", late_fee_percent_default: 0, interest_percent_month_default: 0, monetary_index_default: "IGP-M", status: "active" },
    { name: "Encargos de Atraso", category: "encargos", billing_type: "encargo", currency: "BRL", late_fee_percent_default: 10, interest_percent_month_default: 1, monetary_index_default: "IGP-M", status: "active" },
  ];
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

module.exports = {
  buildCanonicalProductsTemplate,
  buildLocalOpsEnvExample,
  buildSetupTemplateObject,
};
