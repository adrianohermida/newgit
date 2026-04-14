"use strict";

const fs = require("fs");
const path = require("path");

const { formatEnvFile } = require("./env");
const { buildAuthorizeUrl } = require("./freshworks");
const { ensureSetupStructure, getSetupRoot } = require("./bootstrap-paths");
const { ENV_DEFINITIONS, buildPortableIntegrationBundle, buildWorkspaceSlug } = require("./config");

function writeBootstrapOutputs(env, cwd = process.cwd()) {
  const { generatedDir } = ensureSetupStructure(cwd);
  const workspaceSlug = buildWorkspaceSlug(env);
  const bundle = buildPortableIntegrationBundle(env);
  const authorize = buildAuthorizeUrl(env, "freshsales");
  const outputDir = path.join(generatedDir, workspaceSlug);

  fs.mkdirSync(outputDir, { recursive: true });

  const files = Object.fromEntries(
    Object.entries(bundle.files).map(([fileName, content]) => [fileName, JSON.stringify(content, null, 2)])
  );

  Object.assign(files, {
    ".env.bootstrap": formatEnvFile(ENV_DEFINITIONS, env),
    "bundle.json": JSON.stringify(bundle, null, 2),
    "authorize-url.json": JSON.stringify(authorize, null, 2),
  });

  const canonicalProductsPath = path.join(getSetupRoot(cwd), "templates", "canonical-products.json");
  if (fs.existsSync(canonicalProductsPath)) {
    files["canonical-products.json"] = fs.readFileSync(canonicalProductsPath, "utf8").trim();
  }

  for (const [fileName, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(outputDir, fileName), `${content}\n`, "utf8");
  }

  return { outputDir, files: Object.keys(files), workspaceSlug, authorize, bundle };
}

module.exports = { writeBootstrapOutputs };
