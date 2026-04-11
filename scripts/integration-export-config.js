#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { loadPreferredEnvFiles, formatEnvFile } = require("../lib/integration-kit/env");
const { ENV_DEFINITIONS, buildPortableIntegrationBundle, buildWorkspaceSlug } = require("../lib/integration-kit/config");

loadPreferredEnvFiles(process.cwd(), process.env);

const workspaceSlug = buildWorkspaceSlug(process.env);
const outputDir = path.join(process.cwd(), "artifacts", "integration-kit", workspaceSlug);

fs.mkdirSync(outputDir, { recursive: true });

const bundle = buildPortableIntegrationBundle(process.env);
const files = {
  "integration.config.json": JSON.stringify(bundle.files["integration.config.json"], null, 2),
  "field-mapping.json": JSON.stringify(bundle.files["field-mapping.json"], null, 2),
  "business-rules.json": JSON.stringify(bundle.files["business-rules.json"], null, 2),
  ".env.integration.example": formatEnvFile(ENV_DEFINITIONS, process.env),
  "setup-checklist.md": `# Setup checklist\n\n${bundle.setupChecklist.map((item) => `- ${item}`).join("\n")}\n`,
  "bundle.json": JSON.stringify(bundle, null, 2),
};

for (const [fileName, content] of Object.entries(files)) {
  fs.writeFileSync(path.join(outputDir, fileName), content, "utf8");
}

console.log(JSON.stringify({
  ok: true,
  outputDir,
  files: Object.keys(files),
}, null, 2));
