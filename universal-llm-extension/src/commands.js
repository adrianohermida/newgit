const fs = require("fs");
const path = require("path");
const open = require("open");
const { spawn } = require("child_process");
const { getConfigs } = require("./storage");
const { buildHealthPayload } = require("./health");

function safePattern(pattern) {
  const raw = String(pattern || "").trim();
  if (!raw) throw new Error("pattern obrigatorio");
  return new RegExp(raw, "i");
}

function searchFiles({ basePath, pattern, maxResults = 50 }) {
  const regex = safePattern(pattern);
  const results = [];
  const roots = resolveSearchRoots(basePath);

  function walk(dir) {
    if (results.length >= maxResults) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const filePath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(filePath);
      else if (regex.test(entry.name) || regex.test(filePath)) results.push(filePath);
    }
  }

  roots.forEach((root) => walk(root));
  return { ok: true, command: "search_files", roots, pattern: String(pattern), results };
}

function resolveSearchRoots(basePath) {
  const configuredRoots = normalizeRoots(getConfigs().local.roots);
  const requested = normalizeRoots(Array.isArray(basePath) ? basePath : [basePath]);
  const roots = requested.length ? requested : configuredRoots;
  return roots.length ? roots : [process.cwd()];
}

function normalizeRoots(values) {
  return (Array.isArray(values) ? values : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => path.resolve(item))
    .filter((item, index, list) => list.indexOf(item) === index);
}

function openLocalFile(payload) {
  const target = String(payload.path || payload.filePath || "").trim();
  if (!target) throw new Error("path obrigatorio");
  const resolved = path.resolve(target);
  if (!fs.existsSync(resolved)) throw new Error(`Arquivo nao encontrado: ${resolved}`);
  return open(resolved).then(() => ({ ok: true, command: "open_local_file", path: resolved }));
}

function launchApp(payload) {
  const name = String(payload.name || "").trim().toLowerCase();
  const configs = getConfigs();
  const app = (configs.local.apps || []).find((item) => String(item.name || "").trim().toLowerCase() === name);
  if (!app) throw new Error(`Aplicativo nao configurado: ${payload.name || ""}`);
  const child = spawn(app.path, Array.isArray(app.args) ? app.args : [], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  return Promise.resolve({ ok: true, command: "launch_app", name: app.name, path: app.path, args: app.args || [] });
}

function runLocalCommand(payload) {
  const command = String(payload.command || "").trim();
  if (!command) throw new Error("command obrigatorio");
  const args = Array.isArray(payload.args) ? payload.args.map((item) => String(item)) : [];
  const cwd = String(payload.cwd || "").trim() || process.cwd();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: true,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => { stdout += String(chunk || ""); });
    child.stderr?.on("data", (chunk) => { stderr += String(chunk || ""); });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        ok: code === 0,
        command: "run_local_command",
        exitCode: Number(code || 0),
        stdout: stdout.slice(0, 4000),
        stderr: stderr.slice(0, 4000),
      });
    });
  });
}

async function runCommand(command, payload = {}) {
  switch (command) {
    case "health_check":
      return buildHealthPayload();
    case "search_files":
      return searchFiles(payload);
    case "open_local_file":
      return openLocalFile(payload);
    case "launch_app":
      return launchApp(payload);
    case "run_local_command":
      return runLocalCommand(payload);
    case "web_search":
      if (!String(payload.query || "").trim()) throw new Error("query obrigatoria");
      await open(`https://www.google.com/search?q=${encodeURIComponent(String(payload.query).trim())}`);
      return { ok: true, command };
    case "open_url":
      if (!String(payload.url || "").trim()) throw new Error("url obrigatoria");
      await open(String(payload.url).trim());
      return { ok: true, command, url: String(payload.url).trim() };
    default:
      throw new Error(`Comando nao suportado: ${command}`);
  }
}

module.exports = {
  searchFiles,
  runCommand,
};
