import {
  GLOBAL_ERROR_TTL_MS,
  PARTES_QUEUE_REFRESH_TTL_MS,
  PARTES_QUEUE_RESOURCE_ERROR_TTL_MS,
  PROCESS_QUEUE_REFRESH_TTL_MS,
  QUEUE_ERROR_TTL_MS,
  QUEUE_LABELS,
} from "./constants";

export function usePublicacoesDataLoader({
  adminFetch,
  globalErrorUntil,
  heavyQueuesEnabled,
  integratedCursorTrail,
  integratedFilters,
  integratedPageSize,
  integratedQueue,
  integratedQueueRequestRef,
  isResourceLimitError,
  partesCandidates,
  partesCandidatesRequestRef,
  processCandidates,
  processCandidatesRequestRef,
  setGlobalError,
  setGlobalErrorUntil,
  setIntegratedCursorTrail,
  setIntegratedQueue,
  setJobs,
  setOverview,
  setPartesCandidates,
  setProcessCandidates,
  setQueueRefreshLog,
  setRemoteHistory,
  setValidationMap,
}) {
  function pushQueueRefresh(key) {
    const label = QUEUE_LABELS[key] || key;
    const entry = { key, label, ts: new Date().toISOString() };
    setQueueRefreshLog((current) => [entry, ...(current || []).filter((item) => item.key !== key)].slice(0, 6));
  }

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

  async function loadProcessCandidates(page, options = {}) {
    const { force = false } = options;
    const now = Date.now();
    if (!force && processCandidatesRequestRef.current.promise && processCandidatesRequestRef.current.page === page) return processCandidatesRequestRef.current.promise;
    if (!force && processCandidates?.updatedAt) {
      const lastUpdatedAt = new Date(processCandidates.updatedAt).getTime();
      if (!Number.isNaN(lastUpdatedAt) && now - lastUpdatedAt < PROCESS_QUEUE_REFRESH_TTL_MS) return processCandidates;
    }
    setProcessCandidates((state) => state?.errorUntil && now < state.errorUntil ? { ...state, loading: false } : { ...state, loading: true, error: null });
    const request = (async () => {
      try {
        const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=candidatos_processos&page=${page}&pageSize=20&preferSnapshot=1`, {}, { action: "candidatos_processos", component: "publicacoes-filas", label: `Carregar fila de processos criaveis (pagina ${page})`, expectation: "Atualizar a fila de processos derivados de publicacoes" });
        const payloadError = payload.data?.error || null;
        const nextState = { loading: false, error: payloadError, items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })), totalRows: Number(payload.data.totalRows || 0), totalEstimated: Boolean(payload.data.totalEstimated), pageSize: payload.data.pageSize || 20, updatedAt: new Date().toISOString(), limited: Boolean(payload.data.limited), errorUntil: payloadError ? Date.now() + QUEUE_ERROR_TTL_MS : null };
        setProcessCandidates(nextState);
        pushQueueRefresh("candidatos_processos");
        return nextState;
      } catch (error) {
        const nextState = { loading: false, error: error.message || "Falha ao carregar candidatos.", items: processCandidates?.items || [], totalRows: processCandidates?.totalRows || 0, totalEstimated: false, pageSize: 20, updatedAt: processCandidates?.updatedAt || new Date().toISOString(), limited: Boolean(processCandidates?.limited), errorUntil: Date.now() + QUEUE_ERROR_TTL_MS };
        setProcessCandidates(nextState);
        pushQueueRefresh("candidatos_processos");
        return nextState;
      } finally {
        processCandidatesRequestRef.current = { promise: null, page: null };
      }
    })();
    processCandidatesRequestRef.current = { promise: request, page };
    return request;
  }

  async function loadPartesCandidates(page, options = {}) {
    const { force = false } = options;
    if (!force && !heavyQueuesEnabled) return partesCandidates;
    const now = Date.now();
    if (!force && partesCandidatesRequestRef.current.promise && partesCandidatesRequestRef.current.page === page) return partesCandidatesRequestRef.current.promise;
    if (!force && partesCandidates?.updatedAt) {
      const lastUpdatedAt = new Date(partesCandidates.updatedAt).getTime();
      if (!Number.isNaN(lastUpdatedAt) && now - lastUpdatedAt < PARTES_QUEUE_REFRESH_TTL_MS) return partesCandidates;
    }
    setPartesCandidates((state) => state?.errorUntil && now < state.errorUntil ? { ...state, loading: false } : { ...state, loading: true, error: null });
    const request = (async () => {
      try {
        const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=candidatos_partes&page=${page}&pageSize=20`, {}, { action: "candidatos_partes", component: "publicacoes-filas", label: `Carregar fila de partes extraiveis (pagina ${page})`, expectation: "Atualizar a fila de extracao retroativa de partes" });
        const payloadError = payload.data?.error || null;
        const nextState = { loading: false, error: payloadError, items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })), totalRows: Number(payload.data.totalRows || 0), totalEstimated: Boolean(payload.data.totalEstimated), pageSize: payload.data.pageSize || 20, updatedAt: new Date().toISOString(), limited: Boolean(payload.data.limited), errorUntil: payloadError ? Date.now() + QUEUE_ERROR_TTL_MS : null };
        setPartesCandidates(nextState);
        pushQueueRefresh("candidatos_partes");
        return nextState;
      } catch (error) {
        const errorTtl = isResourceLimitError(error) ? PARTES_QUEUE_RESOURCE_ERROR_TTL_MS : QUEUE_ERROR_TTL_MS;
        const nextState = { loading: false, error: error.message || "Falha ao carregar candidatos de partes.", items: partesCandidates?.items || [], totalRows: partesCandidates?.totalRows || 0, totalEstimated: false, pageSize: 20, updatedAt: partesCandidates?.updatedAt || new Date().toISOString(), limited: true, errorUntil: Date.now() + errorTtl };
        setPartesCandidates(nextState);
        pushQueueRefresh("candidatos_partes");
        return nextState;
      } finally {
        partesCandidatesRequestRef.current = { promise: null, page: null };
      }
    })();
    partesCandidatesRequestRef.current = { promise: request, page };
    return request;
  }

  async function loadIntegratedQueue(page, options = {}) {
    const { force = false } = options;
    if (!force && !heavyQueuesEnabled) return integratedQueue;
    const cursor = integratedCursorTrail[Math.max(0, page - 1)] || "";
    const key = JSON.stringify({ page, cursor, query: integratedFilters.query, source: integratedFilters.source });
    if (!force && integratedQueueRequestRef.current.promise && integratedQueueRequestRef.current.key === key) return integratedQueueRequestRef.current.promise;
    setIntegratedQueue((state) => ({ ...state, loading: true, error: null }));
    const request = (async () => {
      try {
        const params = new URLSearchParams({ action: "mesa_integrada", pageSize: String(integratedPageSize), query: integratedFilters.query || "", source: integratedFilters.source || "todos", preferSnapshot: "1" });
        if (cursor) params.set("cursor", cursor); else params.set("page", String(page));
        const payload = await adminFetch(`/api/admin-hmadv-publicacoes?${params.toString()}`, {}, { action: "mesa_integrada", component: "publicacoes-mesa-integrada", label: `Carregar mesa integrada (pagina ${page}${cursor ? " por cursor" : ""})`, expectation: "Trazer fila integrada e paginada de publicacoes" });
        const nextState = { loading: false, error: payload.data?.error || null, items: payload.data?.items || [], totalRows: Number(payload.data?.totalRows || 0), pageSize: Number(payload.data?.pageSize || integratedPageSize), updatedAt: new Date().toISOString(), limited: Boolean(payload.data?.limited), totalEstimated: Boolean(payload.data?.totalEstimated), hasMore: Boolean(payload.data?.hasMore), nextCursor: payload.data?.nextCursor || null, mode: payload.data?.source === "snapshot" ? "snapshot" : "legacy", source: payload.data?.source || "legacy" };
        if (Array.isArray(payload.data?.items)) {
          setValidationMap((current) => {
            const next = { ...current };
            for (const item of payload.data.items) if (item?.numero_cnj && item?.validation) next[item.numero_cnj] = item.validation;
            return next;
          });
        }
        if (nextState.mode === "snapshot") {
          setIntegratedCursorTrail((current) => {
            const next = current.slice(0, page);
            next[page - 1] = cursor;
            return next;
          });
        }
        setIntegratedQueue(nextState);
        return nextState;
      } catch (error) {
        const nextState = { loading: false, error: error.message || "Falha ao carregar mesa integrada.", items: [], totalRows: 0, pageSize: integratedPageSize, updatedAt: new Date().toISOString(), limited: false, totalEstimated: false, hasMore: false, nextCursor: null, mode: "legacy", source: "error" };
        setIntegratedQueue(nextState);
        return nextState;
      } finally {
        integratedQueueRequestRef.current = { promise: null, key: "" };
      }
    })();
    integratedQueueRequestRef.current = { promise: request, key };
    return request;
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
    loadIntegratedQueue,
    loadJobs,
    loadOverview,
    loadPartesCandidates,
    loadProcessCandidates,
    loadRemoteHistory,
    pushQueueRefresh,
  };
}
