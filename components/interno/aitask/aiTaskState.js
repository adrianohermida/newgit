export function buildTaskColumns(tasks = []) {
  const base = {
    pending: [],
    running: [],
    done: [],
    failed: [],
  };
  tasks.forEach((task) => {
    const key = task.status === "done" ? "done" : task.status === "failed" ? "failed" : task.status === "running" ? "running" : "pending";
    base[key].push(task);
  });
  return base;
}

export function buildAgentLanes(tasks = []) {
  const lanes = new Map();
  tasks.forEach((task) => {
    const key = task.assignedAgent || "Dotobot";
    if (!lanes.has(key)) {
      lanes.set(key, { agent: key, tasks: [], runningCount: 0 });
    }
    const lane = lanes.get(key);
    lane.tasks.push(task);
    if (task.status === "running" || task.status === "pending") {
      lane.runningCount += 1;
    }
  });
  return Array.from(lanes.values());
}

export function filterLogsByType(logs = [], selectedLogFilter = "all") {
  return logs.filter((log) => selectedLogFilter === "all" || log.type === selectedLogFilter);
}

export function filterLogsBySearch(logs = [], search = "") {
  const normalized = String(search || "").trim().toLowerCase();
  if (!normalized) return logs;
  return logs.filter((log) => {
    const value = `${log.type} ${log.action} ${log.result}`.toLowerCase();
    return value.includes(normalized);
  });
}

export function findSelectedTask(tasks = [], selectedTaskId = null) {
  return tasks.find((task) => task.id === selectedTaskId) || tasks[0] || null;
}

export function resolveAutomationLabel(automation) {
  return automation === "running"
    ? "Executando"
    : automation === "paused"
      ? "Pausado"
      : automation === "waiting_approval"
        ? "Aguardando aprovacao"
        : automation === "done"
          ? "Concluido"
          : automation === "failed"
            ? "Falhou"
            : automation === "stopped"
              ? "Parado"
              : "Pronto";
}

export function trimRecentHistory(missionHistory = [], limit = 6) {
  return missionHistory.slice(0, limit);
}

export function normalizeAttachmentsFromEvent(event, limit = 6) {
  return Array.from(event?.target?.files || [])
    .slice(0, limit)
    .map((file) => ({
      name: file.name,
      type: file.type || "file",
      size: file.size,
    }));
}
