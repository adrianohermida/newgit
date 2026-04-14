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
  task.logs = [...(task.logs || []), `${ts()} step_result=${step.status} step=${stepId}${result.error ? ` error=${result.error}` : ""}`];
  return task;
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
  getRunnableStep,
  getApprovalStep,
  markApprovalDecision,
  markStepAwaitingApproval,
  shouldRequireApproval,
};
