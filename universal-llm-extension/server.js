// Universal LLM Assistant Local Extension (Node.js)
// Bridge local para missões assistidas: web, arquivos e navegação.

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const open = require("open");

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = Number(process.env.UNIVERSAL_LLM_EXTENSION_PORT || 32123);
const DEFAULT_BASE_PATH = process.env.UNIVERSAL_LLM_DEFAULT_BASE_PATH || process.cwd();

function safePattern(pattern) {
  if (pattern instanceof RegExp) return pattern;
  const raw = String(pattern || "").trim();
  if (!raw) {
    throw new Error("pattern obrigatório");
  }
  return new RegExp(raw, "i");
}

function healthPayload() {
  return {
    ok: true,
    service: "universal-llm-extension",
    version: "0.2.0",
    port: PORT,
    defaultBasePath: DEFAULT_BASE_PATH,
    commands: ["health_check", "search_files", "web_search", "open_url"],
  };
}

function searchFiles({ basePath, pattern, maxResults = 50 }) {
  const resolvedBasePath = path.resolve(basePath || DEFAULT_BASE_PATH);
  const regex = safePattern(pattern);
  const results = [];

  function walk(dir) {
    if (results.length >= maxResults) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= maxResults) break;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (regex.test(entry.name) || regex.test(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  walk(resolvedBasePath);
  return {
    ok: true,
    command: "search_files",
    basePath: resolvedBasePath,
    pattern: String(pattern),
    results,
  };
}

async function runCommand(command, payload = {}) {
  switch (command) {
    case "health_check":
      return healthPayload();
    case "search_files":
      return searchFiles(payload);
    case "web_search": {
      const query = String(payload.query || "").trim();
      if (!query) throw new Error("query obrigatória");
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      await open(url);
      return { ok: true, command, url, message: "Busca aberta no navegador local." };
    }
    case "open_url": {
      const url = String(payload.url || "").trim();
      if (!url) throw new Error("url obrigatória");
      await open(url);
      return { ok: true, command, url, message: "URL aberta no navegador local." };
    }
    default:
      throw new Error(`Comando não suportado: ${command}`);
  }
}

app.get("/health", (_req, res) => {
  res.json(healthPayload());
});

app.post("/execute", async (req, res) => {
  try {
    const command = String(req.body?.command || "").trim();
    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
    if (!command) {
      return res.status(400).json({ ok: false, error: "command obrigatório" });
    }
    const result = await runCommand(command, payload);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || "Falha ao executar comando da extensão local.",
    });
  }
});

app.post("/search-files", (req, res) => {
  try {
    res.json(searchFiles(req.body || {}));
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Falha na busca de arquivos." });
  }
});

app.post("/web-search", async (req, res) => {
  try {
    res.json(await runCommand("web_search", req.body || {}));
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Falha na busca web." });
  }
});

app.post("/open-url", async (req, res) => {
  try {
    res.json(await runCommand("open_url", req.body || {}));
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Falha ao abrir URL." });
  }
});

app.listen(PORT, () => {
  console.log(`Universal LLM Assistant Extension rodando em http://localhost:${PORT}`);
});
