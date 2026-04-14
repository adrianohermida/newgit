import { getActivityLogResponseText } from "../../../lib/admin/activity-log";

const ACTIVE_JOB_STATUSES = ["pending", "running", "paused", "retry_wait", "scheduled"];
const MODULE_LABELS = {
  processos: "Processos",
  publicacoes: "Publicacoes",
  jobs: "Jobs",
  financeiro: "Financeiro",
};
const QUEUE_LABELS = {
  semMovimentacoes: "Sem movimentacoes",
  movimentacoesPendentes: "Movimentacoes pendentes",
  publicacoesPendentes: "Publicacoes pendentes",
  partesSemContato: "Partes sem contato",
  audienciasPendentes: "Audiencias pendentes",
  camposOrfaos: "Campos orfaos",
  orfaos: "Sem Sales Account",
  candidatosProcessos: "Processos criaveis",
  candidatosPartes: "Partes extraiveis",
};

function formatQueueLabel(key) {
  return QUEUE_LABELS[key] || key;
}

export function buildOperationalRailData(moduleKey, snapshot, entries = []) {
  if (!moduleKey || !snapshot) return null;
  const jobs = Array.isArray(snapshot?.jobs) ? snapshot.jobs : [];
  const activeJobs = jobs.filter((item) => ACTIVE_JOB_STATUSES.includes(String(item?.status || ""))).slice(0, 5);
  const failedJobs = jobs.filter((item) => String(item?.status || "") === "error").slice(0, 3);
  const queues = Object.entries(snapshot?.queues || {})
    .map(([key, value]) => ({ key, label: formatQueueLabel(key), totalRows: Number(value?.totalRows || 0), error: value?.error || null, updatedAt: value?.updatedAt || null, limited: Boolean(value?.limited) }))
    .filter((item) => item.totalRows > 0 || item.error)
    .sort((left, right) => (Boolean(left.error) !== Boolean(right.error) ? (left.error ? -1 : 1) : right.totalRows - left.totalRows))
    .slice(0, 5);
  const batchHints = Object.entries(snapshot?.queueBatchSizes || {})
    .map(([key, value]) => ({ key, label: formatQueueLabel(key), value: Number(value || 0) }))
    .filter((item) => item.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);
  const recentErrors = entries
    .filter((entry) => entry?.module === moduleKey && entry?.severity === "error")
    .slice(0, 4)
    .map((entry) => ({
      id: entry.id,
      label: entry.label || entry.action || "Erro operacional",
      message: entry.error || getActivityLogResponseText(entry) || entry.recommendedAction || "Falha sem detalhe.",
      createdAt: entry.createdAt || null,
      fingerprint: entry.fingerprint || "",
    }));
  const actionState = snapshot?.actionState || {};
  const selectedCount = Object.entries(snapshot?.ui || {})
    .filter(([key]) => key.startsWith("selected"))
    .reduce((total, [, value]) => total + Number(value || 0), 0);
  const shouldRender = activeJobs.length || failedJobs.length || queues.length || batchHints.length || recentErrors.length || actionState?.loading || actionState?.error;
  if (!shouldRender) return null;
  return {
    moduleKey,
    moduleLabel: MODULE_LABELS[moduleKey] || moduleKey,
    activeJobs,
    failedJobs,
    queues,
    batchHints,
    recentErrors,
    selectedCount,
    actionState,
    backendHealth: snapshot?.backendHealth || null,
    operationalStatus: snapshot?.operationalStatus || null,
    limit: Number(snapshot?.ui?.limit || 0) || null,
    activeJobId: snapshot?.activeJobId || null,
    drainInFlight: Boolean(snapshot?.drainInFlight),
  };
}
