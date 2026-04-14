import { ACTION_LABELS, MODULE_LIMITS } from "./constants";

export function stringifyLogPayload(payload, limit = 8000) {
  if (payload === undefined) return "";
  try {
    const text = JSON.stringify(payload, null, 2);
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  } catch {
    return String(payload);
  }
}

export function extractActionFromRequest(path, init) {
  let action = "";
  if (typeof window !== "undefined" && typeof path === "string") {
    try {
      action = new URL(path, window.location.origin).searchParams.get("action") || "";
    } catch {}
  }
  if (!action && init?.body) {
    try {
      action = JSON.parse(init.body)?.action || "";
    } catch {}
  }
  return action;
}

export function getSafePublicacoesActionLimit(action, requestedLimit) {
  const normalized = Number(requestedLimit || 0) || 0;
  if (action === "orquestrar_drenagem_publicacoes") return Math.max(1, Math.min(normalized || 10, MODULE_LIMITS.maxCreateProcess));
  if (action === "sincronizar_partes") return Math.max(1, Math.min(normalized || 10, MODULE_LIMITS.maxSyncPartes));
  if (action === "criar_processos_publicacoes") return Math.max(1, Math.min(normalized || 10, MODULE_LIMITS.maxCreateProcess));
  if (action === "backfill_partes") return Math.max(1, Math.min(normalized || 15, MODULE_LIMITS.maxBackfillPartes));
  if (action === "reconciliar_partes_contatos") return Math.max(1, Math.min(normalized || 5, 10));
  if (action === "run_sync_worker") return Math.max(1, Math.min(normalized || 2, MODULE_LIMITS.maxSyncWorker));
  if (action === "run_advise_sync") return Math.max(1, Math.min(normalized || 12, MODULE_LIMITS.maxAdviseSync));
  return Math.max(1, Math.min(normalized || MODULE_LIMITS.maxDefault, MODULE_LIMITS.maxDefault));
}

export function getPublicacoesActionLabel(action) {
  return ACTION_LABELS[action] || action || "publicacoes";
}

export function buildHistoryPreview(result) {
  if (!result) return "";
  if (result.erro) return String(result.erro);
  if (result.uiHint) return String(result.uiHint);
  if (result.activityTypeStatus?.matchedName) return `Tipo de atividade no CRM: ${result.activityTypeStatus.matchedName}`;
  if (typeof result.processosCriados === "number") return `Processos criados: ${result.processosCriados}`;
  if (typeof result.partesInseridas === "number") return `Partes inseridas: ${result.partesInseridas}`;
  if (typeof result.processosAtualizados === "number") return `Processos atualizados: ${result.processosAtualizados}`;
  if (typeof result.accountsReparadas === "number") return `Contas ajustadas: ${result.accountsReparadas}`;
  if (typeof result.publicacoes === "number") return `Publicacoes processadas: ${result.publicacoes}`;
  if (typeof result.total === "number") return `Total: ${result.total}`;
  if (typeof result.affected_count === "number" || typeof result.requested_count === "number") {
    return `Integracoes atualizadas: ${Number(result.affected_count || 0)} de ${Number(result.requested_count || 0)} itens previstos`;
  }
  if (typeof result.items?.length === "number") return `Itens retornados: ${result.items.length}`;
  if (typeof result.sample?.length === "number") return `Amostra: ${result.sample.length}`;
  return "Execucao concluida";
}

export function buildJobPreview(job) {
  if (!job) return "";
  const processed = Number(job.processed_count || 0);
  const requested = Number(job.requested_count || 0);
  const errors = Number(job.error_count || 0);
  if (job.status === "completed") return `Concluido: ${processed}/${requested} processado(s)`;
  if (job.status === "error") return job.last_error || `Falha apos ${processed}/${requested}`;
  return `Em andamento: ${processed}/${requested} processado(s), ${errors} falha(s)`;
}

export function buildDrainPreview(result) {
  if (!result) return "";
  const processed = Number(result.chunksProcessed || 0);
  if (result.completedAll) return `Fila drenada em ${processed} rodada(s)`;
  if (result.job) return `Fila avancou ${processed} rodada(s): ${buildJobPreview(result.job)}`;
  return `Fila avancou ${processed} rodada(s)`;
}
