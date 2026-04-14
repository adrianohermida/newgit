export function buildPublicacoesActionResult({
  action,
  payload,
  overview,
  partesBacklogCount,
  syncWorkerShouldFocusCrm,
}) {
  if (action === "run_sync_worker") {
    const hasNoProgress = Number(payload?.affected_count || 0) === 0;
    if (!hasNoProgress) return payload;
    if (partesBacklogCount > 0) {
      return {
        ...payload,
        uiHint: `O sync-worker concluiu sem progresso e nao drena a fila de partes. Ha ${partesBacklogCount} processo(s) em candidatos_partes; use Extracao retroativa de partes ou Salvar partes + corrigir CRM para atuar nessa fila.`,
      };
    }
    if (syncWorkerShouldFocusCrm) {
      return {
        ...payload,
        uiHint: "O sync-worker concluiu sem progresso nesta rodada. Ele atua em pendencias de activity/CRM, nao em extracao retroativa de partes.",
      };
    }
    return {
      ...payload,
      uiHint: "O sync-worker concluiu sem trabalho pendente nesta rodada.",
    };
  }

  if (action === "run_advise_backfill") {
    const partial = payload?.execucao_parcial;
    const nextPage = payload?.proxima_pagina;
    const plannedPages = Number(payload?.paginas_planejadas || payload?.paginasPlanejadas || 0);
    return {
      ...payload,
      uiHint: partial
        ? `O backfill do Advise continua pendente. Esta rodada tentou ${plannedPages || "um lote curto de"} pagina(s) e a proxima pagina esperada e ${nextPage || "a seguinte do cursor"}.`
        : "O backfill do Advise importa o historico bruto para o Supabase. Depois use Criar processos ausentes e Sincronizar publicacoes vinculadas para concluir a drenagem operacional.",
    };
  }

  if (action === "run_advise_sync") {
    return {
      ...payload,
      uiHint: payload?.execucao_parcial
        ? "A ingestao incremental do Advise ficou parcial nesta rodada para preservar o cursor com seguranca. Rode novamente para continuar do ponto atual."
        : "A ingestao incremental do Advise traz publicacoes novas. Se ainda houver delta estrutural, rode tambem o backfill historico.",
    };
  }

  if (action === "sincronizar_publicacoes_activity") {
    const activityTypeStatus = payload?.activityTypeStatus || overview?.publicationActivityTypes || null;
    if (activityTypeStatus && !activityTypeStatus.matched) {
      return {
        ...payload,
        activityTypeStatus,
        uiHint: activityTypeStatus.error
          ? `O sync de publicacoes esta bloqueado pelo catalogo do Freshsales: ${activityTypeStatus.error}`
          : "O sync de publicacoes nao encontrou um sales activity type compativel para publicacao no Freshsales.",
      };
    }
    if (activityTypeStatus?.fallbackOnly) {
      return {
        ...payload,
        activityTypeStatus,
        uiHint: `O sync de publicacoes esta operando com catalogo em fallback. Tipo atual: ${activityTypeStatus.matchedName || "nao identificado"}.`,
      };
    }
    return { ...payload, activityTypeStatus };
  }

  if (action === "orquestrar_drenagem_publicacoes") {
    const created = Number(payload?.summary?.created || payload?.created?.processosCriados || 0);
    const synced = Number(payload?.summary?.synced || payload?.synced?.activitiesCriadas || 0);
    const snapshots = Number(payload?.summary?.snapshots || 0);
    return {
      ...payload,
      uiHint: `Pipeline concluido: ${created} processo(s) criado(s), ${synced} activity(s) sincronizada(s) e ${snapshots} snapshot(s) reconstruido(s).`,
    };
  }

  return payload;
}
