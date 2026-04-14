const express = require("express");
const fs = require("fs");
const path = require("path");
const { SESSIONS_DIR } = require("../config");
const { SCREENSHOTS_DIR, UPLOADS_DIR } = require("../config");
const { getConfigs, listJsonDir, safeRead, safeWrite } = require("../storage");
const { uid, ts, joinUrl } = require("../utils");
const { jsonPost } = require("../http-client");

function buildSessionAssets(sessionId) {
  const screenshots = listJsonDir(SCREENSHOTS_DIR)
    .filter((item) => item?.sessionId === sessionId)
    .map((item) => ({
      id: item.id,
      kind: "screenshot",
      fileName: `${item.id}.${item.ext || "png"}`,
      filePath: item.filePath,
      directoryPath: item.filePath ? path.dirname(item.filePath) : SCREENSHOTS_DIR,
      metaPath: path.join(SCREENSHOTS_DIR, `${item.id}.json`),
      tabTitle: item.tabTitle || "",
      tabUrl: item.tabUrl || "",
      createdAt: item.createdAt,
    }));
  const uploads = listJsonDir(UPLOADS_DIR)
    .filter((item) => item?.sessionId === sessionId)
    .map((item) => ({
      id: item.id,
      kind: "upload",
      fileName: item.fileName || item.id,
      filePath: item.filePath,
      directoryPath: item.filePath ? path.dirname(item.filePath) : UPLOADS_DIR,
      metaPath: path.join(UPLOADS_DIR, `${item.id}.json`),
      mimeType: item.mimeType || "",
      createdAt: item.createdAt,
    }));
  return [...screenshots, ...uploads].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

function loadSession(sessionId) {
  return safeRead(path.join(SESSIONS_DIR, `${sessionId}.json`));
}

function saveSession(sessionId, session) {
  safeWrite(path.join(SESSIONS_DIR, `${sessionId}.json`), session);
  return session;
}

function getAssetGroups(session) {
  return Array.isArray(session?.metadata?.assetGroups) ? session.metadata.assetGroups : [];
}

function createSessionsRouter() {
  const router = express.Router();

  router.post("/sessions", async (req, res) => {
    try {
      const { sessionId, messages, provider, model, metadata } = req.body || {};
      const id = sessionId || uid();
      const filePath = path.join(SESSIONS_DIR, `${id}.json`);
      const existing = safeRead(filePath) || {};
      const session = { id, provider: provider || existing.provider || "local", model: model || existing.model || "unknown", metadata: { ...existing.metadata, ...metadata }, messages: messages || existing.messages || [], tasks: Array.isArray(existing.tasks) ? existing.tasks : [], createdAt: existing.createdAt || ts(), updatedAt: ts() };
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

  router.get("/sessions", (_req, res) => res.json({ ok: true, sessions: listJsonDir(SESSIONS_DIR).map((session) => ({ id: session.id, provider: session.provider, model: session.model, messageCount: Array.isArray(session.messages) ? session.messages.length : 0, taskCount: Array.isArray(session.tasks) ? session.tasks.length : 0, createdAt: session.createdAt, updatedAt: session.updatedAt, metadata: session.metadata })) }));
  router.get("/sessions/:id", (req, res) => {
    const session = loadSession(req.params.id);
    if (!session) return res.status(404).json({ ok: false, error: "Sessao nao encontrada." });
    return res.json({ ok: true, session });
  });
  router.get("/sessions/:id/assets", (req, res) => {
    const sessionId = String(req.params.id || "");
    const session = loadSession(sessionId);
    const assets = buildSessionAssets(sessionId);
    const groups = getAssetGroups(session).map((group) => ({
      ...group,
      assets: (group.assetRefs || []).map((ref) => {
        const asset = assets.find((item) => item.id === ref.id && item.kind === ref.kind);
        return asset ? { id: asset.id, kind: asset.kind, fileName: asset.fileName, mimeType: asset.mimeType || "", tabTitle: asset.tabTitle || "" } : ref;
      }),
    }));
    return res.json({ ok: true, assets, groups });
  });
  router.get("/sessions/:id/assets/:kind/:assetId/file", (req, res) => {
    const sessionId = String(req.params.id || "");
    const kind = String(req.params.kind || "");
    const assetId = String(req.params.assetId || "");
    const asset = buildSessionAssets(sessionId).find((item) => item.id === assetId && item.kind === kind);
    if (!asset || !asset.filePath || !fs.existsSync(asset.filePath)) {
      return res.status(404).json({ ok: false, error: "Arquivo da sessao nao encontrado." });
    }
    return res.sendFile(asset.filePath);
  });
  router.delete("/sessions/:id/assets/:kind/:assetId", (req, res) => {
    const sessionId = String(req.params.id || "");
    const kind = String(req.params.kind || "");
    const assetId = String(req.params.assetId || "");
    const asset = buildSessionAssets(sessionId).find((item) => item.id === assetId && item.kind === kind);
    if (!asset) return res.status(404).json({ ok: false, error: "Arquivo da sessao nao encontrado." });
    try {
      if (asset.filePath && fs.existsSync(asset.filePath)) fs.unlinkSync(asset.filePath);
      if (asset.metaPath && fs.existsSync(asset.metaPath)) fs.unlinkSync(asset.metaPath);
      const session = loadSession(sessionId);
      if (session) {
        session.metadata = session.metadata || {};
        session.metadata.assetGroups = getAssetGroups(session)
          .map((group) => ({ ...group, assetRefs: (group.assetRefs || []).filter((ref) => !(ref.id === assetId && ref.kind === kind)) }))
          .filter((group) => Array.isArray(group.assetRefs) && group.assetRefs.length);
        session.updatedAt = ts();
        saveSession(sessionId, session);
      }
    } catch (error) {
      return res.status(500).json({ ok: false, error: error?.message || "Falha ao excluir arquivo da sessao." });
    }
    return res.json({ ok: true, deleted: { id: asset.id, kind: asset.kind } });
  });
  router.post("/sessions/:id/asset-groups", (req, res) => {
    const sessionId = String(req.params.id || "");
    const session = loadSession(sessionId);
    if (!session) return res.status(404).json({ ok: false, error: "Sessao nao encontrada." });
    const title = String(req.body?.title || "").trim();
    const assetRefs = Array.isArray(req.body?.assetRefs) ? req.body.assetRefs : [];
    const normalizedRefs = assetRefs
      .map((ref) => ({ id: String(ref?.id || "").trim(), kind: String(ref?.kind || "").trim() }))
      .filter((ref) => ref.id && ref.kind);
    if (!title) return res.status(400).json({ ok: false, error: "title obrigatorio." });
    if (normalizedRefs.length < 2) return res.status(400).json({ ok: false, error: "Selecione pelo menos 2 arquivos." });
    session.metadata = session.metadata || {};
    const groups = getAssetGroups(session);
    const group = {
      id: uid(),
      title,
      assetRefs: normalizedRefs,
      createdAt: ts(),
    };
    session.metadata.assetGroups = [group, ...groups];
    session.updatedAt = ts();
    saveSession(sessionId, session);
    return res.json({ ok: true, group, groups: session.metadata.assetGroups });
  });
  router.delete("/sessions/:id/asset-groups/:groupId", (req, res) => {
    const sessionId = String(req.params.id || "");
    const session = loadSession(sessionId);
    if (!session) return res.status(404).json({ ok: false, error: "Sessao nao encontrada." });
    session.metadata = session.metadata || {};
    session.metadata.assetGroups = getAssetGroups(session).filter((group) => group.id !== String(req.params.groupId || ""));
    session.updatedAt = ts();
    saveSession(sessionId, session);
    return res.json({ ok: true, groups: session.metadata.assetGroups });
  });
  router.get("/sessions/:id/export.md", (req, res) => {
    const session = loadSession(req.params.id);
    if (!session) return res.status(404).json({ ok: false, error: "Sessao nao encontrada." });
    const title = session.metadata?.tabTitle || session.id;
    const lines = [
      `# ${title}`,
      "",
      `- Sessao: ${session.id}`,
      `- Provider: ${session.provider || "local"}`,
      `- Modelo: ${session.model || "desconhecido"}`,
      session.metadata?.tabUrl ? `- URL: ${session.metadata.tabUrl}` : "",
      `- Atualizada em: ${session.updatedAt || session.createdAt || ""}`,
      "",
      "## Conversa",
      "",
    ];
    for (const message of Array.isArray(session.messages) ? session.messages : []) {
      const role = String(message?.role || "system").toUpperCase();
      lines.push(`### ${role}`);
      lines.push("");
      lines.push(String(message?.content || ""));
      lines.push("");
    }
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${String(title).replace(/[^a-zA-Z0-9._-]/g, "_") || session.id}.md"`);
    return res.send(lines.filter(Boolean).join("\n"));
  });
  router.patch("/sessions/:id", (req, res) => {
    const filePath = path.join(SESSIONS_DIR, `${req.params.id}.json`);
    const session = safeRead(filePath);
    if (!session) return res.status(404).json({ ok: false, error: "Sessao nao encontrada." });
    const title = String(req.body?.title || "").trim();
    session.metadata = { ...(session.metadata || {}), tabTitle: title || session.metadata?.tabTitle || session.id };
    session.updatedAt = ts();
    safeWrite(filePath, session);
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
