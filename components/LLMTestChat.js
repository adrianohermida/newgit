import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { adminFetch } from "../lib/admin/api";
import {
  appendActivityLog,
  setModuleHistory,
  subscribeActivityLog,
  updateActivityLog,
} from "../lib/admin/activity-log";
import { formatLawdeskProviderLabel } from "../lib/lawdesk/providers";
import {
  applyLlmTestConsoleFilters,
  buildDiagnosticReport,
  buildTechnicalDebugger,
  buildLlmTestResultRecord,
  buildLlmTestTimeline,
  classifyLlmTestError,
  filterLlmTestActivityEntries,
} from "../lib/lawdesk/llm-test-console";

const DEFAULT_PROMPT = "Resuma em PT-BR, em 3 bullets, como voce pretende me ajudar neste ambiente.";

function nowIso() {
  return new Date().toISOString();
}

function formatStatusTone(status) {
  if (status === "operational" || status === "ok" || status === "success") return "border-[#234034] text-[#8FCFA9] bg-[rgba(35,64,52,0.18)]";
  if (status === "degraded" || status === "running") return "border-[#8b6f33] text-[#D9B46A] bg-[rgba(139,111,51,0.18)]";
  if (status === "failed" || status === "error") return "border-[#5b2d2d] text-[#f2b2b2] bg-[rgba(127,29,29,0.16)]";
  return "border-[#22342F] text-[#D8DEDA] bg-[rgba(255,255,255,0.02)]";
}

function formatTimelineTone(tone) {
  if (tone === "error") return "border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] text-[#f2b2b2]";
  if (tone === "warn") return "border-[#8b6f33] bg-[rgba(139,111,51,0.16)] text-[#D9B46A]";
  return "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA]";
}

function formatDuration(durationMs) {
  return Number.isFinite(Number(durationMs)) ? `${Math.round(Number(durationMs))} ms` : "n/a";
}

function formatJson(value) {
  if (value == null || value === "") return "";
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function ResultCard({ result, onSelect }) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(result.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(result.id);
        }
      }}
      className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 transition hover:border-[#C5A059]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#7F928C]">{result.providerLabel}</p>
          <h3 className="mt-1 text-lg font-semibold text-[#F5F1E8]">{result.provider}</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${formatStatusTone(result.status)}`}>
          {result.status}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-[18px] border border-[#22342F] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Source</p>
          <p className="mt-1 text-sm text-[#F5F1E8]">{result.source || "n/a"}</p>
        </div>
        <div className="rounded-[18px] border border-[#22342F] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Model</p>
          <p className="mt-1 text-sm text-[#F5F1E8]">{result.model || "n/a"}</p>
        </div>
        <div className="rounded-[18px] border border-[#22342F] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Duracao</p>
          <p className="mt-1 text-sm text-[#F5F1E8]">{formatDuration(result.durationMs)}</p>
        </div>
      </div>

      <div className="mt-4 rounded-[20px] border border-[#22342F] bg-[rgba(7,9,8,0.72)] p-4">
        <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Resposta</p>
        <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-7 text-[#F5F1E8]">{result.text}</p>
      </div>

      {result.error ? (
        <div className="mt-4 rounded-[20px] border border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] p-4">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#f2b2b2]">Erro</p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-[#f2b2b2]">{result.error}</p>
        </div>
      ) : null}
    </article>
  );
}

function ConsoleRail({
  entries,
  activeEntryId,
  onSelectEntry,
  filters,
  onFilterChange,
  sourceOptions,
  onOpenDiagnostics,
}) {
  const activeEntry = entries.find((entry) => entry.id === activeEntryId) || entries[0] || null;
  const latestCreatedAt = activeEntry?.createdAt ? new Date(activeEntry.createdAt).toLocaleTimeString("pt-BR") : "n/a";

  return (
    <aside className="min-h-0 overflow-hidden rounded-[28px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(9,13,12,0.98),rgba(6,9,8,0.98))] shadow-[0_16px_48px_rgba(0,0,0,0.24)]">
      <div className="border-b border-[#1B2925] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Console LLM Test</p>
            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-[#F5F1E8]">Log dedicado da IA</h2>
            <p className="mt-2 text-sm leading-6 text-[#8FA39C]">
              Timeline exclusiva do smoke test, request, resposta, telemetria e falhas do provider.
            </p>
          </div>
          <div className="rounded-[20px] border border-[#22342F] px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Ultimo evento</p>
            <p className="mt-1 text-sm font-semibold text-[#F5F1E8]">{latestCreatedAt}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <select
            value={filters.provider}
            onChange={(event) => onFilterChange("provider", event.target.value)}
            className="h-10 rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-3 text-xs text-[#F5F1E8] outline-none"
          >
            <option value="">Todos providers</option>
            <option value="gpt">Nuvem principal</option>
            <option value="local">LLM local</option>
            <option value="cloudflare">Cloudflare</option>
            <option value="custom">Custom</option>
          </select>
          <select
            value={filters.status}
            onChange={(event) => onFilterChange("status", event.target.value)}
            className="h-10 rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-3 text-xs text-[#F5F1E8] outline-none"
          >
            <option value="">Todos status</option>
            <option value="running">Running</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
          <select
            value={filters.source}
            onChange={(event) => onFilterChange("source", event.target.value)}
            className="h-10 rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-3 text-xs text-[#F5F1E8] outline-none"
          >
            <option value="">Todas sources</option>
            {sourceOptions.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid min-h-0 gap-0 xl:grid-cols-[168px_minmax(0,1fr)]">
        <div className="border-b border-[#1B2925] p-3 xl:border-b-0 xl:border-r">
          <div className="space-y-2">
            {entries.length ? entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onSelectEntry(entry.id)}
                className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
                  entry.id === activeEntry?.id
                    ? "border-[#C5A059] bg-[rgba(197,160,89,0.12)]"
                    : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#395149]"
                }`}
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">
                  {new Date(entry.createdAt || Date.now()).toLocaleTimeString("pt-BR")}
                </p>
                <p className="mt-1 text-sm font-semibold text-[#F5F1E8]">{entry.label || entry.action || "Execucao"}</p>
                <p className="mt-1 text-xs text-[#8FA39C]">{entry.status || "n/a"}</p>
              </button>
            )) : (
              <div className="rounded-[18px] border border-dashed border-[#22342F] px-3 py-4 text-sm text-[#8FA39C]">
                Sem eventos ainda.
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-4">
          {activeEntry ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Execucao ativa</p>
                  <h3 className="mt-1 text-lg font-semibold text-[#F5F1E8]">{activeEntry.label || activeEntry.action || "Execucao"}</h3>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${formatStatusTone(activeEntry.status)}`}>
                  {activeEntry.status || "n/a"}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-[18px] border border-[#22342F] px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Path</p>
                  <p className="mt-1 break-all text-sm text-[#F5F1E8]">{activeEntry.path || "/api/admin-lawdesk-chat"}</p>
                </div>
                <div className="rounded-[18px] border border-[#22342F] px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Duracao</p>
                  <p className="mt-1 text-sm text-[#F5F1E8]">{formatDuration(activeEntry.durationMs)}</p>
                </div>
              </div>

              {activeEntry.traceHints?.length ? (
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Trace hints</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {activeEntry.traceHints.map((hint) => (
                      <span key={hint} className="rounded-full border border-[#22342F] px-3 py-1 text-[11px] text-[#D8DEDA]">
                        {hint}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeEntry.request ? (
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Request</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#D8DEDA]">{activeEntry.request}</pre>
                </div>
              ) : null}

              {activeEntry.response ? (
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Resposta / console consolidado</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#D8DEDA]">{activeEntry.response}</pre>
                </div>
              ) : null}

              {activeEntry.error ? (
                <div className="rounded-[20px] border border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#f2b2b2]">Erro</p>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#f2b2b2]">{activeEntry.error}</pre>
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => onOpenDiagnostics(activeEntry)}
                      className="rounded-full border border-[#C5A059] px-3 py-1.5 text-[11px] font-semibold text-[#C5A059] transition hover:bg-[rgba(197,160,89,0.12)]"
                    >
                      Abrir diagnostico
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-[20px] border border-dashed border-[#22342F] p-5 text-sm text-[#8FA39C]">
              O painel direito vai mostrar o log dedicado assim que a primeira execucao rodar.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export default function LLMTestChat() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [provider, setProvider] = useState("gpt");
  const [providerCatalog, setProviderCatalog] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [consoleEntries, setConsoleEntries] = useState([]);
  const [selectedConsoleEntryId, setSelectedConsoleEntryId] = useState(null);
  const [selectedResultId, setSelectedResultId] = useState(null);
  const [consoleFilters, setConsoleFilters] = useState({ provider: "", status: "", source: "" });
  const [providersHealth, setProvidersHealth] = useState(null);
  const [ragHealth, setRagHealth] = useState(null);

  useEffect(() => {
    let active = true;
    adminFetch("/api/admin-lawdesk-providers?include_health=1", { method: "GET" })
      .then((payload) => {
        if (!active) return;
        const providers = Array.isArray(payload?.data?.providers) ? payload.data.providers : [];
        const defaultProvider = typeof payload?.data?.defaultProvider === "string" ? payload.data.defaultProvider : "gpt";
        setProvidersHealth(payload?.data?.health || null);
        setProviderCatalog(providers);
        setProvider((current) => current || defaultProvider || providers.find((item) => item.available)?.id || "gpt");
      })
      .catch((fetchError) => {
        if (!active) return;
        setError(fetchError?.message || "Falha ao carregar catalogo de providers.");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    adminFetch("/api/admin-dotobot-rag-health?include_upsert=0", { method: "GET" })
      .then((payload) => {
        if (!active) return;
        setRagHealth(payload || null);
      })
      .catch(() => {
        if (!active) return;
        setRagHealth({
          status: "failed",
          error: "Falha ao carregar health do RAG.",
        });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const queryProvider = typeof router.query?.provider === "string" ? router.query.provider.trim() : "";
    const queryPrompt = typeof router.query?.prompt === "string" ? router.query.prompt.trim() : "";
    if (queryProvider) setProvider(queryProvider);
    if (queryPrompt) setPrompt(queryPrompt);
  }, [router.query?.prompt, router.query?.provider]);

  useEffect(() => {
    return subscribeActivityLog((entries) => {
      const scopedEntries = filterLlmTestActivityEntries(entries);
      setConsoleEntries(scopedEntries);
      setSelectedConsoleEntryId((current) => current || scopedEntries[0]?.id || null);
    });
  }, []);

  useEffect(() => {
    setModuleHistory("llm-test", {
      routePath: "/llm-test",
      provider,
      promptPreview: String(prompt || "").slice(0, 500),
      loading,
      error: error || null,
      providerCatalog: providerCatalog.map((item) => ({
        id: item.id,
        available: item.available,
        configured: item.configured,
        model: item.model || null,
        status: item.status || null,
      })),
      lastResult: results[0] || null,
      recentResults: results.slice(0, 8),
      consoleEntries: consoleEntries.slice(0, 12),
      providersHealth,
      ragHealth,
      coverage: {
        routeTracked: true,
        consoleIntegrated: true,
        registryRegistered: true,
      },
      consoleTags: ["ai-task", "dotobot", "functions"],
      updatedAt: nowIso(),
    });
  }, [consoleEntries, error, loading, prompt, provider, providerCatalog, providersHealth, ragHealth, results]);

  const quickActions = useMemo(
    () => [
      { id: "gpt", label: "Testar nuvem principal", provider: "gpt" },
      { id: "local", label: "Testar LLM local", provider: "local" },
      { id: "cloudflare", label: "Testar Cloudflare", provider: "cloudflare" },
      { id: "custom", label: "Testar custom", provider: "custom" },
    ],
    []
  );

  const selectedResult = useMemo(
    () => results.find((item) => item.id === selectedResultId) || results[0] || null,
    [results, selectedResultId]
  );

  const filteredConsoleEntries = useMemo(
    () => applyLlmTestConsoleFilters(consoleEntries, consoleFilters),
    [consoleEntries, consoleFilters]
  );

  const consoleSourceOptions = useMemo(
    () => Array.from(new Set(consoleEntries.map((entry) => String(entry.source || "").trim()).filter(Boolean))),
    [consoleEntries]
  );

  const selectedTimeline = useMemo(
    () => buildLlmTestTimeline(selectedResult || {}),
    [selectedResult]
  );

  function handleConsoleFilterChange(key, value) {
    setConsoleFilters((current) => ({ ...current, [key]: value }));
    setSelectedConsoleEntryId(null);
  }

  function handleOpenDiagnostics(entry) {
    const providerHint = String(entry?.provider || provider || "").trim();
    const sourceHint = String(entry?.source || "").trim();
    router.push({
      pathname: "/interno/agentlab/environment",
      query: {
        origin: "llm-test",
        provider: providerHint || undefined,
        source: sourceHint || undefined,
      },
    });
  }

  async function runSmokeTest(selectedProvider) {
    const trimmedPrompt = String(prompt || "").trim();
    if (!trimmedPrompt) return;

    const providerEntry = providerCatalog.find((item) => item.id === selectedProvider);
    const providerLabel = providerEntry?.label || formatLawdeskProviderLabel(selectedProvider);
    const activityId = `llm_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();

    setLoading(true);
    setError("");

    appendActivityLog({
      id: activityId,
      module: "llm-test",
      provider: selectedProvider,
      component: "LLMTestChat",
      label: `LLM Test: ${providerLabel}`,
      action: "llm_smoke_test",
      method: "POST",
      path: "/api/admin-lawdesk-chat",
      page: "/llm-test",
      status: "running",
      consolePane: ["ai-task", "dotobot", "functions"],
      domain: "llm-test",
      system: "ai",
      traceHints: ["provider-selection", "admin-lawdesk-chat", "llm-smoke-test"],
      request: buildDiagnosticReport({
        title: "LLM smoke test request",
        summary: `Provider ${providerLabel} selecionado para validacao.`,
        sections: [
          { label: "request", value: { provider: selectedProvider, prompt: trimmedPrompt, route: "/llm-test" } },
        ],
      }),
    });

    setSelectedConsoleEntryId(activityId);

    try {
      const payload = await adminFetch("/api/admin-lawdesk-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmedPrompt,
          provider: selectedProvider,
          mode: "analysis",
          context: {
            route: "/llm-test",
            assistant: {
              mode: "analysis",
              role: "smoke-test",
            },
          },
        }),
      });

      const responseData = payload?.data || {};
      const durationMs = Date.now() - startedAt;
      const resultRecord = buildLlmTestResultRecord({
        provider: selectedProvider,
        providerLabel,
        responseData,
        createdAt: new Date(startedAt).toISOString(),
        durationMs,
      });

      setResults((current) => [resultRecord, ...current]);
      setSelectedResultId(resultRecord.id);

      updateActivityLog(activityId, {
        status: "success",
        provider: selectedProvider,
        source: resultRecord.source || "",
        durationMs,
        response: buildDiagnosticReport({
          title: "LLM smoke test response",
          summary: resultRecord.text,
          sections: [
            {
              label: "meta",
              value: {
                status: resultRecord.status,
                source: resultRecord.source,
                model: resultRecord.model,
                durationMs,
              },
            },
            { label: "telemetry", value: responseData?.telemetry || [] },
            { label: "backend_logs", value: responseData?.logs || [] },
            { label: "steps", value: responseData?.steps || [] },
            { label: "rag", value: responseData?.rag || null },
          ],
        }),
      });
    } catch (runError) {
      const durationMs = Date.now() - startedAt;
      const resultRecord = buildLlmTestResultRecord({
        provider: selectedProvider,
        providerLabel,
        responseData: {},
        createdAt: new Date(startedAt).toISOString(),
        error: runError?.message || "Falha desconhecida.",
        durationMs,
      });

      setResults((current) => [resultRecord, ...current]);
      setSelectedResultId(resultRecord.id);
      setError(runError?.message || "Falha ao executar smoke test.");

      updateActivityLog(activityId, {
        status: "error",
        provider: selectedProvider,
        source: "",
        errorType: classifyLlmTestError(runError?.message || ""),
        durationMs,
        response: buildDiagnosticReport({
          title: "LLM smoke test failure context",
          summary: "A execucao falhou antes de retornar resposta valida.",
          sections: [
            { label: "meta", value: { provider: selectedProvider, providerLabel, durationMs } },
            {
              label: "health_snapshot",
              value: {
                providers: providersHealth?.status || null,
                rag: ragHealth?.status || null,
              },
            },
          ],
        }),
        error: buildDiagnosticReport({
          title: "Falha ao executar smoke test",
          summary: runError?.message || "Falha desconhecida.",
          sections: [
            { label: "request", value: { provider: selectedProvider, prompt: trimmedPrompt } },
          ],
        }),
        request: buildDiagnosticReport({
          title: "LLM smoke test request",
          summary: `Provider ${providerLabel} selecionado para validacao.`,
          sections: [
            { label: "request", value: { provider: selectedProvider, prompt: trimmedPrompt, route: "/llm-test" } },
          ],
        }),
      });
      updateActivityLog(activityId, {
        response: `${buildDiagnosticReport({
          title: "LLM smoke test failure context",
          summary: "A execucao falhou antes de retornar resposta valida.",
          sections: [
            { label: "meta", value: { provider: selectedProvider, providerLabel, durationMs } },
            {
              label: "health_snapshot",
              value: {
                providers: providersHealth?.status || null,
                rag: ragHealth?.status || null,
              },
            },
          ],
        })}\n\n---\n\n${buildTechnicalDebugger({
          errorMessage: runError?.message || "Falha desconhecida.",
          provider: selectedProvider,
          providerLabel,
          durationMs,
          request: { provider: selectedProvider, prompt: trimmedPrompt, route: "/llm-test" },
          providersHealth,
          ragHealth,
          providerCatalog,
          route: "/llm-test",
        })}`,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-6 py-8 text-[#F5F1E8]">
      <section className="rounded-[30px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(11,15,14,0.98),rgba(7,10,9,0.98))] p-6 shadow-[0_18px_54px_rgba(0,0,0,0.24)]">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_360px]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#C5A059]">Hermida Maia Advocacia</p>
            <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.04em]">LLM Test Local</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[#9BAEA8]">
              Valide `gpt`, `local`, `cloudflare` e `custom` usando o mesmo endpoint administrativo do AI Task e do Dotobot,
              agora com trilha de console dedicada para request, resposta, telemetria e falhas.
            </p>

            <div className="mt-5 rounded-[26px] border border-[#22342F] bg-[rgba(7,9,8,0.96)] p-4">
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={6}
                className="w-full bg-transparent text-sm leading-7 text-[#F5F1E8] outline-none placeholder:text-[#60706A]"
                placeholder="Digite o prompt de validacao..."
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    setProvider(action.provider);
                    runSmokeTest(action.provider);
                  }}
                  disabled={loading}
                  className="rounded-full border border-[#22342F] px-3 py-1.5 text-[11px] text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
                >
                  {action.label}
                </button>
              ))}
            </div>

            {error ? (
              <div className="mt-4 rounded-[20px] border border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] px-4 py-3 text-sm text-[#f2b2b2]">
                {error}
              </div>
            ) : null}
          </div>

          <div className="space-y-4">
            <div className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Provider</p>
              <select
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
                className="mt-3 h-12 w-full rounded-2xl border border-[#22342F] bg-[rgba(7,9,8,0.98)] px-3 text-sm text-[#F5F1E8] outline-none"
              >
                {providerCatalog.map((item) => (
                  <option key={item.id} value={item.id} disabled={!item.available}>
                    {item.label}{item.model ? ` · ${item.model}` : ""}{item.status ? ` · ${item.status}` : ""}
                  </option>
                ))}
                {!providerCatalog.length ? <option value="gpt">Carregando catalogo...</option> : null}
              </select>
            </div>

            <button
              type="button"
              onClick={() => runSmokeTest(provider)}
              disabled={loading || !String(prompt || "").trim()}
              className="w-full rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] transition hover:bg-[#D7B570] disabled:opacity-50"
            >
              {loading ? "Executando..." : "Executar smoke test"}
            </button>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[22px] border border-[#22342F] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Execucoes</p>
                <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{results.length}</p>
              </div>
              <div className="rounded-[22px] border border-[#22342F] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Eventos console</p>
                <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{consoleEntries.length}</p>
              </div>
              <div className="rounded-[22px] border border-[#22342F] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Provider ativo</p>
                <p className="mt-2 text-sm font-semibold text-[#F5F1E8]">{formatLawdeskProviderLabel(provider)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Health providers</p>
            <p className="mt-2 text-lg font-semibold text-[#F5F1E8]">{providersHealth?.status || "carregando"}</p>
            <p className="mt-1 text-sm text-[#8FA39C]">
              {Number.isFinite(Number(providersHealth?.summary?.operational))
                ? `${providersHealth.summary.operational} operacionais de ${providersHealth.summary.total || 0}`
                : "Catalogo e probes do servidor."}
            </p>
          </div>
          <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Health RAG</p>
            <p className="mt-2 text-lg font-semibold text-[#F5F1E8]">{ragHealth?.status || "carregando"}</p>
            <p className="mt-1 text-sm text-[#8FA39C]">
              {ragHealth?.report?.supabaseEmbedding?.error || ragHealth?.error || "Embedding, retrieval e fallback."}
            </p>
          </div>
          <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Diagnostico rapido</p>
            <p className="mt-2 text-sm font-semibold text-[#F5F1E8]">
              {ragHealth?.status === "failed"
                ? "RAG com falha; revisar secrets e embedding."
                : providersHealth?.status === "failed"
                  ? "Providers sem saude operacional suficiente."
                  : "Ambiente pronto para smoke tests comparativos."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_400px]">
        <div className="space-y-5">
          <div className="rounded-[28px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Painel operacional</p>
                <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#F5F1E8]">Timeline da execucao selecionada</h2>
              </div>
              {selectedResult ? (
                <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${formatStatusTone(selectedResult.status)}`}>
                  {selectedResult.status}
                </span>
              ) : null}
            </div>

            {selectedResult ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-[18px] border border-[#22342F] px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Source</p>
                    <p className="mt-1 text-sm text-[#F5F1E8]">{selectedResult.source || "n/a"}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#22342F] px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Model</p>
                    <p className="mt-1 text-sm text-[#F5F1E8]">{selectedResult.model || "n/a"}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#22342F] px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Executado em</p>
                    <p className="mt-1 text-sm text-[#F5F1E8]">{new Date(selectedResult.createdAt).toLocaleString("pt-BR")}</p>
                  </div>
                </div>

                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(7,9,8,0.72)] p-4">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Resposta completa</p>
                  <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#F5F1E8]">{selectedResult.text}</pre>
                </div>

                {selectedTimeline.length ? (
                  <div className="space-y-2">
                    {selectedTimeline.map((item, index) => (
                      <div key={`${item.label}_${index}`} className={`rounded-[18px] border px-4 py-3 ${formatTimelineTone(item.tone)}`}>
                        <p className="text-[10px] uppercase tracking-[0.16em]">{item.label}</p>
                        <pre className="mt-2 whitespace-pre-wrap break-words text-xs leading-6">{item.value}</pre>
                      </div>
                    ))}
                  </div>
                ) : null}

                {selectedResult.steps?.length ? (
                  <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Steps</p>
                    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs leading-6 text-[#D8DEDA]">
                      {formatJson(selectedResult.steps)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-4 rounded-[20px] border border-dashed border-[#22342F] p-5 text-sm text-[#8FA39C]">
                Selecione ou execute um teste para abrir a timeline detalhada da IA.
              </div>
            )}
          </div>

          <section className="grid gap-4 lg:grid-cols-2">
            {results.length ? (
              results.map((result) => <ResultCard key={result.id} result={result} onSelect={setSelectedResultId} />)
            ) : (
              <div className="rounded-[24px] border border-dashed border-[#22342F] bg-[rgba(255,255,255,0.02)] p-6 text-sm text-[#9BAEA8]">
                Nenhuma execucao ainda. Rode um smoke test para validar provider, modelo, source, telemetria e resposta final.
              </div>
            )}
          </section>
        </div>

        <ConsoleRail
          entries={filteredConsoleEntries}
          activeEntryId={selectedConsoleEntryId}
          onSelectEntry={setSelectedConsoleEntryId}
          filters={consoleFilters}
          onFilterChange={handleConsoleFilterChange}
          sourceOptions={consoleSourceOptions}
          onOpenDiagnostics={handleOpenDiagnostics}
        />
      </section>
    </div>
  );
}
