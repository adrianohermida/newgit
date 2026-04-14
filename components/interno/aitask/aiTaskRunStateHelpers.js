export function resetRunTracking(refs) {
  refs.runEventIdsRef.current.clear();
  refs.lastEventCursorRef.current = null;
  refs.lastEventSequenceRef.current = null;
}

export function markTasksAsFailed(current, nowIso, message, includePending = false) {
  return current.map((task) => {
    const shouldFail = task.status === "running" || (includePending && task.status === "pending");
    return shouldFail ? { ...task, status: "failed", updated_at: nowIso(), logs: [...(task.logs || []), message] } : task;
  });
}

export function markTasksAsDone(current, nowIso) {
  return current.map((task) => (task.status === "pending" || task.status === "running" ? { ...task, status: "done", updated_at: nowIso() } : task));
}

export function updateHistoryItem(current, matcher, updater) {
  return current.map((item) => (matcher(item) ? updater(item) : item));
}
