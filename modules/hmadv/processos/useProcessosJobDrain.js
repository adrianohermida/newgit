import { useEffect } from "react";
import { ACTION_LABELS } from "./constants";
import { buildJobPreview } from "./action-utils";

export function useProcessosJobDrain(args) {
  useEffect(() => {
    if (!args.jobs.length) return;
    const runningJob = args.jobs.find((item) => item.status === "running" || item.status === "pending");
    if (runningJob?.id && !args.activeJobId) args.setActiveJobId(runningJob.id);
  }, [args]);

  useEffect(() => {
    if (!args.activeJobId) return undefined;
    let cancelled = false;
    const idleDelayMs = args.pageVisible ? 1800 : 6000;
    async function runLoop() {
      while (!cancelled) {
        try {
          if (!args.pageVisible) { args.setDrainInFlight(false); await new Promise((resolve) => setTimeout(resolve, idleDelayMs)); continue; }
          args.setDrainInFlight(true);
          const payload = await args.adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "run_pending_jobs", id: args.activeJobId, maxChunks: 1 }) }, { timeoutMs: 120000, maxRetries: 0 });
          const result = payload.data || {};
          const job = result.job || null;
          if (cancelled) return;
          args.mergeJobIntoState(job);
          args.setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result } : { drain: result } });
          if (result.completedAll || !job?.id || ["completed", "error", "cancelled"].includes(job?.status)) {
            args.setActiveJobId(null);
            if (job?.acao) await args.refreshAfterAction(job.acao, job.payload || {});
            else await args.refreshOperationalContext();
            if (typeof window !== "undefined" && "Notification" in window) {
              if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
              else if (Notification.permission === "granted") new Notification("Atualizacao de processos concluida", { body: result.completedAll ? "Todas as pendencias de processos desta fila foram drenadas." : `${ACTION_LABELS[job?.acao] || job?.acao}: ${buildJobPreview(job)}` });
            }
            args.setDrainInFlight(false);
            return;
          }
          args.setDrainInFlight(false);
          await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
        } catch (error) {
          if (!cancelled) { args.setActionState({ loading: false, error: error.message || "Falha ao processar job.", result: null }); args.setActiveJobId(null); await Promise.all([args.loadJobs(), args.loadRemoteHistory()]); }
          args.setDrainInFlight(false);
          return;
        }
      }
    }
    runLoop();
    return () => { cancelled = true; };
  }, [args]);
}
