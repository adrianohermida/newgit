import { useMemo } from "react";

export function usePublicacoesOverviewState({ data, executionHistory, jobs, remoteHistory, view }) {
  return useMemo(() => {
    const publicationActivityTypes = data.publicationActivityTypes || {};
    const noPublicationActivityTypeConfigured = publicationActivityTypes?.matched === false;
    const adviseSync = data.adviseSync || null;
    const snapshotOverview = data.snapshotOverview || {};
    const adviseConfig = adviseSync?.config || {};
    const adviseCursor = adviseSync?.status_cursor || adviseSync?.ultima_execucao || {};
    const adviseBackfillPage = Number(adviseCursor?.ultima_pagina || 0);
    const adviseBackfillTotalPages = Number(adviseCursor?.total_paginas || 0);
    const pendingJobCount = jobs.filter((item) => ["pending", "running"].includes(String(item?.status || ""))).length;

    return {
      adviseBackfillProgress: adviseBackfillTotalPages > 0 ? `${Math.min(adviseBackfillPage, adviseBackfillTotalPages)}/${adviseBackfillTotalPages}` : "cursor sem pagina total",
      adviseConfig,
      adviseCursor,
      adviseLastCycleTotal: Number(adviseCursor?.total_registros || 0),
      adviseLastRunAt: adviseCursor?.ultima_execucao || null,
      adviseMode: adviseConfig?.modo || "indisponivel",
      advisePersistedDelta: Number(data.advisePersistedDelta || 0),
      adviseSync,
      adviseTokenOk: adviseConfig?.token_ok === true,
      isDockedPublicacoesView: view === "operacao" || view === "resultado",
      isResultView: view === "resultado",
      latestHistory: executionHistory[0] || null,
      latestJob: jobs[0] || null,
      latestRemoteRun: remoteHistory[0] || null,
      noPublicationActivityTypeConfigured,
      operationalPlan: Array.isArray(data?.operationalPlan) ? data.operationalPlan : [],
      pendingJobCount,
      publicationActivityTypeHint: noPublicationActivityTypeConfigured
        ? (publicationActivityTypes.error ? `Freshsales bloqueado: ${publicationActivityTypes.error}` : "Nao ha sales activity type compativel para publicacao no Freshsales.")
        : "",
      publicationActivityTypes,
      publicacoesPendentesComAccount: Number(data.publicacoesPendentesComAccount || 0),
      publicacoesSemProcesso: Number(data.publicacoesSemProcesso || 0),
      snapshotMesaIntegrada: snapshotOverview.mesa_integrada || null,
      snapshotPartes: snapshotOverview.candidatos_partes || null,
      snapshotProcessos: snapshotOverview.candidatos_processos || null,
      syncWorkerLastPublicacoes: Number(data?.syncWorker?.worker?.ultimo_lote?.publicacoes || 0),
    };
  }, [data, executionHistory, jobs, remoteHistory, view]);
}
