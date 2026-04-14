"use strict";

const fs = require("fs");
const path = require("path");

const { cleanValue, formatEnvFile } = require("./env");
const { buildLocalOpsFiles } = require("./bootstrap-local-ops");
const { writeBootstrapOutputs } = require("./bootstrap-output");
const {
  ensureSetupStructure,
  getSetupSecretsPath,
  getSetupTemplatePath,
} = require("./bootstrap-paths");
const { buildSetupPreview } = require("./bootstrap-preview");
const {
  buildCanonicalProductsTemplate,
  buildHandoffSummary,
  buildLocalOpsEnvExample,
  buildLocalOpsReadme,
  buildReadmeTemplate,
  buildReplicationChecklist,
  buildSetupTemplateObject,
} = require("./bootstrap-templates");
const {
  ENV_DEFINITIONS,
  buildPortableIntegrationBundle,
} = require("./config");

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Falha ao ler JSON em ${filePath}: ${error.message}`);
  }
}

function buildEnvFromSetupFile(setup = {}, baseEnv = process.env) {
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


function materializeSetupTemplates(cwd = process.cwd()) {
  const { root, templatesDir, localOpsDir } = ensureSetupStructure(cwd);
  const templatePath = getSetupTemplatePath(cwd);
  const envTemplatePath = path.join(templatesDir, ".env.bootstrap.example");
  const canonicalProductsPath = path.join(templatesDir, "canonical-products.json");
  const readmePath = path.join(root, "README.md");
  const localOpsReadmePath = path.join(localOpsDir, "README.md");
  const localOpsEnvPath = path.join(localOpsDir, ".env.local-ops.example");
  const replicationChecklistPath = path.join(root, "replication-checklist.md");
  const handoffSummaryPath = path.join(root, "handoff-summary.md");
  const localOpsFiles = buildLocalOpsFiles(localOpsDir);
  const templateObject = buildSetupTemplateObject();

  if (!fs.existsSync(templatePath)) {
    fs.writeFileSync(templatePath, `${JSON.stringify(templateObject, null, 2)}\n`, "utf8");
  }

  if (!fs.existsSync(envTemplatePath)) {
    fs.writeFileSync(envTemplatePath, formatEnvFile(ENV_DEFINITIONS, templateObject.env), "utf8");
  }

  if (!fs.existsSync(canonicalProductsPath)) {
    fs.writeFileSync(canonicalProductsPath, `${JSON.stringify(buildCanonicalProductsTemplate(), null, 2)}\n`, "utf8");
  }

  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(readmePath, `${buildReadmeTemplate()}\n`, "utf8");
  }

  if (!fs.existsSync(localOpsReadmePath)) {
    fs.writeFileSync(localOpsReadmePath, `${buildLocalOpsReadme()}\n`, "utf8");
  }

  if (!fs.existsSync(localOpsEnvPath)) {
    fs.writeFileSync(localOpsEnvPath, buildLocalOpsEnvExample(), "utf8");
  }

  if (!fs.existsSync(replicationChecklistPath)) {
    fs.writeFileSync(replicationChecklistPath, `${buildReplicationChecklist()}\n`, "utf8");
  }

  if (!fs.existsSync(handoffSummaryPath)) {
    fs.writeFileSync(handoffSummaryPath, `${buildHandoffSummary()}\n`, "utf8");
  }

  for (const file of localOpsFiles) {
    if (!fs.existsSync(file.path)) {
      fs.writeFileSync(file.path, file.content, "utf8");
    }
  }

  return {
    root,
    templatesDir,
    localOpsDir,
    templatePath,
    envTemplatePath,
    canonicalProductsPath,
    readmePath,
    localOpsReadmePath,
    localOpsEnvPath,
    replicationChecklistPath,
    handoffSummaryPath,
  };
}

module.exports = {
  buildSetupPreview: (setup, baseEnv) => buildSetupPreview(setup, baseEnv, buildEnvFromSetupFile),
  buildEnvFromSetupFile,
  ensureSetupStructure,
  getSetupSecretsPath,
  materializeSetupTemplates,
  readJsonFile,
  writeBootstrapOutputs,
};
