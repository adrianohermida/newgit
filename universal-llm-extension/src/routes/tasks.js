const express = require("express");
const { getConfigs } = require("../storage");
const { jsonPost } = require("../http-client");
const { joinUrl } = require("../utils");
const { loadTaskSession, normalizeTask, saveTaskSession, updateTask } = require("../task-store");
const { applyStepResult, describeStepAction, dispatchApprovedStep, getApprovalStep, getRunnableStep, markApprovalDecision, markStepAwaitingApproval, resolveDispatchTabId, shouldRequireApproval } = require("../task-dispatch");

function shouldCreateTask(query) {
  const text = String(query || "").trim().toLowerCase();
  return text.startsWith("/tarefa") || text.startsWith("/tarefas") ||
    ["analisar", "extrair", "preencher", "abrir", "navegar", "buscar", "executar", "planejar", "automatizar"].some((token) => text.includes(token));
}

async function executeTask(query, sessionId, workspace = {}) {
  let lastError = null;
  for (const baseUrl of getConfigs().local.candidates) {
    try {
      return await jsonPost(joinUrl(baseUrl, "/execute"), {
        query,
        context: {
          session_id: sessionId,
          route: "extension/task-runner",
          active_tab_id: workspace.tabId || null,
          browser_tabs: Array.isArray(workspace.tabs) ? workspace.tabs : [],
          multi_tab_enabled: Array.isArray(workspace.tabs) && workspace.tabs.length > 1,
        },
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

async function autoDispatchTasks(commandQueue, session, tasks, tabId) {
  for (const task of tasks) {
    const step = getRunnableStep(task);
    if (!step) continue;
    if (shouldRequireApproval(step)) {
      const targetTabId = resolveDispatchTabId(task, step, tabId, session?.metadata?.browserTabs || []);
      if (targetTabId) step.action = { ...(step.action || {}), tabId: targetTabId };
      markStepAwaitingApproval(task, step);
      normalizeTask(task);
      continue;
    }
    const targetTabId = resolveDispatchTabId(task, step, tabId, session?.metadata?.browserTabs || []);
    if (step.action?.type !== "command" && !targetTabId) continue;
    step.status = "running";
    await dispatchApprovedStep({ commandQueue, tabId: targetTabId, task, step });
    normalizeTask(task);
  }
}

async function dispatchNextTaskStep(commandQueue, session, task, tabId) {
  if (!task) return null;
  const nextStep = getRunnableStep(task);
  if (!nextStep) {
    normalizeTask(task);
    return null;
  }
  if (shouldRequireApproval(nextStep)) {
    const targetTabId = resolveDispatchTabId(task, nextStep, tabId, session?.metadata?.browserTabs || []);
    if (targetTabId) nextStep.action = { ...(nextStep.action || {}), tabId: targetTabId };
    markStepAwaitingApproval(task, nextStep);
    normalizeTask(task);
    return { mode: "awaiting_approval", action: describeStepAction(nextStep) };
  }
  if (nextStep.status === "awaiting_approval") {
    normalizeTask(task);
    return null;
  }
  const targetTabId = resolveDispatchTabId(task, nextStep, tabId, session?.metadata?.browserTabs || []);
  if (nextStep.action?.type !== "command" && !targetTabId) {
    task.logs = [...(task.logs || []), `dispatch_skipped_missing_tab step=${nextStep.id}`];
    normalizeTask(task);
    return null;
  }
  nextStep.status = "running";
  const dispatch = await dispatchApprovedStep({ commandQueue, tabId: targetTabId, task, step: nextStep });
  normalizeTask(task);
  return dispatch;
}

function createTasksRouter(commandQueue) {
  const router = express.Router();

  router.post("/tasks/run", async (req, res) => {
    try {
      const { sessionId, query, tabId, tabs } = req.body || {};
      if (!String(query || "").trim()) return res.status(400).json({ ok: false, error: "query obrigatoria" });
      const session = loadTaskSession(String(sessionId || `sess_${Date.now()}`));
      session.metadata = session.metadata || {};
      session.metadata.browserTabs = Array.isArray(tabs)
        ? tabs.map((tab) => ({
            id: String(tab?.id || "").trim(),
            title: String(tab?.title || "").trim(),
            url: String(tab?.url || "").trim(),
            origin: String(tab?.origin || "").trim(),
            active: Boolean(tab?.active),
            pinned: Boolean(tab?.pinned),
            audible: Boolean(tab?.audible),
          })).filter((tab) => tab.id)
        : Array.isArray(session.metadata.browserTabs) ? session.metadata.browserTabs : [];
      session.metadata.activeTabId = String(tabId || "").trim() || session.metadata.activeTabId || "";
      const execution = await executeTask(query, session.id, { tabId, tabs: session.metadata.browserTabs });
      const rawTasks = extractAiTasks(execution.body);
      const aiTasks = rawTasks.map((task) => {
        const normalized = normalizeTask({ ...task });
        normalized.sessionId = session.id; // propaga sessionId para uso no content script
        normalized.logs = Array.isArray(normalized.logs) ? normalized.logs : [];
        return normalized;
      });
      await autoDispatchTasks(commandQueue, session, aiTasks, tabId ? String(tabId) : "");
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
          const targetTabId = resolveDispatchTabId(task, step, tabId || session.metadata?.activeTabId || "", session.metadata?.browserTabs || []);
          dispatch = await dispatchApprovedStep({ commandQueue, tabId: targetTabId, task, step });
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
      const { sessionId, taskId, stepId, status, output, error, tabId } = req.body || {};
      const session = loadTaskSession(String(sessionId || ""));
      updateTask(session, String(taskId || ""), (task) =>
        applyStepResult(task, String(stepId || ""), { status, output, error })
      );
      const task = (session.tasks || []).find((item) => item.id === String(taskId || ""));
      Promise.resolve(dispatchNextTaskStep(commandQueue, session, task, tabId ? String(tabId) : ""))
        .then(() => saveTaskSession(session))
        .catch(() => saveTaskSession(session));
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
