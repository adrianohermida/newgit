export function createInitialOverviewState() {
  return { loading: true, error: null, data: null };
}

export function createInitialProcessCandidatesState() {
  return { loading: true, error: null, items: [], totalRows: 0, pageSize: 20, updatedAt: null, limited: false, errorUntil: null };
}

export function createInitialPartesCandidatesState() {
  return {
    loading: false,
    error: "Leitura sob demanda para evitar estouro do Worker. Use o botao de carregar ou atualize o snapshot.",
    items: [],
    totalRows: 0,
    pageSize: 20,
    updatedAt: null,
    limited: true,
    errorUntil: null,
  };
}

export function createInitialActionState() {
  return { loading: false, error: null, result: null };
}

export function createInitialIntegratedQueueState() {
  return {
    loading: false,
    error: "Leitura sob demanda para evitar estouro do Worker. Atualize o snapshot ou carregue a mesa manualmente.",
    items: [],
    totalRows: 0,
    pageSize: 12,
    updatedAt: null,
    limited: true,
    totalEstimated: false,
    hasMore: false,
    nextCursor: null,
    mode: "snapshot",
    source: "snapshot",
  };
}

export function createInitialIntegratedFilters() {
  return { query: "", source: "todos", validation: "todos", sort: "pendencia" };
}

export function createInitialDetailState() {
  return { loading: false, error: null, row: null, data: null };
}

export function createInitialDetailEditForm() {
  return { name: "", email: "", phone: "", note: "" };
}

export function createInitialOperationalStatus() {
  return { mode: "ok", message: "", updatedAt: null };
}
