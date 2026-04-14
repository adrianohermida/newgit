const fs = require("fs");
const path = require("path");
const open = require("open");
const { buildHealthPayload } = require("./health");

function safePattern(pattern) {
  const raw = String(pattern || "").trim();
  if (!raw) throw new Error("pattern obrigatorio");
  return new RegExp(raw, "i");
}

function searchFiles({ basePath, pattern, maxResults = 50 }) {
  const base = path.resolve(basePath || process.cwd());
  const regex = safePattern(pattern);
  const results = [];

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

  walk(base);
  return { ok: true, command: "search_files", basePath: base, pattern: String(pattern), results };
}

async function runCommand(command, payload = {}) {
  switch (command) {
    case "health_check":
      return buildHealthPayload();
    case "search_files":
      return searchFiles(payload);
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
