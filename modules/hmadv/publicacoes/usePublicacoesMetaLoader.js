import { GLOBAL_ERROR_TTL_MS } from "./constants";

export function usePublicacoesMetaLoader({
  adminFetch,
  globalErrorUntil,
  setGlobalError,
  setGlobalErrorUntil,
  setJobs,
  setOverview,
  setRemoteHistory,
}) {
  async function loadOverview() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      setOverview((state) => ({ ...state, loading: false }));
      return;
    }
    setOverview({ loading: true, error: null, data: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=overview", {}, { action: "overview", component: "publicacoes-overview", label: "Carregar overview de publicacoes", expectation: "Atualizar indicadores e leitura do modulo" });
      setOverview({ loading: false, error: null, data: payload.data });
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch (error) {
      const message = error.message || "Falha ao carregar modulo de publicacoes.";
      setOverview({ loading: false, error: message, data: null });
      setGlobalError(message);
      setGlobalErrorUntil(Date.now() + GLOBAL_ERROR_TTL_MS);
    }
  }

  async function loadRemoteHistory() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) return;
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=historico&limit=20", {}, { action: "historico", component: "publicacoes-console", label: "Carregar historico remoto de publicacoes", expectation: "Sincronizar o historico HMADV no console" });
      setRemoteHistory(payload.data.items || []);
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch {
      setRemoteHistory([]);
    }
  }

  async function loadJobs() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) return;
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=jobs&limit=12", {}, { action: "jobs", component: "publicacoes-jobs", label: "Carregar jobs de publicacoes", expectation: "Atualizar a fila operacional de jobs" });
      setJobs(payload.data.items || []);
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch {
      setJobs([]);
    }
  }

  return {
    loadJobs,
    loadOverview,
    loadRemoteHistory,
  };
}
