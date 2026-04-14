const { runCommand } = require("./commands");
const { ts } = require("./utils");

function getApprovalStep(task) {
  return (Array.isArray(task.steps) ? task.steps : []).find((step) => step.status === "awaiting_approval");
}

function getRunnableStep(task) {
  return (Array.isArray(task.steps) ? task.steps : []).find((step) => step.status === "pending" && step.action);
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

module.exports = {
  applyStepResult,
  dispatchApprovedStep,
  getRunnableStep,
  getApprovalStep,
  markApprovalDecision,
};
