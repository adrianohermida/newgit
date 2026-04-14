const path = require("path");
const { SESSIONS_DIR } = require("./config");
const { safeRead, safeWrite } = require("./storage");
const { ts } = require("./utils");

function getSessionFile(sessionId) {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}

function loadTaskSession(sessionId) {
  return safeRead(getSessionFile(sessionId)) || {
    id: sessionId,
    provider: "local",
    model: "aetherlab-legal-local-v1",
    metadata: {},
    messages: [],
    tasks: [],
    createdAt: ts(),
    updatedAt: ts(),
  };
}

function saveTaskSession(session) {
  session.updatedAt = ts();
  safeWrite(getSessionFile(session.id), session);
  return session;
}

function updateTask(session, taskId, updater) {
  session.tasks = (Array.isArray(session.tasks) ? session.tasks : []).map((task) => {
    if (task.id !== taskId) return task;
    return normalizeTask(updater({ ...task }));
  });
  return saveTaskSession(session);
}

function normalizeTask(task) {
  const steps = Array.isArray(task.steps) ? task.steps : [];
  const done = steps.filter((step) => step.status === "done").length;
  const awaiting = steps.some((step) => step.status === "awaiting_approval");
  const running = steps.some((step) => step.status === "running");
  const failed = steps.some((step) => step.status === "error");
  task.steps = steps;
  task.progressPct = steps.length ? Math.round((done / steps.length) * 100) : Number(task.progressPct || 0);
  task.currentStepId = steps.find((step) => step.status !== "done")?.id || null;
  task.status = awaiting ? "awaiting_approval" : failed ? "error" : running ? "running" : done === steps.length && steps.length ? "completed" : "pending";
  task.updatedAt = ts();
  return task;
}

function findStep(task, stepId) {
  return (Array.isArray(task.steps) ? task.steps : []).find((step) => step.id === stepId);
}

module.exports = {
  findStep,
  loadTaskSession,
  normalizeTask,
  saveTaskSession,
  updateTask,
};
