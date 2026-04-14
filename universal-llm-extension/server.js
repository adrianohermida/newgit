/**
 * Universal LLM Extension Bridge — v0.4.0
 *
 * Endpoints:
 *  GET  /health              status dos providers
 *  GET  /download            serve o .zip da extensão (build on-demand)
 *
 *  POST /chat                proxy LLM → local | cloud | cloudflare
 *
 *  POST /sessions            salva conversa (sincroniza para ai-core /memory se disponível)
 *  GET  /sessions            lista sessões salvas (JSON)
 *  GET  /sessions/:id        sessão específica
 *
 *  POST /screenshot          recebe screenshot base64, salva em disco
 *  POST /upload              recebe arquivo base64, salva em disco
 *
 *  POST /record              grava um passo de navegação do usuário
 *  GET  /automations         lista automações gravadas
 *  GET  /automations/:id     automação específica
 *  DELETE /automations/:id   apaga automação
 *
 *  POST /play/:id            enfileira automação para replay
 *  GET  /commands            conteúdo pendente de replay (polling do content script)
 *
 *  POST /execute             comandos de sistema (search_files, web_search, open_url)
 */

const express  = require("express");
const cors     = require("cors");
const fs       = require("fs");
const path     = require("path");
const open     = require("open");
const http     = require("http");
const https    = require("https");
const crypto   = require("crypto");
const zlib     = require("zlib");

const app  = express();
app.use(cors());
app.use(express.json({ limit: "20mb" })); // suporta imagens/arquivos base64

const PORT = Number(process.env.UNIVERSAL_LLM_EXTENSION_PORT || 32123);
const DIR  = __dirname;

// ─── Pastas de dados ──────────────────────────────────────────────────────────
const DATA_DIR        = path.join(DIR, "data");
const SESSIONS_DIR    = path.join(DATA_DIR, "sessions");
const AUTOMATIONS_DIR = path.join(DATA_DIR, "automations");
const SCREENSHOTS_DIR = path.join(DATA_DIR, "screenshots");
const UPLOADS_DIR     = path.join(DATA_DIR, "uploads");

for (const d of [SESSIONS_DIR, AUTOMATIONS_DIR, SCREENSHOTS_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ─── Providers ────────────────────────────────────────────────────────────────
const AICORE_CANDIDATES = [
  process.env.AICORE_API_BASE_URL,
  process.env.LOCAL_LLM_BASE_URL,
  "http://127.0.0.1:8010",
  "http://127.0.0.1:8000",
].filter(Boolean);

const APP_BASE_URL = (process.env.APP_BASE_URL || process.env.NEXTJS_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
const CLOUD_BASE_URL   = (process.env.CUSTOM_LLM_BASE_URL || process.env.PROCESS_AI_BASE || process.env.LAWDESK_AI_BASE_URL || process.env.HMADV_RUNNER_URL || "").replace(/\/+$/, "");
const CLOUD_AUTH_TOKEN = process.env.CUSTOM_LLM_AUTH_TOKEN || process.env.HMADV_AI_SHARED_SECRET || process.env.LAWDESK_AI_SHARED_SECRET || "";
const CF_MODEL         = process.env.CLOUDFLARE_WORKERS_AI_MODEL || process.env.CF_WORKERS_AI_MODEL || "@cf/meta/llama-3.1-8b-instruct";
const CF_ACCOUNT_ID    = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CF_API_TOKEN     = process.env.CLOUDFLARE_API_TOKEN  || "";

// ─── Fila de comandos de replay (em memória, por sessão) ──────────────────────
const commandQueue = new Map(); // tabId → [{ type, payload }]

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return crypto.randomBytes(8).toString("hex"); }
function ts()  { return new Date().toISOString(); }
function joinUrl(base, p) { return `${String(base).replace(/\/+$/, "")}/${String(p).replace(/^\/+/, "")}`; }
function safeWrite(filePath, data) { fs.writeFileSync(filePath, typeof data === "string" ? data : JSON.stringify(data, null, 2), "utf8"); }
function safeRead(filePath) { try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; } }

function listJsonDir(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .map(f => safeRead(path.join(dir, f)))
      .filter(Boolean)
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  } catch { return []; }
}

async function jsonPost(url, body, headers = {}) {
  const lib = url.startsWith("https") ? https : http;
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed  = new URL(url);
    const opts    = {
      hostname: parsed.hostname,
      port:     parsed.port || (url.startsWith("https") ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...headers },
    };
    const req = lib.request(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: { raw: data } }); }
      });
    });
    req.on("error", reject);
    req.setTimeout(60000, () => req.destroy(new Error("Timeout ao chamar LLM.")));
    req.write(payload);
    req.end();
  });
}

function extractContent(data) {
  if (!data || typeof data !== "object") return null;
  if (Array.isArray(data.content)) {
    const t = data.content.map(b => typeof b === "string" ? b : b?.text || "").filter(Boolean).join("\n");
    if (t) return t;
  }
  if (typeof data.content === "string" && data.content) return data.content;
  if (typeof data.result  === "string" && data.result)  return data.result;
  if (typeof data.data?.result === "string")             return data.data.result;
  if (typeof data.message?.content === "string")        return data.message.content;
  if (Array.isArray(data.choices) && data.choices[0]?.message?.content) return data.choices[0].message.content;
  if (typeof data.result?.response === "string")         return data.result.response;
  return null;
}

// ─── GET /download ────────────────────────────────────────────────────────────
app.get("/download", (req, res) => {
  const DIST_DIR = path.join(DIR, "dist");
  const ZIP_NAME = "universal-llm-assistant-v9.0.0.zip";
  const zipPath  = path.join(DIST_DIR, ZIP_NAME);

  if (!fs.existsSync(zipPath)) {
    // Tenta build on-demand
    try {
      require("./build-all.js");
    } catch {}
  }

  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ ok: false, error: "Extensão não empacotada. Execute: npm run build:extension" });
  }

  const stat = fs.statSync(zipPath);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${ZIP_NAME}"`);
  res.setHeader("Content-Length", stat.size);
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Access-Control-Allow-Origin", "*");
  fs.createReadStream(zipPath).pipe(res);
});

// ─── POST /chat ───────────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { provider = "local", messages, model, context } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: "messages[] é obrigatório." });
  }

  // Injeta contexto extra (conteúdo de arquivo, screenshot OCR, etc.) se fornecido
  const enrichedMessages = context
    ? [...messages.slice(0, -1), { role: "user", content: `${context}\n\n${messages[messages.length - 1].content}` }]
    : messages;

  try {
    if (provider === "local") {
      const useModel = model || process.env.LOCAL_LLM_MODEL || "aetherlab-legal-local-v1";
      let lastErr;
      for (const baseUrl of AICORE_CANDIDATES) {
        try {
          const r = await jsonPost(joinUrl(baseUrl, "/v1/messages"), { model: useModel, messages: enrichedMessages, max_tokens: 1400 });
          const content = extractContent(r.body);
          if (r.status >= 200 && r.status < 300 && content) return res.json({ ok: true, content, provider: "local", model: useModel });
          lastErr = new Error(`ai-core ${r.status}: ${JSON.stringify(r.body).substring(0, 200)}`);
        } catch (err) { lastErr = err; }
      }
      throw lastErr || new Error("Runtime local indisponível.");
    }

    if (provider === "cloud") {
      if (!CLOUD_BASE_URL) throw new Error("Provider cloud não configurado. Defina CUSTOM_LLM_BASE_URL.");
      const useModel = model || process.env.CUSTOM_LLM_MODEL || "aetherlab-legal-v1";
      const headers  = CLOUD_AUTH_TOKEN ? { Authorization: `Bearer ${CLOUD_AUTH_TOKEN}` } : {};
      const r = await jsonPost(joinUrl(CLOUD_BASE_URL, "/v1/messages"), { model: useModel, messages: enrichedMessages, max_tokens: 1400 }, headers);
      const content = extractContent(r.body);
      if (r.status >= 200 && r.status < 300 && content) return res.json({ ok: true, content, provider: "cloud", model: useModel });
      throw new Error(`Cloud ${r.status}: ${JSON.stringify(r.body).substring(0, 200)}`);
    }

    if (provider === "cloudflare") {
      const useModel = model || CF_MODEL;
      if (CF_ACCOUNT_ID && CF_API_TOKEN) {
        const cfUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${encodeURIComponent(useModel)}`;
        const r = await jsonPost(cfUrl, { messages: enrichedMessages }, { Authorization: `Bearer ${CF_API_TOKEN}` });
        const content = extractContent(r.body);
        if (r.status >= 200 && r.status < 300 && content) return res.json({ ok: true, content, provider: "cloudflare", model: useModel });
        throw new Error(`Cloudflare API ${r.status}: ${JSON.stringify(r.body).substring(0, 200)}`);
      }
      const query = enrichedMessages.map(m => `[${m.role}] ${m.content}`).join("\n");
      const r = await jsonPost(joinUrl(APP_BASE_URL, "/api/admin-lawdesk-chat"), { query, provider: "cloudflare", model: useModel });
      const content = extractContent(r.body);
      if (r.status >= 200 && r.status < 300 && content) return res.json({ ok: true, content, provider: "cloudflare", model: useModel });
      throw new Error(`App proxy ${r.status}: ${JSON.stringify(r.body).substring(0, 200)}`);
    }

    throw new Error(`Provider desconhecido: ${provider}`);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message || "Falha ao chamar o LLM.", provider });
  }
});

// ─── SESSIONS ─────────────────────────────────────────────────────────────────
app.post("/sessions", async (req, res) => {
  try {
    const { sessionId, messages, provider, model, metadata } = req.body || {};
    const id        = sessionId || uid();
    const filePath  = path.join(SESSIONS_DIR, `${id}.json`);
    const existing  = safeRead(filePath) || {};

    const session = {
      id,
      provider:   provider  || existing.provider  || "local",
      model:      model     || existing.model     || "unknown",
      metadata:   { ...existing.metadata, ...metadata },
      messages:   messages  || existing.messages  || [],
      createdAt:  existing.createdAt || ts(),
      updatedAt:  ts(),
    };

    safeWrite(filePath, session);

    // Sincroniza para o ai-core /memory se disponível
    for (const baseUrl of AICORE_CANDIDATES) {
      try {
        const lastPair = session.messages.slice(-2);
        if (lastPair.length > 0) {
          await jsonPost(joinUrl(baseUrl, "/memory"), {
            session_id: id,
            messages:   lastPair,
            metadata:   session.metadata,
          });
        }
        break; // sucesso no primeiro candidato
      } catch { /* ai-core pode não ter /memory — ignora silenciosamente */ }
    }

    return res.json({ ok: true, id, updatedAt: session.updatedAt });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message });
  }
});

app.get("/sessions", (_req, res) => {
  const sessions = listJsonDir(SESSIONS_DIR).map(s => ({
    id:        s.id,
    provider:  s.provider,
    model:     s.model,
    messageCount: (s.messages || []).length,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    metadata:  s.metadata,
  }));
  res.json({ ok: true, sessions });
});

app.get("/sessions/:id", (req, res) => {
  const filePath = path.join(SESSIONS_DIR, `${req.params.id}.json`);
  const session  = safeRead(filePath);
  if (!session) return res.status(404).json({ ok: false, error: "Sessão não encontrada." });
  res.json({ ok: true, session });
});

app.delete("/sessions/:id", (req, res) => {
  const filePath = path.join(SESSIONS_DIR, `${req.params.id}.json`);
  try { fs.unlinkSync(filePath); } catch {}
  res.json({ ok: true });
});

// ─── SCREENSHOT ───────────────────────────────────────────────────────────────
app.post("/screenshot", (req, res) => {
  try {
    const { dataUrl, sessionId, tabUrl, tabTitle } = req.body || {};
    if (!dataUrl) return res.status(400).json({ ok: false, error: "dataUrl obrigatório." });

    const id       = uid();
    const ext      = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
    const imgPath  = path.join(SCREENSHOTS_DIR, `${id}.${ext}`);
    const metaPath = path.join(SCREENSHOTS_DIR, `${id}.json`);

    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    fs.writeFileSync(imgPath, Buffer.from(base64, "base64"));
    safeWrite(metaPath, { id, ext, sessionId, tabUrl, tabTitle, createdAt: ts(), filePath: imgPath });

    return res.json({ ok: true, id, filePath: imgPath });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message });
  }
});

// ─── UPLOAD DE ARQUIVO ────────────────────────────────────────────────────────
app.post("/upload", (req, res) => {
  try {
    const { dataUrl, fileName, mimeType, sessionId } = req.body || {};
    if (!dataUrl && !fileName) return res.status(400).json({ ok: false, error: "dataUrl ou fileName obrigatório." });

    const id       = uid();
    const safeName = (fileName || "arquivo").replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = path.join(UPLOADS_DIR, `${id}_${safeName}`);
    const metaPath = path.join(UPLOADS_DIR, `${id}.json`);

    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
    fs.writeFileSync(filePath, Buffer.from(base64, "base64"));
    safeWrite(metaPath, { id, fileName: safeName, mimeType, sessionId, filePath, createdAt: ts() });

    // Extrai texto simples se for txt/json/md (para contexto LLM)
    let textContent = null;
    const isText = /\.(txt|md|json|csv|js|py|ts|html|css|xml|yaml|yml)$/.test(safeName);
    if (isText) {
      try { textContent = fs.readFileSync(filePath, "utf8").substring(0, 12000); } catch {}
    }

    return res.json({ ok: true, id, filePath, fileName: safeName, textContent });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message });
  }
});

// ─── RECORDER DE NAVEGAÇÃO ────────────────────────────────────────────────────
app.post("/record", (req, res) => {
  try {
    const { automationId, step, tabUrl, tabTitle } = req.body || {};
    if (!automationId || !step) return res.status(400).json({ ok: false, error: "automationId e step obrigatórios." });

    const filePath = path.join(AUTOMATIONS_DIR, `${automationId}.json`);
    const existing = safeRead(filePath) || {
      id: automationId,
      title: tabTitle || tabUrl || "Automação sem título",
      startUrl: tabUrl || "",
      steps: [],
      createdAt: ts(),
    };

    existing.steps.push({ ...step, recordedAt: ts() });
    existing.updatedAt = ts();
    existing.stepCount = existing.steps.length;
    safeWrite(filePath, existing);

    return res.json({ ok: true, automationId, stepCount: existing.stepCount });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err?.message });
  }
});

app.get("/automations", (_req, res) => {
  const list = listJsonDir(AUTOMATIONS_DIR).map(a => ({
    id:        a.id,
    title:     a.title,
    startUrl:  a.startUrl,
    stepCount: a.stepCount || (a.steps || []).length,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));
  res.json({ ok: true, automations: list });
});

app.get("/automations/:id", (req, res) => {
  const filePath = path.join(AUTOMATIONS_DIR, `${req.params.id}.json`);
  const auto = safeRead(filePath);
  if (!auto) return res.status(404).json({ ok: false, error: "Automação não encontrada." });
  res.json({ ok: true, automation: auto });
});

app.delete("/automations/:id", (req, res) => {
  const filePath = path.join(AUTOMATIONS_DIR, `${req.params.id}.json`);
  try { fs.unlinkSync(filePath); } catch {}
  res.json({ ok: true });
});

// ─── REPLAY ───────────────────────────────────────────────────────────────────
app.post("/play/:id", (req, res) => {
  const filePath = path.join(AUTOMATIONS_DIR, `${req.params.id}.json`);
  const auto     = safeRead(filePath);
  if (!auto) return res.status(404).json({ ok: false, error: "Automação não encontrada." });

  const tabId = req.body?.tabId || "default";
  if (!commandQueue.has(tabId)) commandQueue.set(tabId, []);
  commandQueue.get(tabId).push(...auto.steps.map(step => ({ type: "REPLAY_STEP", payload: step })));

  return res.json({ ok: true, queued: auto.steps.length, tabId });
});

// Polling: content script busca comandos pendentes
app.get("/commands", (req, res) => {
  const tabId   = req.query.tabId || "default";
  const pending = commandQueue.get(tabId) || [];
  commandQueue.set(tabId, []);          // drena a fila
  res.json({ ok: true, commands: pending });
});

// ─── EXECUTE (comandos de sistema existentes) ─────────────────────────────────
function safePattern(pattern) {
  const raw = String(pattern || "").trim();
  if (!raw) throw new Error("pattern obrigatório");
  return new RegExp(raw, "i");
}

function searchFiles({ basePath, pattern, maxResults = 50 }) {
  const base  = path.resolve(basePath || process.cwd());
  const regex = safePattern(pattern);
  const results = [];
  function walk(dir) {
    if (results.length >= maxResults) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (results.length >= maxResults) break;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) { walk(fp); continue; }
      if (regex.test(e.name) || regex.test(fp)) results.push(fp);
    }
  }
  walk(base);
  return { ok: true, command: "search_files", basePath: base, pattern: String(pattern), results };
}

async function runCommand(command, payload = {}) {
  switch (command) {
    case "health_check": return healthPayload();
    case "search_files": return searchFiles(payload);
    case "web_search": {
      const query = String(payload.query || "").trim();
      if (!query) throw new Error("query obrigatória");
      await open(`https://www.google.com/search?q=${encodeURIComponent(query)}`);
      return { ok: true, command };
    }
    case "open_url": {
      const url = String(payload.url || "").trim();
      if (!url) throw new Error("url obrigatória");
      await open(url);
      return { ok: true, command, url };
    }
    default: throw new Error(`Comando não suportado: ${command}`);
  }
}

app.post("/execute", async (req, res) => {
  try {
    const command = String(req.body?.command || "").trim();
    const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
    if (!command) return res.status(400).json({ ok: false, error: "command obrigatório" });
    res.json(await runCommand(command, payload));
  } catch (err) {
    res.status(500).json({ ok: false, error: err?.message });
  }
});

app.post("/search-files", (req, res) => {
  try { res.json(searchFiles(req.body || {})); }
  catch (err) { res.status(500).json({ ok: false, error: err?.message }); }
});

app.post("/web-search", async (req, res) => {
  try { res.json(await runCommand("web_search", req.body || {})); }
  catch (err) { res.status(500).json({ ok: false, error: err?.message }); }
});

app.post("/open-url", async (req, res) => {
  try { res.json(await runCommand("open_url", req.body || {})); }
  catch (err) { res.status(500).json({ ok: false, error: err?.message }); }
});

// ─── GET /health ──────────────────────────────────────────────────────────────
function healthPayload() {
  return {
    ok: true,
    service: "universal-llm-extension",
    version: "0.4.0",
    port: PORT,
    providers: {
      local:      { candidates: AICORE_CANDIDATES },
      cloud:      { configured: Boolean(CLOUD_BASE_URL), baseUrl: CLOUD_BASE_URL || null },
      cloudflare: { model: CF_MODEL, directApi: Boolean(CF_ACCOUNT_ID && CF_API_TOKEN), proxyApp: Boolean(APP_BASE_URL) },
    },
    data: {
      sessions:    listJsonDir(SESSIONS_DIR).length,
      automations: listJsonDir(AUTOMATIONS_DIR).length,
      screenshots: fs.readdirSync(SCREENSHOTS_DIR).filter(f => !f.endsWith(".json")).length,
      uploads:     fs.readdirSync(UPLOADS_DIR).filter(f => !f.endsWith(".json")).length,
    },
    commands: ["health_check", "search_files", "web_search", "open_url"],
    endpoints: ["/chat", "/sessions", "/screenshot", "/upload", "/record", "/automations", "/play/:id", "/commands", "/download"],
  };
}

app.get("/health", (_req, res) => res.json(healthPayload()));

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[universal-llm-extension] bridge v0.4.0 → http://localhost:${PORT}`);
  console.log(`  /chat         proxy LLM (local | cloud | cloudflare)`);
  console.log(`  /sessions     persistência de conversas + sync ai-core /memory`);
  console.log(`  /screenshot   captura de tela`);
  console.log(`  /upload       upload de arquivos para análise`);
  console.log(`  /record       gravação de passos de navegação`);
  console.log(`  /automations  lista / reproduz automações`);
  console.log(`  /play/:id     enfileira replay para content script`);
  console.log(`  /commands     polling de comandos (content script)`);
  console.log(`  /download     serve a extensão .zip`);
});
