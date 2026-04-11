const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function runValidate(cwd) {
  return spawnSync("node", [path.join(__dirname, "../../scripts/integration-validate.js")], {
    cwd,
    encoding: "utf8",
    shell: false,
    env: { ...process.env },
  });
}

function testValidateSetupCoverage() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "integration-kit-validate-"));
  writeJson(path.join(cwd, "setup/integration-kit/setup.secrets.json"), {
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
      FRESHSALES_OAUTH_CLIENT_ID: "client-id",
      FRESHSALES_OAUTH_CLIENT_SECRET: "client-secret",
      FRESHSALES_REFRESH_TOKEN: "refresh-token",
      FRESHDESK_DOMAIN: "https://demo.freshdesk.com",
      FRESHDESK_API_KEY: "api-key",
    },
  });

  const result = runValidate(cwd);
  assert.equal(result.status, 0, "validate should pass with minimum coverage");

  const payload = JSON.parse(String(result.stdout || "{}"));
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.missingRequired, []);
  assert.ok(Array.isArray(payload.credentialChecklist));
  assert.ok(payload.credentialChecklist.every((item) => item.present === true));
}

testValidateSetupCoverage();
console.log("integration-validate.test: ok");
