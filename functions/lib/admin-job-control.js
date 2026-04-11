function normalizeSource(value, fallback = "interno") {
  const source = String(value || fallback || "interno").trim().toLowerCase();
  return source === "portal" ? "portal" : "interno";
}

export function normalizeJobControlPayload(payload = {}, defaults = {}) {
  const rawControl = payload?.jobControl && typeof payload.jobControl === "object" ? payload.jobControl : payload;
  const source = normalizeSource(rawControl?.source || rawControl?.origem, defaults.defaultSource || "interno");
  const priority = Math.max(1, Math.min(Number(rawControl?.priority || defaults.defaultPriority || 3), 5));
  const rateLimitKey = String(rawControl?.rateLimitKey || rawControl?.rate_limit_key || defaults.defaultRateLimitKey || "default").trim() || "default";
  const visibleToPortal = rawControl?.visibleToPortal !== undefined
    ? Boolean(rawControl.visibleToPortal)
    : rawControl?.visible_to_portal !== undefined
      ? Boolean(rawControl.visible_to_portal)
      : Boolean(defaults.defaultVisibleToPortal);
  return {
    source,
    priority,
    rateLimitKey,
    visibleToPortal,
  };
}

export function getJobControlFromPayload(payload = {}) {
  const control = payload?.jobControl && typeof payload.jobControl === "object" ? payload.jobControl : payload;
  return {
    source: normalizeSource(control?.source || control?.origem, "interno"),
    priority: Math.max(1, Math.min(Number(control?.priority || 3), 5)),
    rateLimitKey: String(control?.rateLimitKey || control?.rate_limit_key || "default").trim() || "default",
    visibleToPortal: Boolean(control?.visibleToPortal || control?.visible_to_portal || false),
  };
}

export function getAdminJobDispatchScore(job = {}) {
  const control = getJobControlFromPayload(job?.payload || {});
  const status = String(job?.status || "").trim();
  const scheduledFor = String(job?.payload?.scheduledFor || "").trim();
  const scheduledAt = scheduledFor ? Date.parse(scheduledFor) : NaN;
  const isFutureScheduled = Number.isFinite(scheduledAt) && scheduledAt > Date.now();
  const createdAt = Date.parse(String(job?.created_at || "")) || 0;

  const statusWeight =
    status === "running"
      ? 0
      : status === "pending"
        ? 1
        : status === "retry_wait"
          ? 2
          : status === "paused"
            ? 3
            : isFutureScheduled
              ? 4
              : 5;

  return {
    statusWeight,
    priorityWeight: 6 - control.priority,
    scheduledWeight: isFutureScheduled ? 1 : 0,
    createdAt,
    rateLimitKey: control.rateLimitKey,
  };
}

export function sortAdminJobsForDispatch(items = []) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const leftScore = getAdminJobDispatchScore(left);
    const rightScore = getAdminJobDispatchScore(right);
    if (leftScore.statusWeight !== rightScore.statusWeight) return leftScore.statusWeight - rightScore.statusWeight;
    if (leftScore.scheduledWeight !== rightScore.scheduledWeight) return leftScore.scheduledWeight - rightScore.scheduledWeight;
    if (leftScore.priorityWeight !== rightScore.priorityWeight) return leftScore.priorityWeight - rightScore.priorityWeight;
    return leftScore.createdAt - rightScore.createdAt;
  });
}

export function pickNextDispatchableJob(items = [], options = {}) {
  const activeRateLimitKeys = new Set(
    (Array.isArray(options.activeRateLimitKeys) ? options.activeRateLimitKeys : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );
  const sorted = sortAdminJobsForDispatch(items);
  return (
    sorted.find((job) => {
      const status = String(job?.status || "").trim();
      if (!["pending", "running", "retry_wait"].includes(status)) return false;
      const control = getJobControlFromPayload(job?.payload || {});
      if (status !== "running" && activeRateLimitKeys.has(control.rateLimitKey)) return false;
      const scheduledFor = String(job?.payload?.scheduledFor || "").trim();
      const scheduledAt = scheduledFor ? Date.parse(scheduledFor) : NaN;
      if (Number.isFinite(scheduledAt) && scheduledAt > Date.now()) return false;
      return true;
    }) || null
  );
}
