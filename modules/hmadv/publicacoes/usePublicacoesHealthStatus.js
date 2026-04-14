import { useEffect } from "react";

function hasReadMismatch(queue) {
  return Number(queue?.totalRows || 0) > 0 && !(queue?.items || []).length;
}

export function usePublicacoesHealthStatus(params) {
  const {
    globalError,
    overview,
    partesCandidates,
    processCandidates,
    remoteHistory,
    setBackendHealth,
    setOperationalStatus,
  } = params;

  useEffect(() => {
    if (globalError) {
      setOperationalStatus({ mode: "error", message: globalError, updatedAt: new Date().toISOString() });
      return;
    }

    const overviewData = overview?.data || {};
    const queueErrorCount = [processCandidates, partesCandidates].filter((queue) => queue?.error).length;
    const mismatchCount = [processCandidates, partesCandidates].filter((queue) => hasReadMismatch(queue)).length;
    const limitedCount = [processCandidates, partesCandidates].filter((queue) => queue?.limited).length;
    const advisePersistedDelta = Number(overviewData.advisePersistedDelta || 0);
    const publicacoesSemProcesso = Number(overviewData.publicacoesSemProcesso || 0);
    const publicacoesPendentesComAccount = Number(overviewData.publicacoesPendentesComAccount || 0);

    if (queueErrorCount > 0) return setOperationalStatus({ mode: "error", message: `${queueErrorCount} fila(s) com erro de leitura no painel.`, updatedAt: new Date().toISOString() });
    if (mismatchCount > 0) return setOperationalStatus({ mode: "limited", message: `${mismatchCount} fila(s) com contagem maior que a pagina retornada.`, updatedAt: new Date().toISOString() });
    if (limitedCount > 0) return setOperationalStatus({ mode: "limited", message: `${limitedCount} fila(s) em modo reduzido para evitar sobrecarga.`, updatedAt: new Date().toISOString() });
    if (advisePersistedDelta > 0) return setOperationalStatus({ mode: "limited", message: `Ainda existe delta estrutural de ${advisePersistedDelta} publicacao(oes) entre o cursor do Advise e o banco.`, updatedAt: new Date().toISOString() });
    if (publicacoesSemProcesso > 0) return setOperationalStatus({ mode: "limited", message: `${publicacoesSemProcesso} publicacao(oes) seguem sem processo vinculado e exigem drenagem de criacao.`, updatedAt: new Date().toISOString() });
    if (publicacoesPendentesComAccount > 0) return setOperationalStatus({ mode: "limited", message: `${publicacoesPendentesComAccount} publicacao(oes) vinculadas ainda aguardam atualizacao no CRM.`, updatedAt: new Date().toISOString() });
    setOperationalStatus({ mode: "ok", message: "Fluxo operando normalmente", updatedAt: new Date().toISOString() });
  }, [globalError, overview, partesCandidates, processCandidates, setOperationalStatus]);

  useEffect(() => {
    const latest = remoteHistory[0];
    if (!latest) return setBackendHealth({ status: "unknown", message: "Sem historico recente.", updatedAt: null });
    if (latest.status === "error") return setBackendHealth({ status: "error", message: "A ultima rodada apresentou falha.", updatedAt: latest.created_at });
    const latestRows = Array.isArray(latest?.result_sample) ? latest.result_sample : [];
    const fallbackRows = latestRows.filter((row) => row?.status === "fallback_local").length;
    if (fallbackRows > 0) return setBackendHealth({ status: "warning", message: `Ultimo ciclo operou em fallback local para ${fallbackRows} item(ns).`, updatedAt: latest.created_at });
    if (Number(latest.affected_count || 0) === 0) return setBackendHealth({ status: "warning", message: "Ultimo ciclo nao teve progresso.", updatedAt: latest.created_at });
    setBackendHealth({ status: "ok", message: "Ultima rodada concluida com estabilidade.", updatedAt: latest.created_at });
  }, [remoteHistory, setBackendHealth]);
}
