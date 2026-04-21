const express = require("express");
const { getConfigs } = require("../storage");
const { jsonPost } = require("../http-client");
const { loadTaskSession, normalizeTask, saveTaskSession, updateTask } = require("../task-store");
const { getLocalExecuteTarget, getLocalProviderLabel } = require("../local-provider");
const { buildLocalExecutionFallback, buildLocalExecutionRequest } = require("../local-task-provider");
const { compactText, extractAiTasks, firstNonEmpty } = require("../local-plan-adapter");
const { deriveIntentTasks } = require("../local-intent-adapter");
const { ensureLocalRuntimeStarted } = require("../local-runtime-bootstrap");
const {
  applyStepResult,
  describeStepAction,
  dispatchApprovedStep,
  getApprovalStep,
  getRunnableStep,
  markApprovalDecision,
  markStepAwaitingApproval,
  resolveDispatchTabId,
  shouldRequireApproval,
  stampStepTabContext,
} = require("../task-dispatch");

function shouldCreateTask(query) {
  const text = String(query || "").trim().toLowerCase();
  return text.startsWith("/tarefa") || text.startsWith("/tarefas")
    || [
      "analisar",
      "extrair",
      "preencher",
      "digitar",
      "inserir",
      "clicar",
      "clique",
      "abrir",
      "navegar",
      "acessar",
      "ler",
      "buscar",
      "executar",
      "planejar",
      "automatizar",
    ].some((token) => text.includes(token));
}

async function executeTask(query, sessionId, workspace = {}) {
  const configs = getConfigs();
  await ensureLocalRuntimeStarted(configs, "tasks_run");
  let lastError = null;
  for (const baseUrl of configs.local.candidates) {
    try {
      return await jsonPost(
        getLocalExecuteTarget(baseUrl, configs),
        buildLocalExecutionRequest(query, sessionId, workspace),
        {},
        { timeoutMs: 12000 },
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Nao foi possivel executar task no ${getLocalProviderLabel(configs)}.`);
}

function hasActionableStep(task) {
  return Boolean((Array.isArray(task?.steps) ? task.steps : []).find((step) => step?.action?.type));
}

function shouldReplaceWithIntentTasks(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  if (!list.length) return true;
  if (list.some(hasActionableStep)) return false;
  return true;
}

function sanitizeTask(task) {
  const next = { ...task };
  next.steps = (Array.isArray(task?.steps) ? task.steps : []).map((step) => sanitizeTaskStep(step));
  return next;
}

function sanitizeTaskStep(step) {
  const next = { ...step };
  const action = sanitizeTaskAction(step?.action || {});
  if (action) next.action = action;
  else delete next.action;

  const outputStatus = String(step?.output?.status || "").trim().toLowerCase();
  if (!action && ["pending", "running"].includes(String(step?.status || "")) && outputStatus === "ok") {
    next.status = "done";
  }
  if (!action && !next.description) {
    next.description = "Passo de raciocinio interno";
  }
  return next;
}

function sanitizeTaskAction(action) {
  const type = String(action?.type || "").trim().toLowerCase();
  if (!type) return null;
  const selector = firstNonEmpty(action.selector, action.cssSelector, action.targetSelector);
  const url = firstNonEmpty(action.url, action.href, action.targetUrl);
  const command = firstNonEmpty(action.command);
  const targetText = firstNonEmpty(action.targetText, action.text);
  const label = firstNonEmpty(action.label, action.fieldLabel, action.targetLabel);
  const value = firstNonEmpty(action.value);
  if (type === "navigate" && !url) return null;
  if ((type === "click" || type === "input" || type === "change") && !(selector || targetText || label)) return null;
  if (type === "command" && !command) return null;
  if (type === "key" && !firstNonEmpty(action.key, action.code)) return null;
  if (type === "extract") {
    return { ...action, type, selector, targetText, label };
  }
  return {
    ...action,
    type,
    selector,
    url,
    command,
    targetText,
    label,
    value,
  };
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
  stampStepTabContext(step, targetTabId, session?.metadata?.browserTabs || []);
  if (shouldRequireApproval(step)) {
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
  return dispatchSessionReadySteps(commandQueue, session, tabId);
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
  stampStepTabContext(step, targetTabId, session?.metadata?.browserTabs || []);
  if (shouldRequireApproval(step)) {
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

function mapBrowserTabs(tabs, previousTabs = []) {
  if (!Array.isArray(tabs)) return Array.isArray(previousTabs) ? previousTabs : [];
  return tabs.map((tab) => ({
    id: String(tab?.id || "").trim(),
    title: String(tab?.title || "").trim(),
    url: String(tab?.url || "").trim(),
    origin: String(tab?.origin || "").trim(),
    active: Boolean(tab?.active),
    pinned: Boolean(tab?.pinned),
    audible: Boolean(tab?.audible),
  })).filter((tab) => tab.id);
}

function normalizeIncomingTasks(tasks, sessionId) {
  return (Array.isArray(tasks) ? tasks : []).map((task) => {
    const normalized = normalizeTask(sanitizeTask({ ...task }));
    normalized.sessionId = sessionId;
    normalized.logs = Array.isArray(normalized.logs) ? normalized.logs : [];
    return normalized;
  });
}

function buildTaskResponse(session, query, execution, executionError, tasks, dispatches) {
  return {
    ok: true,
    sessionId: session.id,
    shouldCreateTask: shouldCreateTask(query),
    result: execution?.body?.result || (executionError ? buildLocalExecutionFallback(query, executionError) : null),
    tasks,
    dispatches,
    orchestration: {
      ...(execution?.body?.orchestration || {}),
      ai_tasks: tasks,
    },
  };
}

function createTasksRouter(commandQueue) {
  const router = express.Router();

  router.post("/tasks/run", async (req, res) => {
    try {
      const { sessionId, query, tabId, tabs } = req.body || {};
      if (!String(query || "").trim()) return res.status(400).json({ ok: false, error: "query obrigatoria" });
      const session = loadTaskSession(String(sessionId || `sess_${Date.now()}`));
      session.metadata = session.metadata || {};
      session.metadata.browserTabs = mapBrowserTabs(tabs, session.metadata.browserTabs);
      session.metadata.activeTabId = String(tabId || "").trim() || session.metadata.activeTabId || "";

      let execution = null;
      let executionError = null;
      try {
        execution = await executeTask(query, session.id, { tabId, tabs: session.metadata.browserTabs });
      } catch (error) {
        executionError = error;
      }

      const rawTasks = execution?.body ? extractAiTasks(execution.body) : [];
      let aiTasks = normalizeIncomingTasks(rawTasks, session.id);

      if (shouldCreateTask(query) && shouldReplaceWithIntentTasks(aiTasks)) {
        aiTasks = normalizeIncomingTasks(deriveIntentTasks(query, { tabId, tabs: session.metadata.browserTabs }), session.id);
      }

      const dispatches = await autoDispatchTasks(commandQueue, session, aiTasks, tabId ? String(tabId) : "");
      saveTaskSession(session);
      res.json(buildTaskResponse(session, query, execution, executionError, aiTasks, dispatches));
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
      let additionalDispatches = [];
      updateTask(session, req.params.taskId, (task) => markApprovalDecision(task, approved));
      if (approved) {
        const task = (session.tasks || []).find((item) => item.id === req.params.taskId);
        const step = getApprovalStep(task || {}) || (task?.steps || []).find((item) => item.status === "running");
        if (!task || !step) throw new Error("Nenhum step aguardando aprovacao foi encontrado.");
        step.status = "running";
        try {
          const targetTabId = resolveDispatchTabId(task, step, tabId || session.metadata?.activeTabId || "", session.metadata?.browserTabs || []);
          stampStepTabContext(step, targetTabId, session?.metadata?.browserTabs || []);
          dispatch = await dispatchApprovedStep({ commandQueue, tabId: targetTabId, task, step });
          normalizeTask(task);
          additionalDispatches = await dispatchSessionReadySteps(commandQueue, session, targetTabId || tabId || session.metadata?.activeTabId || "");
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
      res.json({ ok: true, tasks: session.tasks, dispatch, additionalDispatches });
    } catch (error) {
      res.status(500).json({ ok: false, error: error?.message || "Falha ao aplicar aprovacao." });
    }
  });

  router.post("/tasks/result", (req, res) => {
    try {
      const {
        sessionId, taskId, stepId, status, output, error, tabId,
      } = req.body || {};
      const session = loadTaskSession(String(sessionId || ""));
      updateTask(session, String(taskId || ""), (task) =>
        applyStepResult(task, String(stepId || ""), { status, output, error }));
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
