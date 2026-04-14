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

function hasInFlightStep(task) {
  return (Array.isArray(task?.steps) ? task.steps : []).some((step) => ["running", "awaiting_approval"].includes(step?.status));
}

function getTaskDependencies(task) {
  const raw = task?.orchestration?.dependsOn || task?.dependsOn || [];
  return Array.isArray(raw) ? raw.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function isTaskReadyForDispatch(session, task) {
  const deps = getTaskDependencies(task);
  if (!deps.length) return true;
  const tasks = Array.isArray(session?.tasks) ? session.tasks : [];
  return deps.every((dependencyId) => {
    const dependency = tasks.find((item) => String(item?.id || "") === dependencyId);
    return dependency ? dependency.status === "completed" : false;
  });
}

async function dispatchTaskIfReady(commandQueue, session, task, tabId) {
  if (!task || hasInFlightStep(task) || !isTaskReadyForDispatch(session, task)) return null;
  const step = getRunnableStep(task);
  if (!step) return null;
  const targetTabId = resolveDispatchTabId(task, step, tabId, session?.metadata?.browserTabs || []);
  if (shouldRequireApproval(step)) {
    if (targetTabId) step.action = { ...(step.action || {}), tabId: targetTabId };
    markStepAwaitingApproval(task, step);
    normalizeTask(task);
    return { mode: "awaiting_approval", taskId: task.id, stepId: step.id, tabId: targetTabId || null };
  }
  if (step.action?.type !== "command" && !targetTabId) {
    task.logs = [...(task.logs || []), `dispatch_skipped_missing_tab step=${step.id}`];
    normalizeTask(task);
    return null;
  }
  step.status = "running";
  const dispatch = await dispatchApprovedStep({ commandQueue, tabId: targetTabId, task, step });
  normalizeTask(task);
  return dispatch;
}

async function dispatchSessionReadySteps(commandQueue, session, preferredTabId = "") {
  const dispatches = [];
  for (const task of Array.isArray(session?.tasks) ? session.tasks : []) {
    const dispatch = await dispatchTaskIfReady(commandQueue, session, task, preferredTabId || session?.metadata?.activeTabId || "");
    if (dispatch) dispatches.push({ taskId: task.id, ...dispatch });
  }
  return dispatches;
}

async function autoDispatchTasks(commandQueue, session, tasks, tabId) {
  for (const task of tasks) {
    if (!Array.isArray(session.tasks)) session.tasks = [];
    const existing = session.tasks.find((item) => item.id === task.id);
    if (!existing) session.tasks.push(task);
  }
  await dispatchSessionReadySteps(commandQueue, session, tabId);
}

async function dispatchNextTaskStep(commandQueue, session, task, tabId) {
  if (!task) return null;
  if (!isTaskReadyForDispatch(session, task)) {
    normalizeTask(task);
    return null;
  }
  const step = getRunnableStep(task);
  if (!step) {
    normalizeTask(task);
    return null;
  }
  const targetTabId = resolveDispatchTabId(task, step, tabId, session?.metadata?.browserTabs || []);
  if (shouldRequireApproval(step)) {
    if (targetTabId) step.action = { ...(step.action || {}), tabId: targetTabId };
    markStepAwaitingApproval(task, step);
    normalizeTask(task);
    return { mode: "awaiting_approval", action: describeStepAction(step), tabId: targetTabId || null };
  }
  if (step.action?.type !== "command" && !targetTabId) {
    task.logs = [...(task.logs || []), `dispatch_skipped_missing_tab step=${step.id}`];
    normalizeTask(task);
    return null;
  }
  step.status = "running";
  const dispatch = await dispatchApprovedStep({ commandQueue, tabId: targetTabId, task, step });
  normalizeTask(task);
  return dispatch;
}

async function dispatchCurrentAndSession(commandQueue, session, task, tabId) {
  const currentDispatch = await dispatchNextTaskStep(commandQueue, session, task, tabId);
  const additionalDispatches = await dispatchSessionReadySteps(commandQueue, session, tabId);
  return { currentDispatch, additionalDispatches };
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
          await dispatchSessionReadySteps(commandQueue, session, targetTabId || tabId || session.metadata?.activeTabId || "");
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
      Promise.resolve(dispatchCurrentAndSession(commandQueue, session, task, tabId ? String(tabId) : ""))
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
