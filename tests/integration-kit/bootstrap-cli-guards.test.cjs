const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function runBootstrap(cwd, extraArgs = []) {
  return spawnSync("node", [path.join(__dirname, "../../scripts/integration-bootstrap.js"), ...extraArgs], {
    cwd,
    encoding: "utf8",
    shell: false,
    env: {
      ...process.env,
      SUPABASE_URL: "https://ambient.supabase.co",
      SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst",
      SUPABASE_SERVICE_ROLE_KEY: "ambient-service-role",
      GITHUB_REPO_OWNER: "acme",
      GITHUB_REPO_NAME: "ambient-starter",
      FRESHSALES_OAUTH_CLIENT_ID: "ambient-client-id",
      FRESHSALES_OAUTH_CLIENT_SECRET: "ambient-client-secret",
      FRESHDESK_DOMAIN: "https://ambient.freshdesk.com",
    },
  });
}

function testFailsClosedWithoutSetupSecrets() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "integration-kit-no-setup-"));
  writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "tmp", private: true }));

  const result = runBootstrap(cwd);
  assert.notEqual(result.status, 0, "bootstrap should fail without setup.secrets.json");

  const payload = JSON.parse(String(result.stdout || "{}"));
  assert.equal(payload.ok, false);
  assert.equal(payload.setupFilePresent, false);
  assert.match(payload.error, /setup\.secrets\.json ausente/i);
}

function testAllowsAmbientEnvOnlyWithExplicitFlag() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "integration-kit-ambient-"));
  writeFile(path.join(cwd, "package.json"), JSON.stringify({ name: "tmp", private: true }));

  const result = runBootstrap(cwd, ["--allow-ambient-env"]);
  assert.equal(result.status, 0, "bootstrap should succeed with explicit ambient-env override");

  const payload = JSON.parse(String(result.stdout || "{}"));
  assert.equal(payload.ok, true);
  assert.equal(payload.allowAmbientEnv, true);
  assert.equal(payload.usedAmbientEnvFallback, true);
  assert.ok(String(payload.outputDir || "").includes(path.join("setup", "integration-kit", "generated")));
  assert.match(String((payload.nextSteps || []).join(" ")), /allow-ambient-env/i);
}

testFailsClosedWithoutSetupSecrets();
testAllowsAmbientEnvOnlyWithExplicitFlag();
console.log("bootstrap-cli-guards.test: ok");
