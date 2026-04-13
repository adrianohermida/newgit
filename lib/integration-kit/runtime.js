"use strict";

const fs = require("fs");
const path = require("path");

const { loadPreferredEnvFiles, cleanValue, parseJsonEnv } = require("./env");
const { buildWorkspaceSlug } = require("./config");
const { buildEnvFromSetupFile, getSetupSecretsPath } = require("./bootstrap");

const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, "../..");

function loadRuntimeEnv(cwd = DEFAULT_PROJECT_ROOT, baseEnv = process.env) {
  loadPreferredEnvFiles(cwd, baseEnv);

  const setupPath = getSetupSecretsPath(cwd);
  if (fs.existsSync(setupPath)) {
    const setup = JSON.parse(fs.readFileSync(setupPath, "utf8"));
    const merged = buildEnvFromSetupFile(setup, baseEnv);
    Object.assign(baseEnv, merged);
  }

  const workspaceSlug = buildWorkspaceSlug(baseEnv);
  const generatedDir = path.join(cwd, "setup", "integration-kit", "generated", workspaceSlug);
  const envBootstrapPath = path.join(generatedDir, ".env.bootstrap");
  if (fs.existsSync(envBootstrapPath)) {
    const lines = fs.readFileSync(envBootstrapPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.trim().startsWith("#")) continue;
      const index = line.indexOf("=");
      if (index === -1) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1);
      if (!key || baseEnv[key] !== undefined) continue;
      baseEnv[key] = value;
    }
  }

  return {
    env: baseEnv,
    workspaceSlug,
    generatedDir,
    bundle: readJson(path.join(generatedDir, "bundle.json")),
    integrationConfig: readJson(path.join(generatedDir, "integration.config.json")),
    fieldMapping: readJson(path.join(generatedDir, "field-mapping.json")),
    businessRules: readJson(path.join(generatedDir, "business-rules.json")),
    canonicalProducts: readJson(path.join(generatedDir, "canonical-products.json")) || readJson(path.join(cwd, "setup", "integration-kit", "templates", "canonical-products.json")),
    authorize: readJson(path.join(generatedDir, "authorize-url.json")),
  };
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveWorkspaceId(runtime) {
  return (
    cleanValue(runtime?.env?.INTEGRATION_WORKSPACE_SLUG) ||
    cleanValue(runtime?.env?.HMADV_WORKSPACE_ID) ||
    cleanValue(runtime?.integrationConfig?.workspace?.slug) ||
    cleanValue(runtime?.workspaceSlug) ||
    null
  );
}

function resolveFreshsalesStageMap(runtime) {
  return parseJsonEnv(runtime?.env?.FRESHSALES_BILLING_DEAL_STAGE_ID_MAP, {}) ||
    runtime?.integrationConfig?.mappings?.dealStageMap ||
    {};
}

function resolveFieldMap(runtime) {
  return (
    runtime?.fieldMapping?.freshsales?.dealFieldMap ||
    parseJsonEnv(runtime?.env?.FRESHSALES_BILLING_DEAL_FIELD_MAP, {})
  );
}

function parseBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return defaultValue;
}

function isLocalDesktopRuntime(env = process.env, cwd = DEFAULT_PROJECT_ROOT) {
  const appData = String(env.APPDATA || env.LOCALAPPDATA || "").trim();
  const resolvedCwd = String(cwd || "").trim();
  return resolvedCwd.length > 0 && (resolvedCwd.startsWith("C:\\") || resolvedCwd.startsWith("D:\\")) && appData.length > 0;
}

function getIntegrationKitMode(env = process.env, cwd = DEFAULT_PROJECT_ROOT) {
  return isLocalDesktopRuntime(env, cwd) ? "local-ops" : "static-safe";
}

function getIntegrationKitCapabilities(env = process.env, cwd = DEFAULT_PROJECT_ROOT) {
  const mode = getIntegrationKitMode(env, cwd);
  const localRuntime = mode === "local-ops";
  const runnerEnabled = parseBoolean(env.INTEGRATION_KIT_COMMAND_RUNNER_ENABLED, false);
  const serverWriteEnabled = parseBoolean(env.INTEGRATION_KIT_ALLOW_SERVER_FILE_WRITE, false);

  return {
    mode,
    localRuntime,
    canDownloadSetup: true,
    canPreview: true,
    canServerSaveSetup: localRuntime && serverWriteEnabled,
    canRunCommands: localRuntime && runnerEnabled,
    commandRunnerEnabled: runnerEnabled,
    serverWriteEnabled,
  };
}

module.exports = {
  getIntegrationKitCapabilities,
  getIntegrationKitMode,
  isLocalDesktopRuntime,
  loadRuntimeEnv,
  parseBoolean,
  resolveFieldMap,
  resolveFreshsalesStageMap,
  resolveWorkspaceId,
};
