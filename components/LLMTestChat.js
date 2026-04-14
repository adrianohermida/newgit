import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { adminFetch } from "../lib/admin/api";
import {
  appendActivityLog,
  setModuleHistory,
  subscribeActivityLog,
  updateActivityLog,
} from "../lib/admin/activity-log";
import {
  invokeBrowserLocalMessages,
  isBrowserLocalProvider,
  shouldAutoProbeBrowserLocalRuntime,
} from "../lib/lawdesk/browser-local-runtime";
import { formatLawdeskProviderLabel } from "../lib/lawdesk/providers";
import { useInternalTheme } from "./interno/InternalThemeProvider";
import {
  applyLlmTestConsoleFilters,
  buildDiagnosticReport,
  buildProviderDebugMatrix,
  buildTechnicalDebugger,
  buildLlmTestResultRecord,
  buildLlmTestTimeline,
  classifyLlmTestError,
  filterLlmTestActivityEntries,
} from "../lib/lawdesk/llm-test-console";

const DEFAULT_PROMPT = "Resuma em PT-BR, em 3 bullets, como voce pretende me ajudar neste ambiente.";
const FALLBACK_PROVIDER_CATALOG = [
  { id: "gpt", label: "Nuvem principal", available: true, configured: true, transport: "http_execute" },
  { id: "local", label: "LLM local", available: false, configured: false, transport: "local_llm_api" },
  { id: "cloudflare", label: "Cloudflare Workers AI", available: false, configured: false, transport: "workers_ai_direct" },
  { id: "custom", label: "Endpoint custom", available: false, configured: false, transport: "custom_llm_api" },
];

function resolveLlmTestProvider(provider, catalog = []) {
  if (!isBrowserLocalProvider(provider)) return provider;
  if (shouldAutoProbeBrowserLocalRuntime()) return provider;
  return catalog.find((item) => item.id !== "local" && item.available)?.id || "gpt";
}

function nowIso() {
  return new Date().toISOString();
}

function formatStatusTone(status, isLightTheme = false) {
  if (status === "operational" || status === "ok" || status === "success") {
    return isLightTheme
      ? "border-[#8dc8a3] bg-[#effaf2] text-[#166534]"
      : "border-[#234034] text-[#8FCFA9] bg-[rgba(35,64,52,0.18)]";
  }
  if (status === "degraded" || status === "running") {
    return isLightTheme
      ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]"
      : "border-[#8b6f33] text-[#D9B46A] bg-[rgba(139,111,51,0.18)]";
  }
  if (status === "failed" || status === "error") {
    return isLightTheme
      ? "border-[#e7b3b3] bg-[#fff1f1] text-[#991b1b]"
      : "border-[#5b2d2d] text-[#f2b2b2] bg-[rgba(127,29,29,0.16)]";
  }
  return isLightTheme
    ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]"
    : "border-[#22342F] text-[#D8DEDA] bg-[rgba(255,255,255,0.02)]";
}

function formatTimelineTone(tone, isLightTheme = false) {
  if (tone === "error") return isLightTheme ? "border-[#e7b3b3] bg-[#fff1f1] text-[#991b1b]" : "border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] text-[#f2b2b2]";
  if (tone === "warn") return isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#8b6f33] bg-[rgba(139,111,51,0.16)] text-[#D9B46A]";
  return isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] text-[#D8DEDA]";
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

function extractAdminErrorDetails(error, fallbackMessage) {
  const payload = error?.payload && typeof error.payload === "object" ? error.payload : null;
  return {
    message: payload?.error || error?.message || fallbackMessage,
    errorType: payload?.errorType || null,
    details: payload?.details || null,
    status: Number(error?.status) || null,
  };
}

function flattenProviderDiagnostics(diagnostics, prefix = "") {
  if (!diagnostics || typeof diagnostics !== "object") return [];

  return Object.entries(diagnostics).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (!value || typeof value !== "object") return [];

    const hasShape = Object.prototype.hasOwnProperty.call(value, "configuredFrom") || Object.prototype.hasOwnProperty.call(value, "missing");
    if (hasShape) {
      return [{
        key: nextKey,
        configuredFrom: value?.configuredFrom || null,
        missing: Array.isArray(value?.missing) ? value.missing : [],
      }];
    }

    return flattenProviderDiagnostics(value, nextKey);
  });
}

function ProviderMatrixCard({ item, onRun }) {
  const diagnostics = item.diagnostics && typeof item.diagnostics === "object" ? item.diagnostics : null;
  const diagnosticBlocks = diagnostics ? flattenProviderDiagnostics(diagnostics).filter((entry) => entry.configuredFrom || entry.missing.length) : [];
  const expectedEnv = Array.isArray(item.expectedEnv) ? item.expectedEnv : [];
  const failureText = String(item.failureReason || "").toLowerCase();
  const hasExecutionRouteIssue =
    item.id === "gpt" &&
    (failureText.includes("requested function was not found") ||
      failureText.includes("not_found") ||
      failureText.includes("/execute") ||
      failureText.includes("/v1/execute"));
  const backendHealthOk = String(item.healthStatus || "").toLowerCase() === "operational";
  return (
    <article className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">{item.transport || "transport"}</p>
          <h3 className="mt-1 text-base font-semibold text-[#F5F1E8]">{item.label}</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${formatStatusTone(item.healthStatus || item.latestResultStatus || "failed")}`}>
          {item.healthStatus || "unknown"}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[16px] border border-[#22342F] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Modelo</p>
          <p className="mt-1 text-sm text-[#F5F1E8]">{item.model || "n/a"}</p>
        </div>
        <div className="rounded-[16px] border border-[#22342F] px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Último teste</p>
          <p className="mt-1 text-sm text-[#F5F1E8]">{item.latestResultStatus || "sem teste"}</p>
        </div>
      </div>
      {item.id === "gpt" ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[16px] border border-[#22342F] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Sonda de execucao</p>
            <p className="mt-1 text-sm text-[#F5F1E8]">
              {item.executeProbeOk == null ? "n/a" : item.executeProbeOk ? "ok" : "falhou"}
            </p>
          </div>
          <div className="rounded-[16px] border border-[#22342F] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Rota sondada</p>
            <p className="mt-1 break-all text-sm text-[#F5F1E8]">{item.executeProbeRoute || "sem sucesso"}</p>
          </div>
        </div>
      ) : null}
      {item.details?.config ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-[16px] border border-[#22342F] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Host resolvido</p>
            <p className="mt-1 break-all text-sm text-[#F5F1E8]">{item.details.config.host || item.details.config.baseUrl || "n/a"}</p>
          </div>
          <div className="rounded-[16px] border border-[#22342F] px-3 py-2">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Source da base</p>
            <p className="mt-1 text-sm text-[#F5F1E8]">{item.details.config.baseUrlSource || "n/a"}</p>
          </div>
        </div>
      ) : null}
      {item.id === "gpt" && item.details?.health?.routes?.length ? (
        <div className="mt-3 rounded-[16px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Rotas anunciadas pelo backend</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.details.health.routes.slice(0, 6).map((entry) => (
              <span key={`${item.id}_route_${entry}`} className="rounded-full border border-[#22342F] px-2.5 py-1 text-[10px] text-[#D8DEDA]">
                {entry}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {item.id === "gpt" && item.details?.health?.auth_configured != null ? (
        <div className="mt-3 rounded-[14px] border border-[#22342F] px-3 py-2 text-xs leading-6 text-[#9BAEA8]">
          Autenticacao remota: {item.details.health.auth_configured ? "secret configurado no worker" : "worker sem secret configurado"}.
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className={`rounded-full border px-2.5 py-1 ${item.configured ? "border-[#234034] text-[#8FCFA9]" : "border-[#5b2d2d] text-[#f2b2b2]"}`}>
          {item.configured ? "Configurado" : "Nao configurado"}
        </span>
        {item.errorType ? (
          <span className="rounded-full border border-[#3C3320] px-2.5 py-1 text-[#E7C987]">
            causa: {item.errorType}
          </span>
        ) : null}
      </div>
      <div className="mt-3 rounded-[16px] border border-[#22342F] bg-[rgba(7,9,8,0.72)] p-3">
        <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Leitura rápida</p>
        <p className="mt-2 text-xs leading-6 text-[#D8DEDA]">{item.failureReason || "Sem falha registrada. Provider pronto para validação comparativa."}</p>
      </div>
      {!item.catalogLoaded ? (
        <div className="mt-3 rounded-[14px] border border-[#8b6f33] bg-[rgba(139,111,51,0.12)] px-3 py-2 text-xs leading-6 text-[#D9B46A]">
          O catalogo de providers nao carregou por completo nesta sessao. Valide tambem `/api/admin-lawdesk-providers`.
        </div>
      ) : null}
      {hasExecutionRouteIssue ? (
        <div className={`mt-3 rounded-[14px] border px-3 py-2 text-xs leading-6 ${backendHealthOk ? "border-[#8b6f33] bg-[rgba(139,111,51,0.12)] text-[#D9B46A]" : "border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] text-[#f2b2b2]"}`}>
          {backendHealthOk
            ? "Health do backend principal esta operacional, mas a execucao falhou. O sinal mais forte aqui e rota ou deploy divergente em `/execute` ou `/v1/execute`."
            : "O provider principal falhou na execucao e no health. Revise primeiro deploy, roteamento e disponibilidade do backend antes de testar novamente."}
        </div>
      ) : null}
      {expectedEnv.length ? (
        <div className="mt-3 rounded-[16px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Ambiente esperado</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {expectedEnv.map((entry) => (
              <span key={`${item.id}_${entry}`} className="rounded-full border border-[#22342F] px-2.5 py-1 text-[10px] text-[#D8DEDA]">
                {entry}
              </span>
            ))}
          </div>
          {item.id === "gpt" ? (
            <p className="mt-2 text-xs leading-6 text-[#8FA39C]">O backend principal precisa responder em `/execute` ou `/v1/execute`. Se `health` estiver OK e a execucao falhar, o problema tende a ser deploy ou roteamento.</p>
          ) : null}
        </div>
      ) : null}
      {item.id === "gpt" && item.executeProbeErrors?.length ? (
        <div className="mt-3 space-y-2">
          {item.executeProbeErrors.slice(0, 2).map((entry) => (
            <p key={entry} className="rounded-[14px] border border-[#5b2d2d] bg-[rgba(127,29,29,0.16)] px-3 py-2 text-xs leading-6 text-[#f2b2b2]">
              {entry}
            </p>
          ))}
        </div>
      ) : null}
      {diagnosticBlocks.length ? (
        <div className="mt-3 space-y-2">
          {diagnosticBlocks.slice(0, 3).map((entry) => (
            <div key={entry.key} className="rounded-[14px] border border-[#22342F] px-3 py-2 text-xs leading-6 text-[#9BAEA8]">
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">{entry.key}</p>
              <p className="mt-1 text-[#D8DEDA]">{entry.configuredFrom ? `Lido de ${entry.configuredFrom}.` : "Sem source resolvida."}</p>
              {entry.missing.length ? <p className="mt-1 text-[#8FA39C]">Faltando ou sem uso: {entry.missing.join(", ")}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {item.recommendations?.length ? (
        <div className="mt-3 space-y-2">
          {item.recommendations.slice(0, 2).map((rec) => (
            <p key={rec} className="rounded-[14px] border border-[#22342F] px-3 py-2 text-xs leading-6 text-[#9BAEA8]">
              {rec}
            </p>
          ))}
        </div>
      ) : null}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => onRun(item.id)}
          className="rounded-full border border-[#C5A059] px-3 py-1.5 text-[11px] font-semibold text-[#C5A059] transition hover:bg-[rgba(197,160,89,0.12)]"
        >
          Testar este provider
        </button>
      </div>
    </article>
  );
}

function ResultCard({ result, onSelect }) {
  const { isLightTheme } = useInternalTheme();
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
      className={`rounded-[24px] border p-4 transition ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] hover:border-[#c79b2c]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)] hover:border-[#C5A059]"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>{result.providerLabel}</p>
          <h3 className={`mt-1 text-lg font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{result.provider}</h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${formatStatusTone(result.status, isLightTheme)}`}>
          {result.status}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className={`rounded-[18px] border px-3 py-2 ${isLightTheme ? "border-[#d7d4cb]" : "border-[#22342F]"}`}>
          <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>Origem</p>
          <p className={`mt-1 text-sm ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{result.source || "n/a"}</p>
        </div>
        <div className={`rounded-[18px] border px-3 py-2 ${isLightTheme ? "border-[#d7d4cb]" : "border-[#22342F]"}`}>
          <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>Modelo solicitado</p>
          <p className={`mt-1 text-sm ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{result.requestedModel || result.model || "n/a"}</p>
        </div>
        <div className={`rounded-[18px] border px-3 py-2 ${isLightTheme ? "border-[#d7d4cb]" : "border-[#22342F]"}`}>
          <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>Duracao</p>
          <p className={`mt-1 text-sm ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{formatDuration(result.durationMs)}</p>
        </div>
      </div>

      {result.resolvedModel && result.resolvedModel !== (result.requestedModel || result.model) ? (
        <div className="mt-3 rounded-[18px] border border-[#3B3523] bg-[rgba(197,160,89,0.08)] px-3 py-3">
          <p className="text-[10px] uppercase tracking-[0.16em] text-[#D9B46A]">Engine real</p>
          <p className="mt-1 text-sm text-[#F5F1E8]">{result.resolvedModel}</p>
        </div>
      ) : null}

      <div className={`mt-4 rounded-[20px] border p-4 ${isLightTheme ? "border-[#d7d4cb] bg-white" : "border-[#22342F] bg-[rgba(7,9,8,0.72)]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>Resposta</p>
        <p className={`mt-2 line-clamp-5 whitespace-pre-wrap text-sm leading-7 ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{result.text}</p>
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
  const { isLightTheme } = useInternalTheme();
  const activeEntry = entries.find((entry) => entry.id === activeEntryId) || entries[0] || null;
  const latestCreatedAt = activeEntry?.createdAt ? new Date(activeEntry.createdAt).toLocaleTimeString("pt-BR") : "n/a";

  return (
    <aside className={`min-h-0 overflow-hidden rounded-[28px] border shadow-[0_16px_48px_rgba(0,0,0,0.18)] ${isLightTheme ? "border-[#d7d4cb] bg-[linear-gradient(180deg,#ffffff,#f7f4ec)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(9,13,12,0.98),rgba(6,9,8,0.98))]"}`}>
      <div className={`px-4 py-4 ${isLightTheme ? "border-b border-[#e5e0d4]" : "border-b border-[#1B2925]"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-[10px] uppercase tracking-[0.22em] ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>Historico de validacao</p>
            <h2 className={`mt-2 text-[22px] font-semibold tracking-[-0.03em] ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>Console dedicado da IA</h2>
            <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#4b5563]" : "text-[#8FA39C]"}`}>
              Acompanhe request, resposta, telemetria e sinais de falha do modelo em um unico fluxo.
            </p>
          </div>
          <div className={`rounded-[20px] border px-3 py-2 text-right ${isLightTheme ? "border-[#d7d4cb]" : "border-[#22342F]"}`}>
            <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>Ultimo evento</p>
            <p className={`mt-1 text-sm font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{latestCreatedAt}</p>
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
  const { isLightTheme } = useInternalTheme();
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [provider, setProvider] = useState("");
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
        setProvidersHealth(payload?.data?.health || { loaded: true, status: "failed", providers: [], summary: { total: providers.length, operational: 0, configured: 0, failed: providers.length } });
        setProviderCatalog(providers.length ? providers : FALLBACK_PROVIDER_CATALOG);
        setProvider((current) => {
          const preferred =
            current ||
            providers.find((item) => item.id === "local" && item.available)?.id ||
            providers.find((item) => item.available)?.id ||
            defaultProvider ||
            "gpt";
          return resolveLlmTestProvider(preferred, providers);
        });
      })
      .catch((fetchError) => {
        if (!active) return;
        const fetchFailure = extractAdminErrorDetails(fetchError, "Falha ao carregar catalogo de providers.");
        setProviderCatalog(FALLBACK_PROVIDER_CATALOG);
        setProvidersHealth({
          loaded: false,
          status: "failed",
          error: fetchFailure.message,
          errorType: fetchFailure.errorType,
          details: fetchFailure.details,
          httpStatus: fetchFailure.status,
          providers: [],
          summary: {
            total: FALLBACK_PROVIDER_CATALOG.length,
            operational: 0,
            configured: 0,
            failed: FALLBACK_PROVIDER_CATALOG.length,
          },
        });
        setError(fetchFailure.message);
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
      .catch((fetchError) => {
        if (!active) return;
        const fetchFailure = extractAdminErrorDetails(fetchError, "Falha ao carregar health do RAG.");
        setRagHealth({
          status: "failed",
          error: fetchFailure.message,
          errorType: fetchFailure.errorType,
          details: fetchFailure.details,
          httpStatus: fetchFailure.status,
        });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const queryProvider = typeof router.query?.provider === "string" ? router.query.provider.trim() : "";
    const queryPrompt = typeof router.query?.prompt === "string" ? router.query.prompt.trim() : "";
    if (queryProvider) setProvider(resolveLlmTestProvider(queryProvider, providerCatalog));
    if (queryPrompt) setPrompt(queryPrompt);
  }, [providerCatalog, router.query?.prompt, router.query?.provider]);

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
  const providerDebugMatrix = useMemo(
    () => buildProviderDebugMatrix({ providerCatalog, providersHealth, results }),
    [providerCatalog, providersHealth, results]
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
    const effectiveProvider = resolveLlmTestProvider(selectedProvider, providerCatalog);

    const providerEntry = providerCatalog.find((item) => item.id === effectiveProvider);
    const providerLabel = providerEntry?.label || formatLawdeskProviderLabel(effectiveProvider);
    const activityId = `llm_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const isLocalProvider = isBrowserLocalProvider(effectiveProvider);
    const requestPath = isLocalProvider ? "browser-local:/v1/messages" : "/api/admin-lawdesk-chat";

    setLoading(true);
    setError("");

    appendActivityLog({
      id: activityId,
      module: "llm-test",
      provider: effectiveProvider,
      component: "LLMTestChat",
      label: `LLM Test: ${providerLabel}`,
      action: "llm_smoke_test",
      method: "POST",
      path: requestPath,
      page: "/llm-test",
      status: "running",
      consolePane: ["ai-task", "dotobot", "functions"],
      domain: "llm-test",
      system: "ai",
      traceHints: ["provider-selection", isLocalProvider ? "browser-local-runtime" : "admin-lawdesk-chat", "llm-smoke-test"],
      request: buildDiagnosticReport({
        title: "LLM smoke test request",
        summary: `Provider ${providerLabel} selecionado para validacao.`,
        sections: [
          { label: "request", value: { provider: effectiveProvider, prompt: trimmedPrompt, route: "/llm-test", transport: isLocalProvider ? "browser_local_runtime" : "admin_route" } },
        ],
      }),
    });

    setSelectedConsoleEntryId(activityId);

    try {
      const payload = isLocalProvider
        ? await invokeBrowserLocalMessages({
            query: trimmedPrompt,
            mode: "analysis",
            routePath: "/llm-test",
            contextEnabled: true,
            context: {
              route: "/llm-test",
              assistant: {
                mode: "analysis",
                role: "smoke-test",
              },
            },
          })
        : await adminFetch("/api/admin-lawdesk-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: trimmedPrompt,
              provider: effectiveProvider,
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
        provider: effectiveProvider,
        providerLabel,
        responseData,
        createdAt: new Date(startedAt).toISOString(),
        durationMs,
      });

      setResults((current) => [resultRecord, ...current]);
      setSelectedResultId(resultRecord.id);

      updateActivityLog(activityId, {
        status: "success",
        provider: effectiveProvider,
        source: resultRecord.source || "",
        path: requestPath,
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
      const authErrorType = String(runError?.payload?.errorType || "");
      const isAdminRuntimeUnavailable =
        runError?.status === 404 ||
        runError?.status === 405 ||
        authErrorType === "admin_runtime_unavailable";
      setError(
        runError?.status === 401 || runError?.status === 403 || ["authentication", "missing_session", "invalid_session", "inactive_profile", "missing_token"].includes(authErrorType)
          ? "Sua sessão administrativa expirou ou perdeu permissão. Faça login novamente no interno antes de rodar o LLM Test."
          : isAdminRuntimeUnavailable
            ? "O runtime administrativo do LLM Test não está publicado neste deploy. A rota /api/admin-lawdesk-chat precisa estar ativa no ambiente."
            : runError?.message || "Falha ao executar smoke test."
      );

      updateActivityLog(activityId, {
        status: "error",
        provider: selectedProvider,
        source: "",
        path: requestPath,
        errorType: classifyLlmTestError(runError?.message || ""),
        durationMs,
        response: buildDiagnosticReport({
          title: "LLM smoke test failure context",
          summary: "A execucao falhou antes de retornar resposta valida.",
          sections: [
            { label: "meta", value: { provider: effectiveProvider, providerLabel, durationMs } },
            {
              label: "health_snapshot",
              value: {
                providers: {
                  status: providersHealth?.status || null,
                  loaded: providersHealth?.loaded ?? null,
                  errorType: providersHealth?.errorType || null,
                  httpStatus: providersHealth?.httpStatus || null,
                },
                rag: {
                  status: ragHealth?.status || null,
                  errorType: ragHealth?.errorType || null,
                  httpStatus: ragHealth?.httpStatus || null,
                },
              },
            },
          ],
        }),
        error: buildDiagnosticReport({
          title: "Falha ao executar smoke test",
          summary: runError?.message || "Falha desconhecida.",
          sections: [
            { label: "request", value: { provider: effectiveProvider, prompt: trimmedPrompt } },
          ],
        }),
        request: buildDiagnosticReport({
          title: "LLM smoke test request",
          summary: `Provider ${providerLabel} selecionado para validacao.`,
          sections: [
            { label: "request", value: { provider: effectiveProvider, prompt: trimmedPrompt, route: "/llm-test", transport: isLocalProvider ? "browser_local_runtime" : "admin_route" } },
          ],
        }),
      });
      updateActivityLog(activityId, {
        response: `${buildDiagnosticReport({
          title: "LLM smoke test failure context",
          summary: "A execucao falhou antes de retornar resposta valida.",
          sections: [
            { label: "meta", value: { provider: effectiveProvider, providerLabel, durationMs } },
            {
              label: "health_snapshot",
              value: {
                providers: {
                  status: providersHealth?.status || null,
                  loaded: providersHealth?.loaded ?? null,
                  errorType: providersHealth?.errorType || null,
                  httpStatus: providersHealth?.httpStatus || null,
                },
                rag: {
                  status: ragHealth?.status || null,
                  errorType: ragHealth?.errorType || null,
                  httpStatus: ragHealth?.httpStatus || null,
                },
              },
            },
          ],
        })}\n\n---\n\n${buildTechnicalDebugger({
          errorMessage: runError?.message || "Falha desconhecida.",
          provider: effectiveProvider,
          providerLabel,
          durationMs,
          request: { provider: effectiveProvider, prompt: trimmedPrompt, route: "/llm-test" },
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
    <div className={`mx-auto max-w-[1600px] space-y-6 px-4 py-6 md:px-6 md:py-8 ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>
      <section className={`rounded-[30px] border p-6 shadow-[0_18px_54px_rgba(0,0,0,0.18)] ${isLightTheme ? "border-[#d7d4cb] bg-[linear-gradient(180deg,#ffffff,#f7f4ec)]" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(11,15,14,0.98),rgba(7,10,9,0.98))]"}`}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_360px]">
          <div>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>Laboratorio de IA</p>
            <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.04em]">Validacao de modelos</h1>
            <p className={`mt-3 max-w-3xl text-sm leading-7 ${isLightTheme ? "text-[#4b5563]" : "text-[#9BAEA8]"}`}>
              Compare provedores, revise estabilidade e acompanhe cada resposta com um console dedicado, no mesmo padrao visual do restante do interno.
            </p>

            <div className={`mt-5 rounded-[26px] border p-4 ${isLightTheme ? "border-[#d7d4cb] bg-white" : "border-[#22342F] bg-[rgba(7,9,8,0.96)]"}`}>
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={6}
                className={`w-full bg-transparent text-sm leading-7 outline-none ${isLightTheme ? "text-[#1f2937] placeholder:text-[#9ca3af]" : "text-[#F5F1E8] placeholder:text-[#60706A]"}`}
                placeholder="Digite o prompt de validacao..."
              />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {quickActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => {
                    setProvider(resolveLlmTestProvider(action.provider, providerCatalog));
                    runSmokeTest(action.provider);
                  }}
                  disabled={loading}
                  className={`rounded-full border px-3 py-1.5 text-[11px] transition disabled:opacity-50 ${isLightTheme ? "border-[#d7d4cb] text-[#4b5563] hover:border-[#c79b2c] hover:text-[#8a6217]" : "border-[#22342F] text-[#D8DEDA] hover:border-[#C5A059] hover:text-[#C5A059]"}`}
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
            <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
              <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>LLM</p>
              <select
                value={provider}
                onChange={(event) => setProvider(resolveLlmTestProvider(event.target.value, providerCatalog))}
                className={`mt-3 h-12 w-full rounded-2xl border px-3 text-sm outline-none ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#22342F] bg-[rgba(7,9,8,0.98)] text-[#F5F1E8]"}`}
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
              {loading ? "Executando..." : "Executar validacao"}
            </button>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-[22px] border border-[#22342F] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Validacoes</p>
                <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{results.length}</p>
              </div>
              <div className="rounded-[22px] border border-[#22342F] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Eventos do console</p>
                <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{consoleEntries.length}</p>
              </div>
              <div className="rounded-[22px] border border-[#22342F] px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">LLM ativo</p>
                <p className="mt-2 text-sm font-semibold text-[#F5F1E8]">{formatLawdeskProviderLabel(provider)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Saude dos modelos</p>
            <p className="mt-2 text-lg font-semibold text-[#F5F1E8]">{providersHealth?.status || "carregando"}</p>
              <p className="mt-1 text-sm text-[#8FA39C]">
                {Number.isFinite(Number(providersHealth?.summary?.operational))
                  ? `${providersHealth.summary.operational} operacionais de ${providersHealth.summary.total || providerDebugMatrix.length || 0}`
                  : "Catalogo e probes do servidor."}
              </p>
              {providersHealth?.error ? (
                <p className="mt-2 text-xs leading-6 text-[#D9B46A]">
                  {providersHealth.errorType ? `[${providersHealth.errorType}] ` : ""}
                  {providersHealth.error}
                </p>
              ) : null}
          </div>
          <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Saude do RAG</p>
            <p className="mt-2 text-lg font-semibold text-[#F5F1E8]">{ragHealth?.status || "carregando"}</p>
            <p className="mt-1 text-sm text-[#8FA39C]">
              {ragHealth?.report?.supabaseEmbedding?.error || ragHealth?.error || "Embedding, retrieval e fallback."}
            </p>
            {ragHealth?.error && ragHealth?.errorType ? (
              <p className="mt-2 text-xs leading-6 text-[#D9B46A]">
                [{ragHealth.errorType}] {ragHealth.error}
              </p>
            ) : null}
          </div>
          <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Leitura rapida</p>
            <p className="mt-2 text-sm font-semibold text-[#F5F1E8]">
              {ragHealth?.status === "failed"
                ? "RAG com falha; revisar secrets e embedding."
                : providersHealth?.status === "failed"
                  ? "Modelos sem saude operacional suficiente."
                  : "Ambiente pronto para validacoes comparativas."}
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[#7F928C]">Panorama</p>
              <h3 className="mt-1 text-lg font-semibold text-[#F5F1E8]">Comparativo técnico dos providers</h3>
            </div>
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-4">
            {providerDebugMatrix.map((item) => (
              <ProviderMatrixCard key={item.id} item={item} onRun={runSmokeTest} />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_400px]">
        <div className="space-y-5">
          <div className="rounded-[28px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Resultado selecionado</p>
                <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-[#F5F1E8]">Timeline da validacao</h2>
              </div>
              {selectedResult ? (
                <span className={`rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em] ${formatStatusTone(selectedResult.status, isLightTheme)}`}>
                  {selectedResult.status}
                </span>
              ) : null}
            </div>

            {selectedResult ? (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-[18px] border border-[#22342F] px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Source</p>
                    <p className="mt-1 text-sm text-[#F5F1E8]">{selectedResult.source || "n/a"}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#22342F] px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Modelo solicitado</p>
                    <p className="mt-1 text-sm text-[#F5F1E8]">{selectedResult.requestedModel || selectedResult.model || "n/a"}</p>
                  </div>
                  <div className="rounded-[18px] border border-[#22342F] px-3 py-3">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-[#7F928C]">Engine real</p>
                    <p className="mt-1 text-sm text-[#F5F1E8]">{selectedResult.resolvedModel || selectedResult.requestedModel || selectedResult.model || "n/a"}</p>
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
