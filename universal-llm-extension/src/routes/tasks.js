const express = require("express");
const { getConfigs } = require("../storage");
const { jsonPost } = require("../http-client");
const { joinUrl } = require("../utils");
const { loadTaskSession, normalizeTask, saveTaskSession, updateTask } = require("../task-store");
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
  let lastError = null;
  for (const baseUrl of getConfigs().local.candidates) {
    try {
      return await jsonPost(
        joinUrl(baseUrl, "/execute"),
        {
          query,
          context: {
            session_id: sessionId,
            route: "extension/task-runner",
            active_tab_id: workspace.tabId || null,
            browser_tabs: Array.isArray(workspace.tabs) ? workspace.tabs : [],
            multi_tab_enabled: Array.isArray(workspace.tabs) && workspace.tabs.length > 1,
          },
        },
        {},
        { timeoutMs: 12000 },
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Nao foi possivel executar task no ai-core.");
}

function extractAiTasks(body) {
  const structuredCandidates = [
    body?.orchestration?.ai_tasks,
    body?.orchestration?.tasks,
    body?.tasks,
  ];
  for (const candidate of structuredCandidates) {
    if (Array.isArray(candidate) && candidate.length && candidate.every(isStructuredTaskCandidate)) {
      return candidate;
    }
  }

  const planSteps = [body?.plan?.steps, body?.steps].find((candidate) => Array.isArray(candidate) && candidate.length);
  if (Array.isArray(planSteps) && planSteps.length) {
    const synthesized = buildTaskFromPlanSteps(planSteps, body);
    return synthesized ? [synthesized] : [];
  }
  return [];
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

function deriveIntentTasks(query, workspace = {}) {
  const text = String(query || "").trim();
  if (!text) return [];

  const activeTab = resolveActiveTab(workspace);
  const steps = buildIntentSteps(text, activeTab);
  if (!steps.length) return [];

  return [buildIntentTask(inferIntentTitle(steps, activeTab), text, steps, { source: "system", activeTab })];
}

function resolveActiveTab(workspace = {}) {
  return (Array.isArray(workspace.tabs) ? workspace.tabs : []).find((tab) => String(tab?.id || "") === String(workspace.tabId || ""))
    || (Array.isArray(workspace.tabs) ? workspace.tabs.find((tab) => tab?.active) : null)
    || null;
}

function buildIntentSteps(text, activeTab) {
  const parts = splitIntentQuery(text);
  const steps = parts.map((part) => deriveIntentStep(part, activeTab)).filter(Boolean);
  if (steps.length) return steps;
  const single = deriveIntentStep(text, activeTab);
  return single ? [single] : [];
}

function splitIntentQuery(text) {
  return String(text || "")
    .split(/\s+(?:e depois|depois|entao|então|e)\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

function deriveIntentStep(text, activeTab) {
  const source = String(text || "").trim();
  const normalized = source.toLowerCase();
  if (!normalized) return null;

  const urlMatch = source.match(/https?:\/\/[^\s)"'<>]+/i);
  const quotedTarget = firstQuotedValue(source);
  const inputMatch = source.match(/(?:preencher|digitar|inserir)(?:\s+(?:o|a|no|na|em))?\s+(.+?)\s+(?:com|para)\s+["“]?(.+?)["”]?$/i);

  if (inputMatch) {
    const target = compactText(inputMatch[1], 120);
    const value = compactText(inputMatch[2], 240);
    return {
      description: `Preencher ${target} com ${value}`,
      action: { type: "input", label: target, targetText: target, value },
    };
  }

  if (normalized.includes("clicar") || normalized.includes("clique")) {
    const target = compactText(quotedTarget || source.replace(/.*?(clicar|clique)\s+(?:em\s+)?/i, ""), 120) || "elemento solicitado";
    return {
      description: `Clicar em ${target}`,
      action: { type: "click", targetText: target, label: target },
    };
  }

  if (urlMatch && ["abrir", "navegar", "acesse", "acessar", "ir para", "visitar"].some((token) => normalized.includes(token))) {
    return {
      description: `Abrir ${urlMatch[0]}`,
      action: { type: "navigate", url: urlMatch[0] },
    };
  }

  if (["ler pagina", "leia a pagina", "analisar a pagina", "analise a pagina", "extrair pagina", "resumir pagina", "varrer pagina"].some((token) => normalized.includes(token))) {
    return {
      description: activeTab?.title ? `Ler ${activeTab.title}` : "Ler pagina ativa",
      action: { type: "extract" },
    };
  }

  if (["analisar", "extrair", "mapear", "inspecionar"].some((token) => normalized.includes(token)) && activeTab) {
    return {
      description: activeTab?.title ? `Extrair contexto de ${activeTab.title}` : "Extrair contexto da guia ativa",
      action: { type: "extract" },
    };
  }

  return null;
}

function inferIntentTitle(steps, activeTab) {
  const types = steps.map((step) => String(step?.action?.type || "").trim()).filter(Boolean);
  if (!types.length) return "Task operacional";
  if (types.length === 1) {
    if (types[0] === "extract") return activeTab?.title ? `Ler ${activeTab.title}` : "Ler pagina ativa";
    if (types[0] === "navigate") return "Abrir pagina";
    if (types[0] === "click") return "Clicar elemento";
    if (types[0] === "input") return "Preencher campo";
  }
  return `Fluxo operacional (${types.join(" + ")})`;
}

function buildIntentTask(title, goal, steps, options = {}) {
  const activeTab = options.activeTab || null;
  return {
    title,
    goal,
    source: options.source || "system",
    status: "pending",
    steps: steps.map((step, index) => ({
      id: step.id || `intent_step_${index + 1}_${Math.random().toString(36).slice(2, 6)}`,
      description: compactText(step.description || `Passo ${index + 1}`, 180),
      status: "pending",
      action: {
        ...(step.action || {}),
        tabId: step.action?.tabId || String(activeTab?.id || ""),
        tabTitle: step.action?.tabTitle || String(activeTab?.title || ""),
        tabUrl: step.action?.tabUrl || String(activeTab?.url || ""),
        origin: step.action?.origin || String(activeTab?.origin || ""),
      },
      output: null,
      error: null,
    })),
    logs: [`intent:${title.toLowerCase().replace(/\s+/g, "_")}`],
    orchestration: {
      agentId: "extension-intent",
      agentRole: "IntentAdapter",
      stage: "intent_inference",
      tool: null,
      moduleKeys: ["browser"],
      dependsOn: [],
      parallelGroup: null,
    },
  };
}

function firstQuotedValue(text) {
  const match = String(text || "").match(/["“'`](.+?)["”'`]/);
  return match ? match[1].trim() : "";
}

function isStructuredTaskCandidate(item) {
  return Boolean(item && typeof item === "object" && (Array.isArray(item.steps) || item.goal || item.title));
}

function buildTaskFromPlanSteps(steps, body) {
  const mappedSteps = steps.map((step, index) => mapPlanStep(step, index)).filter(Boolean);
  if (!mappedSteps.length) return null;
  const summary = compactText(
    body?.result?.message
      || body?.result?.content
      || body?.message
      || "Plano do assistente",
    240,
  );
  return {
    title: compactText(summary || "Plano do assistente", 90),
    goal: summary || "Executar plano derivado da orquestracao atual.",
    source: "planner",
    status: "pending",
    steps: mappedSteps,
    logs: [],
    orchestration: body?.orchestration || {},
  };
}

function mapPlanStep(step, index) {
  if (!step || typeof step !== "object") return null;
  const action = inferBrowserAction(step);
  if (!action) return null;
  return {
    id: `step_${step.id || index + 1}_${Math.random().toString(36).slice(2, 6)}`,
    planStepId: Number(step.id || index + 1),
    description: compactText(step.description || step.action || `Passo ${index + 1}`, 180),
    status: "pending",
    action,
    output: null,
    error: null,
  };
}

function inferBrowserAction(step) {
  const rawAction = String(step?.action || step?.description || "").trim();
  const actionText = rawAction.toLowerCase();
  const input = step?.input && typeof step.input === "object" ? step.input : {};
  const payload = step?.output?.payload && typeof step.output.payload === "object" ? step.output.payload : {};
  const merged = { ...payload, ...input };
  const selector = firstNonEmpty(merged.selector, merged.cssSelector, merged.targetSelector);
  const url = firstNonEmpty(merged.url, merged.href, merged.targetUrl);
  const value = firstNonEmpty(merged.value, merged.text, merged.input, merged.query);
  const label = firstNonEmpty(merged.label, merged.fieldLabel, merged.targetLabel);
  const targetText = firstNonEmpty(merged.targetText, merged.text, merged.buttonText);

  if (url && (actionText.includes("navigate") || actionText.includes("abrir") || actionText.includes("open"))) {
    return { type: "navigate", url };
  }
  if (selector || targetText || label) {
    if (actionText.includes("click") || actionText.includes("clique")) {
      return { type: "click", selector, targetText, label };
    }
    if (actionText.includes("input") || actionText.includes("type") || actionText.includes("fill") || actionText.includes("preench")) {
      return { type: "input", selector, targetText, label, value: value || "" };
    }
    if (actionText.includes("extract") || actionText.includes("read") || actionText.includes("scan") || actionText.includes("ler")) {
      return { type: "extract", selector, targetText, label };
    }
  }
  if (actionText.includes("extract") || actionText.includes("read") || actionText.includes("scan") || actionText.includes("ler")) {
    return { type: "extract" };
  }
  if (url) {
    return { type: "navigate", url };
  }
  return null;
}

function compactText(value, limit = 140) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

function firstNonEmpty(...values) {
  return values.map((item) => String(item || "").trim()).find(Boolean) || "";
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

      let execution = null;
      let executionError = null;
      try {
        execution = await executeTask(query, session.id, { tabId, tabs: session.metadata.browserTabs });
      } catch (error) {
        executionError = error;
      }

      const rawTasks = execution?.body ? extractAiTasks(execution.body) : [];
      let aiTasks = rawTasks.map((task) => {
        const normalized = normalizeTask(sanitizeTask({ ...task }));
        normalized.sessionId = session.id;
        normalized.logs = Array.isArray(normalized.logs) ? normalized.logs : [];
        return normalized;
      });

      if (shouldCreateTask(query) && shouldReplaceWithIntentTasks(aiTasks)) {
        aiTasks = deriveIntentTasks(query, { tabId, tabs: session.metadata.browserTabs }).map((task) => {
          const normalized = normalizeTask(sanitizeTask({ ...task }));
          normalized.sessionId = session.id;
          normalized.logs = Array.isArray(normalized.logs) ? normalized.logs : [];
          return normalized;
        });
      }

      const dispatches = await autoDispatchTasks(commandQueue, session, aiTasks, tabId ? String(tabId) : "");
      saveTaskSession(session);

      const orchestration = {
        ...(execution?.body?.orchestration || {}),
        ai_tasks: aiTasks,
      };
      const result = execution?.body?.result || (executionError ? {
        kind: "structured",
        message: "O planner local nao respondeu a tempo, entao a extensao montou uma task operacional de navegador com base na sua intencao.",
        data: {
          status: "degraded_intent_fallback",
          tool: null,
          payload: {
            query,
            error: executionError?.message || "Falha ao planejar no ai-core.",
          },
        },
      } : null);

      res.json({
        ok: true,
        sessionId: session.id,
        shouldCreateTask: shouldCreateTask(query),
        result,
        tasks: aiTasks,
        dispatches,
        orchestration,
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
