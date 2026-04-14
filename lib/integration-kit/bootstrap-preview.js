"use strict";

const { formatEnvFile } = require("./env");
const { buildAuthorizeUrl } = require("./freshworks");
const { ENV_DEFINITIONS, buildPortableIntegrationBundle } = require("./config");

function buildSetupPreview(setup = {}, baseEnv = process.env, buildEnvFromSetupFile) {
  const env = buildEnvFromSetupFile(setup, baseEnv);
  const bundle = buildPortableIntegrationBundle(env);
  const authorize = buildAuthorizeUrl(env, "freshsales");

  return {
    env,
    bundle,
    authorize,
    envBootstrap: formatEnvFile(ENV_DEFINITIONS, env),
    credentialChecklist: bundle.files["credential-checklist.json"] || [],
    setupFile: {
      project: setup.project || {},
      env: setup.env || {},
    },
  };
}

module.exports = { buildSetupPreview };
