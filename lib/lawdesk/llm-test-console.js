function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function stringifyDiagnostic(value, limit = 12000) {
  if (value == null || value === "") return "";
  let text = "";
  try {
    text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function buildDiagnosticReport({ title, summary = "", sections = [] }) {
  return [
    title ? `# ${title}` : "",
    summary ? safeText(summary) : "",
    ...sections
      .filter((section) => section?.value !== undefined && section?.value !== null && section?.value !== "")
      .map((section) => `${section.label}:\n${stringifyDiagnostic(section.value)}`),
  ]
    .filter(Boolean)
    .join("\n\n---\n\n");
}

export function filterLlmTestActivityEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) =>
      entry?.module === "llm-test" ||
      entry?.component === "LLMTestChat" ||
      entry?.page === "/llm-test" ||
      entry?.path === "/api/admin-lawdesk-chat"
    )
    .sort((left, right) => Date.parse(right?.createdAt || 0) - Date.parse(left?.createdAt || 0));
}

export function buildLlmTestResultRecord({
  provider,
  providerLabel,
  responseData = {},
  createdAt,
  error = "",
  durationMs = null,
}) {
  const telemetry = Array.isArray(responseData?.telemetry) ? responseData.telemetry : [];
  const logs = Array.isArray(responseData?.logs) ? responseData.logs : [];
  const steps = Array.isArray(responseData?.steps) ? responseData.steps : [];
  const errors = Array.isArray(responseData?.errors) ? responseData.errors : [];

  return {
    id: `${Date.now()}_${provider}`,
    provider,
    providerLabel,
    status: error ? "error" : responseData?.status || "ok",
    source: responseData?._metadata?.source || responseData?._metadata?.provider || null,
    model: responseData?._metadata?.model || null,
    text: responseData?.resultText || responseData?.result?.message || "Sem resposta textual.",
    error: safeText(error),
    createdAt: createdAt || new Date().toISOString(),
    durationMs: Number.isFinite(Number(durationMs)) ? Number(durationMs) : null,
    telemetry,
    logs,
    steps,
    errors,
    rag: responseData?.rag || null,
  };
}

export function buildLlmTestTimeline(result = {}) {
  const timeline = [];
  if (result.providerLabel || result.provider) {
    timeline.push({
      tone: "info",
      label: "Provider selecionado",
      value: `${result.providerLabel || result.provider}${result.source ? ` -> ${result.source}` : ""}`,
    });
  }
  if (result.model) {
    timeline.push({ tone: "info", label: "Modelo", value: result.model });
  }
  if (Number.isFinite(Number(result.durationMs))) {
    timeline.push({ tone: "info", label: "Duracao", value: `${Math.round(Number(result.durationMs))} ms` });
  }

  (Array.isArray(result.telemetry) ? result.telemetry : []).forEach((item) => {
    const event = safeText(item?.event, "telemetry");
    const payload = Object.fromEntries(
      Object.entries(item || {}).filter(([key]) => key !== "event" && key !== "timestamp")
    );
    timeline.push({
      tone: item?.status === "error" ? "error" : event.includes("rag") ? "warn" : "info",
      label: event,
      value: stringifyDiagnostic(payload, 1200) || "Sem detalhes.",
    });
  });

  (Array.isArray(result.logs) ? result.logs : []).forEach((item, index) => {
    timeline.push({
      tone: "info",
      label: `backend_log_${index + 1}`,
      value: stringifyDiagnostic(item, 1200),
    });
  });

  (Array.isArray(result.errors) ? result.errors : []).forEach((item, index) => {
    timeline.push({
      tone: "error",
      label: `backend_error_${index + 1}`,
      value: safeText(item),
    });
  });

  if (result.error) {
    timeline.push({
      tone: "error",
      label: "Falha da execucao",
      value: safeText(result.error),
    });
  }

  return timeline;
}
