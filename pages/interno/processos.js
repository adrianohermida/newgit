import { useEffect, useMemo, useRef, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import { OperationalHistoryCompactCard, OperationalResultCard } from "../../components/interno/OperationalResultPanels";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { useInternalTheme } from "../../components/interno/InternalThemeProvider";
import { adminFetch as adminFetchRaw } from "../../lib/admin/api";
import { appendActivityLog, setModuleHistory, updateActivityLog } from "../../lib/admin/activity-log";

const EMPTY_FORM = { numero_cnj_pai: "", numero_cnj_filho: "", tipo_relacao: "dependencia", status: "ativo", observacoes: "" };
const PROCESS_VIEW_ITEMS = [
  { key: "operacao", label: "Visao geral" },
  { key: "filas", label: "Prioridades" },
  { key: "relacoes", label: "Relacionamentos" },
  { key: "resultado", label: "Resultado" },
];
const HISTORY_STORAGE_KEY = "hmadv:interno-processos:history:v1";
const UI_STATE_STORAGE_KEY = "hmadv:interno-processos:ui:v1";
const SNAPSHOT_STORAGE_KEY = "hmadv:interno-processos:snapshot:v1";
const ACTION_LABELS = {
  run_sync_worker: "Atualizar integracoes",
  push_orfaos: "Criar contas comerciais",
  repair_freshsales_accounts: "Corrigir dados comerciais",
  sync_supabase_crm: "Atualizar base comercial",
  sincronizar_movimentacoes_activity: "Refletir andamentos no CRM",
  sincronizar_publicacoes_activity: "Refletir publicacoes no CRM",
  reconciliar_partes_contatos: "Reconciliar partes com contatos",
  backfill_audiencias: "Atualizar audiencias",
  auditoria_sync: "Rodar auditoria",
  enriquecer_datajud: "Atualizar dados judiciais",
  monitoramento_status: "Atualizar monitoramento",
  executar_integracao_total_hmadv: "Rodar sincronizacao completa",
  salvar_relacao: "Salvar relacionamento",
  remover_relacao: "Remover relacionamento",
  run_pending_jobs: "Avancar fila automatica",
};
const QUEUE_ERROR_TTL_MS = 1000 * 60 * 3;
const GLOBAL_ERROR_TTL_MS = 1000 * 60 * 2;
const ASYNC_PROCESS_ACTIONS = new Set([
  "push_orfaos",
  "enriquecer_datajud",
  "repair_freshsales_accounts",
  "sync_supabase_crm",
  "sincronizar_movimentacoes_activity",
  "sincronizar_publicacoes_activity",
  "backfill_audiencias",
]);
const OPERATIONAL_VIEWS = new Set(["operacao", "filas"]);
const COVERAGE_VIEWS = new Set(["filas", "resultado"]);
const RELATION_VIEWS = new Set(["relacoes"]);
const QUEUE_REFRESHERS = {
  sem_movimentacoes: "sem_movimentacoes",
  movimentacoes_pendentes: "movimentacoes_pendentes",
  publicacoes_pendentes: "publicacoes_pendentes",
  partes_sem_contato: "partes_sem_contato",
  audiencias_pendentes: "audiencias_pendentes",
  monitoramento_ativo: "monitoramento_ativo",
  monitoramento_inativo: "monitoramento_inativo",
  campos_orfaos: "campos_orfaos",
};
const QUEUE_LABELS = {
  sem_movimentacoes: "Sem atualizacoes",
  movimentacoes_pendentes: "Andamentos pendentes",
  publicacoes_pendentes: "Publicacoes pendentes",
  partes_sem_contato: "Partes sem contato",
  audiencias_pendentes: "Audiencias em aberto",
  monitoramento_ativo: "Monitoramento ativo",
  monitoramento_inativo: "Monitoramento pausado",
  campos_orfaos: "Dados incompletos",
  orfaos: "Sem conta comercial",
  cobertura: "Cobertura da carteira",
};
const MODULE_LIMITS = {
  maxProcessBatch: 25,
  maxMovementBatch: 25,
  maxPublicationBatch: 10,
  maxPartesBatch: 30,
  maxAudienciasBatch: 10,
};
const DEFAULT_QUEUE_BATCHES = {
  sem_movimentacoes: 5,
  movimentacoes_pendentes: 5,
  publicacoes_pendentes: 5,
  partes_sem_contato: 10,
  audiencias_pendentes: 5,
  monitoramento_ativo: 5,
  monitoramento_inativo: 5,
  campos_orfaos: 1,
  orfaos: 5,
};

function stringifyLogPayload(payload, limit = 8000) {
  if (payload === undefined) return "";
  let text = "";
  try {
    text = JSON.stringify(payload, null, 2);
  } catch {
    text = String(payload);
  }
  if (text.length > limit) {
    return `${text.slice(0, limit)}...`;
  }
  return text;
}

function extractActionFromRequest(path, init) {
  let action = "";
  if (typeof window !== "undefined" && typeof path === "string") {
    try {
      const url = new URL(path, window.location.origin);
      action = url.searchParams.get("action") || "";
    } catch {}
  }
  if (!action && init?.body) {
    try {
      const parsed = JSON.parse(init.body);
      action = parsed?.action || "";
    } catch {}
  }
  return action;
}

function getProcessActionLimitConfig(action) {
  if (action === "sync_supabase_crm") return { defaultLimit: 1, maxLimit: 1 };
  if (action === "repair_freshsales_accounts") return { defaultLimit: 1, maxLimit: 1 };
  if (action === "sincronizar_movimentacoes_activity") return { defaultLimit: 5, maxLimit: 25 };
  if (action === "sincronizar_publicacoes_activity") return { defaultLimit: 5, maxLimit: 10 };
  if (action === "reconciliar_partes_contatos") return { defaultLimit: 10, maxLimit: 30 };
  if (action === "enriquecer_datajud") return { defaultLimit: 5, maxLimit: 10 };
  if (action === "push_orfaos") return { defaultLimit: 5, maxLimit: 10 };
  if (action === "backfill_audiencias") return { defaultLimit: 5, maxLimit: 10 };
  return { defaultLimit: 15, maxLimit: 25 };
}

function getSafeProcessActionLimit(action, requestedLimit) {
  const config = getProcessActionLimitConfig(action);
  return Math.max(1, Math.min(Number(requestedLimit || config.defaultLimit), config.maxLimit));
}

function getProcessActionLabel(action, payload = {}) {
  let normalizedAction = String(action || "").trim();
  let suffixLabel = "";
  if (normalizedAction.endsWith("_job")) {
    normalizedAction = normalizedAction.slice(0, -4);
    suffixLabel = " (job)";
  } else if (normalizedAction.endsWith("_inline_fallback")) {
    normalizedAction = normalizedAction.slice(0, -16);
    suffixLabel = " (fallback inline)";
  }
  let intent = String(payload?.intent || "").trim();
  if (!intent && normalizedAction.startsWith("enriquecer_datajud_")) {
    intent = normalizedAction.slice("enriquecer_datajud_".length);
    normalizedAction = "enriquecer_datajud";
  }
  if (normalizedAction === "enriquecer_datajud") {
    if (intent === "buscar_movimentacoes") return `Buscar atualizacoes no DataJud${suffixLabel}`;
    if (intent === "sincronizar_monitorados") return `Sincronizar monitorados${suffixLabel}`;
    if (intent === "reenriquecer_gaps") return `Completar processos com lacunas${suffixLabel}`;
    return `Reenriquecer via DataJud${suffixLabel}`;
  }
  if (normalizedAction === "sync_supabase_crm") {
    if (intent === "crm_only") return `Atualizar CRM sem DataJud${suffixLabel}`;
    if (intent === "datajud_plus_crm") return `Atualizar DataJud e CRM${suffixLabel}`;
  }
  return `${ACTION_LABELS[normalizedAction] || normalizedAction}${suffixLabel}`;
}

function getProcessIntentBadge(payload = {}) {
  const intent = String(payload?.intent || "").trim();
  if (intent === "buscar_movimentacoes") return "subtipo: buscar movimentacoes";
  if (intent === "sincronizar_monitorados") return "subtipo: sincronizar monitorados";
  if (intent === "reenriquecer_gaps") return "subtipo: reenriquecer gaps";
  if (intent === "crm_only") return "subtipo: crm only";
  if (intent === "datajud_plus_crm") return "subtipo: datajud + crm";
  return "";
}

function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
}

function buildJobPreview(job) {
  if (!job) return "";
  const processed = Number(job.processed_count || 0);
  const requested = Number(job.requested_count || 0);
  const errors = Number(job.error_count || 0);
  if (job.status === "completed") return `Concluido: ${processed}/${requested} processado(s)`;
  if (job.status === "error") return job.last_error || `Falha apos ${processed}/${requested}`;
  return `Em andamento: ${processed}/${requested} processado(s), ${errors} falha(s)`;
}

function buildDrainPreview(result) {
  if (!result) return "";
  const processed = Number(result.chunksProcessed || 0);
  if (result.completedAll) return `Rodada concluida em ${processed} etapa(s)`;
  if (result.job) return `Rodada avancou ${processed} etapa(s): ${buildJobPreview(result.job)}`;
  return `Rodada avancou ${processed} etapa(s)`;
}

function buildHistoryPreview(result) {
  if (!result) return "";
  if (result.erro) return String(result.erro);
  if (typeof result.sincronizados === "number") return `Sincronizados: ${result.sincronizados}`;
  if (typeof result.reparados === "number") return `Reparados: ${result.reparados}`;
  if (typeof result.publicacoes === "number") return `Publicacoes processadas: ${result.publicacoes}`;
  if (typeof result.publicacoesAtualizadas === "number") return `Publicacoes atualizadas: ${result.publicacoesAtualizadas}`;
  if (typeof result.movimentacoes === "number") return `Movimentacoes sincronizadas: ${result.movimentacoes}`;
  if (typeof result.movimentacoesAtualizadas === "number") return `Movimentacoes atualizadas: ${result.movimentacoesAtualizadas}`;
  if (typeof result.activitiesCriadas === "number") return `Activities criadas: ${result.activitiesCriadas}`;
  if (typeof result.contatosVinculados === "number") return `Contatos vinculados: ${result.contatosVinculados}`;
  if (typeof result.contatosCriados === "number") return `Contatos criados: ${result.contatosCriados}`;
  if (typeof result.updated === "number") return `Atualizados: ${result.updated}`;
  if (typeof result.inserted === "number") return `Inseridos: ${result.inserted}`;
  if (typeof result.total === "number") return `Total: ${result.total}`;
  if (typeof result.items?.length === "number") return `Itens retornados: ${result.items.length}`;
  if (typeof result.sample?.length === "number") return `Amostra: ${result.sample.length}`;
  return "Execucao concluida";
}

function loadHistoryEntries() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistHistoryEntries(entries) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, 40)));
  } catch {}
}

function CompactHistoryPanel({ localHistory, remoteHistory, className = "" }) {
  const { isLightTheme } = useInternalTheme();
  const latestLocal = localHistory[0];
  const latestRemote = remoteHistory[0];
  return (
    <div className={`rounded-[28px] border p-5 shadow-[0_12px_36px_rgba(0,0,0,0.22)] ${isLightTheme ? "border-[#d7d4cb] bg-[linear-gradient(180deg,#ffffff,#f7f4ec)] text-[#1f2937]" : "border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.96),rgba(7,9,8,0.96))]"} ${className}`.trim()}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Historico (compacto)</p>
      <div className="mt-3 space-y-3 text-sm">
        <div>
          <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#9a6d14]" : "opacity-60"}`}>Ultimo local</p>
          {latestLocal ? (
            <p className="mt-1">{latestLocal.label || latestLocal.action} • {latestLocal.status}</p>
          ) : (
            <p className={`mt-1 ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Sem registros locais.</p>
          )}
        </div>
        <div>
          <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#9a6d14]" : "opacity-60"}`}>Ultimo HMADV</p>
          {latestRemote ? (
            <p className="mt-1">{getProcessActionLabel(latestRemote.acao, latestRemote.payload || {})} • {latestRemote.status}</p>
          ) : (
            <p className={`mt-1 ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Sem registros remotos.</p>
          )}
        </div>
        <p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Detalhes completos no Console &gt; Log.</p>
      </div>
    </div>
  );
}

function hasJsonTruncationMessage(value) {
  return /unexpected end of json input/i.test(String(value || ""));
}

function coverageMismatchMessage(state) {
  const totalRows = Number(state?.totalRows || 0);
  const items = Array.isArray(state?.items) ? state.items : [];
  if (totalRows > 0 && !items.length) {
    return "A cobertura encontrou processos na contagem, mas esta pagina voltou sem linhas. A leitura pode ter entrado em modo degradado ou sofrido timeout parcial.";
  }
  return "";
}

function queueMismatchMessage(state) {
  const totalRows = Number(state?.totalRows || 0);
  const items = Array.isArray(state?.items) ? state.items : [];
  if (totalRows > 0 && !items.length) {
    return "A fila encontrou itens na contagem, mas esta pagina voltou sem linhas. Isso costuma indicar leitura parcial, timeout ou fallback operacional.";
  }
  return "";
}

function queueHasReadMismatch(state) {
  return Boolean(queueMismatchMessage(state));
}

function countQueueReadMismatches(queues = []) {
  return queues.filter((queue) => queueHasReadMismatch(queue)).length;
}

function countQueueErrors(queues = []) {
  return queues.filter((queue) => queue?.error).length;
}

function loadUiState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function persistUiState(nextState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(UI_STATE_STORAGE_KEY, JSON.stringify(nextState));
  } catch {}
}

function loadOperationalSnapshot() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function persistOperationalSnapshot(snapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {}
}

function currentHashValue() {
  if (typeof window === "undefined") return "";
  return window.location.hash ? window.location.hash.replace("#", "") : "";
}

function getProcessSelectionValue(row) {
  return String(row?.numero_cnj || row?.key || "").trim();
}

function parseProcessNumbers(rawValue) {
  return [...new Set(
    String(rawValue || "")
      .split(/\r?\n|,|;/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

function uniqueProcessNumbers(values = []) {
  return [...new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean))];
}

function getRelationSelectionValue(row) {
  return String(row?.selection_key || row?.id || "").trim();
}

function getSuggestionSelectionValue(row) {
  return String(row?.suggestion_key || "").trim();
}

function MetricCard({ label, value, helper }) {
  const { isLightTheme } = useInternalTheme();
  return <div className={`rounded-[28px] border p-5 shadow-[0_12px_36px_rgba(0,0,0,0.22)] ${isLightTheme ? "border-[#d7d4cb] bg-[linear-gradient(180deg,#ffffff,#f7f4ec)] text-[#1f2937]" : "border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.98),rgba(7,9,8,0.98))]"}`}><p className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>{label}</p><p className="mb-2 font-serif text-3xl">{value}</p>{helper ? <p className={`text-sm leading-relaxed ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>{helper}</p> : null}</div>;
}
function Panel({ title, eyebrow, children, className = "" }) {
  const { isLightTheme } = useInternalTheme();
  return <section className={`rounded-[30px] border p-6 shadow-[0_14px_48px_rgba(0,0,0,0.22)] ${isLightTheme ? "border-[#d7d4cb] bg-[linear-gradient(180deg,#ffffff,#f7f4ec)] text-[#1f2937]" : "border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.96),rgba(7,9,8,0.96))]"} ${className}`.trim()}>{eyebrow ? <p className={`mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>{eyebrow}</p> : null}<h3 className="mb-4 font-serif text-[1.9rem] leading-tight">{title}</h3>{children}</section>;
}
function Field({ label, value, onChange, placeholder }) {
  const { isLightTheme } = useInternalTheme();
  return <label className="block"><span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>{label}</span><input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`w-full rounded-2xl border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`} /></label>;
}
function SelectField({ label, value, onChange, options }) {
  const { isLightTheme } = useInternalTheme();
  return <label className="block"><span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className={`w-full rounded-2xl border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
function ActionButton({ children, tone = "subtle", className = "", ...props }) {
  const { isLightTheme } = useInternalTheme();
  const tones = {
    subtle: isLightTheme ? "border border-[#d7d4cb] text-[#4b5563] hover:border-[#9a6d14] hover:text-[#9a6d14]" : "border border-[#2D2E2E] text-[#F4F1EA] hover:border-[#C5A059] hover:text-[#C5A059]",
    primary: isLightTheme ? "bg-[#c79b2c] text-[#fffdf7] hover:brightness-110" : "bg-[#C5A059] text-[#050706] hover:brightness-110",
    danger: isLightTheme ? "border border-[#E7C4C4] bg-[#FFF4F4] text-[#B25E5E] hover:border-[#C96A6A]" : "border border-[#4B2222] text-red-200 hover:border-[#C96A6A]",
  };
  return <button type="button" {...props} className={`rounded-2xl px-5 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone] || tones.subtle} ${className}`.trim()}>{children}</button>;
}
function ViewToggle({ value, onChange }) {
  const { isLightTheme } = useInternalTheme();
  return <div className="flex flex-wrap gap-2">{PROCESS_VIEW_ITEMS.map((item) => {
    const active = item.key === value;
    return <button key={item.key} type="button" onClick={() => onChange(item.key)} className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${active ? (isLightTheme ? "border-[#c79b2c] bg-[#fff8e7] text-[#8a6217]" : "border-[#C5A059] bg-[rgba(197,160,89,0.12)] text-[#F8E7B5]") : (isLightTheme ? "border-[#d7d4cb] text-[#8a6217] hover:border-[#c79b2c]" : "border-[#2D2E2E] text-[#C5A059] hover:border-[#C5A059]")}`}>{item.label}</button>;
  })}</div>;
}
function QueueList({ title, rows, selected, onToggle, onTogglePage, page, setPage, loading, helper, totalRows = 0, pageSize = 20, renderStatuses = null, lastUpdated = null, limited = false, errorMessage = "", selectionDisabled = false, selectionDisabledMessage = "" }) {
  const { isLightTheme } = useInternalTheme();
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(getProcessSelectionValue(row)));
  const totalPages = Math.max(1, Math.ceil(Number(totalRows || 0) / Math.max(1, pageSize)));
  const mismatchMessage = queueMismatchMessage({ totalRows, items: rows });
  const updatedLabel = lastUpdated ? new Date(lastUpdated).toLocaleString("pt-BR") : "nao atualizado";
  return <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{title}</p><span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E] opacity-70"}`}>{rows.length} nesta pagina</span><span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E] opacity-70"}`}>{totalRows} no total</span>{selected.length ? <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] bg-[rgba(76,57,26,0.22)] text-[#FDE68A]"}`}>{selected.length} selecionado(s)</span> : null}</div>{helper ? <p className={`mt-1 text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{helper}</p> : null}{totalRows ? <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Pagina {page} de {totalPages}</p> : null}{lastUpdated !== undefined ? <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Atualizado em {updatedLabel}</p> : null}{limited ? <p className={`mt-1 text-xs ${isLightTheme ? "text-[#9a6d14]" : "text-[#FDE68A]"}`}>Fila em modo reduzido para evitar sobrecarga.</p> : null}{errorMessage ? <p className="mt-1 text-xs text-[#FECACA]">{errorMessage}</p> : null}{selectionDisabled && selectionDisabledMessage ? <p className={`mt-1 text-xs ${isLightTheme ? "text-[#9a6d14]" : "text-[#FDE68A]"}`}>{selectionDisabledMessage}</p> : null}{mismatchMessage ? <p className={`mt-1 text-xs ${isLightTheme ? "text-[#9a6d14]" : "text-[#FDE68A]"}`}>{mismatchMessage}</p> : null}</div><div className="flex flex-wrap gap-2">{selectionDisabled ? null : <ActionButton onClick={() => onTogglePage(!allSelected)} className="px-3 py-2 text-xs">{allSelected ? "Desmarcar pagina" : "Selecionar pagina"}</ActionButton>}<ActionButton onClick={() => setPage(Math.max(1, page - 1))} disabled={loading || page <= 1} className="px-3 py-2 text-xs">Anterior</ActionButton><ActionButton onClick={() => setPage(page + 1)} disabled={loading || page >= totalPages} className="px-3 py-2 text-xs">Proxima</ActionButton></div></div>{loading ? <p className={`text-sm ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Carregando fila...</p> : null}{!loading && !rows.length ? <p className={`rounded-2xl border border-dashed px-4 py-6 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#6b7280]" : "border-[#2D2E2E] opacity-60"}`}>Nenhum item encontrado nesta pagina.</p> : null}<div className="space-y-3">{rows.map((row) => { const selectionValue = getProcessSelectionValue(row); const statuses = renderStatuses ? renderStatuses(row) : []; return <label key={row.key} className={`block rounded-[24px] border p-4 transition ${selectionDisabled ? "cursor-default" : "cursor-pointer"} ${isLightTheme ? "border-[#d7d4cb] bg-white hover:border-[#c79b2c]" : `border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] ${selectionDisabled ? "" : "hover:border-[#3A3E3D]"}`}`}><div className="flex gap-3">{selectionDisabled ? <div className={`mt-1 h-4 w-4 rounded-full border ${isLightTheme ? "border-[#d7d4cb] bg-[#f3eee1]" : "border-[#4A4031] bg-[rgba(76,57,26,0.22)]"}`} /> : <input type="checkbox" checked={selected.includes(selectionValue)} onChange={() => onToggle(selectionValue)} className="mt-1" />}<div className="min-w-0 flex-1 space-y-2 text-sm"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold break-all">{row.numero_cnj || row.key}</p>{row.monitoramento_fallback ? <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E] opacity-70"}`}>fallback</span> : null}</div>{row.titulo ? <p className={isLightTheme ? "text-[#4b5563]" : "opacity-70"}>{row.titulo}</p> : null}{statuses.length ? <div className="flex flex-wrap gap-2">{statuses.map((status) => <StatusBadge key={status.label} tone={status.tone}>{status.label}</StatusBadge>)}</div> : null}<div className={`flex flex-wrap gap-x-4 gap-y-1 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{row.status_atual_processo ? <span>Status: {row.status_atual_processo}</span> : null}{row.quantidade_movimentacoes !== undefined ? <span>Movimentacoes: {row.quantidade_movimentacoes ?? 0}</span> : null}{row.monitoramento_ativo !== undefined ? <span>Monitorado: {row.monitoramento_ativo ? "sim" : "nao"}</span> : null}{row.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`} target="_blank" rel="noreferrer" className={`underline ${isLightTheme ? "hover:text-[#9a6d14]" : "hover:text-[#C5A059]"}`} onClick={(e) => e.stopPropagation()}>Account {row.account_id_freshsales}</a> : <span>Sem Sales Account</span>}</div></div></div></label>; })}</div></div>;
}
function QueueActionBlock({ selectionCount = 0, batchSize = 1, onBatchChange, helper = "", disabled = false, actions = [] }) {
  const { isLightTheme } = useInternalTheme();
  return <div className={`rounded-[22px] border p-4 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-2">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Acao por fila</p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={selectionCount ? "success" : "default"}>{selectionCount} selecionado(s)</StatusBadge>
          <StatusBadge tone="default">lote local {batchSize}</StatusBadge>
        </div>
        {helper ? <p className={`text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{helper}</p> : null}
      </div>
      <label className="block min-w-[120px]">
        <span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Lote</span>
        <input type="number" min="1" max="30" value={batchSize} onChange={(e) => onBatchChange(e.target.value)} className={`w-full rounded-2xl border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`} />
      </label>
    </div>
    <div className="mt-4 flex flex-wrap gap-3">
      {actions.map((action) => <ActionButton key={action.label} tone={action.tone || "subtle"} onClick={action.onClick} disabled={disabled || action.disabled}>{action.label}</ActionButton>)}
    </div>
  </div>;
}
function CoverageList({ rows, page, setPage, loading, totalRows = 0, pageSize = 20, onSelectProcess = null }) {
  const { isLightTheme } = useInternalTheme();
  const totalPages = Math.max(1, Math.ceil(Number(totalRows || 0) / Math.max(1, pageSize)));
  return <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Cobertura por processo</p><p className="mt-1 text-xs leading-6 opacity-60">Leitura consolidada do que ja esta coberto entre HMADV e Freshsales, por processo.</p><p className="mt-1 text-xs opacity-50">Pagina {page} de {totalPages} • {totalRows} processo(s) com pendencia</p></div><div className="flex flex-wrap gap-2"><ActionButton onClick={() => setPage(Math.max(1, page - 1))} disabled={loading || page <= 1} className="px-3 py-2 text-xs">Anterior</ActionButton><ActionButton onClick={() => setPage(page + 1)} disabled={loading || page >= totalPages} className="px-3 py-2 text-xs">Proxima</ActionButton></div></div>{loading ? <p className="text-sm opacity-60">Carregando cobertura...</p> : null}{!loading && !rows.length ? <p className="rounded-2xl border border-dashed border-[#2D2E2E] px-4 py-6 text-sm opacity-60">Nenhum processo com pendencia de cobertura nesta pagina.</p> : null}<div className="space-y-3">{rows.map((row) => <div key={row.key} className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-2"><p className="font-semibold break-all">{row.numero_cnj || row.key}</p>{row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}<div className="flex flex-wrap gap-2"><StatusBadge tone={row.coveragePct >= 85 ? "success" : row.coveragePct >= 55 ? "warning" : "danger"}>{row.coveragePct || 0}% coberto</StatusBadge>{(row.pending || []).slice(0, 6).map((label) => <StatusBadge key={`${row.key}-${label}`} tone="warning">{label.replace(/_/g, " ")}</StatusBadge>)}</div><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60"><span>Publicacoes pendentes: {row.publicacoesPendentes || 0}</span><span>Movimentacoes pendentes: {row.movimentacoesPendentes || 0}</span><span>Partes sem contato: {row.partesSemContato || 0}</span><span>Audiencias pendentes: {row.audienciasPendentes || 0}</span>{row.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Account {row.account_id_freshsales}</a> : <span>Sem Sales Account</span>}</div></div>{onSelectProcess ? <ActionButton onClick={() => onSelectProcess(row.numero_cnj)} className="px-3 py-2 text-xs">Usar no lote</ActionButton> : null}</div></div>)}</div></div>;
}
function RelationProcessCard({ title, process, fallbackNumber }) {
  const { isLightTheme } = useInternalTheme();
  return <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[#050706]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>{title}</p><p className="mt-3 break-all font-semibold">{process?.numero_cnj || fallbackNumber || "Sem CNJ"}</p><p className={`mt-1 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{process?.titulo || "Processo ainda nao encontrado na base judiciaria."}</p><div className={`mt-2 flex flex-wrap gap-3 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{process?.status_atual_processo ? <span>Status: {process.status_atual_processo}</span> : null}{process?.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${process.account_id_freshsales}`} target="_blank" rel="noreferrer" className={`underline ${isLightTheme ? "hover:text-[#9a6d14]" : "hover:text-[#C5A059]"}`}>Account {process.account_id_freshsales}</a> : null}</div></div>;
}
function RelationSelectionBar({
  title,
  helper,
  page,
  totalRows,
  pageSize = 20,
  selectedCount = 0,
  allMatchingSelected = false,
  loading = false,
  onTogglePage,
  onToggleAllMatching,
  onPrevPage,
  onNextPage,
  disableNext = false,
  disablePrev = false,
}) {
  const { isLightTheme } = useInternalTheme();
  const totalPages = Math.max(1, Math.ceil(Number(totalRows || 0) / Math.max(1, pageSize)));
  return <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E] opacity-70"}`}>{totalRows} no total</span>
        {selectedCount ? <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] bg-[rgba(76,57,26,0.22)] text-[#FDE68A]"}`}>{selectedCount} selecionado(s)</span> : null}
        {allMatchingSelected ? <StatusBadge tone="success">todos do filtro</StatusBadge> : null}
      </div>
      {helper ? <p className={`mt-1 text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{helper}</p> : null}
      <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Pagina {page} de {totalPages}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <ActionButton onClick={onTogglePage} disabled={loading} className="px-3 py-2 text-xs">Selecionar pagina</ActionButton>
      <ActionButton onClick={onToggleAllMatching} disabled={loading || !totalRows} className="px-3 py-2 text-xs">{allMatchingSelected ? "Limpar todos do filtro" : "Selecionar todos do filtro"}</ActionButton>
      <ActionButton onClick={onPrevPage} disabled={loading || disablePrev} className="px-3 py-2 text-xs">Anterior</ActionButton>
      <ActionButton onClick={onNextPage} disabled={loading || disableNext} className="px-3 py-2 text-xs">Proxima</ActionButton>
    </div>
  </div>;
}
function RelationSuggestionCard({ item, checked, onToggle, onUseSuggestion }) {
  const { isLightTheme } = useInternalTheme();
  return <label className={`block cursor-pointer rounded-[26px] border p-4 transition ${isLightTheme ? "border-[#d7d4cb] bg-white hover:border-[#c79b2c]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] hover:border-[#3A3E3D]"}`}>
    <div className="flex gap-3">
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={item.score >= 0.8 ? "success" : item.score >= 0.6 ? "warning" : "default"}>{item.score_pct || Math.round(Number(item.score || 0) * 100)}% confianca</StatusBadge>
          <StatusBadge tone="default">{item.tipo_relacao}</StatusBadge>
          <StatusBadge tone="success">sugestao</StatusBadge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <RelationProcessCard title="Pai sugerido" process={item.source_process?.numero_cnj === item.numero_cnj_pai ? item.source_process : item.target_process} fallbackNumber={item.numero_cnj_pai} />
          <RelationProcessCard title="Filho sugerido" process={item.source_process?.numero_cnj === item.numero_cnj_filho ? item.source_process : item.target_process} fallbackNumber={item.numero_cnj_filho} />
        </div>
        {item.reasons?.length ? <div className="flex flex-wrap gap-2">{item.reasons.map((reason) => <StatusBadge key={reason} tone="warning">{reason}</StatusBadge>)}</div> : null}
        {item.evidence?.trecho ? <div className={`rounded-[20px] border p-3 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] opacity-75"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${isLightTheme ? "text-[#6b7280]" : "opacity-55"}`}>Trecho da publicacao</p><p className="mt-2 leading-6">{item.evidence.trecho}</p></div> : null}
        <div className={`flex flex-wrap items-center gap-3 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>
          {item.evidence?.data_publicacao ? <span>Publicacao: {new Date(item.evidence.data_publicacao).toLocaleDateString("pt-BR")}</span> : null}
          {item.evidence?.cnj_mencionado ? <span>CNJ citado: {item.evidence.cnj_mencionado}</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton onClick={(event) => { event.preventDefault(); onUseSuggestion(item); }} className="px-3 py-2 text-xs">Usar no formulario</ActionButton>
        </div>
      </div>
    </div>
  </label>;
}
function RegisteredRelationCard({ item, checked, onToggle, onEdit, onDelete, disabled = false }) {
  const { isLightTheme } = useInternalTheme();
  return <label className={`block cursor-pointer rounded-[28px] border p-4 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
    <div className="flex gap-3">
      <input type="checkbox" checked={checked} onChange={onToggle} className="mt-1" />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.15em]">
            <span className={`border px-2 py-1 ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E]"}`}>{item.tipo_relacao}</span>
            <span className={`border px-2 py-1 ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E]"}`}>{item.status}</span>
          </div>
          <div className="flex gap-2">
            <ActionButton onClick={(event) => { event.preventDefault(); onEdit(item); }} disabled={disabled} className="px-3 py-2 text-xs">Editar</ActionButton>
            <ActionButton tone="danger" onClick={(event) => { event.preventDefault(); onDelete(item.id); }} disabled={disabled} className="px-3 py-2 text-xs">Remover</ActionButton>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <RelationProcessCard title="Processo principal" process={item.processo_pai} fallbackNumber={item.numero_cnj_pai} />
          <RelationProcessCard title="Processo relacionado" process={item.processo_filho} fallbackNumber={item.numero_cnj_filho} />
        </div>
        {item.observacoes ? <p className={`text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>{item.observacoes}</p> : null}
      </div>
    </div>
  </label>;
}
function StatusBadge({ children, tone = "default" }) {
  const { isLightTheme } = useInternalTheme();
  const tones = {
    default: isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#6b7280]" : "border-[#2D2E2E] text-[#F4F1EA]",
    success: isLightTheme ? "border-[#8dc8a3] bg-[#effaf2] text-[#166534]" : "border-[#30543A] text-[#B7F7C6]",
    warning: isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] text-[#FDE68A]",
    danger: isLightTheme ? "border-[#e7b3b3] bg-[#fff1f1] text-[#991b1b]" : "border-[#5B2D2D] text-[#FECACA]",
  };
  return <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${tones[tone] || tones.default}`}>{children}</span>;
}
function countFrontendProcessGaps(row) {
  const fields = ["classe", "assunto_principal", "area", "data_ajuizamento", "sistema", "polo_ativo", "polo_passivo", "status_atual_processo"];
  return fields.reduce((acc, field) => {
    const value = row?.[field];
    if (value === null || value === undefined || value === "") acc += 1;
    return acc;
  }, 0);
}
function renderQueueRowStatuses(row, queueKey, { monitoringUnsupported = false } = {}) {
  const statuses = [];
  if (queueKey === "sem_movimentacoes") {
    statuses.push({ label: "pendente de datajud", tone: "warning" });
    if (!row?.account_id_freshsales) statuses.push({ label: "sem conta", tone: "danger" });
  }
  if (queueKey === "monitoramento_ativo") {
    if (monitoringUnsupported && row?.monitoramento_fallback) {
      statuses.push({ label: "leitura por fallback", tone: "warning" });
      statuses.push({ label: "schema pendente", tone: "danger" });
    } else if (row?.monitoramento_ativo === true) {
      statuses.push({ label: "monitoramento real", tone: "success" });
    }
  }
  if (queueKey === "monitoramento_inativo") {
    if (monitoringUnsupported) {
      statuses.push({ label: "diagnostico apenas", tone: "warning" });
      statuses.push({ label: "schema pendente", tone: "danger" });
    } else if (row?.monitoramento_ativo === false) {
      statuses.push({ label: "monitoramento inativo", tone: "danger" });
    }
  }
  if (queueKey === "campos_orfaos") {
    const gaps = countFrontendProcessGaps(row);
    if (gaps > 0) {
      statuses.push({ label: `${gaps} ajustes no CRM`, tone: "warning" });
      statuses.push({ label: "apto para reparo", tone: "success" });
    }
  }
  if (queueKey === "movimentacoes_pendentes") {
    const pending = Number(row?.total_pendente || 0);
    if (pending > 0) statuses.push({ label: `${pending} andamentos pendentes`, tone: "warning" });
    if (row?.account_id_freshsales) statuses.push({ label: "pronto para atualizar", tone: "success" });
    else statuses.push({ label: "sem conta comercial", tone: "danger" });
    if (row?.ultima_data) statuses.push({ label: `ultima ${new Date(row.ultima_data).toLocaleDateString("pt-BR")}`, tone: "default" });
  }
  if (queueKey === "publicacoes_pendentes") {
    const pending = Number(row?.total_pendente || 0);
    if (pending > 0) statuses.push({ label: `${pending} publicacoes pendentes`, tone: "warning" });
    if (row?.account_id_freshsales) statuses.push({ label: "pronto para refletir", tone: "success" });
    else statuses.push({ label: "sem conta comercial", tone: "danger" });
    if (row?.ultima_data) statuses.push({ label: `ultima ${new Date(row.ultima_data).toLocaleDateString("pt-BR")}`, tone: "default" });
  }
  if (queueKey === "partes_sem_contato") {
    const pending = Number(row?.total_pendente || 0);
    if (pending > 0) statuses.push({ label: `${pending} partes sem contato`, tone: "warning" });
    if (row?.account_id_freshsales) statuses.push({ label: "pronto para conciliar", tone: "success" });
    else statuses.push({ label: "sem conta comercial", tone: "danger" });
  }
  if (queueKey === "orfaos") {
    statuses.push({ label: "sem conta comercial", tone: "danger" });
    statuses.push({ label: "pronto para criar conta", tone: "warning" });
  }
  return statuses;
}
function PayloadDetails({ title, payload }) {
  if (!payload) return null;
  const { isLightTheme } = useInternalTheme();
  return <details className={`mt-2 rounded-2xl border p-3 text-xs ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] opacity-75"}`}>
    <summary className={`cursor-pointer list-none font-semibold uppercase tracking-[0.14em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>{title}</summary>
    <pre className={`mt-3 overflow-x-auto whitespace-pre-wrap ${isLightTheme ? "text-[#4b5563]" : "opacity-80"}`}>{JSON.stringify(payload, null, 2)}</pre>
  </details>;
}
function renderProcessSyncStatuses(row) {
  const statuses = [];
  if (row.datajud) statuses.push({ label: "supabase atualizado", tone: "success" });
  if (row.result) statuses.push({ label: "consulta persistida", tone: "success" });
  if ((row.movimentos_novos || 0) > 0) statuses.push({ label: `+${row.movimentos_novos} movimentos`, tone: "success" });
  if ((row.gaps_reduzidos || 0) > 0) statuses.push({ label: `-${row.gaps_reduzidos} gaps`, tone: "success" });
  if (row.quantidade_movimentacoes === 0 || row.quantidade_movimentacoes === null) statuses.push({ label: "sem movimentacoes", tone: "warning" });
  if (row.freshsales_repair?.reason === "sem_gap_crm") statuses.push({ label: "sem gap crm", tone: "default" });
  else if (row.freshsales_repair?.reason === "sem_mudanca_util") statuses.push({ label: "sem mudanca util", tone: "default" });
  else if (row.freshsales_repair?.skipped) statuses.push({ label: "crm pendente", tone: "warning" });
  else if (row.freshsales_repair) statuses.push({ label: "crm reparado", tone: "success" });
  if (row.monitoramento_ativo === true) statuses.push({ label: "monitorado", tone: "default" });
  if (row.monitoramento_ativo === false) statuses.push({ label: "monitoramento inativo", tone: "danger" });
  return statuses;
}
function deriveSelectionActionHint({
  selectedWithoutMovements = [],
  selectedMovementBacklog = [],
  selectedPublicationBacklog = [],
  selectedPartesBacklog = [],
  selectedAudienciaCandidates = [],
  selectedMonitoringActive = [],
  selectedMonitoringInactive = [],
  selectedFieldGaps = [],
  selectedOrphans = [],
  monitoringUnsupported = false,
}) {
  if (selectedOrphans.length) {
    return {
      title: "Criar contas primeiro",
      body: "Ha processos sem conta comercial selecionados. Priorize a criacao dessas contas para liberar as proximas etapas.",
      badges: [`${selectedOrphans.length} sem conta`, "acao: criar contas"],
    };
  }
  if (selectedFieldGaps.length) {
    return {
      title: "Ajustar CRM agora",
      body: "Os itens selecionados ainda precisam de ajuste entre a base interna e o CRM. O melhor proximo passo e corrigir os dados antes de atualizar novamente.",
      badges: [`${selectedFieldGaps.length} ajustes`, "acao: corrigir crm"],
    };
  }
  if (selectedWithoutMovements.length) {
    return {
      title: "Buscar movimentacoes no DataJud",
      body: "A selecao atual esta concentrada em processos sem andamento local. Reenriquecer pelo DataJud tende a gerar o maior ganho.",
      badges: [`${selectedWithoutMovements.length} sem mov.`, "acao: datajud"],
    };
  }
  if (selectedMovementBacklog.length) {
    return {
      title: "Atualizar andamentos no CRM",
      body: "Os processos selecionados ja tem andamentos, mas ainda faltam reflexos no CRM. Vale priorizar essa atualizacao antes de novos lotes amplos.",
      badges: [`${selectedMovementBacklog.length} com andamentos pendentes`, "acao: sync movimentacoes"],
    };
  }
  if (selectedPublicationBacklog.length) {
    return {
      title: "Atualizar publicacoes no CRM",
      body: "Os processos selecionados ainda tem publicacoes sem reflexo no CRM. Vale atualizar esse historico antes de novas rodadas amplas.",
      badges: [`${selectedPublicationBacklog.length} com publicacoes pendentes`, "acao: sync publicacoes"],
    };
  }
  if (selectedPartesBacklog.length) {
    return {
      title: "Reconciliar partes com contatos",
      body: "Os processos selecionados ainda tem partes sem contato no CRM. A conciliacao reduz perda de contexto no produto e no portal.",
      badges: [`${selectedPartesBacklog.length} com partes pendentes`, "acao: reconciliar contatos"],
    };
  }
  if (selectedAudienciaCandidates.length) {
    return {
      title: "Retroagir audiencias agora",
      body: "Ha processos com audiencias detectadas nas publicacoes e ainda pendentes de persistencia. Vale priorizar essa fila antes de novas rodadas amplas.",
      badges: [`${selectedAudienciaCandidates.length} com audiencias`, "acao: retroagir audiencias"],
    };
  }
  if (selectedMonitoringInactive.length) {
    return {
      title: monitoringUnsupported ? "Adequacao de schema pendente" : "Reativar monitoramento",
      body: monitoringUnsupported
        ? "A fila esta em modo diagnostico: a coluna monitoramento_ativo ainda nao existe no HMADV, entao nenhuma alteracao pode ser gravada."
        : "Ha processos fora do monitoramento. Reative a fila para recolocar o sync continuo em andamento.",
      badges: [`${selectedMonitoringInactive.length} itens`, monitoringUnsupported ? "somente leitura" : "acao: ativar"],
    };
  }
  if (selectedMonitoringActive.length) {
    if (monitoringUnsupported) {
      return {
        title: "Adequacao de schema pendente",
        body: "A leitura de monitoramento ativo esta em fallback e serve apenas para diagnostico. Acoes por lote ficam bloqueadas ate a migracao do schema.",
        badges: [`${selectedMonitoringActive.length} itens`, "somente leitura"],
      };
    }
    return {
      title: "Sincronizar monitorados",
      body: "A selecao atual ja esta em acompanhamento. Vale priorizar sincronismo e retroacao de audiencias nesse recorte.",
      badges: [`${selectedMonitoringActive.length} monitorados`, "acao: sincronizar"],
    };
  }
  return {
    title: "Selecione uma fila para priorizar",
    body: "Use as filas para montar o lote operacional e o painel destaca automaticamente a proxima acao mais util.",
    badges: ["sem selecao ativa"],
  };
}
function buildSelectionSuggestedAction({
  selectedWithoutMovements = [],
  selectedMovementBacklog = [],
  selectedPublicationBacklog = [],
  selectedPartesBacklog = [],
  selectedAudienciaCandidates = [],
  selectedMonitoringActive = [],
  selectedMonitoringInactive = [],
  selectedFieldGaps = [],
  selectedOrphans = [],
  monitoringUnsupported = false,
  withoutMovements = [],
  movementBacklog = [],
  publicationBacklog = [],
  partesBacklog = [],
  audienciaCandidates = [],
  monitoringActive = [],
  monitoringInactive = [],
  fieldGaps = [],
  orphans = [],
  resolveActionProcessNumbers,
  getSelectedNumbers,
  limit,
}) {
  if (selectedOrphans.length) {
    return {
      key: "push_orfaos",
      label: "Criar accounts agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(orphans, selectedOrphans).join("\n")),
        limit,
      },
    };
  }
  if (selectedFieldGaps.length) {
    return {
      key: "repair_freshsales_accounts",
      label: "Corrigir CRM agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps, selectedFieldGaps).join("\n")),
        limit,
      },
    };
  }
  if (selectedWithoutMovements.length) {
    return {
      key: "enriquecer_datajud",
      intent: "buscar_movimentacoes",
      label: "Buscar movimentacoes agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(withoutMovements, selectedWithoutMovements).join("\n")),
        limit,
        intent: "buscar_movimentacoes",
        action: "enriquecer_datajud",
      },
    };
  }
  if (selectedMovementBacklog.length) {
    return {
      key: "sincronizar_movimentacoes_activity",
      label: "Sincronizar movimentacoes agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(movementBacklog, selectedMovementBacklog).join("\n")),
        limit,
      },
    };
  }
  if (selectedPublicationBacklog.length) {
    return {
      key: "sincronizar_publicacoes_activity",
      label: "Sincronizar publicacoes agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(publicationBacklog, selectedPublicationBacklog).join("\n")),
        limit,
      },
    };
  }
  if (selectedPartesBacklog.length) {
    return {
      key: "reconciliar_partes_contatos",
      label: "Reconciliar partes agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(partesBacklog, selectedPartesBacklog).join("\n")),
        limit,
      },
    };
  }
  if (selectedAudienciaCandidates.length) {
    return {
      key: "backfill_audiencias",
      label: "Retroagir audiencias agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(audienciaCandidates, selectedAudienciaCandidates).join("\n")),
        limit,
        apply: true,
      },
    };
  }
  if (selectedMonitoringInactive.length) {
    if (monitoringUnsupported) {
      return {
        key: "monitoramento_status",
        label: "Schema pendente para monitoramento",
        tone: "subtle",
        disabled: true,
      };
    }
    return {
      key: "monitoramento_status",
      label: "Ativar monitoramento agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringInactive, selectedMonitoringInactive).join("\n")),
        active: true,
        limit,
      },
    };
  }
  if (selectedMonitoringActive.length) {
    if (monitoringUnsupported) {
      return {
        key: "monitoramento_schema",
        label: "Adequacao de schema pendente",
        tone: "subtle",
        disabled: true,
      };
    }
    return {
      key: "enriquecer_datajud",
      intent: "sincronizar_monitorados",
      label: "Sincronizar monitorados agora",
      tone: "primary",
      payload: {
        processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive, selectedMonitoringActive).join("\n")),
        limit,
        intent: "sincronizar_monitorados",
        action: "enriquecer_datajud",
      },
    };
  }
  return null;
}
function shouldShowProcessPayloadDetails(row) {
  if (!row) return false;
  if (row.result?.ok === false || row.datajud?.ok === false || row.freshsales_repair?.ok === false) return true;
  if (row.freshsales_repair?.skipped && !["sem_gap_crm", "sem_mudanca_util"].includes(String(row.freshsales_repair?.reason || ""))) return true;
  if (row.monitoramento_ativo === false) return true;
  return false;
}
function buildProcessResultHeadline(row) {
  if (!row) return "Sem alteracoes relevantes";
  if (row.result?.ok === false || row.datajud?.ok === false || row.freshsales_repair?.ok === false) return "Falha na rodada";
  if ((row.movimentos_novos || 0) > 0 && (row.gaps_reduzidos || 0) > 0) return "DataJud trouxe atualizacoes e completou dados";
  if ((row.movimentos_novos || 0) > 0) return "DataJud trouxe novas atualizacoes";
  if ((row.gaps_reduzidos || 0) > 0) return "Supabase ficou mais completo";
  if (row.freshsales_repair && !row.freshsales_repair?.skipped) return "CRM refletido com sucesso";
  if (row.freshsales_repair?.reason === "sem_gap_crm") return "CRM ja estava equilibrado";
  if (row.freshsales_repair?.reason === "sem_mudanca_util") return "Sem mudanca util para refletir no CRM";
  if (row.quantidade_movimentacoes === 0 || row.quantidade_movimentacoes === null) return "Processo ainda sem atualizacoes locais";
  return "Sem alteracoes relevantes";
}
function OperationResult({ result }) {
  const { isLightTheme } = useInternalTheme();
  if (result?.job) {
    return <JobCard job={result.job} active />;
  }
  const movementLike = typeof result?.movimentacoes === "number" || typeof result?.movimentacoesAtualizadas === "number" || String(result?.source || "").includes("andamentos");
  const publicationLike = typeof result?.publicacoes === "number" || typeof result?.publicacoesAtualizadas === "number" || String(result?.source || "").includes("publicacoes");
  const partesLike = typeof result?.contatosVinculados === "number" || typeof result?.contatosCriados === "number";
  if (movementLike) {
    const rows = Array.isArray(result?.items) ? result.items : Array.isArray(result?.sample) ? result.sample : [];
    const counters = {
      processos: Number(result?.processosLidos || rows.length || 0),
      movimentacoes: Number(result?.movimentacoes || result?.movimentacoesAtualizadas || 0),
      activities: Number(result?.activitiesCriadas || 0),
      semAccount: Number(result?.semAccount || 0),
      errors: Number(result?.errors || 0),
    };
    return <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-5">
        <QueueSummaryCard title="Processos lidos" count={counters.processos} helper="Processos avaliados nesta rodada." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Atualizacoes" count={counters.movimentacoes} helper="Andamentos refletidos no CRM." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Atividades" count={counters.activities} helper="Atividades criadas ou atualizadas." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Sem conta" count={counters.semAccount} helper="Pendencias sem conta comercial vinculada." accent="text-[#FDE68A]" />
        <QueueSummaryCard title="Falhas" count={counters.errors} helper="Itens que pedem revisao manual." accent="text-[#FECACA]" />
      </div>
      {result?.source ? <div className={`rounded-2xl border px-4 py-3 text-xs uppercase tracking-[0.16em] ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#6b7280]" : "border-[#1D2321] bg-[rgba(4,6,6,0.45)] opacity-65"}`}>Origem da execucao: {result.source}</div> : null}
      {rows.length ? rows.slice(0, 20).map((row, index) => <div key={`${row.numero_cnj || row.processo_id || row.id || index}`} className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
        <p className="font-semibold">{row.numero_cnj || row.id || `Linha ${index + 1}`}</p>
        {row.titulo ? <p className={isLightTheme ? "text-[#4b5563]" : "opacity-70"}>{row.titulo}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {row.status ? <StatusBadge tone={String(row.status).includes("sem") ? "warning" : "success"}>{String(row.status).replaceAll("_", " ")}</StatusBadge> : null}
          {typeof row.total_pendente === "number" ? <StatusBadge tone="warning">{row.total_pendente} pendentes</StatusBadge> : null}
          {row.account_id_freshsales ? <StatusBadge tone="success">conta vinculada</StatusBadge> : <StatusBadge tone="danger">sem conta comercial</StatusBadge>}
        </div>
        <div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-65"}`}>
          {row.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`} target="_blank" rel="noreferrer" className={`underline transition ${isLightTheme ? "hover:text-[#9a6d14]" : "hover:text-[#C5A059]"}`}>Abrir conta {row.account_id_freshsales}</a> : null}
          {row.processo_id ? <span>Processo ID: {row.processo_id}</span> : null}
          {row.ultima_data ? <span>Ultima data: {new Date(row.ultima_data).toLocaleDateString("pt-BR")}</span> : null}
        </div>
        {Array.isArray(row.sample_conteudo) && row.sample_conteudo.length ? <PayloadDetails title="Amostra de andamentos" payload={row.sample_conteudo} /> : null}
      </div>) : <PayloadDetails title="Resultado completo" payload={result} />}
    </div>;
  }
  if (publicationLike) {
    const rows = Array.isArray(result?.items) ? result.items : Array.isArray(result?.sample) ? result.sample : [];
    return <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-5">
        <QueueSummaryCard title="Processos lidos" count={Number(result?.processosLidos || rows.length || 0)} helper="Processos avaliados nesta rodada." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Publicacoes" count={Number(result?.publicacoes || result?.publicacoesAtualizadas || 0)} helper="Publicacoes refletidas no CRM." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Atividades" count={Number(result?.activitiesCriadas || 0)} helper="Atividades criadas ou atualizadas." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Sem conta" count={Number(result?.semAccount || 0)} helper="Pendencias sem conta comercial vinculada." accent="text-[#FDE68A]" />
        <QueueSummaryCard title="Falhas" count={Number(result?.errors || 0)} helper="Itens que pedem revisao manual." accent="text-[#FECACA]" />
      </div>
      {result?.source ? <div className={`rounded-2xl border px-4 py-3 text-xs uppercase tracking-[0.16em] ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#6b7280]" : "border-[#1D2321] bg-[rgba(4,6,6,0.45)] opacity-65"}`}>Origem da execucao: {result.source}</div> : null}
      {rows.length ? rows.slice(0, 20).map((row, index) => <div key={`${row.numero_cnj || row.processo_id || row.id || index}`} className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
        <p className="font-semibold">{row.numero_cnj || row.id || `Linha ${index + 1}`}</p>
        {row.titulo ? <p className={isLightTheme ? "text-[#4b5563]" : "opacity-70"}>{row.titulo}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {row.status ? <StatusBadge tone={String(row.status).includes("sem") ? "warning" : "success"}>{String(row.status).replaceAll("_", " ")}</StatusBadge> : null}
          {typeof row.total_pendente === "number" ? <StatusBadge tone="warning">{row.total_pendente} pendentes</StatusBadge> : null}
        </div>
        {Array.isArray(row.sample_conteudo) && row.sample_conteudo.length ? <PayloadDetails title="Amostra de publicacoes" payload={row.sample_conteudo} /> : null}
      </div>) : <PayloadDetails title="Resultado completo" payload={result} />}
    </div>;
  }
  if (partesLike) {
    const rows = Array.isArray(result?.items) ? result.items : Array.isArray(result?.sample) ? result.sample : [];
    return <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-4">
        <QueueSummaryCard title="Processos lidos" count={Number(result?.processosLidos || rows.length || 0)} helper="Processos avaliados nesta rodada." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Contatos vinculados" count={Number(result?.contatosVinculados || 0)} helper="Partes vinculadas a contatos existentes ou criados." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Contatos criados" count={Number(result?.contatosCriados || 0)} helper="Novos contatos gerados no CRM." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Modo" count={result?.apply ? "Aplicar" : "Simular"} helper="Execucao da reconciliacao." accent="text-[#C5A059]" />
      </div>
      {rows.length ? rows.slice(0, 20).map((row, index) => <div key={`${row.numero_cnj || row.processo_id || index}`} className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
        <p className="font-semibold">{row.numero_cnj || `Linha ${index + 1}`}</p>
        {Array.isArray(row.partes) ? <div className="mt-2 flex flex-wrap gap-2">{row.partes.slice(0, 6).map((parte) => <StatusBadge key={`${parte.parte_id || parte.nome}-${parte.modo || "parte"}`} tone={parte.contato_freshsales_id ? "success" : "warning"}>{parte.nome || "Parte"}: {parte.modo || "pendente"}</StatusBadge>)}</div> : null}
      </div>) : <PayloadDetails title="Resultado completo" payload={result} />}
    </div>;
  }
  const rows = Array.isArray(result?.items) ? result.items : Array.isArray(result?.sample) ? result.sample : [];
  const counters = rows.reduce((acc, row) => {
    if (row.datajud || row.result) acc.persistidos += 1;
    acc.movimentos += Number(row.movimentos_novos || 0);
    acc.gaps += Number(row.gaps_reduzidos || 0);
    if (row.datajud?.reason === "crm_only") acc.crmOnly += 1;
    if (row.freshsales_repair?.skipped) acc.pendentes += 1;
    else if (row.freshsales_repair) acc.reparados += 1;
    if (row.result?.ok === false || row.datajud?.ok === false || row.freshsales_repair?.ok === false) acc.falhas += 1;
    return acc;
  }, { persistidos: 0, reparados: 0, pendentes: 0, falhas: 0, movimentos: 0, gaps: 0, crmOnly: 0 });
  return rows.length ? <div className="space-y-3"><div className="grid gap-3 md:grid-cols-7"><QueueSummaryCard title="Persistidos" count={counters.persistidos} helper="Consultas ou dados gravados na base." accent="text-[#B7F7C6]" /><QueueSummaryCard title="Atualizacoes novas" count={counters.movimentos} helper="Andamentos agregados na rodada." accent="text-[#B7F7C6]" /><QueueSummaryCard title="Dados completados" count={counters.gaps} helper="Campos antes vazios que foram preenchidos." accent="text-[#B7F7C6]" /><QueueSummaryCard title="CRM direto" count={counters.crmOnly} helper="Itens que foram direto para ajuste no CRM." accent="text-[#C5A059]" /><QueueSummaryCard title="CRM ajustado" count={counters.reparados} helper="Contas refletidas no CRM." accent="text-[#B7F7C6]" /><QueueSummaryCard title="Pendentes" count={counters.pendentes} helper="Processos que ainda pedem ajuste." accent="text-[#FDE68A]" /><QueueSummaryCard title="Falhas" count={counters.falhas} helper="Itens que pedem revisao manual." accent="text-[#FECACA]" /></div><div className={`rounded-2xl border px-4 py-3 text-xs uppercase tracking-[0.16em] ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#6b7280]" : "border-[#1D2321] bg-[rgba(4,6,6,0.45)] opacity-65"}`}>Amostra da rodada: {rows.length} item(ns)</div>{rows.slice(0, 20).map((row, index) => { const showPayloads = shouldShowProcessPayloadDetails(row); return <div key={`${row.numero_cnj || row.id || index}`} className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}><p className="font-semibold">{row.numero_cnj || row.id || `Linha ${index + 1}`}</p>{row.titulo ? <p className={isLightTheme ? "text-[#4b5563]" : "opacity-70"}>{row.titulo}</p> : null}<p className={`mt-2 text-sm ${isLightTheme ? "text-[#374151]" : "opacity-80"}`}>{buildProcessResultHeadline(row)}</p>{renderProcessSyncStatuses(row).length ? <div className="mt-2 flex flex-wrap gap-2">{renderProcessSyncStatuses(row).map((item) => <StatusBadge key={item.label} tone={item.tone}>{item.label}</StatusBadge>)}</div> : null}<div className={`mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-65"}`}>{row.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`} target="_blank" rel="noreferrer" className={`underline transition ${isLightTheme ? "hover:text-[#9a6d14]" : "hover:text-[#C5A059]"}`}>Abrir conta {row.account_id_freshsales}</a> : <span>Sem conta comercial</span>}{row.processo_id ? <span>Processo ID: {row.processo_id}</span> : null}{row.before ? <span>Antes: {row.before.quantidade_movimentacoes || 0} mov.</span> : null}{row.after ? <span>Depois: {row.after.quantidade_movimentacoes || 0} mov.</span> : null}</div>{showPayloads ? <><PayloadDetails title="Detalhes do CRM" payload={row.freshsales_repair} /><PayloadDetails title="Detalhes da persistencia" payload={row.result} /><PayloadDetails title="Detalhes do DataJud" payload={row.datajud} /></> : null}</div>; })}</div> : <PayloadDetails title="Resultado completo" payload={result} />;
}
function HistoryCard({ entry, onReuse }) {
  const { isLightTheme } = useInternalTheme();
  return <div className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold">{entry.label}</p>{entry.meta?.intentLabel ? <p className={`mt-1 text-xs uppercase tracking-[0.14em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>{entry.meta.intentLabel}</p> : null}<p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{new Date(entry.createdAt).toLocaleString("pt-BR")}</p></div>
      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${entry.status === "running" ? (isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] text-[#FDE68A]") : entry.status === "error" ? (isLightTheme ? "border-[#E7C4C4] bg-[#FFF4F4] text-[#B25E5E]" : "border-[#4B2222] text-red-200") : (isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E] opacity-70")}`}>{entry.status}</span>
    </div>
    {entry.preview ? <p className={`mt-3 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{entry.preview}</p> : null}
    {entry.meta?.selectedCount ? <p className={`mt-2 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Itens selecionados: {entry.meta.selectedCount}</p> : null}
    {entry.meta?.limit ? <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Lote: {entry.meta.limit}</p> : null}
    {entry.meta?.processNumbersPreview ? <p className={`mt-2 break-all text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>CNJs: {entry.meta.processNumbersPreview}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2"><ActionButton onClick={() => onReuse(entry)} className="px-3 py-2 text-xs">Reusar parametros</ActionButton></div>
  </div>;
}
function JobCard({ job, active = false }) {
  const { isLightTheme } = useInternalTheme();
  const processed = Number(job?.processed_count || 0);
  const requested = Number(job?.requested_count || 0);
  const percent = requested ? Math.min(100, Math.round((processed / requested) * 100)) : 0;
  return <div className={`rounded-[24px] border p-4 text-sm ${active ? (isLightTheme ? "border-[#c79b2c] bg-[#fff8e8] text-[#1f2937]" : "border-[#C5A059] bg-[rgba(76,57,26,0.18)]") : (isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]")}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold">{getProcessActionLabel(job?.acao, job?.payload || {})}</p>
        <p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{job?.created_at ? new Date(job.created_at).toLocaleString("pt-BR") : "sem horario"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge tone={job?.status === "completed" ? "success" : job?.status === "error" ? "danger" : "warning"}>{job?.status || "pending"}</StatusBadge>
        {active ? <StatusBadge tone="default">ativo na tela</StatusBadge> : null}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <StatusBadge>Solicitados {requested}</StatusBadge>
      <StatusBadge tone="success">Processados {processed}</StatusBadge>
      <StatusBadge tone="warning">Falhas {Number(job?.error_count || 0)}</StatusBadge>
    </div>
    <div className={`mt-3 h-2 overflow-hidden rounded-full ${isLightTheme ? "bg-[#ece7da]" : "bg-[rgba(255,255,255,0.08)]"}`}>
      <div className={`h-full rounded-full ${isLightTheme ? "bg-[#c79b2c]" : "bg-[#C5A059]"}`} style={{ width: `${percent}%` }} />
    </div>
    <p className={`mt-2 text-xs ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>{buildJobPreview(job)}</p>
    {job?.last_error ? <p className={`mt-2 text-xs ${isLightTheme ? "text-[#B25E5E]" : "text-red-200"}`}>{job.last_error}</p> : null}
  </div>;
}
function QueueSummaryCard({ title, count, helper, accent = "text-[#C5A059]" }) {
  const { isLightTheme } = useInternalTheme();
  return <div className={`w-full rounded-[24px] border p-4 text-left ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
    <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>{title}</p>
    <p className={`mt-2 font-serif text-3xl ${accent}`}>{count}</p>
    <p className={`mt-2 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>{helper}</p>
  </div>;
}
function RemoteRunSummary({ entry }) {
  if (!entry) return null;
  const { isLightTheme } = useInternalTheme();
  const summary = entry.result_summary || {};
  const items = Object.entries(summary).filter(([, value]) => value !== undefined && value !== null && value !== "");
  const rows = Array.isArray(entry?.result_sample) ? entry.result_sample : [];
  const truncationErrors = rows.filter((row) => hasJsonTruncationMessage(row?.detalhe)).length;
  return <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Ultimo ciclo HMADV</p>
        <p className="mt-1 font-semibold">{getProcessActionLabel(entry.acao, entry.payload || {})}</p>
        <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{new Date(entry.created_at).toLocaleString("pt-BR")}</p>
      </div>
      <StatusBadge tone={entry.status === "error" ? "danger" : entry.status === "success" ? "success" : "default"}>{entry.status}</StatusBadge>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <StatusBadge>Solicitados {entry.requested_count || 0}</StatusBadge>
      <StatusBadge tone="success">Afetados {entry.affected_count || 0}</StatusBadge>
      {items.slice(0, 4).map(([key, value]) => <StatusBadge key={key} tone="warning">{key}: {String(value)}</StatusBadge>)}
      {truncationErrors ? <StatusBadge tone="danger">json truncado {truncationErrors}</StatusBadge> : null}
    </div>
    {entry.resumo ? <p className={`mt-3 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{entry.resumo}</p> : null}
    {truncationErrors ? <p className="mt-3 text-sm text-[#FECACA]">O retorno remoto trouxe respostas JSON incompletas nesta amostra. Vale rodar lotes menores ou cair para o fluxo local/fallback antes de confiar que a fila esta vazia.</p> : null}
  </div>;
}
function deriveRemoteHealth(history = []) {
  const latest = history[0] || null;
  if (!latest) return [];
  const sameAction = history.filter((item) => item.acao === latest.acao).slice(0, 3);
  const badges = [];
  const latestRows = Array.isArray(latest?.result_sample) ? latest.result_sample : [];
  const truncationErrors = latestRows.filter((row) => hasJsonTruncationMessage(row?.detalhe)).length;
  if (latest.status === "error") badges.push({ label: "ultima execucao com erro", tone: "danger" });
  if (Number(latest.affected_count || 0) === 0) badges.push({ label: "sem progresso", tone: "warning" });
  if (sameAction.length >= 2 && sameAction.every((item) => Number(item.affected_count || 0) === 0)) badges.push({ label: "fila reincidente", tone: "danger" });
  if (truncationErrors) badges.push({ label: "upstream json truncado", tone: "danger" });
  if (!badges.length && latest.status === "success") badges.push({ label: "ciclo saudavel", tone: "success" });
  return badges;
}
function deriveRecurringProcessEntries(history = []) {
  const counts = new Map();
  for (const entry of history.slice(0, 6)) {
    const rows = Array.isArray(entry?.result_sample) ? entry.result_sample : [];
    for (const row of rows) {
      const key = row?.numero_cnj || row?.id || row?.processo_id;
      if (!key) continue;
      const current = counts.get(key) || {
        key,
        titulo: row?.titulo || "",
        hits: 0,
        lastAction: entry.acao,
        source: "supabase",
        needsManualReview: false,
        noProgress: false,
        nextAction: "rodar auditoria",
      };
      current.hits += 1;
      if (!current.titulo && row?.titulo) current.titulo = row.titulo;
      current.lastAction = entry.acao;
      current.source = classifyProcessRecurringSource(entry, row);
      current.needsManualReview = current.needsManualReview || processNeedsManualReview(row);
      current.noProgress = current.noProgress || processHasNoProgress(entry, row);
      current.nextAction = suggestProcessNextAction(current.source, row, current);
      counts.set(key, current);
    }
  }
  return Array.from(counts.values()).filter((item) => item.hits > 1).sort((a, b) => b.hits - a.hits).slice(0, 8);
}
function summarizeRecurringProcessEntries(items = []) {
  return items.reduce((acc, item) => {
    acc.total += 1;
    acc[item.source] = (acc[item.source] || 0) + 1;
    if (item.needsManualReview) acc.manual += 1;
    if (item.noProgress) acc.stagnant += 1;
    return acc;
  }, { total: 0, supabase: 0, freshsales: 0, datajud: 0, advise: 0, manual: 0, stagnant: 0 });
}
function classifyProcessRecurringSource(entry, row) {
  if (entry?.acao === "enriquecer_datajud") return "datajud";
  if (row?.freshsales_repair || entry?.acao === "repair_freshsales_accounts" || entry?.acao === "push_orfaos") return "freshsales";
  if (row?.quantidade_movimentacoes === 0 || row?.before?.quantidade_movimentacoes === row?.after?.quantidade_movimentacoes) return "datajud";
  if (row?.monitoramento_ativo === false) return "supabase";
  return "supabase";
}
function processNeedsManualReview(row) {
  return Boolean(
    row?.result?.ok === false ||
    row?.datajud?.ok === false ||
    row?.freshsales_repair?.ok === false ||
    row?.freshsales_repair?.skipped
  );
}
function processHasNoProgress(entry, row) {
  if (Number(entry?.affected_count || 0) === 0) return true;
  return Number(row?.movimentos_novos || 0) === 0 && Number(row?.gaps_reduzidos || 0) === 0 && !row?.freshsales_repair;
}
function sourceTone(source) {
  if (source === "freshsales") return "warning";
  if (source === "datajud") return "danger";
  if (source === "advise") return "warning";
  return "default";
}
function sourceLabel(source) {
  if (source === "freshsales") return "gargalo freshsales";
  if (source === "datajud") return "gargalo datajud";
  if (source === "advise") return "gargalo advise";
  return "gargalo supabase";
}
function recurrenceBand(hits) {
  if (hits >= 4) return { label: "critico 4x+", tone: "danger" };
  if (hits >= 3) return { label: "reincidente 3x", tone: "warning" };
  if (hits >= 2) return { label: "recorrente 2x", tone: "default" };
  return null;
}
function summarizeRecurrenceBands(items = []) {
  return items.reduce((acc, item) => {
    if (item.hits >= 4) acc.critical += 1;
    else if (item.hits >= 3) acc.reincident += 1;
    else if (item.hits >= 2) acc.recurring += 1;
    return acc;
  }, { recurring: 0, reincident: 0, critical: 0 });
}
function groupRecurringProcessEntries(items = []) {
  return {
    critical: items.filter((item) => item.hits >= 4),
    reincident: items.filter((item) => item.hits === 3),
    recurring: items.filter((item) => item.hits === 2),
  };
}
function deriveRecurringProcessFocus(summary, bands) {
  if (bands.critical > 0) return { title: "Prioridade imediata", body: "Existem itens 4x+ reaparecendo. Priorize bloqueios cronicos antes de rodar novos lotes amplos." };
  if (summary.manual > 0) return { title: "Revisao manual prioritaria", body: "Ha casos que continuam pedindo intervencao humana. Vale revisar retorno e regra antes de repetir a fila." };
  if (summary.freshsales > 0) return { title: "Ajustar CRM primeiro", body: "Os bloqueios recorrentes estao concentrados no CRM. Priorize criacao de conta e ajuste de dados." };
  if (summary.datajud > 0) return { title: "Atualizar via DataJud", body: "O principal bloqueio recorrente esta no enriquecimento ou nas atualizacoes vindas do DataJud." };
  if (summary.stagnant > 0) return { title: "Revisar lote sem progresso", body: "Ha recorrencias sem ganho util. Revise selecao, regra e cobertura antes de insistir no mesmo lote." };
  return { title: "Ciclo sob controle", body: "As recorrencias atuais parecem estaveis e podem ser tratadas pela fila normal com lotes menores." };
}
function deriveSuggestedProcessBatch(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) return { size: 5, reason: "Use lote minimo para validar correcao estrutural ou manual." };
  if (summary.freshsales > 0 || summary.datajud > 0) return { size: 10, reason: "Use lote curto para medir ganho antes de ampliar a rodada." };
  if (summary.stagnant > 0) return { size: 8, reason: "Reduza o lote para isolar por que a fila nao esta progredindo." };
  return { size: 20, reason: "A fila parece sob controle para um lote padrao." };
}
function deriveSuggestedProcessActions(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) return ["Rodar auditoria", "Atualizar base comercial", "Buscar atualizacoes no DataJud"];
  if (summary.freshsales > 0) return ["Criar contas comerciais", "Corrigir dados comerciais", "Atualizar base comercial"];
  if (summary.datajud > 0) return ["Buscar atualizacoes no DataJud", "Atualizar dados judiciais", "Atualizar base comercial"];
  if (summary.stagnant > 0) return ["Rodar auditoria", "Atualizar base comercial"];
  return ["Atualizar base comercial", "Atualizar integracoes"];
}
function derivePrimaryProcessAction(actions = []) {
  return actions[0] || "Atualizar base comercial";
}
function deriveSuggestedProcessChecklist(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) {
    return [
      "Revise primeiro a amostra reincidente antes de ampliar o lote.",
      "Rode um lote curto de atualizacao da base comercial.",
      "Se ainda faltar progresso, reconsulte atualizacoes no DataJud.",
    ];
  }
  if (summary.freshsales > 0) {
    return [
      "Crie ou recupere as contas comerciais ausentes.",
      "Rode a correcao de dados no CRM.",
      "Feche o ciclo com atualizacao da base comercial.",
    ];
  }
  if (summary.datajud > 0) {
    return [
      "Busque atualizacoes para os processos mais vazios.",
      "Reenriqueca os campos DataJud do lote curto.",
      "Atualize o resultado consolidado no CRM.",
    ];
  }
  return [
    "Execute a atualizacao principal em lote controlado.",
    "Revise os itens que permanecerem sem progresso.",
    "Aumente o lote apenas se o ganho vier consistente.",
  ];
}
function suggestProcessNextAction(source, row, current) {
  if (current?.needsManualReview) return "revisar manualmente o retorno";
  if (source === "freshsales") {
    if (!row?.account_id_freshsales) return "criar conta comercial";
    return "corrigir dados no CRM";
  }
  if (source === "datajud") {
    if (row?.quantidade_movimentacoes === 0 || row?.before?.quantidade_movimentacoes === row?.after?.quantidade_movimentacoes) {
      return "buscar atualizacoes no datajud";
    }
    return "atualizar dados via datajud";
  }
  if (row?.monitoramento_ativo === false) return "reativar monitoramento";
  if (current?.noProgress) return "rodar auditoria do lote";
  return "atualizar base comercial";
}
function RecurringProcessItem({ item }) {
  const { isLightTheme } = useInternalTheme();
  return <div className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-semibold break-all">{item.key}</p>
      <StatusBadge tone="danger">{item.hits} ciclos</StatusBadge>
      {recurrenceBand(item.hits) ? <StatusBadge tone={recurrenceBand(item.hits).tone}>{recurrenceBand(item.hits).label}</StatusBadge> : null}
      <StatusBadge tone="warning">{ACTION_LABELS[item.lastAction] || item.lastAction}</StatusBadge>
      <StatusBadge tone={sourceTone(item.source)}>{sourceLabel(item.source)}</StatusBadge>
      {item.noProgress ? <StatusBadge tone="warning">sem progresso relevante</StatusBadge> : null}
      {item.needsManualReview ? <StatusBadge tone="danger">precisa revisao manual</StatusBadge> : null}
      {item.nextAction ? <StatusBadge tone="success">{item.nextAction}</StatusBadge> : null}
    </div>
    {item.titulo ? <p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{item.titulo}</p> : null}
  </div>;
}
function RecurringProcessGroup({ title, helper, items }) {
  if (!items.length) return null;
  const { isLightTheme } = useInternalTheme();
  return <div className="space-y-3">
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{helper}</p>
    </div>
    <div className="space-y-3">
      {items.map((item) => <RecurringProcessItem key={item.key} item={item} />)}
    </div>
  </div>;
}

export default function InternoProcessosPage() {
return <RequireAdmin>{(profile) => <InternoLayout profile={profile} title="Gestão de Processos" description="Gestão da carteira processual com acompanhamento, relacionamento e atualização contínua."><InternoProcessosContent /></InternoLayout>}</RequireAdmin>;
}

function InternoProcessosContent() {
  const { isLightTheme } = useInternalTheme();
  const [view, setView] = useState("operacao");
  const [overview, setOverview] = useState({ loading: true, data: null });
  const [processCoverage, setProcessCoverage] = useState({ loading: true, items: [], totalRows: 0, page: 1, pageSize: 20 });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [executionHistory, setExecutionHistory] = useState([]);
  const [queueRefreshLog, setQueueRefreshLog] = useState([]);
  const [operationalStatus, setOperationalStatus] = useState({ mode: "ok", message: "", updatedAt: null });
  const [backendHealth, setBackendHealth] = useState({ status: "ok", message: "", updatedAt: null });
  const [remoteHistory, setRemoteHistory] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [drainInFlight, setDrainInFlight] = useState(false);
  const [schemaStatus, setSchemaStatus] = useState({ loading: true, data: null });
  const [runnerMetrics, setRunnerMetrics] = useState({ loading: true, data: null });
  const [snapshotAt, setSnapshotAt] = useState(null);
  const [globalError, setGlobalError] = useState(null);
  const [globalErrorUntil, setGlobalErrorUntil] = useState(null);
  const [uiHydrated, setUiHydrated] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [lastFocusHash, setLastFocusHash] = useState("");
  const bootstrappedRef = useRef(false);
  const snapshotPayloadRef = useRef("");
  const [limit, setLimit] = useState(2);
  const [queueBatchSizes, setQueueBatchSizes] = useState(DEFAULT_QUEUE_BATCHES);
  const [processNumbers, setProcessNumbers] = useState("");
  const [copilotContext, setCopilotContext] = useState(null);
  const copilotQueryAppliedRef = useRef(false);
  const [withoutMovements, setWithoutMovements] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [movementBacklog, setMovementBacklog] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [publicationBacklog, setPublicationBacklog] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [partesBacklog, setPartesBacklog] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [audienciaCandidates, setAudienciaCandidates] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [monitoringActive, setMonitoringActive] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [monitoringInactive, setMonitoringInactive] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [fieldGaps, setFieldGaps] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [orphans, setOrphans] = useState({ loading: true, items: [], updatedAt: null, error: null, errorUntil: null, limited: false });
  const [wmPage, setWmPage] = useState(1);
  const [movPage, setMovPage] = useState(1);
  const [pubPage, setPubPage] = useState(1);
  const [partesPage, setPartesPage] = useState(1);
  const [audPage, setAudPage] = useState(1);
  const [maPage, setMaPage] = useState(1);
  const [miPage, setMiPage] = useState(1);
  const [fgPage, setFgPage] = useState(1);
  const [orphanPage, setOrphanPage] = useState(1);
  const [covPage, setCovPage] = useState(1);
  const [selectedWithoutMovements, setSelectedWithoutMovements] = useState([]);
  const [selectedMovementBacklog, setSelectedMovementBacklog] = useState([]);
  const [selectedPublicationBacklog, setSelectedPublicationBacklog] = useState([]);
  const [selectedPartesBacklog, setSelectedPartesBacklog] = useState([]);
  const [selectedAudienciaCandidates, setSelectedAudienciaCandidates] = useState([]);
  const [selectedMonitoringActive, setSelectedMonitoringActive] = useState([]);
  const [selectedMonitoringInactive, setSelectedMonitoringInactive] = useState([]);
  const [selectedFieldGaps, setSelectedFieldGaps] = useState([]);
  const [selectedOrphans, setSelectedOrphans] = useState([]);
  const [relations, setRelations] = useState({ loading: true, error: null, items: [], totalRows: 0, page: 1, pageSize: 20 });
  const [relationSuggestions, setRelationSuggestions] = useState({ loading: true, error: null, items: [], totalRows: 0, page: 1, pageSize: 20 });
  const [search, setSearch] = useState("");
  const [relationMinScore, setRelationMinScore] = useState("0.45");
  const [lookup, setLookup] = useState({ loading: false, items: [] });
  const [lookupTerm, setLookupTerm] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRelationId, setEditingRelationId] = useState(null);
  const [selectedRelations, setSelectedRelations] = useState([]);
  const [selectedSuggestionKeys, setSelectedSuggestionKeys] = useState([]);
  const [allMatchingRelationsSelected, setAllMatchingRelationsSelected] = useState(false);
  const [allMatchingSuggestionsSelected, setAllMatchingSuggestionsSelected] = useState(false);
  const [relationSelectionLoading, setRelationSelectionLoading] = useState(false);
  const [suggestionSelectionLoading, setSuggestionSelectionLoading] = useState(false);

  async function adminFetch(path, init = {}, meta = {}) {
    const startedAt = Date.now();
    const method = String(init?.method || "GET").toUpperCase();
    const action = meta.action || extractActionFromRequest(path, init);
    let requestPayload = "";
    if (init?.body) {
      try {
        requestPayload = stringifyLogPayload(JSON.parse(init.body));
      } catch {
        requestPayload = stringifyLogPayload(init.body);
      }
    }
    const entryId = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      appendActivityLog({
        id: entryId,
        module: "processos",
        component: meta.component || "processos",
        label: meta.label || action || "Chamada administrativa",
        action,
        method,
        path,
      expectation: meta.expectation || (action ? `Executar ${action}` : "Consultar backend"),
      request: requestPayload,
      status: "running",
      startedAt,
      durationMs: null,
      response: "",
      error: "",
    });
    try {
      const payload = await adminFetchRaw(path, init, meta);
      updateActivityLog(entryId, {
        status: "success",
        durationMs: Date.now() - startedAt,
        response: stringifyLogPayload(payload),
      });
      return payload;
    } catch (error) {
      updateActivityLog(entryId, {
        status: "error",
        durationMs: Date.now() - startedAt,
        error: stringifyLogPayload(error?.payload || error?.message || error),
      });
      throw error;
    }
  }

  useEffect(() => {
    const syncViewFromLocation = () => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      const queryView = url.searchParams.get("view");
      const hashView = window.location.hash ? window.location.hash.replace("#", "") : "";
      const nextView = PROCESS_VIEW_ITEMS.some((item) => item.key === queryView)
        ? queryView
        : PROCESS_VIEW_ITEMS.some((item) => item.key === hashView)
          ? hashView
          : "operacao";
      setView(nextView);
      setLastFocusHash(hashView || nextView);
    };
    syncViewFromLocation();
    if (typeof window !== "undefined") window.addEventListener("hashchange", syncViewFromLocation);
    return () => {
      if (typeof window !== "undefined") window.removeEventListener("hashchange", syncViewFromLocation);
    };
  }, []);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState !== "hidden");
    };
    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);
  useEffect(() => { setExecutionHistory(loadHistoryEntries()); }, []);
  useEffect(() => {
    if (typeof window === "undefined" || copilotQueryAppliedRef.current) return;
    const url = new URL(window.location.href);
    const queryProcessNumbers = String(url.searchParams.get("processNumbers") || "").trim();
    const queryContext = parseCopilotContext(url.searchParams.get("copilotContext") || "");
    if (queryProcessNumbers) setProcessNumbers(queryProcessNumbers);
    if (queryContext) setCopilotContext(queryContext);
    copilotQueryAppliedRef.current = true;
  }, []);
  useEffect(() => {
    setModuleHistory("processos", {
      executionHistory,
      remoteHistory,
      jobs,
      activeJobId,
      drainInFlight,
      operationalStatus,
      backendHealth,
      schemaStatus,
      runnerMetrics,
      queueRefreshLog,
      queueBatchSizes,
      actionState: {
        loading: Boolean(actionState?.loading),
        error: actionState?.error || null,
        result: actionState?.result || null,
      },
      ui: {
        view,
        limit,
        processNumbers,
        selectedWithoutMovements: selectedWithoutMovements.length,
        selectedMovementBacklog: selectedMovementBacklog.length,
        selectedPublicationBacklog: selectedPublicationBacklog.length,
        selectedPartesBacklog: selectedPartesBacklog.length,
        selectedAudienciaCandidates: selectedAudienciaCandidates.length,
        selectedMonitoringActive: selectedMonitoringActive.length,
        selectedMonitoringInactive: selectedMonitoringInactive.length,
        selectedFieldGaps: selectedFieldGaps.length,
        selectedOrphans: selectedOrphans.length,
      },
      queues: {
        semMovimentacoes: {
          totalRows: Number(withoutMovements?.totalRows || withoutMovements?.items?.length || 0),
          pageSize: Number(withoutMovements?.pageSize || 20),
          updatedAt: withoutMovements?.updatedAt || null,
          limited: Boolean(withoutMovements?.limited),
          error: withoutMovements?.error || null,
        },
        movimentacoesPendentes: {
          totalRows: Number(movementBacklog?.totalRows || movementBacklog?.items?.length || 0),
          pageSize: Number(movementBacklog?.pageSize || 20),
          updatedAt: movementBacklog?.updatedAt || null,
          limited: Boolean(movementBacklog?.limited),
          error: movementBacklog?.error || null,
        },
        publicacoesPendentes: {
          totalRows: Number(publicationBacklog?.totalRows || publicationBacklog?.items?.length || 0),
          pageSize: Number(publicationBacklog?.pageSize || 20),
          updatedAt: publicationBacklog?.updatedAt || null,
          limited: Boolean(publicationBacklog?.limited),
          error: publicationBacklog?.error || null,
        },
        partesSemContato: {
          totalRows: Number(partesBacklog?.totalRows || partesBacklog?.items?.length || 0),
          pageSize: Number(partesBacklog?.pageSize || 20),
          updatedAt: partesBacklog?.updatedAt || null,
          limited: Boolean(partesBacklog?.limited),
          error: partesBacklog?.error || null,
        },
        audienciasPendentes: {
          totalRows: Number(audienciaCandidates?.totalRows || audienciaCandidates?.items?.length || 0),
          pageSize: Number(audienciaCandidates?.pageSize || 20),
          updatedAt: audienciaCandidates?.updatedAt || null,
          limited: Boolean(audienciaCandidates?.limited),
          error: audienciaCandidates?.error || null,
        },
        camposOrfaos: {
          totalRows: Number(fieldGaps?.totalRows || fieldGaps?.items?.length || 0),
          pageSize: Number(fieldGaps?.pageSize || 20),
          updatedAt: fieldGaps?.updatedAt || null,
          limited: Boolean(fieldGaps?.limited),
          error: fieldGaps?.error || null,
        },
        orfaos: {
          totalRows: Number(orphans?.totalRows || orphans?.items?.length || 0),
          pageSize: Number(orphans?.pageSize || 20),
          updatedAt: orphans?.updatedAt || null,
          limited: Boolean(orphans?.limited),
          error: orphans?.error || null,
        },
      },
    });
  }, [
    activeJobId,
    actionState,
    audienciaCandidates,
    backendHealth,
    drainInFlight,
    executionHistory,
    fieldGaps,
    jobs,
    limit,
    movementBacklog,
    operationalStatus,
    orphans,
    partesBacklog,
    processNumbers,
    publicationBacklog,
    queueBatchSizes,
    queueRefreshLog,
    remoteHistory,
    runnerMetrics,
    schemaStatus,
    selectedAudienciaCandidates.length,
    selectedFieldGaps.length,
    selectedMonitoringActive.length,
    selectedMonitoringInactive.length,
    selectedMovementBacklog.length,
    selectedOrphans.length,
    selectedPartesBacklog.length,
    selectedPublicationBacklog.length,
    selectedWithoutMovements.length,
    view,
    withoutMovements,
  ]);
  useEffect(() => {
    const saved = loadUiState();
    if (saved) {
      const currentUrl = typeof window !== "undefined" ? new URL(window.location.href) : null;
      const hasExplicitTarget = Boolean(currentUrl?.searchParams.get("view") || currentHashValue());
      if (saved.view && PROCESS_VIEW_ITEMS.some((item) => item.key === saved.view)) setView(saved.view);
      if (!hasExplicitTarget && saved.lastFocusHash) {
        setLastFocusHash(String(saved.lastFocusHash));
        if (typeof window !== "undefined") {
          const url = new URL(window.location.href);
          url.searchParams.set("view", saved.view && PROCESS_VIEW_ITEMS.some((item) => item.key === saved.view) ? saved.view : "operacao");
          url.hash = String(saved.lastFocusHash);
          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        }
      }
      if (saved.processNumbers) setProcessNumbers(String(saved.processNumbers));
      if (saved.limit) setLimit(Number(saved.limit) || 2);
      if (saved.queueBatchSizes && typeof saved.queueBatchSizes === "object") setQueueBatchSizes((current) => ({ ...current, ...saved.queueBatchSizes }));
      if (saved.wmPage) setWmPage(Math.max(1, Number(saved.wmPage) || 1));
      if (saved.movPage) setMovPage(Math.max(1, Number(saved.movPage) || 1));
      if (saved.pubPage) setPubPage(Math.max(1, Number(saved.pubPage) || 1));
      if (saved.partesPage) setPartesPage(Math.max(1, Number(saved.partesPage) || 1));
      if (saved.audPage) setAudPage(Math.max(1, Number(saved.audPage) || 1));
      if (saved.maPage) setMaPage(Math.max(1, Number(saved.maPage) || 1));
      if (saved.miPage) setMiPage(Math.max(1, Number(saved.miPage) || 1));
      if (saved.fgPage) setFgPage(Math.max(1, Number(saved.fgPage) || 1));
      if (saved.orphanPage) setOrphanPage(Math.max(1, Number(saved.orphanPage) || 1));
      if (saved.covPage) setCovPage(Math.max(1, Number(saved.covPage) || 1));
      if (saved.search) setSearch(String(saved.search));
      if (saved.relationMinScore) setRelationMinScore(String(saved.relationMinScore));
      if (Array.isArray(saved.selectedWithoutMovements)) setSelectedWithoutMovements(saved.selectedWithoutMovements);
      if (Array.isArray(saved.selectedMovementBacklog)) setSelectedMovementBacklog(saved.selectedMovementBacklog);
      if (Array.isArray(saved.selectedPublicationBacklog)) setSelectedPublicationBacklog(saved.selectedPublicationBacklog);
      if (Array.isArray(saved.selectedPartesBacklog)) setSelectedPartesBacklog(saved.selectedPartesBacklog);
      if (Array.isArray(saved.selectedAudienciaCandidates)) setSelectedAudienciaCandidates(saved.selectedAudienciaCandidates);
      if (Array.isArray(saved.selectedMonitoringActive)) setSelectedMonitoringActive(saved.selectedMonitoringActive);
      if (Array.isArray(saved.selectedMonitoringInactive)) setSelectedMonitoringInactive(saved.selectedMonitoringInactive);
      if (Array.isArray(saved.selectedFieldGaps)) setSelectedFieldGaps(saved.selectedFieldGaps);
      if (Array.isArray(saved.selectedOrphans)) setSelectedOrphans(saved.selectedOrphans);
      if (Array.isArray(saved.selectedRelations)) setSelectedRelations(saved.selectedRelations);
      if (Array.isArray(saved.selectedSuggestionKeys)) setSelectedSuggestionKeys(saved.selectedSuggestionKeys);
    }
    setUiHydrated(true);
  }, []);
  useEffect(() => {
    const snapshot = loadOperationalSnapshot();
    if (!snapshot) return;
    if (snapshot.overview) setOverview(snapshot.overview);
    if (snapshot.processCoverage) setProcessCoverage(snapshot.processCoverage);
    if (snapshot.withoutMovements) setWithoutMovements(snapshot.withoutMovements);
    if (snapshot.movementBacklog) setMovementBacklog(snapshot.movementBacklog);
    if (snapshot.publicationBacklog) setPublicationBacklog(snapshot.publicationBacklog);
    if (snapshot.partesBacklog) setPartesBacklog(snapshot.partesBacklog);
    if (snapshot.audienciaCandidates) setAudienciaCandidates(snapshot.audienciaCandidates);
    if (snapshot.monitoringActive) setMonitoringActive(snapshot.monitoringActive);
    if (snapshot.monitoringInactive) setMonitoringInactive(snapshot.monitoringInactive);
    if (snapshot.fieldGaps) setFieldGaps(snapshot.fieldGaps);
    if (snapshot.orphans) setOrphans(snapshot.orphans);
    if (Array.isArray(snapshot.remoteHistory)) setRemoteHistory(snapshot.remoteHistory);
    if (Array.isArray(snapshot.jobs)) setJobs(snapshot.jobs);
    if (snapshot.schemaStatus) setSchemaStatus(snapshot.schemaStatus);
    if (snapshot.runnerMetrics) setRunnerMetrics(snapshot.runnerMetrics);
    if (snapshot.actionState && typeof snapshot.actionState === "object") {
      setActionState({
        loading: false,
        error: snapshot.actionState.error || null,
        result: snapshot.actionState.result || null,
      });
    }
    if (snapshot.cachedAt) setSnapshotAt(snapshot.cachedAt);
  }, []);
  useEffect(() => {
    persistUiState({
      view,
      lastFocusHash,
      processNumbers,
      limit,
      queueBatchSizes,
      wmPage,
      movPage,
      pubPage,
      partesPage,
      audPage,
      maPage,
      miPage,
      fgPage,
      orphanPage,
      covPage,
      search,
      relationMinScore,
      selectedWithoutMovements,
      selectedMovementBacklog,
      selectedPublicationBacklog,
      selectedPartesBacklog,
      selectedAudienciaCandidates,
      selectedMonitoringActive,
      selectedMonitoringInactive,
      selectedFieldGaps,
      selectedOrphans,
      selectedRelations,
      selectedSuggestionKeys,
    });
  }, [view, lastFocusHash, processNumbers, limit, queueBatchSizes, wmPage, movPage, pubPage, partesPage, audPage, maPage, miPage, fgPage, orphanPage, covPage, search, relationMinScore, selectedWithoutMovements, selectedMovementBacklog, selectedPublicationBacklog, selectedPartesBacklog, selectedAudienciaCandidates, selectedMonitoringActive, selectedMonitoringInactive, selectedFieldGaps, selectedOrphans, selectedRelations, selectedSuggestionKeys]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const targetHash = String(window.location.hash || "").replace(/^#/, "") || lastFocusHash || view;
    if (!targetHash) return undefined;
    const timer = window.setTimeout(() => {
      const target = document.getElementById(targetHash);
      if (target) target.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [view, lastFocusHash]);
  useEffect(() => {
    const snapshotPayload = {
      overview,
      processCoverage,
      withoutMovements,
      movementBacklog,
      publicationBacklog,
      partesBacklog,
      audienciaCandidates,
      monitoringActive,
      monitoringInactive,
      fieldGaps,
      orphans,
      schemaStatus,
      runnerMetrics,
      remoteHistory,
      jobs,
      actionState: {
        error: actionState.error || null,
        result: actionState.result || null,
      },
    };
    const normalizedPayload = JSON.stringify(snapshotPayload);
    if (normalizedPayload === snapshotPayloadRef.current) return;
    snapshotPayloadRef.current = normalizedPayload;
    const cachedAt = new Date().toISOString();
    setSnapshotAt(cachedAt);
    persistOperationalSnapshot({
      cachedAt,
      ...snapshotPayload,
    });
  }, [overview, processCoverage, withoutMovements, movementBacklog, publicationBacklog, partesBacklog, audienciaCandidates, monitoringActive, monitoringInactive, fieldGaps, orphans, remoteHistory, jobs, actionState.error, actionState.result]);
  useEffect(() => {
    if (!uiHydrated) return undefined;
    let cancelled = false;
    bootstrappedRef.current = false;
    const shouldLoadQueues = OPERATIONAL_VIEWS.has(view);
    const shouldLoadCoverage = COVERAGE_VIEWS.has(view);
    const shouldLoadRelations = RELATION_VIEWS.has(view);
    async function bootstrap() {
      const baseCalls = [
        loadOverview(),
        loadSchemaStatus(),
        loadRunnerMetrics(),
        loadRemoteHistory(),
        loadJobs(),
      ];
      const queueCalls = shouldLoadQueues
        ? [
          loadQueue("sem_movimentacoes", setWithoutMovements, wmPage),
          loadQueue("movimentacoes_pendentes", setMovementBacklog, movPage),
          loadQueue("publicacoes_pendentes", setPublicationBacklog, pubPage),
          loadQueue("partes_sem_contato", setPartesBacklog, partesPage),
          loadQueue("audiencias_pendentes", setAudienciaCandidates, audPage),
          loadQueue("monitoramento_ativo", setMonitoringActive, maPage),
          loadQueue("monitoramento_inativo", setMonitoringInactive, miPage),
          loadQueue("campos_orfaos", setFieldGaps, fgPage),
          loadOrphans(orphanPage),
        ]
        : [];
      const coverageCalls = shouldLoadCoverage ? [loadCoverage(covPage)] : [];
      const relationCalls = shouldLoadRelations ? [loadRelations(1, search), loadRelationSuggestions(1, search, relationMinScore)] : [];
      await Promise.all([...baseCalls, ...queueCalls, ...coverageCalls, ...relationCalls]);
      if (!cancelled) bootstrappedRef.current = true;
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [uiHydrated, view, relationMinScore]);
  useEffect(() => {
    if (globalError) {
      setOperationalStatus({ mode: "error", message: globalError, updatedAt: new Date().toISOString() });
      return;
    }
    const queues = [withoutMovements, movementBacklog, publicationBacklog, partesBacklog, audienciaCandidates, monitoringActive, monitoringInactive, fieldGaps, orphans];
    const queueErrorCount = countQueueErrors(queues);
    const mismatchCount = countQueueReadMismatches(queues);
    const limitedCount = queues.filter((queue) => queue?.limited).length;
    if (queueErrorCount > 0) {
      setOperationalStatus({
        mode: "error",
        message: `${queueErrorCount} fila(s) com erro de leitura no painel.`,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (mismatchCount > 0) {
      setOperationalStatus({
        mode: "limited",
        message: `${mismatchCount} fila(s) com contagem maior que a pagina retornada.`,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    if (limitedCount > 0) {
      setOperationalStatus({
        mode: "limited",
        message: `${limitedCount} fila(s) em modo reduzido para evitar sobrecarga.`,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    setOperationalStatus({ mode: "ok", message: "Operacao normal", updatedAt: new Date().toISOString() });
  }, [globalError, withoutMovements, movementBacklog, publicationBacklog, partesBacklog, audienciaCandidates, monitoringActive, monitoringInactive, fieldGaps, orphans]);
  useEffect(() => {
    const latest = remoteHistory[0];
    if (!latest) {
      setBackendHealth({ status: "unknown", message: "Sem historico recente.", updatedAt: null });
      return;
    }
    if (latest.status === "error") {
      setBackendHealth({ status: "error", message: "Ultimo ciclo HMADV falhou.", updatedAt: latest.created_at });
      return;
    }
    const latestRows = Array.isArray(latest?.result_sample) ? latest.result_sample : [];
    const truncationErrors = latestRows.filter((row) => hasJsonTruncationMessage(row?.detalhe)).length;
    if (truncationErrors > 0) {
      setBackendHealth({ status: "warning", message: `Ultimo ciclo remoto devolveu JSON truncado em ${truncationErrors} item(ns).`, updatedAt: latest.created_at });
      return;
    }
    if (Number(latest.affected_count || 0) === 0) {
      setBackendHealth({ status: "warning", message: "Ultimo ciclo nao teve progresso.", updatedAt: latest.created_at });
      return;
    }
    setBackendHealth({ status: "ok", message: "Ciclo HMADV saudavel.", updatedAt: latest.created_at });
  }, [remoteHistory]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("sem_movimentacoes", setWithoutMovements, wmPage);
  }, [wmPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("movimentacoes_pendentes", setMovementBacklog, movPage);
  }, [movPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("publicacoes_pendentes", setPublicationBacklog, pubPage);
  }, [pubPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("partes_sem_contato", setPartesBacklog, partesPage);
  }, [partesPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("audiencias_pendentes", setAudienciaCandidates, audPage);
  }, [audPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("monitoramento_ativo", setMonitoringActive, maPage);
  }, [maPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("monitoramento_inativo", setMonitoringInactive, miPage);
  }, [miPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadQueue("campos_orfaos", setFieldGaps, fgPage);
  }, [fgPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!OPERATIONAL_VIEWS.has(view)) return;
    loadOrphans(orphanPage);
  }, [orphanPage, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!RELATION_VIEWS.has(view)) return;
    loadRelations(1, search);
  }, [search, view]);
  useEffect(() => {
    if (!bootstrappedRef.current) return;
    if (!RELATION_VIEWS.has(view)) return;
    loadRelationSuggestions(1, search, relationMinScore);
  }, [search, relationMinScore, view]);
  useEffect(() => {
    const term = lookupTerm.trim();
    if (!term) { setLookup({ loading: false, items: [] }); return undefined; }
    let cancelled = false;
    const timeoutId = setTimeout(async () => {
      setLookup((current) => ({ ...current, loading: true }));
      try {
        const payload = await adminFetch(`/api/admin-hmadv-processos?action=buscar_processos&query=${encodeURIComponent(term)}&limit=8`);
        if (!cancelled) setLookup({ loading: false, items: payload.data.items || [] });
      } catch { if (!cancelled) setLookup({ loading: false, items: [] }); }
    }, 250);
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [lookupTerm]);
  useEffect(() => {
    setAllMatchingRelationsSelected(false);
  }, [search, relations.page]);
  useEffect(() => {
    setAllMatchingSuggestionsSelected(false);
  }, [search, relationSuggestions.page, relationMinScore]);
  useEffect(() => {
    if (!jobs.length) return;
    const runningJob = jobs.find((item) => item.status === "running" || item.status === "pending");
    if (runningJob?.id && !activeJobId) {
      setActiveJobId(runningJob.id);
    }
  }, [jobs, activeJobId]);
  useEffect(() => {
    if (!activeJobId) return undefined;
    let cancelled = false;
    const idleDelayMs = pageVisible ? 1800 : 6000;
    async function runLoop() {
      while (!cancelled) {
        try {
          if (!pageVisible) {
            setDrainInFlight(false);
            await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
            continue;
          }
          setDrainInFlight(true);
          const payload = await adminFetch("/api/admin-hmadv-processos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "run_pending_jobs", id: activeJobId, maxChunks: 1 }),
          }, { timeoutMs: 120000, maxRetries: 0 });
          const result = payload.data || {};
          const job = result.job || null;
          if (cancelled) return;
          mergeJobIntoState(job);
          setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result } : { drain: result } });
          if (result.completedAll || !job?.id || job?.status === "completed" || job?.status === "error" || job?.status === "cancelled") {
            setActiveJobId(null);
            if (job?.acao) {
              await refreshAfterAction(job.acao, job.payload || {});
            } else {
              await refreshOperationalContext();
            }
            if (typeof window !== "undefined" && "Notification" in window) {
              if (Notification.permission === "default") {
                Notification.requestPermission().catch(() => {});
              } else if (Notification.permission === "granted") {
                new Notification("HMADV concluiu um job de processos", {
                  body: result.completedAll
                    ? "Todas as pendencias de processos desta fila foram drenadas."
                    : `${ACTION_LABELS[job?.acao] || job?.acao}: ${buildJobPreview(job)}`,
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
    return () => {
      cancelled = true;
    };
  }, [activeJobId, pageVisible, wmPage, movPage, pubPage, partesPage, audPage, maPage, miPage, fgPage, orphanPage]);

  async function loadOverview() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      setOverview((state) => ({ ...state, loading: false }));
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=overview");
      setOverview({ loading: false, data: payload.data });
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch (error) {
      setOverview({ loading: false, data: null });
      setGlobalError(error.message || "Falha ao carregar visao geral.");
      setGlobalErrorUntil(Date.now() + GLOBAL_ERROR_TTL_MS);
    }
  }
  async function loadSchemaStatus() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      setSchemaStatus((state) => ({ ...state, loading: false }));
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=schema_status");
      setSchemaStatus({ loading: false, data: payload.data });
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch (error) {
      setSchemaStatus({ loading: false, data: null });
      setGlobalError(error.message || "Falha ao ler schema.");
      setGlobalErrorUntil(Date.now() + GLOBAL_ERROR_TTL_MS);
    }
  }
  async function loadRunnerMetrics() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      setRunnerMetrics((state) => ({ ...state, loading: false }));
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=runner_metrics");
      setRunnerMetrics({ loading: false, data: payload.data });
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch (error) {
      setRunnerMetrics({ loading: false, data: null });
      setGlobalError(error.message || "Falha ao carregar runner.");
      setGlobalErrorUntil(Date.now() + GLOBAL_ERROR_TTL_MS);
    }
  }
  function pushQueueRefresh(key) {
    const label = QUEUE_LABELS[key] || key;
    const entry = { key, label, ts: new Date().toISOString() };
    setQueueRefreshLog((current) => [entry, ...(current || []).filter((item) => item.key !== key)].slice(0, 6));
  }
  async function loadCoverage(page = 1) {
    if (schemaStatus?.data?.exists === false) {
      setProcessCoverage({ loading: false, items: [], totalRows: 0, page, pageSize: 20, unsupported: true, limited: false, error: null });
      pushQueueRefresh("cobertura");
      return;
    }
    setProcessCoverage((state) => ({ ...state, loading: true }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=cobertura_processos&page=${page}&pageSize=20`);
      setProcessCoverage({ loading: false, items: payload.data.items || [], totalRows: payload.data.totalRows || 0, page: payload.data.page || page, pageSize: payload.data.pageSize || 20, unsupported: false, limited: Boolean(payload.data.limited), error: payload.data?.error || null });
      pushQueueRefresh("cobertura");
    } catch (error) {
      setProcessCoverage((state) => ({ loading: false, items: state?.items || [], totalRows: state?.totalRows || 0, page, pageSize: state?.pageSize || 20, unsupported: false, limited: Boolean(state?.limited), error: error.message || "Falha ao carregar cobertura." }));
      pushQueueRefresh("cobertura");
    }
  }
  async function loadQueue(action, setter, page) {
    setter((state) => ({ ...state, loading: true, error: null }));
    const now = Date.now();
    setter((state) => {
      if (state?.errorUntil && now < state.errorUntil) {
        return { ...state, loading: false };
      }
      return state;
    });
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=${action}&page=${page}&pageSize=20`);
        const payloadError = payload.data?.error || null;
        const nextErrorUntil = payloadError ? Date.now() + QUEUE_ERROR_TTL_MS : null;
        setter({
          loading: false,
          items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })),
          totalRows: payload.data.totalRows || 0,
          page: payload.data.page || page,
          pageSize: payload.data.pageSize || 20,
          unsupported: Boolean(payload.data.unsupported),
          updatedAt: new Date().toISOString(),
          limited: Boolean(payload.data.limited),
          error: payloadError,
          errorUntil: nextErrorUntil,
        });
        pushQueueRefresh(action);
    } catch (error) {
      const message = error.message || "Falha ao carregar fila.";
      setter((state) => ({
        loading: false,
        items: state?.items || [],
        totalRows: state?.totalRows || 0,
        page,
        pageSize: 20,
        unsupported: Boolean(state?.unsupported),
        updatedAt: state?.updatedAt || new Date().toISOString(),
        limited: Boolean(state?.limited),
        error: message,
        errorUntil: Date.now() + QUEUE_ERROR_TTL_MS,
      }));
      pushQueueRefresh(action);
    }
  }
  async function loadOrphans(page = 1) {
    setOrphans((state) => ({ ...state, loading: true }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=orfaos&page=${page}&pageSize=20`);
      setOrphans({ loading: false, items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })), totalRows: payload.data.totalRows || 0, page: payload.data.page || page, pageSize: payload.data.pageSize || 20, updatedAt: new Date().toISOString() });
      pushQueueRefresh("orfaos");
    } catch {
      setOrphans({ loading: false, items: [], totalRows: 0, page, pageSize: 20, updatedAt: new Date().toISOString() });
      pushQueueRefresh("orfaos");
    }
  }
  async function loadRelations(page = 1, query = "") {
    setRelations((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=relacoes&page=${page}&pageSize=20&query=${encodeURIComponent(query || "")}`);
      setRelations({
        loading: false,
        error: null,
        items: payload.data.items || [],
        totalRows: payload.data.totalRows || 0,
        page: payload.data.page || page,
        pageSize: payload.data.pageSize || 20,
      });
    } catch (error) {
      setRelations({ loading: false, error: error.message || "Falha ao carregar relacoes.", items: [], totalRows: 0, page, pageSize: 20 });
    }
  }
  async function loadRelationSuggestions(page = 1, query = "", minScore = relationMinScore) {
    setRelationSuggestions((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=sugestoes_relacoes&page=${page}&pageSize=20&query=${encodeURIComponent(query || "")}&minScore=${encodeURIComponent(minScore || "0.45")}`);
      setRelationSuggestions({
        loading: false,
        error: null,
        items: payload.data.items || [],
        totalRows: payload.data.totalRows || 0,
        page: payload.data.page || page,
        pageSize: payload.data.pageSize || 20,
      });
    } catch (error) {
      setRelationSuggestions({ loading: false, error: error.message || "Falha ao carregar sugestoes.", items: [], totalRows: 0, page, pageSize: 20 });
    }
  }
  async function loadRemoteHistory() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=historico&limit=20");
      setRemoteHistory(payload.data.items || []);
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch {
      setRemoteHistory([]);
    }
  }
  async function loadJobs() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos?action=jobs&limit=12");
      setJobs(payload.data.items || []);
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch {
      setJobs([]);
    }
  }
  function mergeJobIntoState(job) {
    if (!job?.id) return;
    setJobs((current) => {
      const next = Array.isArray(current) ? [...current] : [];
      const index = next.findIndex((item) => item.id === job.id);
      if (index >= 0) next[index] = { ...next[index], ...job };
      else next.unshift(job);
      return next.slice(0, 12);
    });
  }
  async function refreshOperationalQueues(options = {}) {
    const { forceAll = false } = options;
    const shouldLoadQueues = forceAll || OPERATIONAL_VIEWS.has(view);
    const shouldLoadCoverage = forceAll || COVERAGE_VIEWS.has(view);
    const calls = [loadOverview()];
    if (shouldLoadCoverage) calls.push(loadCoverage(covPage));
    if (shouldLoadQueues) {
      calls.push(
        loadQueue("sem_movimentacoes", setWithoutMovements, wmPage),
        loadQueue("movimentacoes_pendentes", setMovementBacklog, movPage),
        loadQueue("publicacoes_pendentes", setPublicationBacklog, pubPage),
        loadQueue("partes_sem_contato", setPartesBacklog, partesPage),
        loadQueue("audiencias_pendentes", setAudienciaCandidates, audPage),
        loadQueue("monitoramento_ativo", setMonitoringActive, maPage),
        loadQueue("monitoramento_inativo", setMonitoringInactive, miPage),
        loadQueue("campos_orfaos", setFieldGaps, fgPage),
        loadOrphans(orphanPage),
      );
    }
    await Promise.all(calls);
  }
  function buildRefreshPlan(action, payload = {}) {
    const intent = String(payload.intent || "").trim();
    const queues = new Set();
    let coverage = false;
    let orphans = false;
    if (action === "push_orfaos") {
      orphans = true;
    } else if (action === "repair_freshsales_accounts") {
      queues.add(QUEUE_REFRESHERS.campos_orfaos);
    } else if (action === "sync_supabase_crm") {
      coverage = true;
      queues.add(QUEUE_REFRESHERS.movimentacoes_pendentes);
      queues.add(QUEUE_REFRESHERS.publicacoes_pendentes);
      queues.add(QUEUE_REFRESHERS.partes_sem_contato);
      queues.add(QUEUE_REFRESHERS.campos_orfaos);
    } else if (action === "sincronizar_movimentacoes_activity") {
      queues.add(QUEUE_REFRESHERS.movimentacoes_pendentes);
    } else if (action === "sincronizar_publicacoes_activity") {
      queues.add(QUEUE_REFRESHERS.publicacoes_pendentes);
    } else if (action === "reconciliar_partes_contatos") {
      queues.add(QUEUE_REFRESHERS.partes_sem_contato);
    } else if (action === "backfill_audiencias") {
      queues.add(QUEUE_REFRESHERS.audiencias_pendentes);
    } else if (action === "monitoramento_status") {
      queues.add(QUEUE_REFRESHERS.monitoramento_ativo);
      queues.add(QUEUE_REFRESHERS.monitoramento_inativo);
    } else if (action === "enriquecer_datajud") {
      if (intent === "sincronizar_monitorados") {
        queues.add(QUEUE_REFRESHERS.monitoramento_ativo);
        queues.add(QUEUE_REFRESHERS.monitoramento_inativo);
      } else if (intent === "reenriquecer_gaps") {
        queues.add(QUEUE_REFRESHERS.campos_orfaos);
      } else {
        queues.add(QUEUE_REFRESHERS.sem_movimentacoes);
        queues.add(QUEUE_REFRESHERS.movimentacoes_pendentes);
      }
    }
    return {
      queues: [...queues],
      coverage,
      orphans,
    };
  }
  async function refreshAfterAction(action, payload = {}) {
    const plan = buildRefreshPlan(action, payload);
    const calls = [loadOverview()];
    if (plan.coverage) calls.push(loadCoverage(covPage));
    if (plan.orphans) calls.push(loadOrphans(orphanPage));
    if (plan.queues.length) {
      plan.queues.forEach((queue) => {
        if (queue === QUEUE_REFRESHERS.sem_movimentacoes) calls.push(loadQueue("sem_movimentacoes", setWithoutMovements, wmPage));
        if (queue === QUEUE_REFRESHERS.movimentacoes_pendentes) calls.push(loadQueue("movimentacoes_pendentes", setMovementBacklog, movPage));
        if (queue === QUEUE_REFRESHERS.publicacoes_pendentes) calls.push(loadQueue("publicacoes_pendentes", setPublicationBacklog, pubPage));
        if (queue === QUEUE_REFRESHERS.partes_sem_contato) calls.push(loadQueue("partes_sem_contato", setPartesBacklog, partesPage));
        if (queue === QUEUE_REFRESHERS.audiencias_pendentes) calls.push(loadQueue("audiencias_pendentes", setAudienciaCandidates, audPage));
        if (queue === QUEUE_REFRESHERS.monitoramento_ativo) calls.push(loadQueue("monitoramento_ativo", setMonitoringActive, maPage));
        if (queue === QUEUE_REFRESHERS.monitoramento_inativo) calls.push(loadQueue("monitoramento_inativo", setMonitoringInactive, miPage));
        if (queue === QUEUE_REFRESHERS.campos_orfaos) calls.push(loadQueue("campos_orfaos", setFieldGaps, fgPage));
      });
    }
    await Promise.all([...calls, loadRemoteHistory(), loadJobs()]);
  }
  async function refreshOperationalContext(options = {}) {
    await Promise.all([
      refreshOperationalQueues(options),
      loadRemoteHistory(),
      loadJobs(),
    ]);
  }
  function toggleSelection(setter, current, key) { setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]); }
  function togglePageSelection(setter, current, rows, nextState) { const keys = rows.map((item) => getProcessSelectionValue(item)).filter(Boolean); if (nextState) { setter([...new Set([...current, ...keys])]); return; } setter(current.filter((item) => !keys.includes(item))); }
  function getSelectedNumbers(rows, selected) {
    const visible = rows.map((item) => getProcessSelectionValue(item)).filter(Boolean);
    const selectedSet = new Set(selected.map((item) => String(item || "").trim()).filter(Boolean));
    return [...new Set([...visible.filter((item) => selectedSet.has(item)), ...selectedSet])];
  }
  function getCombinedSelectedNumbers() {
    return [...new Set([
      ...selectedWithoutMovements,
      ...selectedMovementBacklog,
      ...selectedPublicationBacklog,
      ...selectedPartesBacklog,
      ...selectedAudienciaCandidates,
      ...selectedMonitoringActive,
      ...selectedMonitoringInactive,
      ...selectedFieldGaps,
      ...selectedOrphans,
    ])];
  }
  function resolveActionProcessNumbers(preferredNumbers = "") {
    const explicit = String(preferredNumbers || "").trim();
    if (explicit) return explicit;
    return String(processNumbers || "").trim();
  }
  function getQueueBatchSize(queueKey) {
    const requested = Number(queueBatchSizes?.[queueKey] || DEFAULT_QUEUE_BATCHES[queueKey] || 1);
    return Math.max(1, Math.min(requested, 30));
  }
  function updateQueueBatchSize(queueKey, rawValue) {
    const nextValue = Math.max(1, Math.min(Number(rawValue || 1), 30));
    setQueueBatchSizes((current) => ({ ...current, [queueKey]: nextValue }));
  }
  function runQueueAction(action, queueKey, payload = {}) {
    handleAction(action, { ...payload, limit: getQueueBatchSize(queueKey) });
  }
  const recurringProcesses = deriveRecurringProcessEntries(remoteHistory);
  const recurringProcessSummary = summarizeRecurringProcessEntries(recurringProcesses);
  const recurringProcessBands = summarizeRecurrenceBands(recurringProcesses);
  const recurringProcessGroups = groupRecurringProcessEntries(recurringProcesses);
  const recurringProcessFocus = deriveRecurringProcessFocus(recurringProcessSummary, recurringProcessBands);
  const recurringProcessBatch = deriveSuggestedProcessBatch(recurringProcessSummary, recurringProcessBands);
  const recurringProcessActions = deriveSuggestedProcessActions(recurringProcessSummary, recurringProcessBands);
  const recurringProcessChecklist = deriveSuggestedProcessChecklist(recurringProcessSummary, recurringProcessBands);
  function selectVisibleRecurringProcesses() {
    const recurringKeys = new Set(recurringProcesses.map((item) => item.key));
    setSelectedWithoutMovements(withoutMovements.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMovementBacklog(movementBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedPublicationBacklog(publicationBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedPartesBacklog(partesBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedAudienciaCandidates(audienciaCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMonitoringActive(monitoringActive.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMonitoringInactive(monitoringInactive.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedFieldGaps(fieldGaps.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedOrphans(orphans.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    updateView("filas");
  }
  function selectVisibleSevereRecurringProcesses() {
    const recurringKeys = new Set(recurringProcesses.filter((item) => item.hits >= 3).map((item) => item.key));
    setSelectedWithoutMovements(withoutMovements.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMovementBacklog(movementBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedPublicationBacklog(publicationBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedPartesBacklog(partesBacklog.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedAudienciaCandidates(audienciaCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMonitoringActive(monitoringActive.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedMonitoringInactive(monitoringInactive.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedFieldGaps(fieldGaps.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    setSelectedOrphans(orphans.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getProcessSelectionValue(item)));
    updateView("filas");
  }
  function applySevereRecurringPreset() {
    setLimit(recurringProcessBatch.size);
    selectVisibleSevereRecurringProcesses();
  }
  function clearAllQueueSelections() {
    setSelectedWithoutMovements([]);
    setSelectedMovementBacklog([]);
    setSelectedPublicationBacklog([]);
    setSelectedPartesBacklog([]);
    setSelectedAudienciaCandidates([]);
    setSelectedMonitoringActive([]);
    setSelectedMonitoringInactive([]);
    setSelectedFieldGaps([]);
    setSelectedOrphans([]);
  }
  function toggleCustomSelection(setter, current, key) {
    setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }
  function toggleCustomPageSelection(setter, current, rows, getValue) {
    const keys = rows.map((item) => getValue(item)).filter(Boolean);
    const allSelected = keys.length > 0 && keys.every((key) => current.includes(key));
    if (allSelected) {
      setter(current.filter((item) => !keys.includes(item)));
      return;
    }
    setter([...new Set([...current, ...keys])]);
  }
  async function toggleAllMatchingRelations() {
    if (allMatchingRelationsSelected) {
      setSelectedRelations([]);
      setAllMatchingRelationsSelected(false);
      return;
    }
    setRelationSelectionLoading(true);
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=relacoes&selection=1&page=1&pageSize=500&query=${encodeURIComponent(search || "")}`);
      setSelectedRelations((payload.data.items || []).map((item) => item.selection_key).filter(Boolean));
      setAllMatchingRelationsSelected(true);
    } finally {
      setRelationSelectionLoading(false);
    }
  }
  async function toggleAllMatchingSuggestions() {
    if (allMatchingSuggestionsSelected) {
      setSelectedSuggestionKeys([]);
      setAllMatchingSuggestionsSelected(false);
      return;
    }
    setSuggestionSelectionLoading(true);
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=sugestoes_relacoes&selection=1&page=1&pageSize=500&query=${encodeURIComponent(search || "")}&minScore=${encodeURIComponent(relationMinScore || "0.45")}`);
      setSelectedSuggestionKeys((payload.data.items || []).map((item) => item.suggestion_key).filter(Boolean));
      setAllMatchingSuggestionsSelected(true);
    } finally {
      setSuggestionSelectionLoading(false);
    }
  }
  async function loadSelectedRelationItems() {
    const needRemote = allMatchingRelationsSelected || selectedRelations.length > relations.items.length;
    if (!needRemote) {
      return relations.items.filter((item) => selectedRelations.includes(getRelationSelectionValue(item)));
    }
    const payload = await adminFetch(`/api/admin-hmadv-processos?action=relacoes&page=1&pageSize=500&query=${encodeURIComponent(search || "")}`);
    return (payload.data.items || []).filter((item) => selectedRelations.includes(getRelationSelectionValue(item)));
  }
  async function loadSelectedSuggestionItems() {
    const needRemote = allMatchingSuggestionsSelected || selectedSuggestionKeys.length > relationSuggestions.items.length;
    if (!needRemote) {
      return relationSuggestions.items.filter((item) => selectedSuggestionKeys.includes(getSuggestionSelectionValue(item)));
    }
    const payload = await adminFetch(`/api/admin-hmadv-processos?action=sugestoes_relacoes&page=1&pageSize=500&query=${encodeURIComponent(search || "")}&minScore=${encodeURIComponent(relationMinScore || "0.45")}`);
    return (payload.data.items || []).filter((item) => selectedSuggestionKeys.includes(getSuggestionSelectionValue(item)));
  }
  function useCoverageProcess(number) {
    if (!number) return;
    const next = uniqueProcessNumbers([...getCombinedSelectedNumbers(), String(number || "").trim()]);
    setProcessNumbers(next.join("\n"));
    updateView("operacao");
  }
  function updateView(nextView, nextHash = nextView) {
    setView(nextView);
    setLastFocusHash(nextHash || nextView);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    url.hash = nextHash || nextView;
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }
  function buildActionMeta(payload = {}) {
    const explicitNumbers = String(payload.processNumbers || "").trim();
    const fallbackNumbers = String(processNumbers || "").trim();
    const effectiveNumbers = parseProcessNumbers(explicitNumbers || fallbackNumbers);
    const intentLabel = getProcessIntentBadge(payload);
    const action = String(payload.action || "");
    const safeLimit = action ? getSafeProcessActionLimit(action, payload.limit ?? limit) : Number(limit || 10);
    return {
      limit: safeLimit,
      selectedCount: effectiveNumbers.length || getCombinedSelectedNumbers().length,
      processNumbersPreview: effectiveNumbers.slice(0, 6).join(", "),
      intentLabel,
    };
  }
  function pushHistoryEntry(entry) {
    setExecutionHistory((current) => {
      const next = [entry, ...current].slice(0, 40);
      persistHistoryEntries(next);
      return next;
    });
  }
  function replaceHistoryEntry(id, patch) {
    setExecutionHistory((current) => {
      const next = current.map((item) => item.id === id ? { ...item, ...patch } : item);
      persistHistoryEntries(next);
      return next;
    });
  }
  async function queueAsyncAction(action, payload = {}) {
    const safeLimit = getSafeProcessActionLimit(action, payload.limit ?? limit);
    const response = await adminFetch("/api/admin-hmadv-processos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_job",
        jobAction: action,
        limit: safeLimit,
        processNumbers: payload.processNumbers || processNumbers,
        ...payload,
      }),
    });
    if (response.data?.legacy_inline) {
      setActionState({ loading: false, error: null, result: response.data.result });
      setActiveJobId(null);
      await Promise.all([
        refreshOperationalContext(),
      ]);
      return response.data;
    }
      const job = response.data;
      setActionState({ loading: false, error: null, result: { job } });
      setActiveJobId(job?.id || null);
      mergeJobIntoState(job);
      await loadRemoteHistory();
      return job;
    }
  async function runPendingJobsNow() {
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "run_pending_jobs", id: activeJobId, maxChunks: 1 }),
        }, { timeoutMs: 120000, maxRetries: 0 });
        const result = payload.data || {};
        mergeJobIntoState(result.job || null);
        setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result } : { drain: result } });
        setActiveJobId(result.completedAll ? null : (result.job?.id || null));
        if (result.completedAll || !result.job?.id || ["completed", "error", "cancelled"].includes(String(result.job?.status || ""))) {
          if (result.job?.acao) {
            await refreshAfterAction(result.job.acao, result.job.payload || {});
          } else {
            await refreshOperationalContext();
          }
        } else {
          await loadRemoteHistory();
        }
      } catch (error) {
        setActionState({ loading: false, error: error.message || "Falha ao drenar fila.", result: null });
      }
  }
  async function handleAction(action, payload = {}) {
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    const historyId = `${action}:${Date.now()}`;
  const safeLimit = getSafeProcessActionLimit(action, payload.limit ?? limit);
  const normalizedLimit = Math.min(
    safeLimit,
    action === "sincronizar_movimentacoes_activity"
      ? MODULE_LIMITS.maxMovementBatch
      : action === "sincronizar_publicacoes_activity"
        ? MODULE_LIMITS.maxPublicationBatch
        : action === "reconciliar_partes_contatos"
          ? MODULE_LIMITS.maxPartesBatch
          : action === "backfill_audiencias"
            ? MODULE_LIMITS.maxAudienciasBatch
            : MODULE_LIMITS.maxProcessBatch
  );
  const normalizedPayload = {
    ...payload,
    action,
    limit: normalizedLimit,
    processNumbers: payload.processNumbers || processNumbers,
  };
    pushHistoryEntry({
      id: historyId,
      action,
      label: getProcessActionLabel(action, normalizedPayload),
      status: "running",
      createdAt: new Date().toISOString(),
      preview: "Execucao iniciada",
      meta: buildActionMeta(normalizedPayload),
      payload: {
        action,
        limit: safeLimit,
        processNumbers: payload.processNumbers || processNumbers,
        intent: payload.intent || "",
      },
    });
    try {
      if (action === "executar_integracao_total_hmadv") {
        const response = await adminFetch("/api/admin-hmadv-processos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            scanLimit: 100,
            monitorLimit: 100,
            movementLimit: 120,
            advisePages: 2,
            advisePerPage: 50,
            publicacoesBatch: 20,
            maxChunks: 2,
          }),
        });
        setActionState({ loading: false, error: null, result: response.data });
        replaceHistoryEntry(historyId, {
          status: "success",
          preview: buildHistoryPreview(response.data),
          result: response.data,
        });
        await Promise.all([loadRunnerMetrics(), loadSchemaStatus(), loadRemoteHistory(), loadJobs()]);
        return;
      }
      if (ASYNC_PROCESS_ACTIONS.has(action)) {
        const job = await queueAsyncAction(action, normalizedPayload);
        replaceHistoryEntry(historyId, {
          status: "success",
          preview: job?.legacy_inline
            ? `Fallback inline: ${buildHistoryPreview(job.result)}`
            : `Job criado: ${buildJobPreview(job)}`,
          result: job?.legacy_inline ? job.result : { job },
        });
        return;
      }
      const response = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, limit: safeLimit, processNumbers: payload.processNumbers || processNumbers, ...normalizedPayload }) });
      setActionState({ loading: false, error: null, result: response.data });
      replaceHistoryEntry(historyId, {
        status: "success",
        preview: buildHistoryPreview(response.data),
        result: response.data,
      });
      if (action === "executar_integracao_completa") {
        await refreshOperationalContext({ forceAll: true });
      } else {
        await refreshAfterAction(action, normalizedPayload);
      }
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao executar acao.", result: null });
      replaceHistoryEntry(historyId, {
        status: "error",
        preview: error.message || "Falha ao executar acao.",
        error: error.message || "Falha ao executar acao.",
      });
    }
  }
  async function handleSaveRelation() {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "salvar_relacao", id: editingRelationId, ...form }) });
      setActionState({ loading: false, error: null, result: payload.data }); setForm(EMPTY_FORM); setEditingRelationId(null); await Promise.all([loadRelations(relations.page, search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) { setActionState({ loading: false, error: error.message || "Falha ao salvar relacao.", result: null }); }
  }
  async function handleDeleteRelation(id) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remover_relacao", id }) });
      setActionState({ loading: false, error: null, result: payload.data }); await Promise.all([loadRelations(relations.page, search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) { setActionState({ loading: false, error: error.message || "Falha ao remover relacao.", result: null }); }
  }
  async function handleBulkRelationStatus(nextStatus) {
    if (!selectedRelations.length) return;
    setActionState({ loading: true, error: null, result: null });
    try {
      const relationIds = (await loadSelectedRelationItems())
        .map((item) => item.id)
        .filter(Boolean);
      const payload = await adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_relacoes", ids: relationIds, status: nextStatus }),
      });
      setActionState({ loading: false, error: null, result: payload.data });
      await Promise.all([loadRelations(relations.page, search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha na atualizacao em massa.", result: null });
    }
  }
  async function handleBulkRelationRemoval() {
    if (!selectedRelations.length) return;
    setActionState({ loading: true, error: null, result: null });
    try {
      const relationIds = (await loadSelectedRelationItems())
        .map((item) => item.id)
        .filter(Boolean);
      const payload = await adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_relacoes", ids: relationIds, remove: true }),
      });
      setActionState({ loading: false, error: null, result: payload.data });
      setSelectedRelations([]);
      await Promise.all([loadRelations(Math.max(1, relations.page), search), loadRelationSuggestions(relationSuggestions.page, search, relationMinScore)]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha na remocao em massa.", result: null });
    }
  }
  function useSuggestionInForm(item) {
    setForm({
      numero_cnj_pai: item.numero_cnj_pai || "",
      numero_cnj_filho: item.numero_cnj_filho || "",
      tipo_relacao: item.tipo_relacao || "dependencia",
      status: item.status || "ativo",
      observacoes: item.evidence?.trecho ? `Sugerido a partir de publicacao: ${item.evidence.trecho}` : "",
    });
  }
  async function handleBulkSaveSuggestions() {
    if (!selectedSuggestionKeys.length) return;
    setActionState({ loading: true, error: null, result: null });
    try {
      const items = (await loadSelectedSuggestionItems())
        .map((item) => ({
          numero_cnj_pai: item.numero_cnj_pai,
          numero_cnj_filho: item.numero_cnj_filho,
          tipo_relacao: item.tipo_relacao,
          status: item.status || "ativo",
          score: item.score,
          observacoes: item.evidence?.trecho ? `Sugestao validada em massa. Evidencia: ${item.evidence.trecho}` : "",
        }));
      const payload = await adminFetch("/api/admin-hmadv-processos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk_salvar_relacoes", items }),
      });
      setActionState({ loading: false, error: null, result: payload.data });
      setSelectedSuggestionKeys([]);
      await Promise.all([
        loadRelations(1, search),
        loadRelationSuggestions(relationSuggestions.page, search, relationMinScore),
      ]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao validar sugestoes em massa.", result: null });
    }
  }
  useEffect(() => {
    if (!uiHydrated) return;
    if (!COVERAGE_VIEWS.has(view)) return;
    loadCoverage(covPage);
  }, [covPage, view, uiHydrated]);
  function startEditing(item) { setEditingRelationId(item.id); setForm({ numero_cnj_pai: item.numero_cnj_pai || "", numero_cnj_filho: item.numero_cnj_filho || "", tipo_relacao: item.tipo_relacao || "dependencia", status: item.status || "ativo", observacoes: item.observacoes || "" }); }
  function reuseHistoryEntry(entry) {
    if (entry?.payload?.processNumbers) setProcessNumbers(entry.payload.processNumbers);
    if (entry?.payload?.limit) {
      const safeLimit = getSafeProcessActionLimit(entry?.action || entry?.payload?.action || "", entry.payload.limit);
      setLimit(Number(safeLimit) || 10);
    }
    updateView("operacao");
  }
  function clearHistory() {
    setExecutionHistory([]);
    persistHistoryEntries([]);
  }

  const data = overview.data || {};
  const quickStats = useMemo(() => [{ label: "Processos totais", value: data.processosTotal || 0, helper: "Carteira persistida no HMADV." }, { label: "Com account", value: data.processosComAccount || 0, helper: "Sales Accounts ja vinculadas." }, { label: "Sem account", value: data.processosSemAccount || 0, helper: "Processos orfaos." }, { label: "Backlog do worker", value: data.workerVisibleTotal || 0, helper: data.syncWorkerScopeNote || "Pendencias que o sync-worker realmente consegue drenar no escopo atual." }, { label: "Gap estrutural", value: data.structuralGapTotal || 0, helper: "Pendencias fora do escopo direto do sync-worker: campos, polos, contatos e cobertura." }, { label: "Sem movimentacoes", value: data.processosSemMovimentacao || 0, helper: "Fila de reconsulta DataJud; nao some so com o sync-worker." }, { label: "Movimentacoes pendentes", value: movementBacklog.totalRows || data.movimentacoesPendentes || 0, helper: "Andamentos ainda sem activity no Freshsales." }, { label: "Publicacoes pendentes", value: publicationBacklog.totalRows || data.publicacoesPendentes || 0, helper: "Publicacoes ainda sem activity no Freshsales." }, { label: "Partes sem contato", value: partesBacklog.totalRows || data.partesSemContato || 0, helper: "Processos com partes ainda sem contato vinculado." }, { label: "Campos orfaos", value: fieldGaps.totalRows || data.camposOrfaos || 0, helper: "Processos com lacunas estruturais ou gap de CRM." }, { label: "Cobertura auditada", value: processCoverage.totalRows || 0, helper: "Processos com leitura consolidada de cobertura nesta consulta." }, { label: "Audiencias detectaveis", value: audienciaCandidates.totalRows || 0, helper: "Processos com audiencia pendente nas publicacoes." }, { label: "Audiencias no banco", value: data.audienciasTotal || 0, helper: "Persistidas em judiciario.audiencias." }], [data, movementBacklog.totalRows, publicationBacklog.totalRows, partesBacklog.totalRows, fieldGaps.totalRows, processCoverage.totalRows, audienciaCandidates.totalRows]);
  const relationTypeSummary = useMemo(() => relations.items.reduce((acc, item) => { acc[item.tipo_relacao] = (acc[item.tipo_relacao] || 0) + 1; return acc; }, {}), [relations.items]);
  const latestHistory = executionHistory[0] || null;
  const latestRemoteRun = remoteHistory[0] || null;
  const latestJob = jobs[0] || null;
  const remoteHealth = deriveRemoteHealth(remoteHistory);
  const monitoringUnsupported = Boolean(monitoringActive.unsupported || monitoringInactive.unsupported);
  const primaryProcessAction = derivePrimaryProcessAction(recurringProcessActions);
  const combinedSelectedNumbers = getCombinedSelectedNumbers();
  const selectedSummary = combinedSelectedNumbers.length;
  const visibleRecurringCount = [...withoutMovements.items, ...movementBacklog.items, ...publicationBacklog.items, ...partesBacklog.items, ...audienciaCandidates.items, ...monitoringActive.items, ...monitoringInactive.items, ...fieldGaps.items, ...orphans.items]
    .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index)
    .filter((item) => recurringProcesses.some((recurring) => recurring.key === (item.numero_cnj || item.key))).length;
  const visibleSevereRecurringCount = [...withoutMovements.items, ...movementBacklog.items, ...publicationBacklog.items, ...partesBacklog.items, ...audienciaCandidates.items, ...monitoringActive.items, ...monitoringInactive.items, ...fieldGaps.items, ...orphans.items]
    .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index)
    .filter((item) => recurringProcesses.some((recurring) => recurring.key === (item.numero_cnj || item.key) && recurring.hits >= 3)).length;
  const selectedVisibleSevereRecurringCount = [...withoutMovements.items, ...movementBacklog.items, ...publicationBacklog.items, ...partesBacklog.items, ...audienciaCandidates.items, ...monitoringActive.items, ...monitoringInactive.items, ...fieldGaps.items, ...orphans.items]
    .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index)
    .filter((item) => recurringProcesses.some((recurring) => recurring.key === (item.numero_cnj || item.key) && recurring.hits >= 3))
    .filter((item) => combinedSelectedNumbers.includes(item.numero_cnj))
    .length;
  const priorityBatchReady = visibleSevereRecurringCount > 0 && selectedVisibleSevereRecurringCount >= visibleSevereRecurringCount && limit === recurringProcessBatch.size;
  const selectionActionHint = deriveSelectionActionHint({
    selectedWithoutMovements,
    selectedMovementBacklog,
    selectedPublicationBacklog,
    selectedPartesBacklog,
    selectedAudienciaCandidates,
    selectedMonitoringActive,
    selectedMonitoringInactive,
    selectedFieldGaps,
    selectedOrphans,
    monitoringUnsupported,
  });
  const selectionSuggestedAction = buildSelectionSuggestedAction({
    selectedWithoutMovements,
    selectedMovementBacklog,
    selectedPublicationBacklog,
    selectedPartesBacklog,
    selectedAudienciaCandidates,
    selectedMonitoringActive,
    selectedMonitoringInactive,
    selectedFieldGaps,
    selectedOrphans,
    monitoringUnsupported,
    withoutMovements: withoutMovements.items,
    movementBacklog: movementBacklog.items,
    publicationBacklog: publicationBacklog.items,
    partesBacklog: partesBacklog.items,
    audienciaCandidates: audienciaCandidates.items,
    monitoringActive: monitoringActive.items,
    monitoringInactive: monitoringInactive.items,
    fieldGaps: fieldGaps.items,
    orphans: orphans.items,
    resolveActionProcessNumbers,
    getSelectedNumbers,
    limit,
  });
  const operationalPlan = Array.isArray(data?.operationalPlan) ? data.operationalPlan : [];
  function getOperationalPlanStepState(step, index) {
    const latestAction = String(latestHistory?.action || "");
    const stepAction = String(step?.actionKey || "");
    if (actionState.loading && latestAction && latestAction === stepAction) {
      return { label: "em andamento", tone: "warning" };
    }
    if (latestHistory?.status === "success" && latestAction && latestAction === stepAction) {
      return { label: "concluido", tone: "success" };
    }
    if (latestHistory?.status === "error" && latestAction && latestAction === stepAction) {
      return { label: "falhou", tone: "danger" };
    }
    if (index === 0) {
      return { label: "agora", tone: "default" };
    }
    return { label: "proximo", tone: "default" };
  }
  function runOperationalPlanStep(step) {
    if (!step) return;
    updateView(step.targetView || "filas", step.targetHash || "filas");
  }
  const isSuggestedAction = (action, intent = "") => {
    if (!selectionSuggestedAction) return false;
    return selectionSuggestedAction.key === action && String(selectionSuggestedAction.intent || "") === String(intent || "");
  };
  const queueActionConfigs = useMemo(() => ({
    sem_movimentacoes: {
      batchSize: getQueueBatchSize("sem_movimentacoes"),
      selectionCount: selectedWithoutMovements.length,
      helper: "Aplica o lote apenas sobre os processos selecionados nesta fila.",
      actions: [
        {
          label: "Buscar movimentacoes",
          tone: isSuggestedAction("enriquecer_datajud", "buscar_movimentacoes") ? "primary" : "subtle",
          onClick: () => runQueueAction("enriquecer_datajud", "sem_movimentacoes", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(withoutMovements.items, selectedWithoutMovements).join("\n")),
            intent: "buscar_movimentacoes",
            action: "enriquecer_datajud",
          }),
        },
      ],
    },
    movimentacoes_pendentes: {
      batchSize: getQueueBatchSize("movimentacoes_pendentes"),
      selectionCount: selectedMovementBacklog.length,
      helper: "Use o lote da fila para refletir apenas os andamentos selecionados no Freshsales.",
      actions: [
        {
          label: "Sincronizar movimentacoes",
          tone: isSuggestedAction("sincronizar_movimentacoes_activity") ? "primary" : "subtle",
          onClick: () => runQueueAction("sincronizar_movimentacoes_activity", "movimentacoes_pendentes", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(movementBacklog.items, selectedMovementBacklog).join("\n")),
          }),
        },
      ],
    },
    publicacoes_pendentes: {
      batchSize: getQueueBatchSize("publicacoes_pendentes"),
      selectionCount: selectedPublicationBacklog.length,
      helper: "Dispare o lote local para publicar apenas o recorte desta fila.",
      actions: [
        {
          label: "Sincronizar publicacoes",
          tone: isSuggestedAction("sincronizar_publicacoes_activity") ? "primary" : "subtle",
          onClick: () => runQueueAction("sincronizar_publicacoes_activity", "publicacoes_pendentes", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(publicationBacklog.items, selectedPublicationBacklog).join("\n")),
          }),
        },
      ],
    },
    partes_sem_contato: {
      batchSize: getQueueBatchSize("partes_sem_contato"),
      selectionCount: selectedPartesBacklog.length,
      helper: "O lote atua apenas nas partes dos processos marcados nesta fila.",
      actions: [
        {
          label: "Reconciliar partes",
          tone: isSuggestedAction("reconciliar_partes_contatos") ? "primary" : "subtle",
          onClick: () => runQueueAction("reconciliar_partes_contatos", "partes_sem_contato", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(partesBacklog.items, selectedPartesBacklog).join("\n")),
          }),
        },
      ],
    },
    audiencias_pendentes: {
      batchSize: getQueueBatchSize("audiencias_pendentes"),
      selectionCount: selectedAudienciaCandidates.length,
      helper: "Retroage audiencias somente para os processos escolhidos nesta fila.",
      actions: [
        {
          label: "Retroagir audiencias",
          tone: isSuggestedAction("backfill_audiencias") ? "primary" : "subtle",
          onClick: () => runQueueAction("backfill_audiencias", "audiencias_pendentes", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(audienciaCandidates.items, selectedAudienciaCandidates).join("\n")),
            apply: true,
          }),
        },
      ],
    },
    monitoramento_ativo: {
      batchSize: getQueueBatchSize("monitoramento_ativo"),
      selectionCount: selectedMonitoringActive.length,
      helper: monitoringUnsupported ? "Fila somente leitura: mostra o backlog que depende da coluna monitoramento_ativo no HMADV." : "Escolha um lote local para sincronizar ou desligar o monitoramento do recorte atual.",
      actions: monitoringUnsupported ? [] : [
        {
          label: "Sincronizar monitorados",
          tone: isSuggestedAction("enriquecer_datajud", "sincronizar_monitorados") ? "primary" : "subtle",
          onClick: () => runQueueAction("enriquecer_datajud", "monitoramento_ativo", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n")),
            intent: "sincronizar_monitorados",
            action: "enriquecer_datajud",
          }),
        },
        {
          label: "Desativar monitoramento",
          onClick: () => runQueueAction("monitoramento_status", "monitoramento_ativo", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n")),
            active: false,
          }),
        },
      ],
    },
    monitoramento_inativo: {
      batchSize: getQueueBatchSize("monitoramento_inativo"),
      selectionCount: selectedMonitoringInactive.length,
      helper: monitoringUnsupported ? "Fila somente leitura: o painel mostra apenas o que precisa de adequacao de schema." : "Reative em lote apenas os processos selecionados nesta fila.",
      actions: monitoringUnsupported ? [] : [
        {
          label: "Ativar monitoramento",
          tone: "primary",
          onClick: () => runQueueAction("monitoramento_status", "monitoramento_inativo", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringInactive.items, selectedMonitoringInactive).join("\n")),
            active: true,
          }),
        },
      ],
    },
    campos_orfaos: {
      batchSize: getQueueBatchSize("campos_orfaos"),
      selectionCount: selectedFieldGaps.length,
      helper: "Combine reparo de CRM e reenriquecimento apenas para os gaps marcados nesta fila.",
      actions: [
        {
          label: "Corrigir CRM",
          tone: isSuggestedAction("repair_freshsales_accounts") ? "primary" : "subtle",
          onClick: () => runQueueAction("repair_freshsales_accounts", "campos_orfaos", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n")),
          }),
        },
        {
          label: "Reenriquecer gaps",
          onClick: () => runQueueAction("enriquecer_datajud", "campos_orfaos", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n")),
            intent: "reenriquecer_gaps",
            action: "enriquecer_datajud",
          }),
        },
      ],
    },
    orfaos: {
      batchSize: getQueueBatchSize("orfaos"),
      selectionCount: selectedOrphans.length,
      helper: "Cria Sales Accounts apenas para os processos escolhidos nesta fila.",
      actions: [
        {
          label: "Criar accounts",
          tone: isSuggestedAction("push_orfaos") ? "primary" : "subtle",
          onClick: () => runQueueAction("push_orfaos", "orfaos", {
            processNumbers: resolveActionProcessNumbers(getSelectedNumbers(orphans.items, selectedOrphans).join("\n")),
          }),
        },
      ],
    },
  }), [selectedWithoutMovements, selectedMovementBacklog, selectedPublicationBacklog, selectedPartesBacklog, selectedAudienciaCandidates, selectedMonitoringActive, selectedMonitoringInactive, selectedFieldGaps, selectedOrphans, monitoringUnsupported, withoutMovements.items, movementBacklog.items, publicationBacklog.items, partesBacklog.items, audienciaCandidates.items, monitoringActive.items, monitoringInactive.items, fieldGaps.items, orphans.items, queueBatchSizes, selectionSuggestedAction, processNumbers]);
  const coverageSchemaExists = schemaStatus?.data?.exists;
  const coverageSchemaLabel = schemaStatus.loading
    ? "verificando schema"
    : coverageSchemaExists
      ? "schema de cobertura ok"
      : "schema de cobertura ausente";
  const runnerData = runnerMetrics?.data || {};
  const runnerCoverage = runnerData.coverage || {};
  const runnerDatajud = runnerData.datajud || {};
  const runnerTagged = runnerData.tagged || {};
  const runnerAction = runnerData.datajudAction || {};
  const trackedQueues = [withoutMovements, movementBacklog, publicationBacklog, partesBacklog, audienciaCandidates, monitoringActive, monitoringInactive, fieldGaps, orphans];
  const trackedQueueErrorCount = countQueueErrors(trackedQueues);
  const trackedQueueMismatchCount = countQueueReadMismatches(trackedQueues);
  const hasPendingJobs = jobs.some((item) => ["pending", "running"].includes(String(item.status || "")));
  const backendRecommendedAction = data?.recommendedNextAction || null;
  const workerStoppedWithoutProgress = String(data?.syncWorker?.worker?.ultimo_lote?.motivo || data?.syncWorker?.ultimo_lote?.motivo || "") === "sem_prog";
  const workerStructuralSuggestion = workerStoppedWithoutProgress && Number(data?.structuralGapTotal || 0) > 0
    ? Number(data?.partesSemContato || 0) > 0
      ? { key: "structural_partes", label: "Abrir partes sem contato", onClick: () => updateView("filas", "processos-partes-sem-contato") }
      : Number(data?.camposOrfaos || 0) > 0 || Number(data?.processosSemPolos || 0) > 0 || Number(data?.processosSemStatus || 0) > 0
        ? { key: "structural_gaps", label: "Abrir campos orfaos", onClick: () => updateView("filas", "processos-campos-orfaos") }
        : Number(data?.processosSemMovimentacao || 0) > 0
          ? { key: "structural_movs", label: "Buscar movimentacoes", onClick: () => updateView("filas", "processos-sem-movimentacoes") }
          : { key: "structural_cover", label: "Auditar cobertura", onClick: () => updateView("filas", "processos-cobertura") }
    : null;
  const recommendedHealthAction = backendRecommendedAction?.hash
    ? { key: `backend_${backendRecommendedAction.key || "action"}`, label: backendRecommendedAction.label || "Abrir fila recomendada", onClick: () => updateView("filas", backendRecommendedAction.hash) }
    : workerStructuralSuggestion;
  const healthQueueTarget = publicationBacklog.error || queueHasReadMismatch(publicationBacklog)
    ? { hash: "processos-publicacoes-pendentes", label: "Sincronizar publicacoes", view: "filas" }
    : partesBacklog.error || queueHasReadMismatch(partesBacklog)
      ? { hash: "processos-partes-sem-contato", label: "Reconciliar partes", view: "filas" }
      : movementBacklog.error || queueHasReadMismatch(movementBacklog)
        ? { hash: "processos-movimentacoes-pendentes", label: "Sincronizar movimentacoes", view: "filas" }
        : orphans.error || queueHasReadMismatch(orphans)
          ? { hash: "processos-sem-sales-account", label: "Criar accounts", view: "filas" }
          : processCoverage.error || processCoverage.limited || coverageMismatchMessage(processCoverage)
            ? { hash: "processos-cobertura", label: "Auditar cobertura", view: "filas" }
            : { hash: "filas", label: "Abrir filas", view: "filas" };
  const healthSuggestedActions = [];
  if (recommendedHealthAction) {
    healthSuggestedActions.push(recommendedHealthAction);
  }
  if (trackedQueueErrorCount > 0 || trackedQueueMismatchCount > 0) {
    healthSuggestedActions.push({ key: "filas", label: healthQueueTarget.label, onClick: () => updateView(healthQueueTarget.view, healthQueueTarget.hash) });
  }
  if (backendHealth.status === "warning" || backendHealth.status === "error") {
    healthSuggestedActions.push({ key: "resultado", label: "Ver resultado", onClick: () => updateView("resultado", "resultado") });
  }
  if (hasPendingJobs) {
    healthSuggestedActions.push({ key: "drain", label: drainInFlight ? "Drenando..." : "Drenar fila", onClick: runPendingJobsNow, disabled: actionState.loading || drainInFlight });
  }
  if (!healthSuggestedActions.length || (trackedQueueErrorCount === 0 && trackedQueueMismatchCount === 0 && backendHealth.status === "ok" && !hasPendingJobs)) {
    healthSuggestedActions.push({ key: "operacao", label: "Ir para operacao", onClick: () => updateView("operacao", "operacao") });
  }

  const isResultView = view === "resultado";
  const isDockedProcessView = view === "operacao" || view === "resultado";

  return <div className={`${isDockedProcessView ? "flex min-h-full flex-1 flex-col gap-6" : isResultView ? "space-y-6" : "space-y-8"}`.trim()}>
    {copilotContext ? (
      <section className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#35554B] bg-[rgba(12,22,19,0.72)] text-[#C6D1CC]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#7FC4AF]"}`}>Contexto vindo do Copilot</p>
        <p className={`mt-2 font-semibold ${isLightTheme ? "text-[#1f2937]" : "text-[#F5F1E8]"}`}>{copilotContext.conversationTitle || "Conversa ativa"}</p>
        {copilotContext.mission ? <p className={`mt-2 leading-6 ${isLightTheme ? "text-[#6b7280]" : "text-[#9BAEA8]"}`}>{copilotContext.mission}</p> : null}
        {processNumbers ? <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "text-[#7F928C]"}`}>CNJs pré-carregados no campo de foco manual.</p> : null}
      </section>
    ) : null}
    <section className={`rounded-[30px] border px-4 md:px-6 ${isResultView ? "py-4 md:py-5" : "py-5 md:py-6"} ${isLightTheme ? "border-[#d7d4cb] bg-[radial-gradient(circle_at_top_left,rgba(199,155,44,0.12),transparent_35%),linear-gradient(180deg,#fffdf8,#f5f1e8)] text-[#1f2937]" : "border-[#2D2E2E] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_35%),linear-gradient(180deg,rgba(13,15,14,0.98),rgba(8,10,10,0.98))]"}`}>
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.2em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>Centro operacional</p>
          <h3 className="mt-3 font-serif text-4xl leading-tight">Sincronismo de processos, monitoramento e reparo CRM em uma unica trilha.</h3>
          <p className={`mt-3 max-w-2xl text-sm leading-7 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>A tela agora separa operacao, filas, relacoes e resultado em visoes distintas. Isso reduz ruido visual e preserva memoria do que foi executado nesta sessao de trabalho.</p>
        </div>
        <div className={`flex flex-col gap-3 rounded-[26px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.86)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}>
          <div className="flex items-center justify-between gap-4"><span className={isLightTheme ? "text-[#6b7280]" : "opacity-60"}>Selecionados no momento</span><strong className="font-serif text-2xl">{selectedSummary}</strong></div>
          <div className="flex items-center justify-between gap-4"><span className={isLightTheme ? "text-[#6b7280]" : "opacity-60"}>Ultima acao</span><span className={`text-right text-xs uppercase tracking-[0.16em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>{actionState.loading ? "executando" : actionState.error ? "erro" : actionState.result ? "concluida" : "aguardando"}</span></div>
          {latestHistory ? <p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{latestHistory.label}: {latestHistory.preview}</p> : null}
        </div>
      </div>
        <div className={`mt-6 ${isResultView ? "space-y-3" : "space-y-4"}`}>
          <ViewToggle value={view} onChange={updateView} />
          <div className={`rounded-[22px] border p-4 text-sm ${operationalStatus.mode === "error" || backendHealth.status === "error" ? "border-[#4B2222] bg-[rgba(127,29,29,0.12)]" : operationalStatus.mode === "limited" || backendHealth.status === "warning" ? "border-[#6E5630] bg-[rgba(76,57,26,0.16)]" : isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.82)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Barra de saude operacional</p>
                <p className="mt-2">{operationalStatus.message || "Operacao normal"} • {backendHealth.message || "Sem historico recente."}</p>
                <p className={`mt-2 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-70"}`}>Acao sugerida: {healthSuggestedActions[0]?.label || "Ir para operacao"}</p>
                {data.syncWorkerScopeNote ? <p className={`mt-2 text-xs leading-6 ${isLightTheme ? "text-[#6b7280]" : "opacity-70"}`}>{data.syncWorkerScopeNote}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={operationalStatus.mode === "error" ? "danger" : operationalStatus.mode === "limited" ? "warning" : "success"}>{operationalStatus.mode === "error" ? "operacao com alerta" : operationalStatus.mode === "limited" ? "operacao degradada" : "operacao estavel"}</StatusBadge>
                <StatusBadge tone={backendHealth.status === "error" ? "danger" : backendHealth.status === "warning" ? "warning" : "success"}>{backendHealth.status === "error" ? "backend com falha" : backendHealth.status === "warning" ? "backend com ressalva" : "backend saudavel"}</StatusBadge>
                {trackedQueueErrorCount ? <StatusBadge tone="danger">{trackedQueueErrorCount} fila(s) com erro</StatusBadge> : null}
                {trackedQueueMismatchCount ? <StatusBadge tone="warning">{trackedQueueMismatchCount} fila(s) com leitura parcial</StatusBadge> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {healthSuggestedActions.map((action) => <ActionButton key={action.key} className="px-3 py-2 text-xs" onClick={action.onClick} disabled={action.disabled}>{action.label}</ActionButton>)}
            </div>
          </div>
          {!isResultView && operationalPlan.length ? <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.82)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)]"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Plano operacional</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {operationalPlan.map((step, index) => <button key={`${step.title}-${index}`} type="button" onClick={() => runOperationalPlanStep(step)} className={`rounded-[18px] border p-3 text-left hover:border-[#C5A059] ${isLightTheme ? "border-[#d7d4cb] bg-white" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className={`text-[10px] uppercase tracking-[0.16em] ${isLightTheme ? "text-[#9a6d14]" : "text-[#C5A059]"}`}>Passo {index + 1}</p>
                  <StatusBadge tone={getOperationalPlanStepState(step, index).tone}>{getOperationalPlanStepState(step, index).label}</StatusBadge>
                </div>
                <p className="mt-2 font-semibold">{step.title}</p>
                <p className={`mt-2 text-xs ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{step.detail}</p>
              </button>)}
            </div>
          </div> : null}
          <div className={`rounded-[20px] border p-4 text-xs ${operationalStatus.mode === "error" ? (isLightTheme ? "border-[#E7C4C4] bg-[#FFF4F4] text-[#B25E5E]" : "border-[#4B2222] bg-[rgba(127,29,29,0.15)] text-red-200") : operationalStatus.mode === "limited" ? "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#FDE68A]" : isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#9a6d14]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] text-[#C5A059]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="uppercase tracking-[0.18em] text-[10px]">Status operacional</span>
              <span className="text-[10px] uppercase tracking-[0.16em] opacity-70">{operationalStatus.updatedAt ? new Date(operationalStatus.updatedAt).toLocaleTimeString("pt-BR") : ""}</span>
            </div>
            <p className="mt-2">{operationalStatus.message || "Operacao normal"}</p>
          </div>
          <div className={`rounded-[20px] border p-4 text-xs ${backendHealth.status === "error" ? (isLightTheme ? "border-[#E7C4C4] bg-[#FFF4F4] text-[#B25E5E]" : "border-[#4B2222] bg-[rgba(127,29,29,0.15)] text-red-200") : backendHealth.status === "warning" ? "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#FDE68A]" : isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#9a6d14]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] text-[#C5A059]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="uppercase tracking-[0.18em] text-[10px]">Saude do backend</span>
              <span className="text-[10px] uppercase tracking-[0.16em] opacity-70">{backendHealth.updatedAt ? new Date(backendHealth.updatedAt).toLocaleTimeString("pt-BR") : ""}</span>
            </div>
            <p className="mt-2">{backendHealth.message || "Sem historico recente."}</p>
          </div>
          {!isResultView ? <div className={`rounded-[26px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[rgba(255,255,255,0.88)] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.55)]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Ciclo completo</p>
              <p className={`mt-1 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-75"}`}>Disparo unico para DataJud + Advise + Freshsales com drenagem automatica.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton tone="primary" onClick={() => handleAction("executar_integracao_total_hmadv")} disabled={actionState.loading}>
                Rodar integracao completa
              </ActionButton>
              <ActionButton onClick={() => Promise.all([loadSchemaStatus(), loadRunnerMetrics()])} disabled={actionState.loading}>
                Atualizar leitura
              </ActionButton>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <StatusBadge tone={coverageSchemaExists ? "success" : "warning"}>{coverageSchemaLabel}</StatusBadge>
            <StatusBadge tone={runnerData?.latest?.status === "success" ? "success" : "default"}>
              ultimo runner: {runnerData?.latest?.status || "sem leitura"}
            </StatusBadge>
            <StatusBadge tone="default">limite API Freshsales 1000/h</StatusBadge>
          </div>
          <div className={`mt-3 grid gap-2 text-xs md:grid-cols-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-75"}`}>
            <p><strong>Cobertura:</strong> {Number(runnerCoverage?.coverage_coveredRows || 0)} cobertos / {Number(runnerCoverage?.coverage_totalRows || 0)} total</p>
            <p><strong>Tag datajud:</strong> {Number(runnerTagged?.tagged_fullyCovered || 0)} completos</p>
          </div>
          {runnerAction?.datajud_action_manualActionRequired ? <p className={`mt-2 text-xs ${isLightTheme ? "text-red-700" : "text-[#FECACA]"}`}>A prioridade atual ainda depende de acao manual no Freshsales.</p> : null}
        </div> : null}
        {!isResultView && queueRefreshLog.length ? (
          <div className={`rounded-[22px] border p-4 text-xs ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)]"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Ultimas filas atualizadas</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {queueRefreshLog.map((item) => (
                <span key={item.key} className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#6b7280]" : "border-[#2D2E2E] opacity-70"}`}>
                  {item.label} • {new Date(item.ts).toLocaleTimeString("pt-BR")}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {!isResultView && latestRemoteRun ? <RemoteRunSummary entry={latestRemoteRun} /> : null}
        {!isResultView && remoteHealth.length ? <div className="flex flex-wrap gap-2">{remoteHealth.map((item) => <StatusBadge key={item.label} tone={item.tone}>{item.label}</StatusBadge>)}</div> : null}
      </div>
    </section>

    {!isResultView ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{quickStats.map((card) => <MetricCard key={card.label} label={card.label} value={card.value} helper={card.helper} />)}</div> : null}

    {view === "operacao" ? <div id="operacao" className="grid flex-1 auto-rows-fr gap-6 lg:grid-cols-2">
      <Panel title="Fila operacional" eyebrow="Sincronismo Freshsales + Supabase" className="h-full">
        <div className="space-y-4">
          {latestJob ? <JobCard job={latestJob} active={latestJob.id === activeJobId} /> : null}
          <label className="block"><span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>CNJs para foco manual</span><textarea value={processNumbers} onChange={(e) => setProcessNumbers(e.target.value)} rows={4} placeholder="Opcional: cole CNJs manualmente, um por linha." className={`w-full rounded-[22px] border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`} /></label>
          <label className="block max-w-[220px]"><span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Lote</span><input type="number" min="1" max="30" value={limit} onChange={(e) => setLimit(Number(e.target.value || 2))} className={`w-full rounded-2xl border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`} /><span className={`mt-2 block text-xs leading-5 ${isLightTheme ? "text-[#6b7280]" : "opacity-55"}`}>Lotes maiores ficam disponiveis na operacao, com reducao automatica so quando a acao tiver um teto tecnico mais baixo.</span></label>
          <div className="grid gap-3 md:grid-cols-2">
            {selectionSuggestedAction ? <ActionButton tone={selectionSuggestedAction.tone || "primary"} onClick={() => handleAction(selectionSuggestedAction.key, selectionSuggestedAction.payload || {})} disabled={actionState.loading || selectionSuggestedAction.disabled} className="md:col-span-2">{selectionSuggestedAction.label}</ActionButton> : null}
            <ActionButton onClick={() => handleAction("run_sync_worker")} disabled={actionState.loading} tone={isSuggestedAction("run_sync_worker") ? "primary" : "subtle"}>Rodar sync-worker</ActionButton>
            <ActionButton tone={isSuggestedAction("push_orfaos") ? "primary" : "subtle"} onClick={() => handleAction("push_orfaos", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(orphans.items, selectedOrphans).join("\n")), limit })} disabled={actionState.loading}>Criar accounts no Freshsales</ActionButton>
            <ActionButton tone={isSuggestedAction("sync_supabase_crm") ? "primary" : "subtle"} onClick={() => handleAction("sync_supabase_crm", { processNumbers: resolveActionProcessNumbers(combinedSelectedNumbers.join("\n")), limit })} disabled={actionState.loading}>Sincronizar Supabase + Freshsales</ActionButton>
            <ActionButton tone={isSuggestedAction("sincronizar_movimentacoes_activity") ? "primary" : "subtle"} onClick={() => handleAction("sincronizar_movimentacoes_activity", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(movementBacklog.items, selectedMovementBacklog).join("\n")), limit })} disabled={actionState.loading}>Sincronizar movimentacoes</ActionButton>
            <ActionButton tone={isSuggestedAction("sincronizar_publicacoes_activity") ? "primary" : "subtle"} onClick={() => handleAction("sincronizar_publicacoes_activity", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(publicationBacklog.items, selectedPublicationBacklog).join("\n")), limit })} disabled={actionState.loading}>Sincronizar publicacoes</ActionButton>
            <ActionButton tone={isSuggestedAction("reconciliar_partes_contatos") ? "primary" : "subtle"} onClick={() => handleAction("reconciliar_partes_contatos", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(partesBacklog.items, selectedPartesBacklog).join("\n")), limit })} disabled={actionState.loading}>Reconciliar partes</ActionButton>
            <ActionButton onClick={() => handleAction("auditoria_sync")} disabled={actionState.loading} className="md:col-span-2" tone={isSuggestedAction("auditoria_sync") ? "primary" : "subtle"}>Rodar auditoria</ActionButton>
            <ActionButton onClick={runPendingJobsNow} disabled={actionState.loading || drainInFlight || !jobs.some((item) => ["pending", "running"].includes(String(item.status || "")))} className="md:col-span-2">{drainInFlight ? "Drenando fila..." : "Drenar fila HMADV"}</ActionButton>
          </div>
            <div className={`rounded-[22px] border p-4 text-xs leading-6 ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] opacity-70"}`}>
              <p><strong className={isLightTheme ? "text-[#1f2937]" : "text-[#F4F1EA]"}>Selecao atual:</strong> {combinedSelectedNumbers.length ? combinedSelectedNumbers.slice(0, 8).join(", ") : "nenhum processo selecionado nas filas"}</p>
              <p className="mt-2">As acoes principais agora podem virar job persistido no HMADV. O painel acompanha progresso, continua em lote curto e avisa ao concluir sem depender de cliques repetidos.</p>
              {snapshotAt ? <p className={`mt-2 ${isLightTheme ? "text-[#6b7280]" : "opacity-55"}`}>Memoria local restauravel atualizada em {new Date(snapshotAt).toLocaleString("pt-BR")}.</p> : null}
            </div>
          <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Proximo passo sugerido</p>
            <p className="mt-2 font-semibold">{selectionActionHint.title}</p>
            <p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{selectionActionHint.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectionActionHint.badges.map((badge) => <StatusBadge key={badge} tone="warning">{badge}</StatusBadge>)}
            </div>
          </div>
        </div>
      </Panel>
      <Panel title="Reenriquecimento DataJud" eyebrow="Consulta e persistencia" className="h-full">
        <div className="space-y-4">
          <p className={`text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>Aqui ficam os passos granulares. Eles usam primeiro a selecao da fila atual e, se ela estiver vazia, aproveitam os CNJs digitados manualmente.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <ActionButton tone="primary" onClick={() => handleAction("enriquecer_datajud", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(withoutMovements.items, selectedWithoutMovements).join("\n")), limit, intent: "buscar_movimentacoes", action: "enriquecer_datajud" })} disabled={actionState.loading}>Buscar movimentacoes no DataJud</ActionButton>
            <ActionButton onClick={() => handleAction("repair_freshsales_accounts", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n")), limit })} disabled={actionState.loading}>Corrigir campos no Freshsales</ActionButton>
            <ActionButton onClick={() => handleAction("sincronizar_movimentacoes_activity", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(movementBacklog.items, selectedMovementBacklog).join("\n")), limit })} disabled={actionState.loading}>Sincronizar movimentacoes no Freshsales</ActionButton>
            <ActionButton onClick={() => handleAction("sincronizar_publicacoes_activity", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(publicationBacklog.items, selectedPublicationBacklog).join("\n")), limit })} disabled={actionState.loading}>Sincronizar publicacoes no Freshsales</ActionButton>
            <ActionButton onClick={() => handleAction("reconciliar_partes_contatos", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(partesBacklog.items, selectedPartesBacklog).join("\n")), limit })} disabled={actionState.loading}>Reconciliar partes com contatos</ActionButton>
            <ActionButton onClick={() => handleAction("backfill_audiencias", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(audienciaCandidates.items, selectedAudienciaCandidates).join("\n")), limit, apply: true })} disabled={actionState.loading}>Retroagir audiencias</ActionButton>
            <ActionButton onClick={() => handleAction("enriquecer_datajud", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n")), limit, intent: "sincronizar_monitorados", action: "enriquecer_datajud" })} disabled={actionState.loading}>Sincronizar monitorados</ActionButton>
            <ActionButton onClick={() => handleAction("enriquecer_datajud", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(fieldGaps.items, selectedFieldGaps).join("\n")), limit, intent: "reenriquecer_gaps", action: "enriquecer_datajud" })} disabled={actionState.loading} className="md:col-span-2">Reenriquecer processos com gap</ActionButton>
          </div>
          <div className="grid gap-3 pt-2 md:grid-cols-3">
            <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Fluxo 1</p><p className="mt-2 font-semibold">Persistir consulta</p><p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>Salvar DataJud no Supabase sem depender de reparo imediato no CRM.</p></div>
            <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Fluxo 2</p><p className="mt-2 font-semibold">Corrigir CRM</p><p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>Refletir os campos no Freshsales depois que o processo ja estiver consistente no banco.</p></div>
            <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}><p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Fluxo 3</p><p className="mt-2 font-semibold">Usar pipeline unica</p><p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>O comando combinado executa as duas etapas e devolve o que foi persistido e o que foi reparado.</p></div>
          </div>
        </div>
      </Panel>
    </div> : null}

    {view === "filas" ? <div id="filas" className="space-y-6">
      {recurringProcesses.length ? <Panel title="Pendencias reincidentes" eyebrow="Prioridade operacional">
        <div className="space-y-4">
          <div className={`rounded-[24px] border p-4 ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#5b4a22]" : "border-[#6E5630] bg-[rgba(76,57,26,0.16)]"}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#8a6217]" : "text-[#F8E7B5]"}`}>Foco recomendado</p>
            <p className="mt-2 font-semibold">{recurringProcessFocus.title}</p>
            <p className={`mt-2 text-sm ${isLightTheme ? "text-[#6b7280]" : "opacity-75"}`}>{recurringProcessFocus.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge tone="success">lote sugerido {recurringProcessBatch.size}</StatusBadge>
              <StatusBadge tone="default">{recurringProcessBatch.reason}</StatusBadge>
              <StatusBadge tone="default">{visibleRecurringCount} reincidentes visiveis</StatusBadge>
              <StatusBadge tone="warning">{visibleSevereRecurringCount} graves visiveis</StatusBadge>
              <StatusBadge tone={visibleSevereRecurringCount > 0 && selectedVisibleSevereRecurringCount >= visibleSevereRecurringCount ? "success" : "default"}>
                selecao cobre {selectedVisibleSevereRecurringCount}/{visibleSevereRecurringCount || 0} graves
              </StatusBadge>
              <StatusBadge tone={priorityBatchReady ? "success" : "warning"}>
                {priorityBatchReady ? "lote prioritario pronto" : "lote prioritario pendente"}
              </StatusBadge>
              <ActionButton className="px-3 py-2 text-xs" onClick={() => setLimit(recurringProcessBatch.size)}>Usar lote sugerido</ActionButton>
              <ActionButton tone="primary" className="px-3 py-2 text-xs" onClick={applySevereRecurringPreset}>Montar lote prioritario</ActionButton>
              <ActionButton className="px-3 py-2 text-xs" onClick={selectVisibleRecurringProcesses}>Selecionar reincidentes visiveis</ActionButton>
              <ActionButton className="px-3 py-2 text-xs" onClick={selectVisibleSevereRecurringProcesses}>Selecionar 3x+ visiveis</ActionButton>
              <ActionButton className="px-3 py-2 text-xs" onClick={clearAllQueueSelections}>Limpar selecao</ActionButton>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {recurringProcessActions.map((action) => <StatusBadge key={action} tone="warning">{action}</StatusBadge>)}
            </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge tone="success">proximo disparo: {primaryProcessAction}</StatusBadge>
                <ActionButton className="px-3 py-2 text-xs" onClick={() => updateView("operacao")}>Ir para operacao</ActionButton>
                <ActionButton className="px-3 py-2 text-xs" onClick={runPendingJobsNow} disabled={actionState.loading || drainInFlight}>{drainInFlight ? "Drenando..." : "Rodar drenagem agora"}</ActionButton>
              </div>
            <div className="mt-4 space-y-2">
              {recurringProcessChecklist.map((step, index) => <div key={step} className={`flex items-start gap-3 text-sm ${isLightTheme ? "text-[#4b5563]" : "opacity-80"}`}>
                <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${isLightTheme ? "border-[#e4d2a8] text-[#8a6217]" : "border-[#6E5630] text-[#F8E7B5]"}`}>{index + 1}</span>
                <p>{step}</p>
              </div>)}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <QueueSummaryCard title="Supabase" count={recurringProcessSummary.supabase} helper="Itens que pedem correcao ou consolidacao interna." />
            <QueueSummaryCard title="Freshsales" count={recurringProcessSummary.freshsales} helper="Reparos ou criacao de account no CRM." />
            <QueueSummaryCard title="DataJud" count={recurringProcessSummary.datajud} helper="Reconsulta ou falta de progresso no enriquecimento." />
            <QueueSummaryCard title="Manual" count={recurringProcessSummary.manual} helper="Casos que merecem revisao humana." accent="text-[#FECACA]" />
            <QueueSummaryCard title="Sem progresso" count={recurringProcessSummary.stagnant} helper="Reincidencias sem ganho util no lote." accent="text-[#FDE68A]" />
            <QueueSummaryCard title="Recorrentes" count={recurringProcessSummary.total} helper="Itens que voltaram em multiplos ciclos recentes." />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <QueueSummaryCard title="Faixa 2x" count={recurringProcessBands.recurring} helper="Pendencias que reapareceram em dois ciclos." />
            <QueueSummaryCard title="Faixa 3x" count={recurringProcessBands.reincident} helper="Itens reincidentes que merecem atencao prioritaria." accent="text-[#FDE68A]" />
            <QueueSummaryCard title="Faixa 4x+" count={recurringProcessBands.critical} helper="Gargalos cronicos que pedem acao estrutural." accent="text-[#FECACA]" />
          </div>
          <div className="space-y-6">
            <RecurringProcessGroup title="Criticos (4x+)" helper="Gargalos cronicos que repetem em quatro ou mais ciclos." items={recurringProcessGroups.critical} />
            <RecurringProcessGroup title="Reincidentes (3x)" helper="Itens que persistem por tres ciclos e merecem prioridade alta." items={recurringProcessGroups.reincident} />
            <RecurringProcessGroup title="Recorrentes (2x)" helper="Itens que reapareceram duas vezes e ainda cabem em correcao operacional." items={recurringProcessGroups.recurring} />
          </div>
        </div>
      </Panel> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <QueueSummaryCard title="Sem movimentacoes" count={withoutMovements.totalRows || 0} helper="Processos prontos para reconsulta no DataJud." />
        <QueueSummaryCard title="Movimentacoes pendentes" count={movementBacklog.totalRows || 0} helper="Andamentos ainda sem activity no Freshsales." />
        <QueueSummaryCard title="Publicacoes pendentes" count={publicationBacklog.totalRows || 0} helper="Publicacoes ainda sem activity no Freshsales." />
        <QueueSummaryCard title="Partes sem contato" count={partesBacklog.totalRows || 0} helper="Partes ainda sem contato vinculado." />
        <QueueSummaryCard title="Cobertura auditada" count={processCoverage.totalRows || 0} helper="Processos visiveis na leitura consolidada de cobertura." />
        <QueueSummaryCard title="Monitorados" count={monitoringActive.totalRows || 0} helper="Carteira ativa em acompanhamento." />
        <QueueSummaryCard title="Campos orfaos" count={fieldGaps.totalRows || 0} helper="Gaps entre Supabase e Freshsales." />
        <QueueSummaryCard title="Sem Sales Account" count={orphans.totalRows || 0} helper="Processos ainda sem account vinculada." />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
      <div id="processos-cobertura"><Panel title="Cobertura por processo" eyebrow="Auditoria local">
        {processCoverage.unsupported ? (
          <div className={`rounded-[22px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#F8E7B5]"}`}>
            O schema de cobertura ainda nao foi aplicado no HMADV. Assim que a migracao estiver ativa, esta leitura vai mostrar o percentual real de cobertura por processo.
          </div>
        ) : (
          <div className="space-y-4">
            {processCoverage.limited ? <div className={`rounded-[20px] border p-4 text-sm ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#F8E7B5]"}`}>A leitura de cobertura entrou em modo reduzido para evitar sobrecarga. Os totais continuam uteis, mas a pagina atual pode vir parcial.</div> : null}
            {processCoverage.error ? <div className={`rounded-[20px] border p-4 text-sm ${isLightTheme ? "border-[#E7C4C4] bg-[#FFF4F4] text-[#B25E5E]" : "border-[#4B2222] bg-[rgba(75,34,34,0.18)] text-[#FECACA]"}`}>{processCoverage.error}</div> : null}
            {!processCoverage.loading && Number(processCoverage.totalRows || 0) > 0 && !(processCoverage.items || []).length ? <div className={`rounded-[20px] border p-4 text-sm ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#F8E7B5]"}`}>{coverageMismatchMessage(processCoverage)}</div> : null}
            <CoverageList rows={processCoverage.items} page={covPage} setPage={setCovPage} loading={processCoverage.loading} totalRows={processCoverage.totalRows} pageSize={processCoverage.pageSize} onSelectProcess={useCoverageProcess} />
          </div>
        )}
      </Panel></div>
      <Panel title="Processos sem movimentacoes" eyebrow="Fila paginada"><div className="space-y-4"><QueueList title="Sem movimentacoes" helper="Itens sem andamento local para reconsulta no DataJud." rows={withoutMovements.items} selected={selectedWithoutMovements} onToggle={(key) => toggleSelection(setSelectedWithoutMovements, selectedWithoutMovements, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedWithoutMovements, selectedWithoutMovements, withoutMovements.items, nextState)} page={wmPage} setPage={setWmPage} loading={withoutMovements.loading} totalRows={withoutMovements.totalRows} pageSize={withoutMovements.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "sem_movimentacoes")} lastUpdated={withoutMovements.updatedAt} limited={withoutMovements.limited} errorMessage={withoutMovements.error} /><QueueActionBlock selectionCount={queueActionConfigs.sem_movimentacoes.selectionCount} batchSize={queueActionConfigs.sem_movimentacoes.batchSize} onBatchChange={(value) => updateQueueBatchSize("sem_movimentacoes", value)} helper={queueActionConfigs.sem_movimentacoes.helper} disabled={actionState.loading} actions={queueActionConfigs.sem_movimentacoes.actions} /></div></Panel>
      <div id="processos-movimentacoes-pendentes"><Panel title="Movimentacoes pendentes" eyebrow="Fila paginada"><div className="space-y-4"><QueueList title="Andamentos sem activity" helper="Processos com movimentacoes no HMADV ainda sem reflexo em sales_activities do Freshsales." rows={movementBacklog.items} selected={selectedMovementBacklog} onToggle={(key) => toggleSelection(setSelectedMovementBacklog, selectedMovementBacklog, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedMovementBacklog, selectedMovementBacklog, movementBacklog.items, nextState)} page={movPage} setPage={setMovPage} loading={movementBacklog.loading} totalRows={movementBacklog.totalRows} pageSize={movementBacklog.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "movimentacoes_pendentes")} lastUpdated={movementBacklog.updatedAt} limited={movementBacklog.limited} errorMessage={movementBacklog.error} /><QueueActionBlock selectionCount={queueActionConfigs.movimentacoes_pendentes.selectionCount} batchSize={queueActionConfigs.movimentacoes_pendentes.batchSize} onBatchChange={(value) => updateQueueBatchSize("movimentacoes_pendentes", value)} helper={queueActionConfigs.movimentacoes_pendentes.helper} disabled={actionState.loading} actions={queueActionConfigs.movimentacoes_pendentes.actions} /></div></Panel></div>
      <div id="processos-publicacoes-pendentes"><Panel title="Publicacoes pendentes" eyebrow="Fila paginada"><div className="space-y-4"><QueueList title="Publicacoes sem activity" helper="Processos com publicacoes no HMADV ainda sem reflexo em sales_activities do Freshsales." rows={publicationBacklog.items} selected={selectedPublicationBacklog} onToggle={(key) => toggleSelection(setSelectedPublicationBacklog, selectedPublicationBacklog, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedPublicationBacklog, selectedPublicationBacklog, publicationBacklog.items, nextState)} page={pubPage} setPage={setPubPage} loading={publicationBacklog.loading} totalRows={publicationBacklog.totalRows} pageSize={publicationBacklog.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "publicacoes_pendentes")} lastUpdated={publicationBacklog.updatedAt} limited={publicationBacklog.limited} errorMessage={publicationBacklog.error} /><QueueActionBlock selectionCount={queueActionConfigs.publicacoes_pendentes.selectionCount} batchSize={queueActionConfigs.publicacoes_pendentes.batchSize} onBatchChange={(value) => updateQueueBatchSize("publicacoes_pendentes", value)} helper={queueActionConfigs.publicacoes_pendentes.helper} disabled={actionState.loading} actions={queueActionConfigs.publicacoes_pendentes.actions} /></div></Panel></div>
      <div id="processos-partes-sem-contato"><Panel title="Partes sem contato" eyebrow="Fila paginada"><div className="space-y-4"><QueueList title="Partes a reconciliar" helper="Processos com partes ainda sem contato_freshsales_id, prontos para reconciliacao com o modulo de contatos." rows={partesBacklog.items} selected={selectedPartesBacklog} onToggle={(key) => toggleSelection(setSelectedPartesBacklog, selectedPartesBacklog, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedPartesBacklog, selectedPartesBacklog, partesBacklog.items, nextState)} page={partesPage} setPage={setPartesPage} loading={partesBacklog.loading} totalRows={partesBacklog.totalRows} pageSize={partesBacklog.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "partes_sem_contato")} lastUpdated={partesBacklog.updatedAt} limited={partesBacklog.limited} errorMessage={partesBacklog.error} /><QueueActionBlock selectionCount={queueActionConfigs.partes_sem_contato.selectionCount} batchSize={queueActionConfigs.partes_sem_contato.batchSize} onBatchChange={(value) => updateQueueBatchSize("partes_sem_contato", value)} helper={queueActionConfigs.partes_sem_contato.helper} disabled={actionState.loading} actions={queueActionConfigs.partes_sem_contato.actions} /></div></Panel></div>
      <Panel title="Audiencias detectaveis" eyebrow="Fila paginada"><div className="space-y-4"><QueueList title="Retroativo de audiencias" helper="Processos com sinais concretos de audiencia nas publicacoes e ainda sem persistencia equivalente." rows={audienciaCandidates.items} selected={selectedAudienciaCandidates} onToggle={(key) => toggleSelection(setSelectedAudienciaCandidates, selectedAudienciaCandidates, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedAudienciaCandidates, selectedAudienciaCandidates, audienciaCandidates.items, nextState)} page={audPage} setPage={setAudPage} loading={audienciaCandidates.loading} totalRows={audienciaCandidates.totalRows} pageSize={audienciaCandidates.pageSize} renderStatuses={(row) => [{ label: `${row.audiencias_pendentes || 0} audiencias pendentes`, tone: "warning" }, row.proxima_data_audiencia ? { label: `proxima ${new Date(row.proxima_data_audiencia).toLocaleDateString("pt-BR")}`, tone: "default" } : null].filter(Boolean)} lastUpdated={audienciaCandidates.updatedAt} limited={audienciaCandidates.limited} errorMessage={audienciaCandidates.error} /><QueueActionBlock selectionCount={queueActionConfigs.audiencias_pendentes.selectionCount} batchSize={queueActionConfigs.audiencias_pendentes.batchSize} onBatchChange={(value) => updateQueueBatchSize("audiencias_pendentes", value)} helper={queueActionConfigs.audiencias_pendentes.helper} disabled={actionState.loading} actions={queueActionConfigs.audiencias_pendentes.actions} /></div></Panel>
      <Panel title="Monitoramento ativo" eyebrow="Fila paginada"><div className="space-y-4">{monitoringUnsupported ? <div className={`rounded-[20px] border p-4 text-sm ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#F8E7B5]"}`}>A coluna <strong>monitoramento_ativo</strong> ainda nao existe no HMADV. Esta fila fica em modo diagnostico, com leitura por fallback e sem gravacao.</div> : null}<QueueList title="Monitorados" helper="Se a base ainda nao marca monitoramento_ativo, o painel usa fallback pelos processos com account." rows={monitoringActive.items} selected={selectedMonitoringActive} onToggle={(key) => toggleSelection(setSelectedMonitoringActive, selectedMonitoringActive, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedMonitoringActive, selectedMonitoringActive, monitoringActive.items, nextState)} page={maPage} setPage={setMaPage} loading={monitoringActive.loading} totalRows={monitoringActive.totalRows} pageSize={monitoringActive.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "monitoramento_ativo", { monitoringUnsupported })} lastUpdated={monitoringActive.updatedAt} limited={monitoringActive.limited} errorMessage={monitoringActive.error} selectionDisabled={monitoringUnsupported} selectionDisabledMessage={monitoringUnsupported ? "Selecao bloqueada: esta fila serve apenas para diagnosticar a adequacao de schema." : ""} />{monitoringUnsupported ? <div className={`rounded-[18px] border border-dashed px-4 py-3 text-xs leading-6 ${isLightTheme ? "border-[#e4d2a8] text-[#8a6217]" : "border-[#6E5630] text-[#F8E7B5]"}`}>Escrita de monitoramento temporariamente indisponivel: aplique a migracao do schema para liberar ativacao e desativacao pela fila.</div> : null}<QueueActionBlock selectionCount={queueActionConfigs.monitoramento_ativo.selectionCount} batchSize={queueActionConfigs.monitoramento_ativo.batchSize} onBatchChange={(value) => updateQueueBatchSize("monitoramento_ativo", value)} helper={queueActionConfigs.monitoramento_ativo.helper} disabled={actionState.loading || monitoringUnsupported} actions={queueActionConfigs.monitoramento_ativo.actions} /></div></Panel>
      <Panel title="Monitoramento inativo" eyebrow="Fila paginada"><div className="space-y-4">{monitoringUnsupported ? <div className={`rounded-[20px] border p-4 text-sm ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#F8E7B5]"}`}>Sem a coluna <strong>monitoramento_ativo</strong>, esta fila nao consegue gravar alteracoes. O painel mostra apenas o que precisa de adequacao de schema.</div> : null}<QueueList title="Nao monitorados" helper="Use esta fila para reativar o sync dos processos que ficaram fora da rotina." rows={monitoringInactive.items} selected={selectedMonitoringInactive} onToggle={(key) => toggleSelection(setSelectedMonitoringInactive, selectedMonitoringInactive, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedMonitoringInactive, selectedMonitoringInactive, monitoringInactive.items, nextState)} page={miPage} setPage={setMiPage} loading={monitoringInactive.loading} totalRows={monitoringInactive.totalRows} pageSize={monitoringInactive.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "monitoramento_inativo", { monitoringUnsupported })} lastUpdated={monitoringInactive.updatedAt} limited={monitoringInactive.limited} errorMessage={monitoringInactive.error} selectionDisabled={monitoringUnsupported} selectionDisabledMessage={monitoringUnsupported ? "Selecao bloqueada: esta fila mostra somente o backlog dependente da migracao de schema." : ""} />{monitoringUnsupported ? <div className={`rounded-[18px] border border-dashed px-4 py-3 text-xs leading-6 ${isLightTheme ? "border-[#e4d2a8] text-[#8a6217]" : "border-[#6E5630] text-[#F8E7B5]"}`}>A reativacao fica bloqueada ate a criacao da coluna <strong>monitoramento_ativo</strong> no HMADV.</div> : null}<QueueActionBlock selectionCount={queueActionConfigs.monitoramento_inativo.selectionCount} batchSize={queueActionConfigs.monitoramento_inativo.batchSize} onBatchChange={(value) => updateQueueBatchSize("monitoramento_inativo", value)} helper={queueActionConfigs.monitoramento_inativo.helper} disabled={actionState.loading || monitoringUnsupported} actions={queueActionConfigs.monitoramento_inativo.actions} /></div></Panel>
      <Panel title="GAP DataJud -> CRM" eyebrow="Campos orfaos"><div className="space-y-4"><QueueList title="Campos pendentes no Freshsales" helper="Processos vinculados cujo espelho ainda tem campos importantes em branco." rows={fieldGaps.items} selected={selectedFieldGaps} onToggle={(key) => toggleSelection(setSelectedFieldGaps, selectedFieldGaps, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedFieldGaps, selectedFieldGaps, fieldGaps.items, nextState)} page={fgPage} setPage={setFgPage} loading={fieldGaps.loading} totalRows={fieldGaps.totalRows} pageSize={fieldGaps.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "campos_orfaos")} lastUpdated={fieldGaps.updatedAt} limited={fieldGaps.limited} errorMessage={fieldGaps.error} /><QueueActionBlock selectionCount={queueActionConfigs.campos_orfaos.selectionCount} batchSize={queueActionConfigs.campos_orfaos.batchSize} onBatchChange={(value) => updateQueueBatchSize("campos_orfaos", value)} helper={queueActionConfigs.campos_orfaos.helper} disabled={actionState.loading} actions={queueActionConfigs.campos_orfaos.actions} /></div></Panel>
      <div id="processos-sem-sales-account"><Panel title="Sem Sales Account" eyebrow="Processos orfaos"><div className="space-y-4"><QueueList title="Orfaos" helper="Itens do HMADV que ainda nao viraram Sales Account." rows={orphans.items} selected={selectedOrphans} onToggle={(key) => toggleSelection(setSelectedOrphans, selectedOrphans, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedOrphans, selectedOrphans, orphans.items, nextState)} page={orphanPage} setPage={setOrphanPage} loading={orphans.loading} totalRows={orphans.totalRows} pageSize={orphans.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "orfaos")} lastUpdated={orphans.updatedAt} limited={orphans.limited} errorMessage={orphans.error} /><QueueActionBlock selectionCount={queueActionConfigs.orfaos.selectionCount} batchSize={queueActionConfigs.orfaos.batchSize} onBatchChange={(value) => updateQueueBatchSize("orfaos", value)} helper={queueActionConfigs.orfaos.helper} disabled={actionState.loading} actions={queueActionConfigs.orfaos.actions} /></div></Panel></div>
      </div>
    </div> : null}

    {view === "relacoes" ? <div className="space-y-6" id="relacoes">
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Vincular processos relacionados" eyebrow="Arvore processual">
          <div className="space-y-4">
            {editingRelationId ? <div className={`rounded-2xl border px-4 py-3 text-sm ${isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] bg-[rgba(76,57,26,0.22)]"}`}>Editando relacao existente. Salve novamente para atualizar o vinculo.</div> : null}
            <Field label="Processo principal / pai" value={form.numero_cnj_pai} onChange={(value) => setForm((current) => ({ ...current, numero_cnj_pai: value }))} placeholder="CNJ do processo principal" />
            <Field label="Processo relacionado / filho" value={form.numero_cnj_filho} onChange={(value) => setForm((current) => ({ ...current, numero_cnj_filho: value }))} placeholder="CNJ do apenso, incidente, recurso ou dependencia" />
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField label="Tipo de relacao" value={form.tipo_relacao} onChange={(value) => setForm((current) => ({ ...current, tipo_relacao: value }))} options={[{ value: "dependencia", label: "Dependencia" }, { value: "apenso", label: "Apenso" }, { value: "incidente", label: "Incidente" }, { value: "recurso", label: "Recurso" }]} />
              <SelectField label="Status" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }]} />
            </div>
            <label className="block">
              <span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Observacoes</span>
              <textarea value={form.observacoes} onChange={(e) => setForm((current) => ({ ...current, observacoes: e.target.value }))} rows={4} className={`w-full rounded-[22px] border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`} placeholder="Ex.: recurso distribuido por dependencia do principal." />
            </label>
            <div className="flex flex-wrap gap-3">
              <ActionButton tone="primary" onClick={handleSaveRelation} disabled={actionState.loading}>{editingRelationId ? "Atualizar relacao" : "Salvar relacao"}</ActionButton>
              <ActionButton onClick={() => { setForm(EMPTY_FORM); setEditingRelationId(null); }} disabled={actionState.loading}>{editingRelationId ? "Cancelar edicao" : "Limpar formulario"}</ActionButton>
            </div>
          </div>
        </Panel>
        <Panel title="Busca e enriquecimento" eyebrow="Publicacoes + semelhanca">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_180px]">
              <Field label="Buscar por CNJ, titulo ou parte" value={search} onChange={setSearch} placeholder="Use um CNJ, nome de parte ou trecho do titulo" />
              <label className="block">
                <span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>Confianca minima</span>
                <select value={relationMinScore} onChange={(e) => setRelationMinScore(e.target.value)} className={`w-full rounded-2xl border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`}>
                  <option value="0.35">35%</option>
                  <option value="0.45">45%</option>
                  <option value="0.60">60%</option>
                  <option value="0.75">75%</option>
                </select>
              </label>
            </div>
            <div className={`rounded-[22px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#4b5563]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] opacity-75"}`}>
              <p className="font-semibold">Como as sugestoes sao montadas</p>
              <p className="mt-2 leading-6">A tela cruza CNJs citados nas publicacoes recentes com semelhanca entre titulo e polos do processo. O resultado vira uma fila priorizada para validacao humana e aprovacao em massa.</p>
            </div>
            <div className="space-y-3">
              <Field label="Busca rapida de processos" value={lookupTerm} onChange={setLookupTerm} placeholder="Digite o CNJ ou parte do titulo" />
              {lookup.loading ? <p className="text-sm opacity-60">Buscando processos...</p> : null}
              {!lookup.loading && !lookup.items.length && lookupTerm.trim() ? <p className="text-sm opacity-60">Nenhum processo encontrado para esse termo.</p> : null}
              <div className="space-y-3">
                {lookup.items.map((item) => <div key={item.id || item.numero_cnj} className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}><p className="font-semibold">{item.numero_cnj || "Sem CNJ"}</p><p className={`mt-1 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{item.titulo || "Sem titulo"}</p><div className={`mt-2 flex flex-wrap gap-3 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}><span>Status: {item.status_atual_processo || "sem_status"}</span>{item.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${item.account_id_freshsales}`} target="_blank" rel="noreferrer" className={`underline transition ${isLightTheme ? "hover:text-[#9a6d14]" : "hover:text-[#C5A059]"}`}>Account {item.account_id_freshsales}</a> : null}</div><div className="mt-3 flex flex-wrap gap-2"><ActionButton onClick={() => setForm((current) => ({ ...current, numero_cnj_pai: item.numero_cnj || current.numero_cnj_pai }))} className="px-3 py-2 text-xs">Usar como pai</ActionButton><ActionButton onClick={() => setForm((current) => ({ ...current, numero_cnj_filho: item.numero_cnj || current.numero_cnj_filho }))} className="px-3 py-2 text-xs">Usar como filho</ActionButton></div></div>)}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Sugestoes de associacao" eyebrow="Validacao em massa">
        <div className="space-y-4">
          <RelationSelectionBar
            title="Fila enriquecida por publicacoes"
            helper="Use a selecao multipla para validar varias associacoes de uma vez. O botao de todos do filtro considera as paginas seguintes."
            page={relationSuggestions.page}
            totalRows={relationSuggestions.totalRows}
            pageSize={relationSuggestions.pageSize}
            selectedCount={selectedSuggestionKeys.length}
            allMatchingSelected={allMatchingSuggestionsSelected}
            loading={relationSuggestions.loading || suggestionSelectionLoading}
            onTogglePage={() => toggleCustomPageSelection(setSelectedSuggestionKeys, selectedSuggestionKeys, relationSuggestions.items, getSuggestionSelectionValue)}
            onToggleAllMatching={toggleAllMatchingSuggestions}
            onPrevPage={() => loadRelationSuggestions(Math.max(1, relationSuggestions.page - 1), search, relationMinScore)}
            onNextPage={() => loadRelationSuggestions(relationSuggestions.page + 1, search, relationMinScore)}
            disablePrev={relationSuggestions.page <= 1}
            disableNext={relationSuggestions.page >= Math.max(1, Math.ceil(Number(relationSuggestions.totalRows || 0) / Math.max(1, relationSuggestions.pageSize || 20)))}
          />
          <div className="flex flex-wrap gap-3">
            <ActionButton tone="primary" onClick={handleBulkSaveSuggestions} disabled={actionState.loading || !selectedSuggestionKeys.length}>Validar selecionadas</ActionButton>
            <ActionButton onClick={() => setSelectedSuggestionKeys([])} disabled={actionState.loading || !selectedSuggestionKeys.length}>Limpar selecao</ActionButton>
          </div>
          {relationSuggestions.loading ? <p className="text-sm opacity-60">Carregando sugestoes...</p> : null}
          {relationSuggestions.error ? <p className={`text-sm ${isLightTheme ? "text-red-700" : "text-red-300"}`}>{relationSuggestions.error}</p> : null}
          {!relationSuggestions.loading && !relationSuggestions.items.length ? <p className={`rounded-2xl border border-dashed px-4 py-6 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#6b7280]" : "border-[#2D2E2E] opacity-60"}`}>Nenhuma sugestao encontrada para os filtros atuais.</p> : null}
          <div className="space-y-4">
            {relationSuggestions.items.map((item) => <RelationSuggestionCard key={item.suggestion_key} item={item} checked={selectedSuggestionKeys.includes(getSuggestionSelectionValue(item))} onToggle={() => toggleCustomSelection(setSelectedSuggestionKeys, selectedSuggestionKeys, getSuggestionSelectionValue(item))} onUseSuggestion={useSuggestionInForm} />)}
          </div>
        </div>
      </Panel>

      <Panel title="Relacoes processuais cadastradas" eyebrow="Lista paginada">
        <div className="space-y-4">
          {relations.items.length ? <div className={`flex flex-wrap gap-2 text-xs uppercase tracking-[0.15em] ${isLightTheme ? "text-[#6b7280]" : "opacity-70"}`}>{Object.entries(relationTypeSummary).map(([key, value]) => <span key={key} className={`border px-2 py-1 ${isLightTheme ? "border-[#d7d4cb] bg-white" : "border-[#2D2E2E]"}`}>{key}: {value}</span>)}</div> : null}
          <RelationSelectionBar
            title="Cadastro de relacoes"
            helper="Voce pode ativar, inativar ou remover varias relacoes de uma vez, com paginação e selecao global por filtro."
            page={relations.page}
            totalRows={relations.totalRows}
            pageSize={relations.pageSize}
            selectedCount={selectedRelations.length}
            allMatchingSelected={allMatchingRelationsSelected}
            loading={relations.loading || relationSelectionLoading}
            onTogglePage={() => toggleCustomPageSelection(setSelectedRelations, selectedRelations, relations.items, getRelationSelectionValue)}
            onToggleAllMatching={toggleAllMatchingRelations}
            onPrevPage={() => loadRelations(Math.max(1, relations.page - 1), search)}
            onNextPage={() => loadRelations(relations.page + 1, search)}
            disablePrev={relations.page <= 1}
            disableNext={relations.page >= Math.max(1, Math.ceil(Number(relations.totalRows || 0) / Math.max(1, relations.pageSize || 20)))}
          />
          <div className="flex flex-wrap gap-3">
            <ActionButton tone="primary" onClick={() => handleBulkRelationStatus("ativo")} disabled={actionState.loading || !selectedRelations.length}>Ativar selecionadas</ActionButton>
            <ActionButton onClick={() => handleBulkRelationStatus("inativo")} disabled={actionState.loading || !selectedRelations.length}>Inativar selecionadas</ActionButton>
            <ActionButton tone="danger" onClick={handleBulkRelationRemoval} disabled={actionState.loading || !selectedRelations.length}>Remover selecionadas</ActionButton>
          </div>
          {relations.loading ? <p className="text-sm opacity-60">Carregando relacoes...</p> : null}
          {relations.error ? <p className={`text-sm ${isLightTheme ? "text-red-700" : "text-red-300"}`}>{relations.error}</p> : null}
          {!relations.loading && !relations.items.length ? <p className={`rounded-2xl border border-dashed px-4 py-6 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-[#fcfbf7] text-[#6b7280]" : "border-[#2D2E2E] opacity-60"}`}>Nenhuma relacao cadastrada ainda.</p> : null}
          <div className="space-y-4">
            {relations.items.map((item) => <RegisteredRelationCard key={item.id} item={item} checked={selectedRelations.includes(getRelationSelectionValue(item))} onToggle={() => toggleCustomSelection(setSelectedRelations, selectedRelations, getRelationSelectionValue(item))} onEdit={startEditing} onDelete={handleDeleteRelation} disabled={actionState.loading} />)}
          </div>
        </div>
      </Panel>
    </div> : null}

    {view === "resultado" ? <div id="resultado" className="grid flex-1 auto-rows-fr items-stretch gap-6 2xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <OperationalResultCard
        className="h-full"
        loading={actionState.loading}
        error={actionState.error}
        result={actionState.result ? <>{actionState.result?.drain ? <div className={`mb-4 rounded-[20px] border p-4 text-sm ${isLightTheme ? "border-[#8dc8a3] bg-[#effaf2] text-[#166534]" : "border-[#30543A] bg-[rgba(48,84,58,0.12)]"}`}><p className="font-semibold">Drenagem de fila</p><p className={`mt-2 ${isLightTheme ? "text-[#166534]" : "opacity-75"}`}>{buildDrainPreview(actionState.result.drain)}</p></div> : null}{jobs.length ? <div className="mb-4 space-y-3"><p className={`text-xs uppercase tracking-[0.16em] ${isLightTheme ? "text-[#6b7280]" : "opacity-55"}`}>Jobs persistidos</p>{jobs.slice(0, 4).map((job) => <JobCard key={job.id} job={job} active={job.id === activeJobId} />)}</div> : null}<OperationResult result={actionState.result} /></> : null}
        emptyText="Nenhuma acao executada ainda nesta sessao."
        footer="Resultado compacto, sem esticar o modulo antes do console."
      />
      <OperationalHistoryCompactCard
        className="h-full"
        primaryText={executionHistory[0] ? `${executionHistory[0].label || executionHistory[0].action} • ${executionHistory[0].status}` : ""}
        secondaryLabel="Ultimo HMADV"
        secondaryText={remoteHistory[0] ? `${getProcessActionLabel(remoteHistory[0].acao, remoteHistory[0].payload || {})} • ${remoteHistory[0].status}` : ""}
      />
    </div> : null}
  </div>;
}
