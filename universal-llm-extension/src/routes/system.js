const express = require("express");
const { runCommand, searchFiles } = require("../commands");
const { buildHealthPayload } = require("../health");

function createSystemRouter() {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json(buildHealthPayload());
  });

  router.post("/execute", async (req, res) => {
    try {
      const command = String(req.body?.command || "").trim();
      const payload = req.body?.payload && typeof req.body.payload === "object" ? req.body.payload : {};
      if (!command) return res.status(400).json({ ok: false, error: "command obrigatorio" });
      res.json(await runCommand(command, payload));
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message });
    }
  });

  router.post("/search-files", (req, res) => {
    try { res.json(searchFiles(req.body || {})); } catch (error) { res.status(500).json({ ok: false, error: error?.message }); }
  });
  router.post("/web-search", async (req, res) => {
    try { res.json(await runCommand("web_search", req.body || {})); } catch (error) { res.status(500).json({ ok: false, error: error?.message }); }
  });
  router.post("/open-url", async (req, res) => {
    try { res.json(await runCommand("open_url", req.body || {})); } catch (error) { res.status(500).json({ ok: false, error: error?.message }); }
  });

  return router;
}

module.exports = {
  createSystemRouter,
};
