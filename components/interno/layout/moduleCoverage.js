import { listModuleRegistryEntries } from "../../../lib/admin/module-registry";
import { summarizeFingerprints, summarizeSla } from "./consoleSummary";

export const PRIORITY_MODULE_KEYS = new Set(["contacts", "publicacoes", "processos", "dotobot", "ai-task"]);

function inferSnapshotTone(snapshot) {
  if (!snapshot) return "muted";
  if (snapshot.error) return "danger";
  if (snapshot.loading) return "warn";
  if (snapshot.uiState === "error" || snapshot.status === "error") return "danger";
  return "success";
}

function inferSnapshotSummary(key, snapshot) {
  if (!snapshot) return "Sem dados coletados.";
  if (snapshot.error) return snapshot.error;
  if (snapshot.routePath && snapshot.shell) return `${snapshot.shell} em ${snapshot.routePath}`;
  if (snapshot.routePath) return `Rota ${snapshot.routePath}`;
  if (key === "contacts" && snapshot.overview) return `Contatos ${snapshot.overview.total || 0}, duplicados ${snapshot.overview.duplicados || 0}`;
  if (key === "processos") return `Historico local ${snapshot.executionHistory?.length || 0}, remoto ${snapshot.remoteHistory?.length || 0}`;
  if (key === "publicacoes") return `Jobs ${snapshot.jobs?.length || 0}, historico remoto ${snapshot.remoteHistory?.length || 0}`;
  if (key === "ai-task") return `Eventos ${snapshot.eventsTotal || 0}, automacao ${snapshot.automation || "idle"}`;
  if (key === "dotobot") return `Conversas ${snapshot.conversationCount || 0}, modo ${snapshot.mode || "n/a"}`;
  if (key === "aprovacoes") return `Pendencias de cadastro ${snapshot.pendingCadastro || 0}`;
  return "Snapshot atualizado.";
}

export function buildCoverageCards(moduleHistory = {}) {
  const registry = new Map(listModuleRegistryEntries().map((entry) => [entry.key, entry]));
  const keys = new Set([...registry.keys(), ...Object.keys(moduleHistory || {})]);
  return Array.from(keys)
    .map((key) => {
      const registered = registry.get(key) || null;
      const snapshot = moduleHistory?.[key] || null;
      return {
        key,
        label: registered?.label || key,
        routePath: snapshot?.routePath || snapshot?.asPath || registered?.routePath || null,
        updatedAt: snapshot?.updatedAt || snapshot?.lastNavigationAt || null,
        tone: snapshot ? inferSnapshotTone(snapshot) : "muted",
        summary: snapshot ? inferSnapshotSummary(key, snapshot) : "Cobertura ainda nao publicada neste modulo.",
        capabilities: snapshot?.capabilities || registered?.capabilities || [],
        quickActions: snapshot?.quickActions || registered?.quickActions || [],
        consoleTags: snapshot?.consoleTags || registered?.consoleTags || ["ai-task", key].filter(Boolean),
        snapshot,
      };
    })
    .sort((a, b) => {
      if (Boolean(a.snapshot) !== Boolean(b.snapshot)) return a.snapshot ? -1 : 1;
      const left = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const right = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return right - left;
    });
}

export function summarizeModuleAlert(moduleKey, entries = [], fingerprintStates = {}) {
  const moduleEntries = entries.filter((entry) => entry?.module === moduleKey);
  const recurring = summarizeFingerprints(moduleEntries, fingerprintStates);
  const sla = summarizeSla(moduleEntries, recurring, fingerprintStates);
  const errors = moduleEntries.filter((entry) => entry?.severity === "error").length;
  const warnings = moduleEntries.filter((entry) => entry?.severity === "warn").length;
  return {
    moduleKey,
    entries: moduleEntries.length,
    errors,
    warnings,
    recurringOpen: recurring.filter((item) => item.status === "aberto").length,
    recurringWatching: recurring.filter((item) => item.status === "acompanhando").length,
    overdue: sla.overdue,
    stale: sla.buckets.acima_72h,
    buckets: sla.buckets,
    tone: sla.tone === "error" || errors >= 3 ? "danger" : sla.tone === "warn" || warnings > 0 ? "warn" : "success",
  };
}

export function deriveModuleSafeWindow(moduleKey, snapshot, alert) {
  const tone = alert?.tone || "success";
  const isCritical = tone === "danger";
  const isWarn = tone === "warn";
  if (moduleKey === "contacts") {
    const syncLimit = Number(snapshot?.settings?.syncLimit || 0) || 100;
    const reconcileLimit = Number(snapshot?.settings?.reconcileLimit || 0) || 20;
    return { blocked: isCritical, summary: isCritical ? "Segure novas bulk actions amplas em contatos ate estabilizar CRM e persistencia." : isWarn ? "Reduza a operacao para um lote menor e acompanhe CRM/portal antes de ampliar." : "Bulk actions podem seguir em lote curto com observacao normal.", chips: [`sync sugerido ${Math.max(10, Math.min(syncLimit, isCritical ? 25 : isWarn ? 50 : 100))}`, `reconcile sugerido ${Math.max(5, Math.min(reconcileLimit, isCritical ? 10 : isWarn ? 15 : 20))}`] };
  }
  if (moduleKey === "publicacoes") {
    const limit = Number(snapshot?.limit || 0) || 10;
    const pendingJobs = Array.isArray(snapshot?.jobs) ? snapshot.jobs.filter((item) => ["pending", "running"].includes(String(item?.status || ""))).length : 0;
    return { blocked: isCritical || pendingJobs > 1, summary: isCritical || pendingJobs > 1 ? "Nao amplie o lote de publicacoes enquanto houver recorrencia critica ou jobs concorrentes." : isWarn ? "Use lote curto e drene a fila antes de disparar nova rodada." : "Fila sob controle para uma rodada operacional padrao.", chips: [`lote sugerido ${Math.max(5, Math.min(limit, isCritical ? 5 : isWarn ? 8 : 10))}`, `jobs ativos ${pendingJobs}`] };
  }
  if (moduleKey === "processos") {
    const limit = Number(snapshot?.limit || 0) || 2;
    const queueHints = Object.values(snapshot?.queueBatchSizes || {}).map((value) => Number(value || 0)).filter(Boolean);
    const baseline = queueHints.length ? Math.min(...queueHints) : limit;
    return { blocked: isCritical, summary: isCritical ? "Trave lote amplo em processos e priorize a amostra reincidente." : isWarn ? "Operar processos em lote minimo ate validar o ganho do ciclo." : "Lote de processos pode seguir no ritmo padrao do painel.", chips: [`lote sugerido ${Math.max(2, Math.min(baseline, isCritical ? 5 : isWarn ? 8 : 15))}`, `filas ${queueHints.length || 0}`] };
  }
  return null;
}
