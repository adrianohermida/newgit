const express = require("express");
const fs = require("fs");
const path = require("path");
const { DIR, SCREENSHOTS_DIR, UPLOADS_DIR } = require("../config");
const { safeWrite } = require("../storage");
const { uid, ts } = require("../utils");

function createAssetsRouter() {
  const router = express.Router();

  router.get("/download", (_req, res) => {
    const zipPath = path.join(DIR, "dist", "universal-llm-assistant-v9.0.0.zip");
    if (!fs.existsSync(zipPath)) { try { require(path.join(DIR, "build-all.js")); } catch {} }
    if (!fs.existsSync(zipPath)) return res.status(404).json({ ok: false, error: "Extensao nao empacotada. Execute: npm run build:extension" });
    const stat = fs.statSync(zipPath);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="universal-llm-assistant-v9.0.0.zip"');
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    fs.createReadStream(zipPath).pipe(res);
  });

  router.post("/screenshot", (req, res) => {
    try {
      const { dataUrl, sessionId, tabUrl, tabTitle } = req.body || {};
      if (!dataUrl) return res.status(400).json({ ok: false, error: "dataUrl obrigatorio." });
      const id = uid();
      const ext = String(dataUrl).startsWith("data:image/png") ? "png" : "jpg";
      const filePath = path.join(SCREENSHOTS_DIR, `${id}.${ext}`);
      fs.writeFileSync(filePath, Buffer.from(String(dataUrl).replace(/^data:image\/\w+;base64,/, ""), "base64"));
      safeWrite(path.join(SCREENSHOTS_DIR, `${id}.json`), { id, ext, sessionId, tabUrl, tabTitle, createdAt: ts(), filePath });
      res.json({ ok: true, id, filePath });
    } catch (error) { res.status(500).json({ ok: false, error: error?.message }); }
  });

  router.post("/upload", (req, res) => {
    try {
      const { dataUrl, fileName, mimeType, sessionId } = req.body || {};
      if (!dataUrl || !fileName) return res.status(400).json({ ok: false, error: "dataUrl e fileName obrigatorios." });
      const id = uid();
      const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(UPLOADS_DIR, `${id}_${safeName}`);
      fs.writeFileSync(filePath, Buffer.from(String(dataUrl).replace(/^data:[^;]+;base64,/, ""), "base64"));
      safeWrite(path.join(UPLOADS_DIR, `${id}.json`), { id, fileName: safeName, mimeType, sessionId, filePath, createdAt: ts() });
      const textContent = /\.(txt|md|json|csv|js|py|ts|html|css|xml|yaml|yml)$/i.test(safeName) ? fs.readFileSync(filePath, "utf8").slice(0, 12000) : null;
      res.json({ ok: true, id, filePath, fileName: safeName, textContent });
    } catch (error) { res.status(500).json({ ok: false, error: error?.message }); }
  });

  return router;
}

module.exports = {
  createAssetsRouter,
};
