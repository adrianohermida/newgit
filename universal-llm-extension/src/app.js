const express = require("express");
const cors = require("cors");
const { createChatRouter } = require("./routes/chat");
const { createSettingsRouter } = require("./routes/settings");
const { createSessionsRouter } = require("./routes/sessions");
const { createAssetsRouter } = require("./routes/assets");
const { createAutomationsRouter } = require("./routes/automations");
const { createSystemRouter } = require("./routes/system");
const { createTasksRouter } = require("./routes/tasks");

function createApp() {
  const app = express();
  const commandQueue = new Map();

  app.use(cors());
  app.use(express.json({ limit: "20mb" }));
  app.use(createSettingsRouter());
  app.use(createChatRouter());
  app.use(createSessionsRouter());
  app.use(createAssetsRouter());
  app.use(createAutomationsRouter(commandQueue));
  app.use(createTasksRouter(commandQueue));
  app.use(createSystemRouter());

  app.use((req, res) => {
    res.status(404).json({ ok: false, error: `Rota nao encontrada: ${req.method} ${req.originalUrl}` });
  });
  app.use((error, _req, res, _next) => {
    res.status(500).json({ ok: false, error: error?.message || "Erro interno no bridge." });
  });

  return app;
}

module.exports = {
  createApp,
};
