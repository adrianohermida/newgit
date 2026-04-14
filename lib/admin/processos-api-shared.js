export function parseProcessNumbers(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return String(value).split(/\r?\n|,|;/).map((item) => item.trim()).filter(Boolean);
}

export function isQueueOverloadError(error) {
  const message = String(error?.message || "");
  return (
    message.includes("Too many subrequests") ||
    message.includes("subrequests") ||
    message.includes("Worker exceeded resource limits") ||
    message.includes("exceeded resource limits")
  );
}

export function buildQueueFallback({ error }) {
  return {
    limited: true,
    unavailable: true,
    items: [],
    totalRows: 0,
    error: error?.message || "Painel em modo reduzido por sobrecarga.",
  };
}

export function buildCoverageFallback({ page = 1, pageSize = 20, error = null, unsupported = false } = {}) {
  return {
    page,
    pageSize,
    totalRows: 0,
    items: [],
    limited: true,
    unsupported,
    error: error?.message || error || (unsupported ? "Cobertura indisponivel neste deploy." : null),
  };
}

export function buildSchemaStatusFallback(error = null) {
  return {
    exists: false,
    available: false,
    degraded: true,
    error: error?.message || error || "Schema administrativo indisponivel no runtime atual.",
  };
}

export function buildRunnerMetricsFallback(error = null) {
  return {
    available: false,
    degraded: true,
    running: false,
    pending: 0,
    processed: 0,
    error: error?.message || error || "Metricas do runner indisponiveis no runtime atual.",
  };
}

export function buildAuthDegradedGetResponse(action, query, auth) {
  const page = Number(query?.page || 1);
  const pageSize = Number(query?.pageSize || 20);
  const error = auth?.error || "Autenticacao administrativa degradada no deploy atual.";

  if (action === "overview") {
    return {
      ok: true,
      data: {
        processosTotal: 0,
        processosComAccount: 0,
        processosSemAccount: 0,
        datajudEnriquecido: 0,
        processosSemStatus: 0,
        processosSemPolos: 0,
        audienciasTotal: 0,
        processosSemMovimentacao: 0,
        movimentacoesPendentes: 0,
        publicacoesPendentes: 0,
        partesSemContato: 0,
        camposOrfaos: 0,
        monitoramentoAtivo: 0,
        monitoramentoInativo: 0,
        monitoramentoFallback: 0,
        monitoramentoFilaPendente: 0,
        workerVisiblePendencias: {},
        workerVisibleTotal: 0,
        structuralGapCounts: {},
        structuralGapTotal: 0,
        syncWorker: null,
        degraded: true,
        limited: true,
        error,
      },
    };
  }

  if (action === "schema_status") return { ok: true, data: buildSchemaStatusFallback(error) };
  if (action === "runner_metrics") return { ok: true, data: buildRunnerMetricsFallback(error) };
  if (action === "historico" || action === "jobs") return { ok: true, data: { items: [], degraded: true, limited: true, error } };
  if (action === "cobertura_processos") return { ok: true, data: buildCoverageFallback({ page, pageSize, error, unsupported: true }) };
  return { ok: true, data: buildQueueFallback({ error }) };
}
