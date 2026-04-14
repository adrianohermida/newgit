"use strict";

const { cleanValue, formatEnvFile } = require("./portable/portable-env");
const { buildAuthorizeUrl } = require("./portable/portable-freshworks");
const {
  ENV_DEFINITIONS,
  buildLocalOpsManifest,
  buildPortableIntegrationBundle,
  buildRequiredChecks,
} = require("./portable/portable-config");

function buildEnvFromSetupFile(setup = {}, baseEnv = {}) {
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

function buildPortableSetupPreview(setup = {}, baseEnv = {}) {
  const env = buildEnvFromSetupFile(setup, baseEnv);
  const bundle = buildPortableIntegrationBundle(env);
  return {
    bundle,
    authorize: buildAuthorizeUrl(env),
    credentialChecklist: bundle.files["credential-checklist.json"] || [],
    envBootstrap: formatEnvFile(ENV_DEFINITIONS, env),
    setupFile: {
      project: setup.project || {},
      env: setup.env || {},
    },
    requiredChecks: buildRequiredChecks(env),
  };
}

module.exports = {
  ENV_DEFINITIONS,
  buildLocalOpsManifest,
  buildPortableIntegrationBundle,
  buildRequiredChecks,
  formatEnvFile,
  buildPortableSetupPreview,
};
