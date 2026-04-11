const assert = require("assert");

const { buildSetupPreview } = require("../../lib/integration-kit/bootstrap");

function run() {
  const preview = buildSetupPreview({
    project: {
      slug: "demo-kit",
      vertical: "saude",
      packageName: "starter-demo",
    },
    env: {
      SUPABASE_URL: "https://demo.supabase.co",
      SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      GITHUB_REPO_OWNER: "acme",
      GITHUB_REPO_NAME: "starter-demo",
      FRESHWORKS_ORG_BASE_URL: "https://demo.myfreshworks.com",
      FRESHSALES_API_BASE: "https://demo.myfreshworks.com/crm/sales/api",
      FRESHSALES_OAUTH_CLIENT_ID: "client-id",
      FRESHSALES_OAUTH_CLIENT_SECRET: "client-secret",
      FRESHSALES_SCOPES: "freshsales.deals.view freshsales.contacts.view",
      FRESHDESK_DOMAIN: "https://demo.freshdesk.com",
    },
  }, {});

  assert.equal(preview.bundle.workspaceSlug, "demo-kit");
  assert.equal(preview.bundle.files["integration.config.json"].workspace.slug, "demo-kit");
  assert.equal(preview.bundle.files["integration.config.json"].workspace.displayName, "saude");
  assert.equal(preview.bundle.files["integration.config.json"].packageName, "starter-demo");
  assert.equal(preview.bundle.files["integration.config.json"].providers.supabase.projectRef, "abcdefghijklmnopqrst");
  assert.equal(preview.bundle.files["integration.config.json"].providers.github.owner, "acme");
  assert.equal(preview.bundle.files["integration.config.json"].providers.github.repo, "starter-demo");
  assert.ok(preview.bundle.files["mcp.config.json"].servers.supabase.url.includes("project_ref=abcdefghijklmnopqrst"));
  assert.equal(preview.bundle.files[".mcp.json"].mcpServers.github_context.repo, "acme/starter-demo");
  assert.ok(Array.isArray(preview.bundle.files["credential-checklist.json"]));
  assert.equal(preview.bundle.files["local-ops-manifest.json"].mode, "optional-local-ops-backend");
  assert.ok(Array.isArray(preview.bundle.files["local-ops-manifest.json"].endpoints));
  assert.ok(preview.credentialChecklist.some((item) => item.system === "Supabase" && item.present === true));
  assert.equal(preview.authorize.ok, true);
  assert.ok(preview.envBootstrap.includes("SUPABASE_URL=https://demo.supabase.co"));
  assert.ok(preview.envBootstrap.includes("SUPABASE_PROJECT_REF=abcdefghijklmnopqrst"));
  assert.ok(preview.envBootstrap.includes("FRESHDESK_DOMAIN=https://demo.freshdesk.com"));
}

run();
console.log("bootstrap-preview.test: ok");
