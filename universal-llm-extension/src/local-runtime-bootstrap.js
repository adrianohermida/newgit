const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { REPO_DIR } = require("./config");
const { probeJsonGetEndpoint } = require("./http-client");
const { joinUrl } = require("./utils");

const state = {
  inFlight: null,
  lastAttemptAt: "",
  lastReadyAt: "",
  lastReason: "",
  lastStatus: "idle",
  lastError: "",
};

function getScriptPath() {
  return path.join(REPO_DIR, "scripts", "start-ai-core-local.ps1");
}

function getTargetBaseUrl(configs) {
  return String(configs?.local?.candidates?.[0] || "").trim();
}

function parsePort(baseUrl) {
  try {
    return Number(new URL(baseUrl).port || 80);
  } catch {
    return 8000;
  }
}

async function isLocalRuntimeReady(configs) {
  const baseUrl = getTargetBaseUrl(configs);
  if (!baseUrl) return false;
  try {
    const probe = await probeJsonGetEndpoint(joinUrl(baseUrl, "/health"), {}, { timeoutMs: 2500 });
    return Boolean(probe?.ok);
  } catch {
    return false;
  }
}

function buildCommand(configs) {
  const args = ["-ExecutionPolicy", "Bypass", "-File", getScriptPath(), "-Port", String(parsePort(getTargetBaseUrl(configs)))];
  const model = String(configs?.local?.model || "").trim();
  if (model) args.push("-LocalLlmModel", model);
  return args;
}

function spawnLocalRuntime(configs) {
  const scriptPath = getScriptPath();
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`Script de bootstrap nao encontrado: ${scriptPath}`);
  }
  const logsDir = path.join(REPO_DIR, ".runtime-logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const stdoutPath = path.join(logsDir, "ai-core-bootstrap.out.log");
  const stderrPath = path.join(logsDir, "ai-core-bootstrap.err.log");
  const stdoutFd = fs.openSync(stdoutPath, "a");
  const stderrFd = fs.openSync(stderrPath, "a");
  const child = spawn("powershell", buildCommand(configs), {
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd],
    windowsHide: true,
  });
  child.unref();
}

async function waitUntilReady(configs, timeoutMs = 35000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isLocalRuntimeReady(configs)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

async function ensureLocalRuntimeStarted(configs, reason = "runtime_check") {
  if (await isLocalRuntimeReady(configs)) {
    if (!state.lastReadyAt) state.lastReadyAt = new Date().toISOString();
    state.lastStatus = "already_running";
    state.lastError = "";
    return { ok: true, status: "already_running" };
  }
  if (state.inFlight) return state.inFlight;
  state.inFlight = (async () => {
    state.lastAttemptAt = new Date().toISOString();
    state.lastReason = reason;
    state.lastStatus = "starting";
    state.lastError = "";
    try {
      spawnLocalRuntime(configs);
      const ready = await waitUntilReady(configs);
      if (!ready) {
        state.lastStatus = "timeout";
        state.lastError = "O Ai-Core Local nao respondeu dentro da janela de bootstrap.";
        return { ok: false, status: "timeout", error: state.lastError };
      }
      state.lastReadyAt = new Date().toISOString();
      state.lastStatus = "started";
      return { ok: true, status: "started" };
    } catch (error) {
      state.lastStatus = "error";
      state.lastError = error?.message || "Falha ao iniciar o Ai-Core Local.";
      return { ok: false, status: "error", error: state.lastError };
    } finally {
      state.inFlight = null;
    }
  })();
  return state.inFlight;
}

function triggerLocalRuntimeBootstrap(configs, reason = "runtime_warmup") {
  ensureLocalRuntimeStarted(configs, reason).catch(() => {});
}

function getLocalRuntimeBootstrapState() {
  return {
    scriptPath: getScriptPath(),
    lastAttemptAt: state.lastAttemptAt,
    lastReadyAt: state.lastReadyAt,
    lastReason: state.lastReason,
    lastStatus: state.lastStatus,
    lastError: state.lastError,
    starting: Boolean(state.inFlight),
  };
}

module.exports = {
  ensureLocalRuntimeStarted,
  triggerLocalRuntimeBootstrap,
  getLocalRuntimeBootstrapState,
};
