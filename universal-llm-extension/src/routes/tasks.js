const express = require("express");
const path = require("path");
const { SESSIONS_DIR } = require("../config");
const { getConfigs, safeRead, safeWrite } = require("../storage");
const { jsonPost } = require("../http-client");
const { joinUrl, ts, uid } = require("../utils");

function shouldCreateTask(query) {
  const text = String(query || "").trim().toLowerCase();
  return text.startsWith("/tarefa") || text.startsWith("/tarefas") || ["analisar", "extrair", "preencher", "abrir", "navegar", "buscar", "executar", "planejar", "automatizar"].some((token) => text.includes(token));
}

function taskSession(filePath, sessionId) {
  return safeRead(filePath) || { id: sessionId, provider: "local", model: "aetherlab-legal-local-v1", metadata: {}, messages: [], tasks: [], createdAt: ts(), updatedAt: ts() };
}

async function executeTask(query, sessionId) {
  let lastError = null;
  for (const baseUrl of getConfigs().local.candidates) {
    try {
      return await jsonPost(joinUrl(baseUrl, "/execute"), { query, context: { session_id: sessionId, route: "extension/task-runner" } });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Nao foi possivel executar task no ai-core.");
}

function createTasksRouter() {
  const router = express.Router();

  router.post("/tasks/run", async (req, res) => {
    try {
      const { sessionId, query } = req.body || {};
      if (!String(query || "").trim()) return res.status(400).json({ ok: false, error: "query obrigatoria" });
      const resolvedSessionId = String(sessionId || `sess_${uid()}`);
      const filePath = path.join(SESSIONS_DIR, `${resolvedSessionId}.json`);
      const session = taskSession(filePath, resolvedSessionId);
      const execution = await executeTask(query, resolvedSessionId);
      const aiTasks = execution.body?.orchestration?.ai_tasks || [];
      session.tasks = [...(Array.isArray(session.tasks) ? session.tasks : []), ...aiTasks];
      session.updatedAt = ts();
      safeWrite(filePath, session);
      res.json({ ok: true, sessionId: resolvedSessionId, shouldCreateTask: shouldCreateTask(query), result: execution.body?.result || null, tasks: aiTasks, orchestration: execution.body?.orchestration || {} });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || "Falha ao criar AI-Task." });
    }
  });

  router.get("/sessions/:id/tasks", (req, res) => {
    const session = safeRead(path.join(SESSIONS_DIR, `${req.params.id}.json`));
    res.json({ ok: true, tasks: Array.isArray(session?.tasks) ? session.tasks : [] });
  });

  router.post("/sessions/:id/tasks/:taskId/approval", (req, res) => {
    const filePath = path.join(SESSIONS_DIR, `${req.params.id}.json`);
    const session = taskSession(filePath, req.params.id);
    const approved = Boolean(req.body?.approved);
    session.tasks = (Array.isArray(session.tasks) ? session.tasks : []).map((task) => task.id !== req.params.taskId ? task : { ...task, status: approved ? "pending" : "paused", updatedAt: ts(), steps: task.steps.map((step) => step.status !== "awaiting_approval" ? step : { ...step, status: approved ? "pending" : "error", error: approved ? null : "Acao negada pelo usuario" }) });
    session.updatedAt = ts();
    safeWrite(filePath, session);
    res.json({ ok: true, tasks: session.tasks });
  });

  return router;
}

module.exports = {
  createTasksRouter,
  shouldCreateTask,
};
