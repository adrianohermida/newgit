import { formatDateTimeLabel } from "./publicacoesFormatting";

function buildOverviewSummary(overview) {
  if (!overview) return null;
  return {
    publicacoesTotal: Number(overview.publicacoesTotal || 0),
    publicacoesSemProcesso: Number(overview.publicacoesSemProcesso || 0),
    publicacoesVinculadas: Number(overview.publicacoesVinculadas || 0),
    publicacoesComActivity: Number(overview.publicacoesComActivity || 0),
    partesTotal: Number(overview.partesTotal || 0),
  };
}

function buildWorkerSummary(worker) {
  if (!worker) return null;
  return {
    em_execucao: Boolean(worker.em_execucao),
    ultima_execucao: worker.ultima_execucao || null,
    ultimo_lote: worker.ultimo_lote || null,
  };
}

export async function recoverPublicacoesAdviseBackfillFailure(params) {
  const { adminFetch, error, safeLimit, setGlobalError, setGlobalErrorUntil, setOverview, setRemoteHistory } = params;
  try {
    const [overviewPayload, historyPayload] = await Promise.all([
      adminFetch("/api/admin-hmadv-publicacoes?action=overview", {}, { action: "overview", component: "publicacoes-actions", label: "Recarregar overview apos falha do backfill", expectation: "Ler o estado atual do modulo apos falha do backfill Advise" }),
      adminFetch("/api/admin-hmadv-publicacoes?action=historico&limit=20", {}, { action: "historico", component: "publicacoes-actions", label: "Recarregar historico apos falha do backfill", expectation: "Ler o historico HMADV apos falha do backfill Advise" }),
    ]);
    const nextOverview = overviewPayload?.data || null;
    const nextHistory = Array.isArray(historyPayload?.data?.items) ? historyPayload.data.items : [];
    const latestBackfillAttempt = nextHistory.find((item) => item?.acao === "run_advise_backfill") || null;
    const latestBackfillSuccess = nextHistory.find((item) => item?.acao === "run_advise_backfill" && item?.status === "success") || null;
    const latestBackfillError = nextHistory.find((item) => item?.acao === "run_advise_backfill" && item?.status === "error") || null;

    setOverview({ loading: false, error: null, data: nextOverview });
    setRemoteHistory(nextHistory);
    setGlobalError(null);
    setGlobalErrorUntil(null);

    return {
      ok: false,
      fallbackRecovered: true,
      source: "client_backfill_recovery",
      erro: error?.message || "Falha ao executar backfill do Advise.",
      plannedPages: safeLimit,
      latestBackfillAttempt,
      latestBackfillSuccess,
      latestBackfillError,
      overviewSummary: buildOverviewSummary(nextOverview),
      worker: buildWorkerSummary(nextOverview?.syncWorker?.worker || null),
      uiHint: latestBackfillAttempt
        ? `O backfill do Advise retornou falha remota, mas a tela foi reidratada com o estado atual. Ultima tentativa HMADV: ${latestBackfillAttempt.status} em ${formatDateTimeLabel(latestBackfillAttempt.created_at || latestBackfillAttempt.finished_at)}. Ultimo sucesso conhecido: ${latestBackfillSuccess ? formatDateTimeLabel(latestBackfillSuccess.created_at || latestBackfillSuccess.finished_at) : "nao encontrado"}.`
        : `O backfill do Advise retornou falha remota, mas o overview foi recarregado. O lote solicitado foi ${safeLimit} pagina(s).`,
    };
  } catch {
    return null;
  }
}
