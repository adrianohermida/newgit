#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { loadPreferredEnvFiles, formatEnvFile } = require("../lib/integration-kit/env");
const {
  ENV_DEFINITIONS,
  buildPortableIntegrationBundle,
  buildWorkspaceSlug,
} = require("../lib/integration-kit/config");
const { materializeSetupTemplates, getSetupRoot } = require("../lib/integration-kit/bootstrap");

loadPreferredEnvFiles(process.cwd(), process.env);

function copyFileIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return false;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function writeText(targetPath, content) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, "utf8");
}

function createArchive(sourceDir, archiveBasePath) {
  if (process.platform === "win32") {
    const zipPath = `${archiveBasePath}.zip`;
    if (fs.existsSync(zipPath)) fs.rmSync(zipPath, { force: true });
    const command = [
      "Compress-Archive",
      "-Path",
      `'${sourceDir}\\*'`,
      "-DestinationPath",
      `'${zipPath}'`,
      "-Force",
    ].join(" ");
    const result = spawnSync("powershell", ["-NoProfile", "-Command", command], {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false,
    });
    if (result.status === 0) {
      return { ok: true, archivePath: zipPath, format: "zip" };
    }
    return {
      ok: false,
      archivePath: null,
      format: "zip",
      error: String(result.stderr || result.stdout || "Falha ao gerar arquivo .zip."),
    };
  }

  const tarPath = `${archiveBasePath}.tar.gz`;
  if (fs.existsSync(tarPath)) fs.rmSync(tarPath, { force: true });
  const result = spawnSync("tar", ["-czf", tarPath, "-C", sourceDir, "."], {
    cwd: process.cwd(),
    encoding: "utf8",
    shell: false,
  });
  if (result.status === 0) {
    return { ok: true, archivePath: tarPath, format: "tar.gz" };
  }
  return {
    ok: false,
    archivePath: null,
    format: "tar.gz",
    error: String(result.stderr || result.stdout || "Falha ao gerar arquivo .tar.gz."),
  };
}

const workspaceSlug = buildWorkspaceSlug(process.env);
const outputDir = path.join(process.cwd(), "artifacts", "integration-kit", workspaceSlug);
const packageDir = path.join(outputDir, "package");
const setupRoot = getSetupRoot(process.cwd());
const localOpsDir = path.join(setupRoot, "local-ops");

materializeSetupTemplates(process.cwd());
fs.mkdirSync(packageDir, { recursive: true });

const bundle = buildPortableIntegrationBundle(process.env);
const files = {
  "integration.config.json": JSON.stringify(bundle.files["integration.config.json"], null, 2),
  "field-mapping.json": JSON.stringify(bundle.files["field-mapping.json"], null, 2),
  "business-rules.json": JSON.stringify(bundle.files["business-rules.json"], null, 2),
  "mcp.config.json": JSON.stringify(bundle.files["mcp.config.json"], null, 2),
  ".mcp.json": JSON.stringify(bundle.files[".mcp.json"], null, 2),
  "credential-checklist.json": JSON.stringify(bundle.files["credential-checklist.json"], null, 2),
  "local-ops-manifest.json": JSON.stringify(bundle.files["local-ops-manifest.json"], null, 2),
  ".env.integration.example": formatEnvFile(ENV_DEFINITIONS, process.env),
  "setup-checklist.md": `# Setup checklist\n\n${bundle.setupChecklist.map((item) => `- ${item}`).join("\n")}\n`,
  "bundle.json": JSON.stringify(bundle, null, 2),
};

for (const [fileName, content] of Object.entries(files)) {
  writeText(path.join(packageDir, fileName), content);
}

copyFileIfExists(path.join(setupRoot, "README.md"), path.join(packageDir, "README.md"));
copyFileIfExists(path.join(setupRoot, "replication-checklist.md"), path.join(packageDir, "replication-checklist.md"));
copyFileIfExists(path.join(setupRoot, "handoff-summary.md"), path.join(packageDir, "handoff-summary.md"));
copyFileIfExists(path.join(setupRoot, "templates", ".env.bootstrap.example"), path.join(packageDir, "templates", ".env.bootstrap.example"));
copyFileIfExists(path.join(setupRoot, "templates", "canonical-products.json"), path.join(packageDir, "templates", "canonical-products.json"));
copyFileIfExists(path.join(setupRoot, "setup.template.json"), path.join(packageDir, "setup.template.json"));

if (fs.existsSync(localOpsDir)) {
  for (const fileName of fs.readdirSync(localOpsDir)) {
    copyFileIfExists(path.join(localOpsDir, fileName), path.join(packageDir, "local-ops", fileName));
  }
}

const archive = createArchive(packageDir, path.join(outputDir, `integration-kit-${workspaceSlug}`));

console.log(JSON.stringify({
  ok: archive.ok,
  outputDir,
  packageDir,
  archivePath: archive.archivePath,
  archiveFormat: archive.format,
  files: Object.keys(files),
  error: archive.error || null,
}, null, 2));

if (!archive.ok) {
  process.exitCode = 1;
}
