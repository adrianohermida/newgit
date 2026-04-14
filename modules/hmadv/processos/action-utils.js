import { ACTION_LABELS } from "./constants";

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

export function getProcessActionLimitConfig(action) {
  if (action === "sync_supabase_crm" || action === "repair_freshsales_accounts") return { defaultLimit: 1, maxLimit: 1 };
  if (action === "sincronizar_publicacoes_activity") return { defaultLimit: 5, maxLimit: 10 };
  if (action === "sincronizar_movimentacoes_activity") return { defaultLimit: 5, maxLimit: 25 };
  if (action === "reconciliar_partes_contatos") return { defaultLimit: 10, maxLimit: 30 };
  if (action === "enriquecer_datajud" || action === "push_orfaos" || action === "backfill_audiencias") return { defaultLimit: 5, maxLimit: 10 };
  return { defaultLimit: 15, maxLimit: 25 };
}

export function getSafeProcessActionLimit(action, requestedLimit) {
  const { defaultLimit, maxLimit } = getProcessActionLimitConfig(action);
  return Math.max(1, Math.min(Number(requestedLimit || defaultLimit), maxLimit));
}

export function getProcessActionLabel(action, payload = {}) {
  let normalizedAction = String(action || "").trim();
  let suffixLabel = "";
  if (normalizedAction.endsWith("_job")) {
    normalizedAction = normalizedAction.slice(0, -4);
    suffixLabel = " (job)";
  } else if (normalizedAction.endsWith("_inline_fallback")) {
    normalizedAction = normalizedAction.slice(0, -16);
    suffixLabel = " (fallback inline)";
  }
  let intent = String(payload?.intent || "").trim();
  if (!intent && normalizedAction.startsWith("enriquecer_datajud_")) {
    intent = normalizedAction.slice("enriquecer_datajud_".length);
    normalizedAction = "enriquecer_datajud";
  }
  if (normalizedAction === "enriquecer_datajud") {
    if (intent === "buscar_movimentacoes") return `Buscar atualizacoes no DataJud${suffixLabel}`;
    if (intent === "sincronizar_monitorados") return `Atualizar monitorados${suffixLabel}`;
    if (intent === "reenriquecer_gaps") return `Completar processos com lacunas${suffixLabel}`;
    return `Atualizar via DataJud${suffixLabel}`;
  }
  if (normalizedAction === "sync_supabase_crm") {
    if (intent === "crm_only") return `Atualizar CRM sem DataJud${suffixLabel}`;
    if (intent === "datajud_plus_crm") return `Atualizar DataJud e CRM${suffixLabel}`;
  }
  return `${ACTION_LABELS[normalizedAction] || normalizedAction}${suffixLabel}`;
}

export function getProcessIntentBadge(payload = {}) {
  const intent = String(payload?.intent || "").trim();
  if (intent === "buscar_movimentacoes") return "subtipo: buscar atualizacoes";
  if (intent === "sincronizar_monitorados") return "subtipo: atualizar monitorados";
  if (intent === "reenriquecer_gaps") return "subtipo: reenriquecer gaps";
  if (intent === "crm_only") return "subtipo: crm only";
  if (intent === "datajud_plus_crm") return "subtipo: datajud + crm";
  return "";
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
  if (result.completedAll) return `Rodada concluida em ${processed} etapa(s)`;
  if (result.job) return `Rodada avancou ${processed} etapa(s): ${buildJobPreview(result.job)}`;
  return `Rodada avancou ${processed} etapa(s)`;
}

export function buildHistoryPreview(result) {
  if (!result) return "";
  if (result.erro) return String(result.erro);
  if (typeof result.processosAtualizados === "number") {
    const parts = [`Monitoramento: ${result.processosAtualizados}`];
    if (typeof result.crmTagged === "number" && result.crmTagged > 0) parts.push(`tag Datajud adicionada: ${result.crmTagged}`);
    if (typeof result.crmUntagged === "number" && result.crmUntagged > 0) parts.push(`tag Datajud removida: ${result.crmUntagged}`);
    if (typeof result.crmErrors === "number" && result.crmErrors > 0) parts.push(`falhas CRM: ${result.crmErrors}`);
    return parts.join(" | ");
  }
  if (typeof result.sincronizados === "number") return `Sincronizados: ${result.sincronizados}`;
  if (typeof result.reparados === "number") return `Reparados: ${result.reparados}`;
  if (typeof result.publicacoes === "number") return `Publicacoes processadas: ${result.publicacoes}`;
  if (typeof result.publicacoesAtualizadas === "number") return `Publicacoes atualizadas: ${result.publicacoesAtualizadas}`;
  if (typeof result.movimentacoes === "number") return `Atualizacoes sincronizadas: ${result.movimentacoes}`;
  if (typeof result.movimentacoesAtualizadas === "number") return `Atualizacoes refletidas: ${result.movimentacoesAtualizadas}`;
  if (typeof result.activitiesCriadas === "number") return `Activities criadas: ${result.activitiesCriadas}`;
  if (typeof result.contatosVinculados === "number") return `Contatos vinculados: ${result.contatosVinculados}`;
  if (typeof result.contatosCriados === "number") return `Contatos criados: ${result.contatosCriados}`;
  if (typeof result.updated === "number") return `Atualizados: ${result.updated}`;
  if (typeof result.inserted === "number") return `Inseridos: ${result.inserted}`;
  if (typeof result.total === "number") return `Total: ${result.total}`;
  if (typeof result.items?.length === "number") return `Itens retornados: ${result.items.length}`;
  if (typeof result.sample?.length === "number") return `Amostra: ${result.sample.length}`;
  return "Execucao concluida";
}
