const express = require("express");
const path = require("path");
const { SESSIONS_DIR } = require("../config");
const { getConfigs, listJsonDir, safeRead, safeWrite } = require("../storage");
const { uid, ts, joinUrl } = require("../utils");
const { jsonPost } = require("../http-client");

function createSessionsRouter() {
  const router = express.Router();

  router.post("/sessions", async (req, res) => {
    try {
      const { sessionId, messages, provider, model, metadata } = req.body || {};
      const id = sessionId || uid();
      const filePath = path.join(SESSIONS_DIR, `${id}.json`);
      const existing = safeRead(filePath) || {};
      const session = { id, provider: provider || existing.provider || "local", model: model || existing.model || "unknown", metadata: { ...existing.metadata, ...metadata }, messages: messages || existing.messages || [], createdAt: existing.createdAt || ts(), updatedAt: ts() };
      safeWrite(filePath, session);

      for (const baseUrl of getConfigs().local.candidates) {
        try {
          const lastPair = session.messages.slice(-2);
          if (lastPair.length) await jsonPost(joinUrl(baseUrl, "/memory"), { session_id: id, messages: lastPair, metadata: session.metadata });
          break;
        } catch {}
      }

      res.json({ ok: true, id, updatedAt: session.updatedAt });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message });
    }
  });

  router.get("/sessions", (_req, res) => res.json({ ok: true, sessions: listJsonDir(SESSIONS_DIR).map((session) => ({ id: session.id, provider: session.provider, model: session.model, messageCount: Array.isArray(session.messages) ? session.messages.length : 0, createdAt: session.createdAt, updatedAt: session.updatedAt, metadata: session.metadata })) }));
  router.get("/sessions/:id", (req, res) => {
    const session = safeRead(path.join(SESSIONS_DIR, `${req.params.id}.json`));
    if (!session) return res.status(404).json({ ok: false, error: "Sessao nao encontrada." });
    return res.json({ ok: true, session });
  });
  router.delete("/sessions/:id", (req, res) => {
    try { require("fs").unlinkSync(path.join(SESSIONS_DIR, `${req.params.id}.json`)); } catch {}
    res.json({ ok: true });
  });

  return router;
}

module.exports = {
  createSessionsRouter,
};
