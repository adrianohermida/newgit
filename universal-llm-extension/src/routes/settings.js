const express = require("express");
const { mergeSettings, loadSettings, saveSettings } = require("../storage");

function createSettingsRouter() {
  const router = express.Router();

  router.get("/settings", (_req, res) => {
    res.json({ ok: true, settings: loadSettings() });
  });

  router.post("/settings", (req, res) => {
    const current = loadSettings();
    const settings = saveSettings(mergeSettings(current, req.body?.settings || {}));
    res.json({ ok: true, settings });
  });

  return router;
}

module.exports = {
  createSettingsRouter,
};
