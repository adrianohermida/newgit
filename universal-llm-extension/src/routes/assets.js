const express = require("express");
const fs = require("fs");
const path = require("path");
const { PDFParse } = require("pdf-parse");
const { DIR, SCREENSHOTS_DIR, UPLOADS_DIR } = require("../config");
const { safeWrite } = require("../storage");
const { uid, ts } = require("../utils");

async function extractUploadedText(filePath, safeName, mimeType) {
  const normalizedName = String(safeName || "");
  const normalizedType = String(mimeType || "").toLowerCase();
  if (/\.(txt|md|json|csv|js|py|ts|html|css|xml|yaml|yml)$/i.test(normalizedName)) {
    return fs.readFileSync(filePath, "utf8").slice(0, 12000);
  }
  if (normalizedType === "application/pdf" || /\.pdf$/i.test(normalizedName)) {
    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText({ pageJoiner: "\n\n-- pagina page_number de total_number --\n\n" });
      return String(parsed?.text || "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 16000);
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  return null;
}

function findLatestExtensionZip(distDir) {
  if (!fs.existsSync(distDir)) return null;
  const candidates = fs.readdirSync(distDir)
    .filter((file) => /^universal-llm-assistant-v.+\.zip$/i.test(file))
    .map((file) => {
      const filePath = path.join(distDir, file);
      return { file, filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.file.localeCompare(left.file));
  return candidates[0]?.filePath || null;
}

function createAssetsRouter() {
  const router = express.Router();

  router.get("/download", (_req, res) => {
    const distDir = path.join(DIR, "dist");
    let zipPath = findLatestExtensionZip(distDir);
    if (!zipPath) { try { require(path.join(DIR, "build-all.js")); } catch {} }
    if (!zipPath) zipPath = findLatestExtensionZip(distDir);
    if (!zipPath || !fs.existsSync(zipPath)) return res.status(404).json({ ok: false, error: "Extensao nao empacotada. Execute: npm run build:extension" });
    const zipName = path.basename(zipPath);
    const stat = fs.statSync(zipPath);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);
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

  router.post("/upload", async (req, res) => {
    try {
      const { dataUrl, fileName, mimeType, sessionId } = req.body || {};
      if (!dataUrl || !fileName) return res.status(400).json({ ok: false, error: "dataUrl e fileName obrigatorios." });
      const id = uid();
      const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = path.join(UPLOADS_DIR, `${id}_${safeName}`);
      fs.writeFileSync(filePath, Buffer.from(String(dataUrl).replace(/^data:[^;]+;base64,/, ""), "base64"));
      safeWrite(path.join(UPLOADS_DIR, `${id}.json`), { id, fileName: safeName, mimeType, sessionId, filePath, createdAt: ts() });
      const textContent = await extractUploadedText(filePath, safeName, mimeType);
      res.json({ ok: true, id, filePath, fileName: safeName, textContent });
    } catch (error) { res.status(500).json({ ok: false, error: error?.message }); }
  });

  return router;
}

module.exports = {
  createAssetsRouter,
};
