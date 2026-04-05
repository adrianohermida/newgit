export function detectModules(mission) {
  if (!mission) return ["geral"];
  if (/peticao|recurso|contestacao|acao|agravo/i.test(mission)) return ["documentos-juridicos"];
  if (/audiencia|processo|cnj/i.test(mission)) return ["processos"];
  if (/cliente|contato|cobranca/i.test(mission)) return ["clientes"];
  return ["geral"];
}

export function requiresApproval(mission) {
  return /deletar|excluir|cancelar|remover|destruir/i.test(mission || "");
}

export function normalizeMission(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function formatExecutionSourceLabel(source) {
  const labels = { openai: "OpenAI", cloudflare: "Cloudflare AI", local: "Modelo local", custom: "Custom" };
  return labels[source] || source || "n/a";
}

export function extractTaskRunResultText(...sources) {
  for (const source of sources) {
    if (!source) continue;
    if (typeof source?.result?.message === "string" && source.result.message.trim()) {
      return source.result.message.trim();
    }
    if (typeof source?.resultText === "string" && source.resultText.trim()) {
      return source.resultText.trim();
    }
    if (typeof source?.result === "string" && source.result.trim()) {
      return source.result.trim();
    }
    if (source?.result != null && typeof source.result !== "string") {
      try {
        return JSON.stringify(source.result);
      } catch {
        return String(source.result);
      }
    }
  }
  return "";
}

export function extractTaskRunMemoryMatches(rag) {
  if (!rag) return [];
  if (Array.isArray(rag?.retrieval?.matches)) return rag.retrieval.matches;
  if (Array.isArray(rag?.retrieved_context)) return rag.retrieved_context;
  return [];
}

export function normalizeTaskRunPayload(payload) {
  const data = payload?.data || {};
  const run = data?.run || null;
  const runResult = run?.result || null;
  const steps = Array.isArray(data?.steps) ? data.steps : Array.isArray(runResult?.steps) ? runResult.steps : [];
  const events = Array.isArray(data?.events) ? data.events : [];
  const rag = data?.rag || runResult?.rag || null;
  return {
    run,
    steps,
    events,
    rag,
    resultText: extractTaskRunResultText(data, runResult),
    source: data?.source || runResult?.source || null,
    model: data?.model || runResult?.model || null,
    status: run?.status || (payload?.ok ? "completed" : "failed"),
    eventsCursor: data?.eventsCursor || null,
    eventsCursorSequence: Number.isFinite(Number(data?.eventsCursorSequence)) ? Number(data.eventsCursorSequence) : null,
    eventsTotal: Number.isFinite(Number(data?.eventsTotal)) ? Number(data.eventsTotal) : null,
    pollIntervalMs: Number.isFinite(Number(data?.pollIntervalMs)) ? Number(data.pollIntervalMs) : null,
  };
}
