export const initialSetup = {
  project: {
    slug: "",
    vertical: "",
    packageName: "freshworks-supabase-starter",
  },
  env: {
    SUPABASE_URL: "",
    SUPABASE_PROJECT_REF: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    SUPABASE_ANON_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    GITHUB_REPO_OWNER: "",
    GITHUB_REPO_NAME: "",
    GITHUB_DEFAULT_BRANCH: "main",
    GITHUB_APP_INSTALLATION_ID: "",
    FRESHWORKS_ORG_BASE_URL: "",
    FRESHSALES_API_BASE: "",
    FRESHSALES_OAUTH_CLIENT_ID: "",
    FRESHSALES_OAUTH_CLIENT_SECRET: "",
    FRESHSALES_REFRESH_TOKEN: "",
    FRESHSALES_SCOPES: "freshsales.deals.view freshsales.deals.create freshsales.contacts.view freshsales.contacts.create freshsales.settings.fields.view",
    FRESHDESK_DOMAIN: "",
    FRESHDESK_API_KEY: "",
    FRESHDESK_PORTAL_TICKET_BASE_URL: "",
    FRESHDESK_NEW_TICKET_URL: "",
    NEXT_PUBLIC_FRESHWORKS_WIDGET_SCRIPT_URL: "",
    NEXT_PUBLIC_FRESHWORKS_WIDGET_CHAT: "false",
  },
};

export const fieldGroups = [
  {
    title: "Projeto",
    accent: "Setup Blueprint",
    fields: [
      { key: "project.slug", label: "Slug do workspace", placeholder: "novo-workspace", secret: false },
      { key: "project.vertical", label: "Vertical/nicho", placeholder: "servicos", secret: false },
      { key: "project.packageName", label: "Nome do pacote", placeholder: "freshworks-supabase-starter", secret: false },
    ],
  },
  {
    title: "Supabase",
    accent: "Base de dados e auth",
    fields: [
      { key: "env.SUPABASE_URL", label: "Supabase URL", placeholder: "https://seu-projeto.supabase.co", secret: false },
      { key: "env.SUPABASE_PROJECT_REF", label: "Supabase project ref", placeholder: "abcdefghijklmnopqrst", secret: false },
      { key: "env.SUPABASE_SERVICE_ROLE_KEY", label: "Service role key", placeholder: "service-role", secret: true },
      { key: "env.SUPABASE_ANON_KEY", label: "Anon key", placeholder: "anon-key", secret: true },
      { key: "env.NEXT_PUBLIC_SUPABASE_URL", label: "NEXT_PUBLIC_SUPABASE_URL", placeholder: "https://seu-projeto.supabase.co", secret: false },
      { key: "env.NEXT_PUBLIC_SUPABASE_ANON_KEY", label: "NEXT_PUBLIC_SUPABASE_ANON_KEY", placeholder: "anon-key", secret: true },
    ],
  },
  {
    title: "GitHub e MCP",
    accent: "Repo e conexoes operacionais",
    fields: [
      { key: "env.GITHUB_REPO_OWNER", label: "GitHub owner", placeholder: "sua-org", secret: false },
      { key: "env.GITHUB_REPO_NAME", label: "GitHub repo", placeholder: "seu-repo", secret: false },
      { key: "env.GITHUB_DEFAULT_BRANCH", label: "Default branch", placeholder: "main", secret: false },
      { key: "env.GITHUB_APP_INSTALLATION_ID", label: "GitHub App installation id", placeholder: "12345678", secret: false },
    ],
  },
  {
    title: "Freshworks",
    accent: "CRM e OAuth",
    fields: [
      { key: "env.FRESHWORKS_ORG_BASE_URL", label: "Org base URL", placeholder: "https://sua-org.myfreshworks.com", secret: false },
      { key: "env.FRESHSALES_API_BASE", label: "Freshsales API base", placeholder: "https://sua-org.myfreshworks.com/crm/sales/api", secret: false },
      { key: "env.FRESHSALES_OAUTH_CLIENT_ID", label: "OAuth client id", placeholder: "client-id", secret: true },
      { key: "env.FRESHSALES_OAUTH_CLIENT_SECRET", label: "OAuth client secret", placeholder: "client-secret", secret: true },
      { key: "env.FRESHSALES_REFRESH_TOKEN", label: "Refresh token", placeholder: "refresh-token", secret: true },
      { key: "env.FRESHSALES_SCOPES", label: "Scopes OAuth", placeholder: "freshsales.deals.view ...", secret: false },
    ],
  },
  {
    title: "Freshdesk e Widget",
    accent: "Suporte e experiencia",
    fields: [
      { key: "env.FRESHDESK_DOMAIN", label: "Freshdesk domain", placeholder: "https://sua-conta.freshdesk.com", secret: false },
      { key: "env.FRESHDESK_API_KEY", label: "Freshdesk API key", placeholder: "api-key", secret: true },
      { key: "env.FRESHDESK_PORTAL_TICKET_BASE_URL", label: "Base de tickets", placeholder: "https://sua-conta.freshdesk.com/support/tickets", secret: false },
      { key: "env.FRESHDESK_NEW_TICKET_URL", label: "URL novo ticket", placeholder: "https://sua-conta.freshdesk.com/support/tickets/new", secret: false },
      { key: "env.NEXT_PUBLIC_FRESHWORKS_WIDGET_SCRIPT_URL", label: "Script do widget", placeholder: "//fw-cdn.com/widget.js", secret: false },
      { key: "env.NEXT_PUBLIC_FRESHWORKS_WIDGET_CHAT", label: "Widget habilitado", placeholder: "false", secret: false },
    ],
  },
];

export function setValueAtPath(target, dottedPath, value) {
  const parts = dottedPath.split(".");
  const clone = JSON.parse(JSON.stringify(target));
  let cursor = clone;
  for (let index = 0; index < parts.length - 1; index += 1) cursor = cursor[parts[index]];
  cursor[parts[parts.length - 1]] = value;
  return clone;
}

export function downloadText(filename, content, contentType = "application/json;charset=utf-8") {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
