import { useEffect } from "react";

export function usePublicacoesJobDrain(params) {
  const {
    ACTION_LABELS,
    activeJobId,
    adminFetch,
    buildJobPreview,
    loadJobs,
    loadRemoteHistory,
    pageVisible,
    refreshAfterAction,
    refreshOperationalContext,
    setActionState,
    setActiveJobId,
    setDrainInFlight,
  } = params;

  useEffect(() => {
    if (!activeJobId) return undefined;
    let cancelled = false;

    async function runLoop() {
      while (!cancelled) {
        try {
          const idleDelayMs = pageVisible ? 1800 : 6000;
          if (!pageVisible) {
            setDrainInFlight(false);
            await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
            continue;
          }

          setDrainInFlight(true);
          const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "run_pending_jobs", id: activeJobId, maxChunks: 1 }),
          }, { timeoutMs: 120000, maxRetries: 0 });
          const result = payload.data || {};
          const job = result.job || null;
          if (cancelled) return;

          await Promise.all([loadJobs(), loadRemoteHistory()]);
          setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result } : { drain: result } });

          if (result.completedAll || !job?.id || ["completed", "error", "cancelled"].includes(job?.status)) {
            setActiveJobId(null);
            if (job?.acao) await refreshAfterAction(job.acao);
            else await refreshOperationalContext();

            if (typeof window !== "undefined" && "Notification" in window) {
              if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
              else if (Notification.permission === "granted") {
                new Notification("Atualizacao de publicacoes concluida", {
                  body: result.completedAll ? "Todas as pendencias de publicacoes desta fila foram drenadas." : `${ACTION_LABELS[job?.acao] || job?.acao}: ${buildJobPreview(job)}`,
                });
              }
            }

            setDrainInFlight(false);
            return;
          }

          setDrainInFlight(false);
          await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
        } catch (error) {
          if (!cancelled) {
            setActionState({ loading: false, error: error.message || "Falha ao processar job.", result: null });
            setActiveJobId(null);
            await Promise.all([loadJobs(), loadRemoteHistory()]);
          }
          setDrainInFlight(false);
          return;
        }
      }
    }

    runLoop();
    return () => { cancelled = true; };
  }, [ACTION_LABELS, activeJobId, adminFetch, buildJobPreview, loadJobs, loadRemoteHistory, pageVisible, refreshAfterAction, refreshOperationalContext, setActionState, setActiveJobId, setDrainInFlight]);
}
