const { runCommand } = require("./commands");
const { ts } = require("./utils");

const APPROVAL_ACTIONS = new Set(["click", "input", "change", "navigate", "submit", "key", "command"]);

function getApprovalStep(task) {
  return (Array.isArray(task.steps) ? task.steps : []).find((step) => step.status === "awaiting_approval");
}

function getRunnableStep(task) {
  return (Array.isArray(task.steps) ? task.steps : []).find((step) => step.status === "pending" && step.action);
}

function shouldRequireApproval(step) {
  const action = step?.action || {};
  if (!action.type) return false;
  if (action.requiresApproval === false) return false;
  if (action.requiresApproval === true) return true;
  return APPROVAL_ACTIONS.has(String(action.type));
}

function describeStepAction(step) {
  const action = step?.action || {};
  const target = action.selector || action.url || action.command || action.value || null;
  const pieces = [action.type || step?.description || "acao"];
  if (target) pieces.push(target);
  return pieces.filter(Boolean).join(" -> ");
}

function resolveDispatchTabId(task, step, fallbackTabId, workspaceTabs = []) {
  const action = step?.action || {};
  const requestedTabId = String(action.tabId || action.targetTabId || "").trim();
  if (requestedTabId) return requestedTabId;
  const match = findDispatchTab(step, fallbackTabId, workspaceTabs);
  return match?.id ? String(match.id) : String(fallbackTabId || "");
}

function findDispatchTab(step, fallbackTabId, workspaceTabs = []) {
  const action = step?.action || {};
  const requestedTabId = String(action.tabId || action.targetTabId || "").trim();
  const normalizedTabs = Array.isArray(workspaceTabs) ? workspaceTabs : [];
  if (requestedTabId) {
    return normalizedTabs.find((tab) => String(tab?.id || "") === requestedTabId) || { id: requestedTabId };
  }

  const tabTarget = action.tabTarget && typeof action.tabTarget === "object" ? action.tabTarget : {};
  const titleHint = String(tabTarget.title || action.tabTitle || "").trim().toLowerCase();
  const urlHint = String(tabTarget.url || action.urlContains || "").trim().toLowerCase();
  const originHint = String(tabTarget.origin || action.origin || "").trim().toLowerCase();

  const matched = normalizedTabs.find((tab) => {
    const title = String(tab?.title || "").toLowerCase();
    const url = String(tab?.url || "").toLowerCase();
    const origin = String(tab?.origin || "").toLowerCase();
    if (titleHint && title.includes(titleHint)) return true;
    if (urlHint && url.includes(urlHint)) return true;
    if (originHint && origin === originHint) return true;
    return false;
  });

  if (matched) return matched;
  if (!fallbackTabId) return null;
  return normalizedTabs.find((tab) => String(tab?.id || "") === String(fallbackTabId)) || { id: String(fallbackTabId) };
}

function stampStepTabContext(step, tabId, workspaceTabs = []) {
  if (!step || !tabId) return step;
  const match = findDispatchTab(step, tabId, workspaceTabs) || { id: String(tabId) };
  step.action = {
    ...(step.action || {}),
    tabId: String(tabId),
    tabTitle: step.action?.tabTitle || match?.title || "",
    tabUrl: step.action?.tabUrl || match?.url || "",
    origin: step.action?.origin || match?.origin || "",
  };
  return step;
}

function markStepAwaitingApproval(task, step) {
  if (!step) return task;
  step.status = "awaiting_approval";
  step.approval = {
    required: true,
    reason: buildApprovalReason(step),
    target: step.action?.selector || step.action?.url || step.action?.command || null,
    actionLabel: describeStepAction(step),
  };
  task.logs = [
    ...(Array.isArray(task.logs) ? task.logs : []),
    `${ts()} awaiting_approval step=${step.id} action=${describeStepAction(step)}`,
  ];
  task.status = "awaiting_approval";
  task.updatedAt = ts();
  return task;
}

function markApprovalDecision(task, approved) {
  const step = getApprovalStep(task);
  if (!step) return task;
  step.status = approved ? "running" : "error";
  step.error = approved ? null : "Acao negada pelo usuario";
  step.errorCategory = approved ? null : "user_denied";
  step.statusReason = approved ? "approved" : "user_denied";
  task.logs = [...(Array.isArray(task.logs) ? task.logs : []), `${ts()} approval=${approved ? "approved" : "denied"} step=${step.id}`];
  task.status = approved ? "running" : "paused";
  task.updatedAt = ts();
  return task;
}

async function dispatchApprovedStep({ commandQueue, tabId, task, step }) {
  const action = step?.action || {};
  if (action.type === "command" && action.command) {
    const result = await runCommand(String(action.command), action.payload || {});
    step.status = "done";
    step.output = result;
    task.logs = [...(task.logs || []), `${ts()} command=${action.command} status=done step=${step.id}`];
    return { mode: "immediate", result };
  }
  if (!tabId) throw new Error("tabId obrigatorio para executar acao no navegador.");
  if (!commandQueue.has(tabId)) commandQueue.set(tabId, []);
  commandQueue.get(tabId).push({
    type: "TASK_STEP",
    payload: { sessionId: task.sessionId, taskId: task.id, stepId: step.id, tabId, action },
  });
  task.logs = [...(task.logs || []), `${ts()} queued_browser_action=${action.type || "unknown"} step=${step.id} tab=${tabId}`];
  return { mode: "queued", tabId };
}

function applyStepResult(task, stepId, result) {
  const step = (task.steps || []).find((item) => item.id === stepId);
  if (!step) return task;
  step.output = result.output || null;
  step.error = result.error || null;
  step.status = result.status === "ok" ? "done" : "error";
  step.errorCategory = result.status === "ok" ? null : classifyStepFailure(result.error, step);
  step.statusReason = result.status === "ok" ? "completed" : step.errorCategory;
  task.logs = [...(task.logs || []), `${ts()} step_result=${step.status} step=${stepId}${result.error ? ` error=${result.error}` : ""}`];
  return task;
}

function classifyStepFailure(error, step) {
  const message = String(error || "").toLowerCase();
  if (!message) return "unknown";
  if (message.includes("negada pelo usuario") || message.includes("denied")) return "user_denied";
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (message.includes("nao encontrado") || message.includes("not found")) {
    return step?.action?.type === "command" ? "tool_missing" : "browser_target_missing";
  }
  if (message.includes("tabid obrigatorio") || message.includes("guia ativa") || message.includes("content script") || message.includes("selector")) {
    return "browser_error";
  }
  if (message.includes("provider") || message.includes("llm") || message.includes("model")) return "provider_error";
  return "unknown";
}

function buildApprovalReason(step) {
  const actionType = String(step?.action?.type || "");
  if (actionType === "navigate") return "Esta etapa vai abrir ou trocar a pagina atual.";
  if (actionType === "input" || actionType === "change") return "Esta etapa vai preencher ou alterar um campo da pagina.";
  if (actionType === "submit") return "Esta etapa pode enviar dados para o site.";
  if (actionType === "click") return "Esta etapa vai interagir com um elemento da interface.";
  if (actionType === "command") return "Esta etapa vai executar um comando local autorizado.";
  if (actionType === "key") return "Esta etapa vai simular digitacao ou atalho de teclado.";
  return "Esta etapa pode alterar o estado da pagina ou do ambiente.";
}

module.exports = {
  applyStepResult,
  describeStepAction,
  dispatchApprovedStep,
  findDispatchTab,
  getRunnableStep,
  getApprovalStep,
  markApprovalDecision,
  markStepAwaitingApproval,
  resolveDispatchTabId,
  stampStepTabContext,
  shouldRequireApproval,
  classifyStepFailure,
};
