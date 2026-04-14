export const LOG_PANES = [
  { key: "activity", label: "Atividade", group: "fluxo", alwaysVisible: true },
  { key: "history", label: "Historico", group: "fluxo", alwaysVisible: true },
  { key: "debug", label: "Debug", group: "fluxo", alwaysVisible: true },
  { key: "frontend", label: "Frontend", group: "auditoria", alwaysVisible: true },
  { key: "schema", label: "Banco", group: "auditoria", alwaysVisible: true },
  { key: "notes", label: "Notas", group: "auditoria", alwaysVisible: true },
  { key: "crm", label: "CRM", group: "integracoes" },
  { key: "supabase", label: "Supabase", group: "integracoes" },
  { key: "webhook", label: "Webhook", group: "integracoes" },
  { key: "functions", label: "Functions", group: "integracoes" },
  { key: "routes", label: "Rotas", group: "integracoes" },
  { key: "jobs", label: "Jobs", group: "integracoes" },
  { key: "dotobot", label: "Dotobot", group: "ia" },
  { key: "ai-task", label: "AI Task", group: "ia" },
  { key: "security", label: "Seguranca", group: "governanca" },
  { key: "data-quality", label: "Dados", group: "governanca" },
];

export const LOG_PANE_GROUPS = [
  { key: "fluxo", label: "Fluxo" },
  { key: "auditoria", label: "Auditoria" },
  { key: "integracoes", label: "Integracoes" },
  { key: "ia", label: "IA" },
  { key: "governanca", label: "Governanca" },
];

export function formatActivityCountLabel(count) {
  return `${count} ${count === 1 ? "item" : "itens"}`;
}

export function getSeverityTone(severity) {
  if (severity === "error") return "border-[#5B2D2D] text-[#FECACA]";
  if (severity === "warn") return "border-[#6E5630] text-[#FDE68A]";
  return "border-[#30543A] text-[#B7F7C6]";
}

export function getFingerprintStatusTone(status) {
  if (status === "resolvido") return "border-[#30543A] text-[#B7F7C6]";
  if (status === "acompanhando") return "border-[#6E5630] text-[#FDE68A]";
  return "border-[#5B2D2D] text-[#FECACA]";
}

export function summarizeFingerprints(entries = [], fingerprintStates = {}) {
  const map = new Map();
  for (const entry of entries) {
    const key = entry?.fingerprint;
    if (!key) continue;
    const triage = fingerprintStates?.[key] || null;
    const current = map.get(key) || {
      fingerprint: key,
      count: 0,
      severity: entry?.severity || "info",
      label: entry?.label || entry?.action || "Evento",
      recommendedAction: entry?.recommendedAction || "",
      status: triage?.status || "aberto",
      note: triage?.note || "",
      updatedAt: triage?.updatedAt || null,
      lastEntryId: triage?.lastEntryId || entry?.id || null,
    };
    current.count += 1;
    if (entry?.severity === "error") current.severity = "error";
    else if (entry?.severity === "warn" && current.severity !== "error") current.severity = "warn";
    map.set(key, current);
  }
  return Array.from(map.values()).filter((item) => item.count > 1).sort((a, b) => b.count - a.count).slice(0, 4);
}

export function summarizeRecommendations(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    const key = String(entry?.recommendedAction || "").trim();
    if (!key) continue;
    const current = map.get(key) || { action: key, count: 0, severity: entry?.severity || "info" };
    current.count += 1;
    if (entry?.severity === "error") current.severity = "error";
    else if (entry?.severity === "warn" && current.severity !== "error") current.severity = "warn";
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 3);
}

export function calculateRiskScore(entries = [], recurring = []) {
  const errors = entries.filter((entry) => entry?.severity === "error").length;
  const warnings = entries.filter((entry) => entry?.severity === "warn").length;
  const unresolvedRecurring = recurring.filter((item) => item.status !== "resolvido").length;
  const score = Math.min(100, (errors * 18) + (warnings * 7) + (unresolvedRecurring * 12));
  const tone = score >= 70 ? "error" : score >= 35 ? "warn" : "info";
  const label = score >= 70 ? "alto" : score >= 35 ? "medio" : "baixo";
  return { score, tone, label };
}

export function formatPaneCountLabel(count) {
  return count > 0 ? `(${count})` : "";
}

export function shouldShowLogPane(pane, paneCounts = {}, activePane = "") {
  if (!pane) return false;
  if (pane.alwaysVisible) return true;
  if (pane.key === activePane) return true;
  return Number(paneCounts?.[pane.key] || 0) > 0;
}

export function summarizeTimeline(entries = []) {
  const map = new Map();
  for (const entry of entries) {
    const hints = Array.isArray(entry?.traceHints) ? entry.traceHints : [];
    for (const hint of hints) {
      const key = `${hint.type}:${hint.value}`;
      const current = map.get(key) || { key, label: hint.label || key, count: 0, severity: entry?.severity || "info", lastAt: entry?.createdAt || entry?.startedAt || null };
      current.count += 1;
      if (entry?.severity === "error") current.severity = "error";
      else if (entry?.severity === "warn" && current.severity !== "error") current.severity = "warn";
      const candidateDate = entry?.createdAt || entry?.startedAt || null;
      if (candidateDate && (!current.lastAt || new Date(candidateDate).getTime() > new Date(current.lastAt).getTime())) current.lastAt = candidateDate;
      map.set(key, current);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5);
}

function getAgeBucket(createdAt) {
  const time = createdAt ? new Date(createdAt).getTime() : 0;
  if (!time || Number.isNaN(time)) return "sem_data";
  const diffHours = (Date.now() - time) / (1000 * 60 * 60);
  if (diffHours <= 4) return "ate_4h";
  if (diffHours <= 24) return "ate_24h";
  if (diffHours <= 72) return "ate_72h";
  return "acima_72h";
}

export function summarizeSla(entries = [], recurring = [], fingerprintStates = {}) {
  const errors = entries.filter((entry) => entry?.severity === "error");
  const openRecurring = recurring.filter((item) => item.status === "aberto").length;
  const watchingRecurring = recurring.filter((item) => item.status === "acompanhando").length;
  const resolvedRecurring = recurring.filter((item) => item.status === "resolvido").length;
  const buckets = { ate_4h: 0, ate_24h: 0, ate_72h: 0, acima_72h: 0, sem_data: 0 };
  for (const entry of errors) {
    const state = entry?.fingerprint ? fingerprintStates?.[entry.fingerprint] : null;
    if (state?.status === "resolvido") continue;
    buckets[getAgeBucket(entry?.createdAt || entry?.startedAt)] += 1;
  }
  const overdue = buckets.acima_72h + buckets.sem_data;
  const tone = overdue > 0 || openRecurring >= 3 ? "error" : openRecurring > 0 || watchingRecurring > 0 ? "warn" : "info";
  return { tone, openRecurring, watchingRecurring, resolvedRecurring, buckets, overdue };
}
