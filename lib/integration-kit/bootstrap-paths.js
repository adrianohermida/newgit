"use strict";

const fs = require("fs");
const path = require("path");

function getSetupRoot(cwd = process.cwd()) {
  return path.join(cwd, "setup", "integration-kit");
}

function getSetupSecretsPath(cwd = process.cwd()) {
  return path.join(getSetupRoot(cwd), "setup.secrets.json");
}

function getSetupTemplatePath(cwd = process.cwd()) {
  return path.join(getSetupRoot(cwd), "setup.template.json");
}

function ensureSetupStructure(cwd = process.cwd()) {
  const root = getSetupRoot(cwd);
  const templatesDir = path.join(root, "templates");
  const generatedDir = path.join(root, "generated");
  const localOpsDir = path.join(root, "local-ops");

  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(templatesDir, { recursive: true });
  fs.mkdirSync(generatedDir, { recursive: true });
  fs.mkdirSync(localOpsDir, { recursive: true });

  return { root, templatesDir, generatedDir, localOpsDir };
}

module.exports = {
  ensureSetupStructure,
  getSetupRoot,
  getSetupSecretsPath,
  getSetupTemplatePath,
};
