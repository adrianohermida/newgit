const express = require("express");
const { getConfigs } = require("../storage");
const { jsonPost } = require("../http-client");
const { joinUrl } = require("../utils");
const { loadTaskSession, normalizeTask, saveTaskSession, updateTask } = require("../task-store");
const { applyStepResult, dispatchApprovedStep, getApprovalStep, getRunnableStep, markApprovalDecision } = require("../task-dispatch");

function shouldCreateTask(query) {
  const text = String(query || "").trim().toLowerCase();
  return text.startsWith("/tarefa") || text.startsWith("/tarefas") ||
    ["analisar", "extrair", "preencher", "abrir", "navegar", "buscar", "executar", "planejar", "automatizar"].some((token) => text.includes(token));
}

async function executeTask(query, sessionId) {
  let lastError = null;
  for (const baseUrl of getConfigs().local.candidates) {
    try {
      return await jsonPost(joinUrl(baseUrl, "/execute"), {
        query,
        context: { session_id: sessionId, route: "extension/task-runner" },
      });
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Nao foi possivel executar task no ai-core.");
}

function extractAiTasks(body) {
  // Suporta múltiplas estruturas de resposta do ai-core
  const candidates = [
    body?.orchestration?.ai_tasks,
    body?.orchestration?.tasks,
    body?.tasks,
    body?.plan?.steps,
    body?.steps,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  return [];
}

async function autoDispatchTasks(commandQueue, tasks, tabId) {
  for (const task of tasks) {
    const step = getRunnableStep(task);
    if (!step) continue;
    if (step.action?.type !== "command" && !tabId) continue;
    step.status = "running";
    await dispatchApprovedStep({ commandQueue, tabId, task, step });
    normalizeTask(task);
  }
}

function createTasksRouter(commandQueue) {
  const router = express.Router();

  router.post("/tasks/run", async (req, res) => {
    try {
      const { sessionId, query, tabId } = req.body || {};
      if (!String(query || "").trim()) return res.status(400).json({ ok: false, error: "query obrigatoria" });
      const session = loadTaskSession(String(sessionId || `sess_${Date.now()}`));
      const execution = await executeTask(query, session.id);
      const rawTasks = extractAiTasks(execution.body);
      const aiTasks = rawTasks.map((task) => {
        const normalized = normalizeTask({ ...task });
        normalized.sessionId = session.id; // propaga sessionId para uso no content script
        return normalized;
      });
      await autoDispatchTasks(commandQueue, aiTasks, tabId ? String(tabId) : "");
      session.tasks = [...(Array.isArray(session.tasks) ? session.tasks : []), ...aiTasks];
      saveTaskSession(session);
      res.json({
        ok: true,
        sessionId: session.id,
        shouldCreateTask: shouldCreateTask(query),
        result: execution.body?.result || null,
        tasks: aiTasks,
        orchestration: execution.body?.orchestration || {},
      });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || "Falha ao criar AI-Task." });
    }
  });

  router.get("/sessions/:id/tasks", (req, res) => {
    const session = loadTaskSession(req.params.id);
    res.json({ ok: true, tasks: Array.isArray(session.tasks) ? session.tasks : [] });
  });

  router.post("/sessions/:id/tasks/:taskId/approval", async (req, res) => {
    try {
      const session = loadTaskSession(req.params.id);
      const approved = Boolean(req.body?.approved);
      const tabId = req.body?.tabId ? String(req.body.tabId) : "";
      let dispatch = null;
      updateTask(session, req.params.taskId, (task) => markApprovalDecision(task, approved));
      if (approved) {
        const task = (session.tasks || []).find((item) => item.id === req.params.taskId);
        const step = getApprovalStep(task || {}) || (task?.steps || []).find((item) => item.status === "running");
        if (!task || !step) throw new Error("Nenhum step aguardando aprovacao foi encontrado.");
        step.status = "running";
        try {
          dispatch = await dispatchApprovedStep({ commandQueue, tabId, task, step });
          normalizeTask(task);
          saveTaskSession(session);
        } catch (error) {
          step.status = "error";
          step.error = error?.message || "Falha ao despachar acao.";
          normalizeTask(task);
          saveTaskSession(session);
          throw error;
        }
      } else {
        saveTaskSession(session);
      }
      res.json({ ok: true, tasks: session.tasks, dispatch });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || "Falha ao aplicar aprovacao." });
    }
  });

  router.post("/tasks/result", (req, res) => {
    try {
      const { sessionId, taskId, stepId, status, output, error } = req.body || {};
      const session = loadTaskSession(String(sessionId || ""));
      updateTask(session, String(taskId || ""), (task) =>
        applyStepResult(task, String(stepId || ""), { status, output, error })
      );
      res.json({ ok: true, tasks: session.tasks });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || "Falha ao atualizar resultado da task." });
    }
  });

  return router;
}

module.exports = {
  createTasksRouter,
  shouldCreateTask,
};
