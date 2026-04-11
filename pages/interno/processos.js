import { useEffect, useMemo, useRef, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch as adminFetchRaw } from "../../lib/admin/api";
import { appendActivityLog, setModuleHistory, updateActivityLog } from "../../lib/admin/activity-log";

const EMPTY_FORM = { numero_cnj_pai: "", numero_cnj_filho: "", tipo_relacao: "dependencia", status: "ativo", observacoes: "" };
const PROCESS_VIEW_ITEMS = [
  { key: "operacao", label: "Operacao" },
  { key: "filas", label: "Filas" },
  { key: "relacoes", label: "Relacoes" },
  { key: "resultado", label: "Resultado" },
];
const HISTORY_STORAGE_KEY = "hmadv:interno-processos:history:v1";
const UI_STATE_STORAGE_KEY = "hmadv:interno-processos:ui:v1";
const SNAPSHOT_STORAGE_KEY = "hmadv:interno-processos:snapshot:v1";
const ACTION_LABELS = {
  run_sync_worker: "Rodar sync-worker",
  push_orfaos: "Criar accounts no Freshsales",
  repair_freshsales_accounts: "Corrigir campos no Freshsales",
  sync_supabase_crm: "Sincronizar Supabase + Freshsales",
  sincronizar_movimentacoes_activity: "Sincronizar movimentacoes no Freshsales",
  sincronizar_publicacoes_activity: "Sincronizar publicacoes no Freshsales",
  reconciliar_partes_contatos: "Reconciliar partes com contatos",
  backfill_audiencias: "Retroagir audiencias",
  auditoria_sync: "Rodar auditoria",
  enriquecer_datajud: "Reenriquecer via DataJud",
  monitoramento_status: "Atualizar monitoramento",
  executar_integracao_total_hmadv: "Rodar integracao completa (HMADV)",
  salvar_relacao: "Salvar relacao",
  remover_relacao: "Remover relacao",
  run_pending_jobs: "Drenar fila HMADV",
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
  sem_movimentacoes: "Sem movimentacoes",
  movimentacoes_pendentes: "Movimentacoes pendentes",
  publicacoes_pendentes: "Publicacoes pendentes",
  partes_sem_contato: "Partes sem contato",
  audiencias_pendentes: "Audiencias detectaveis",
  monitoramento_ativo: "Monitoramento ativo",
  monitoramento_inativo: "Monitoramento inativo",
  campos_orfaos: "Campos orfaos",
  orfaos: "Sem Sales Account",
  cobertura: "Cobertura por processo",
};
const MODULE_LIMITS = {
  maxProcessBatch: 25,
  maxMovementBatch: 25,
  maxPublicationBatch: 10,
  maxPartesBatch: 30,
  maxAudienciasBatch: 10,
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
    if (intent === "buscar_movimentacoes") return `Buscar movimentacoes no DataJud${suffixLabel}`;
    if (intent === "sincronizar_monitorados") return `Sincronizar monitorados${suffixLabel}`;
    if (intent === "reenriquecer_gaps") return `Reenriquecer processos com gap${suffixLabel}`;
    return `Reenriquecer via DataJud${suffixLabel}`;
  }
  if (normalizedAction === "sync_supabase_crm") {
    if (intent === "crm_only") return `Sincronizar CRM sem DataJud${suffixLabel}`;
    if (intent === "datajud_plus_crm") return `Sincronizar DataJud + CRM${suffixLabel}`;
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
  if (result.completedAll) return `Fila drenada em ${processed} rodada(s)`;
  if (result.job) return `Fila avancou ${processed} rodada(s): ${buildJobPreview(result.job)}`;
  return `Fila avancou ${processed} rodada(s)`;
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

function CompactHistoryPanel({ localHistory, remoteHistory }) {
  const latestLocal = localHistory[0];
  const latestRemote = remoteHistory[0];
  return (
    <div className="rounded-[28px] border border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.96),rgba(7,9,8,0.96))] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.22)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">Historico (compacto)</p>
      <div className="mt-3 space-y-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">Ultimo local</p>
          {latestLocal ? (
            <p className="mt-1">{latestLocal.label || latestLocal.action} • {latestLocal.status}</p>
          ) : (
            <p className="mt-1 opacity-60">Sem registros locais.</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">Ultimo HMADV</p>
          {latestRemote ? (
            <p className="mt-1">{getProcessActionLabel(latestRemote.acao, latestRemote.payload || {})} • {latestRemote.status}</p>
          ) : (
            <p className="mt-1 opacity-60">Sem registros remotos.</p>
          )}
        </div>
        <p className="text-xs opacity-60">Detalhes completos no Console &gt; Log.</p>
      </div>
    </div>
  );
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

function MetricCard({ label, value, helper }) {
  return <div className="rounded-[28px] border border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.98),rgba(7,9,8,0.98))] p-5 shadow-[0_12px_36px_rgba(0,0,0,0.22)]"><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{label}</p><p className="mb-2 font-serif text-3xl">{value}</p>{helper ? <p className="text-sm leading-relaxed opacity-65">{helper}</p> : null}</div>;
}
function Panel({ title, eyebrow, children }) {
  return <section className="rounded-[30px] border border-[#2D2E2E] bg-[linear-gradient(180deg,rgba(13,15,14,0.96),rgba(7,9,8,0.96))] p-6 shadow-[0_14px_48px_rgba(0,0,0,0.22)]">{eyebrow ? <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#C5A059" }}>{eyebrow}</p> : null}<h3 className="mb-4 font-serif text-[1.9rem] leading-tight">{title}</h3>{children}</section>;
}
function Field({ label, value, onChange, placeholder }) {
  return <label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{label}</span><input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full rounded-2xl border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none transition focus:border-[#C5A059]" /></label>;
}
function SelectField({ label, value, onChange, options }) {
  return <label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-2xl border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none transition focus:border-[#C5A059]">{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
}
function ActionButton({ children, tone = "subtle", className = "", ...props }) {
  const tones = {
    subtle: "border border-[#2D2E2E] text-[#F4F1EA] hover:border-[#C5A059] hover:text-[#C5A059]",
    primary: "bg-[#C5A059] text-[#050706] hover:brightness-110",
    danger: "border border-[#4B2222] text-red-200 hover:border-[#C96A6A]",
  };
  return <button type="button" {...props} className={`rounded-2xl px-5 py-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone] || tones.subtle} ${className}`.trim()}>{children}</button>;
}
function ViewToggle({ value, onChange }) {
  return <div className="flex flex-wrap gap-2">{PROCESS_VIEW_ITEMS.map((item) => {
    const active = item.key === value;
    return <button key={item.key} type="button" onClick={() => onChange(item.key)} className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${active ? "border-[#C5A059] bg-[rgba(197,160,89,0.12)] text-[#F8E7B5]" : "border-[#2D2E2E] text-[#C5A059] hover:border-[#C5A059]"}`}>{item.label}</button>;
  })}</div>;
}
function QueueList({ title, rows, selected, onToggle, onTogglePage, page, setPage, loading, helper, totalRows = 0, pageSize = 20, renderStatuses = null, lastUpdated = null, limited = false, errorMessage = "" }) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(getProcessSelectionValue(row)));
  const totalPages = Math.max(1, Math.ceil(Number(totalRows || 0) / Math.max(1, pageSize)));
  const updatedLabel = lastUpdated ? new Date(lastUpdated).toLocaleString("pt-BR") : "nao atualizado";
  return <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{title}</p><span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.16em] opacity-70">{rows.length} nesta pagina</span><span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.16em] opacity-70">{totalRows} no total</span>{selected.length ? <span className="rounded-full border border-[#6E5630] bg-[rgba(76,57,26,0.22)] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#FDE68A]">{selected.length} selecionado(s)</span> : null}</div>{helper ? <p className="mt-1 text-xs leading-6 opacity-60">{helper}</p> : null}{totalRows ? <p className="mt-1 text-xs opacity-50">Pagina {page} de {totalPages}</p> : null}{lastUpdated !== undefined ? <p className="mt-1 text-xs opacity-50">Atualizado em {updatedLabel}</p> : null}{limited ? <p className="mt-1 text-xs text-[#FDE68A]">Fila em modo reduzido para evitar sobrecarga.</p> : null}{errorMessage ? <p className="mt-1 text-xs text-[#FECACA]">{errorMessage}</p> : null}</div><div className="flex flex-wrap gap-2"><ActionButton onClick={() => onTogglePage(!allSelected)} className="px-3 py-2 text-xs">{allSelected ? "Desmarcar pagina" : "Selecionar pagina"}</ActionButton><ActionButton onClick={() => setPage(Math.max(1, page - 1))} disabled={loading || page <= 1} className="px-3 py-2 text-xs">Anterior</ActionButton><ActionButton onClick={() => setPage(page + 1)} disabled={loading || page >= totalPages} className="px-3 py-2 text-xs">Proxima</ActionButton></div></div>{loading ? <p className="text-sm opacity-60">Carregando fila...</p> : null}{!loading && !rows.length ? <p className="rounded-2xl border border-dashed border-[#2D2E2E] px-4 py-6 text-sm opacity-60">Nenhum item encontrado nesta pagina.</p> : null}<div className="space-y-3">{rows.map((row) => { const selectionValue = getProcessSelectionValue(row); const statuses = renderStatuses ? renderStatuses(row) : []; return <label key={row.key} className="block cursor-pointer rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 transition hover:border-[#3A3E3D]"><div className="flex gap-3"><input type="checkbox" checked={selected.includes(selectionValue)} onChange={() => onToggle(selectionValue)} className="mt-1" /><div className="min-w-0 flex-1 space-y-2 text-sm"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold break-all">{row.numero_cnj || row.key}</p>{row.monitoramento_fallback ? <span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.16em] opacity-70">fallback</span> : null}</div>{row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}{statuses.length ? <div className="flex flex-wrap gap-2">{statuses.map((status) => <StatusBadge key={status.label} tone={status.tone}>{status.label}</StatusBadge>)}</div> : null}<div className="flex flex-wrap gap-x-4 gap-y-1 opacity-60 text-xs">{row.status_atual_processo ? <span>Status: {row.status_atual_processo}</span> : null}{row.quantidade_movimentacoes !== undefined ? <span>Movimentacoes: {row.quantidade_movimentacoes ?? 0}</span> : null}{row.monitoramento_ativo !== undefined ? <span>Monitorado: {row.monitoramento_ativo ? "sim" : "nao"}</span> : null}{row.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]" onClick={(e) => e.stopPropagation()}>Account {row.account_id_freshsales}</a> : <span>Sem Sales Account</span>}</div></div></div></label>; })}</div></div>;
}
function CoverageList({ rows, page, setPage, loading, totalRows = 0, pageSize = 20, onSelectProcess = null }) {
  const totalPages = Math.max(1, Math.ceil(Number(totalRows || 0) / Math.max(1, pageSize)));
  return <div className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold">Cobertura por processo</p><p className="mt-1 text-xs leading-6 opacity-60">Leitura consolidada do que ja esta coberto entre HMADV e Freshsales, por processo.</p><p className="mt-1 text-xs opacity-50">Pagina {page} de {totalPages} • {totalRows} processo(s) com pendencia</p></div><div className="flex flex-wrap gap-2"><ActionButton onClick={() => setPage(Math.max(1, page - 1))} disabled={loading || page <= 1} className="px-3 py-2 text-xs">Anterior</ActionButton><ActionButton onClick={() => setPage(page + 1)} disabled={loading || page >= totalPages} className="px-3 py-2 text-xs">Proxima</ActionButton></div></div>{loading ? <p className="text-sm opacity-60">Carregando cobertura...</p> : null}{!loading && !rows.length ? <p className="rounded-2xl border border-dashed border-[#2D2E2E] px-4 py-6 text-sm opacity-60">Nenhum processo com pendencia de cobertura nesta pagina.</p> : null}<div className="space-y-3">{rows.map((row) => <div key={row.key} className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div className="space-y-2"><p className="font-semibold break-all">{row.numero_cnj || row.key}</p>{row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}<div className="flex flex-wrap gap-2"><StatusBadge tone={row.coveragePct >= 85 ? "success" : row.coveragePct >= 55 ? "warning" : "danger"}>{row.coveragePct || 0}% coberto</StatusBadge>{(row.pending || []).slice(0, 6).map((label) => <StatusBadge key={`${row.key}-${label}`} tone="warning">{label.replace(/_/g, " ")}</StatusBadge>)}</div><div className="flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60"><span>Publicacoes pendentes: {row.publicacoesPendentes || 0}</span><span>Movimentacoes pendentes: {row.movimentacoesPendentes || 0}</span><span>Partes sem contato: {row.partesSemContato || 0}</span><span>Audiencias pendentes: {row.audienciasPendentes || 0}</span>{row.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Account {row.account_id_freshsales}</a> : <span>Sem Sales Account</span>}</div></div>{onSelectProcess ? <ActionButton onClick={() => onSelectProcess(row.numero_cnj)} className="px-3 py-2 text-xs">Usar no lote</ActionButton> : null}</div></div>)}</div></div>;
}
function RelationProcessCard({ title, process, fallbackNumber }) {
  return <div className="rounded-[24px] border border-[#2D2E2E] bg-[#050706] p-4"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{title}</p><p className="mt-3 break-all font-semibold">{process?.numero_cnj || fallbackNumber || "Sem CNJ"}</p><p className="mt-1 text-sm opacity-70">{process?.titulo || "Processo ainda nao encontrado na base judiciaria."}</p><div className="mt-2 flex flex-wrap gap-3 text-xs opacity-60">{process?.status_atual_processo ? <span>Status: {process.status_atual_processo}</span> : null}{process?.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${process.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Account {process.account_id_freshsales}</a> : null}</div></div>;
}
function StatusBadge({ children, tone = "default" }) {
  const tones = {
    default: "border-[#2D2E2E] text-[#F4F1EA]",
    success: "border-[#30543A] text-[#B7F7C6]",
    warning: "border-[#6E5630] text-[#FDE68A]",
    danger: "border-[#5B2D2D] text-[#FECACA]",
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
    if (!row?.account_id_freshsales) statuses.push({ label: "sem account", tone: "danger" });
  }
  if (queueKey === "monitoramento_ativo") {
    if (monitoringUnsupported && row?.monitoramento_fallback) {
      statuses.push({ label: "leitura inferida", tone: "warning" });
      statuses.push({ label: "schema pendente", tone: "danger" });
    } else if (row?.monitoramento_ativo === true) {
      statuses.push({ label: "monitoramento real", tone: "success" });
    }
  }
  if (queueKey === "monitoramento_inativo") {
    if (monitoringUnsupported) {
      statuses.push({ label: "sem monitoramento real", tone: "danger" });
      statuses.push({ label: "schema pendente", tone: "warning" });
    } else if (row?.monitoramento_ativo === false) {
      statuses.push({ label: "monitoramento inativo", tone: "danger" });
    }
  }
  if (queueKey === "campos_orfaos") {
    const gaps = countFrontendProcessGaps(row);
    if (gaps > 0) {
      statuses.push({ label: `${gaps} gaps crm`, tone: "warning" });
      statuses.push({ label: "apto para reparo", tone: "success" });
    }
  }
  if (queueKey === "movimentacoes_pendentes") {
    const pending = Number(row?.total_pendente || 0);
    if (pending > 0) statuses.push({ label: `${pending} andamentos pendentes`, tone: "warning" });
    if (row?.account_id_freshsales) statuses.push({ label: "apto para sync", tone: "success" });
    else statuses.push({ label: "sem sales account", tone: "danger" });
    if (row?.ultima_data) statuses.push({ label: `ultima ${new Date(row.ultima_data).toLocaleDateString("pt-BR")}`, tone: "default" });
  }
  if (queueKey === "publicacoes_pendentes") {
    const pending = Number(row?.total_pendente || 0);
    if (pending > 0) statuses.push({ label: `${pending} publicacoes pendentes`, tone: "warning" });
    if (row?.account_id_freshsales) statuses.push({ label: "apto para activity", tone: "success" });
    else statuses.push({ label: "sem sales account", tone: "danger" });
    if (row?.ultima_data) statuses.push({ label: `ultima ${new Date(row.ultima_data).toLocaleDateString("pt-BR")}`, tone: "default" });
  }
  if (queueKey === "partes_sem_contato") {
    const pending = Number(row?.total_pendente || 0);
    if (pending > 0) statuses.push({ label: `${pending} partes sem contato`, tone: "warning" });
    if (row?.account_id_freshsales) statuses.push({ label: "apto para reconciliar", tone: "success" });
    else statuses.push({ label: "sem sales account", tone: "danger" });
  }
  if (queueKey === "orfaos") {
    statuses.push({ label: "sem sales account", tone: "danger" });
    statuses.push({ label: "apto para criar account", tone: "warning" });
  }
  return statuses;
}
function PayloadDetails({ title, payload }) {
  if (!payload) return null;
  return <details className="mt-2 rounded-2xl border border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] p-3 text-xs opacity-75">
    <summary className="cursor-pointer list-none font-semibold uppercase tracking-[0.14em] text-[#C5A059]">{title}</summary>
    <pre className="mt-3 overflow-x-auto whitespace-pre-wrap opacity-80">{JSON.stringify(payload, null, 2)}</pre>
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
      title: "Criar accounts primeiro",
      body: "Ha processos orfaos selecionados. Priorize a criacao de Sales Accounts para liberar as proximas trilhas de sincronismo.",
      badges: [`${selectedOrphans.length} orfaos`, "acao: criar accounts"],
    };
  }
  if (selectedFieldGaps.length) {
    return {
      title: "Reparar CRM agora",
      body: "Os itens selecionados tem gap entre HMADV e Freshsales. O melhor proximo passo e corrigir campos no CRM.",
      badges: [`${selectedFieldGaps.length} gaps`, "acao: corrigir crm"],
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
      title: "Sincronizar movimentacoes no Freshsales",
      body: "Os processos selecionados ja tem andamentos no HMADV, mas ainda faltam activities no CRM. Vale priorizar esse reflexo antes de novos lotes amplos.",
      badges: [`${selectedMovementBacklog.length} com andamentos pendentes`, "acao: sync movimentacoes"],
    };
  }
  if (selectedPublicationBacklog.length) {
    return {
      title: "Sincronizar publicacoes no Freshsales",
      body: "Os processos selecionados ainda tem publicacoes sem sales_activity. Vale refletir esse historico no CRM antes de novas rodadas amplas.",
      badges: [`${selectedPublicationBacklog.length} com publicacoes pendentes`, "acao: sync publicacoes"],
    };
  }
  if (selectedPartesBacklog.length) {
    return {
      title: "Reconciliar partes com contatos",
      body: "Os processos selecionados ainda tem partes sem contato no Freshsales. A reconciliacao reduz perda de contexto no CRM e no portal.",
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
      title: monitoringUnsupported ? "Schema pendente para monitoramento" : "Reativar monitoramento",
      body: monitoringUnsupported
        ? "Existe selecao em monitoramento inativo, mas a coluna monitoramento_ativo ainda nao existe no HMADV."
        : "Ha processos fora do monitoramento. Reative a fila para recolocar o sync continuo em andamento.",
      badges: [`${selectedMonitoringInactive.length} inativos`, monitoringUnsupported ? "schema pendente" : "acao: ativar"],
    };
  }
  if (selectedMonitoringActive.length) {
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
  if (row.result?.ok === false || row.datajud?.ok === false || row.freshsales_repair?.ok === false) return "Falha operacional no lote";
  if ((row.movimentos_novos || 0) > 0 && (row.gaps_reduzidos || 0) > 0) return "DataJud trouxe movimentos e reduziu gaps";
  if ((row.movimentos_novos || 0) > 0) return "DataJud trouxe novos movimentos";
  if ((row.gaps_reduzidos || 0) > 0) return "Supabase ficou mais completo";
  if (row.freshsales_repair && !row.freshsales_repair?.skipped) return "CRM refletido com sucesso";
  if (row.freshsales_repair?.reason === "sem_gap_crm") return "CRM ja estava equilibrado";
  if (row.freshsales_repair?.reason === "sem_mudanca_util") return "Sem mudanca util para refletir no CRM";
  if (row.quantidade_movimentacoes === 0 || row.quantidade_movimentacoes === null) return "Processo ainda sem movimentacoes locais";
  return "Sem alteracoes relevantes";
}
function OperationResult({ result }) {
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
        <QueueSummaryCard title="Movimentacoes" count={counters.movimentacoes} helper="Andamentos refletidos no Freshsales." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Activities" count={counters.activities} helper="Sales Activities criadas ou atualizadas." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Sem account" count={counters.semAccount} helper="Pendencias sem Sales Account vinculada." accent="text-[#FDE68A]" />
        <QueueSummaryCard title="Falhas" count={counters.errors} helper="Itens que pedem revisao manual." accent="text-[#FECACA]" />
      </div>
      {result?.source ? <div className="rounded-2xl border border-[#1D2321] bg-[rgba(4,6,6,0.45)] px-4 py-3 text-xs uppercase tracking-[0.16em] opacity-65">Origem da execucao: {result.source}</div> : null}
      {rows.length ? rows.slice(0, 20).map((row, index) => <div key={`${row.numero_cnj || row.processo_id || row.id || index}`} className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm">
        <p className="font-semibold">{row.numero_cnj || row.id || `Linha ${index + 1}`}</p>
        {row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {row.status ? <StatusBadge tone={String(row.status).includes("sem") ? "warning" : "success"}>{String(row.status).replaceAll("_", " ")}</StatusBadge> : null}
          {typeof row.total_pendente === "number" ? <StatusBadge tone="warning">{row.total_pendente} pendentes</StatusBadge> : null}
          {row.account_id_freshsales ? <StatusBadge tone="success">account vinculada</StatusBadge> : <StatusBadge tone="danger">sem sales account</StatusBadge>}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-65">
          {row.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Abrir account {row.account_id_freshsales}</a> : null}
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
        <QueueSummaryCard title="Publicacoes" count={Number(result?.publicacoes || result?.publicacoesAtualizadas || 0)} helper="Publicacoes refletidas no Freshsales." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Activities" count={Number(result?.activitiesCriadas || 0)} helper="Sales Activities criadas ou atualizadas." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Sem account" count={Number(result?.semAccount || 0)} helper="Pendencias sem Sales Account vinculada." accent="text-[#FDE68A]" />
        <QueueSummaryCard title="Falhas" count={Number(result?.errors || 0)} helper="Itens que pedem revisao manual." accent="text-[#FECACA]" />
      </div>
      {result?.source ? <div className="rounded-2xl border border-[#1D2321] bg-[rgba(4,6,6,0.45)] px-4 py-3 text-xs uppercase tracking-[0.16em] opacity-65">Origem da execucao: {result.source}</div> : null}
      {rows.length ? rows.slice(0, 20).map((row, index) => <div key={`${row.numero_cnj || row.processo_id || row.id || index}`} className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm">
        <p className="font-semibold">{row.numero_cnj || row.id || `Linha ${index + 1}`}</p>
        {row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}
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
        <QueueSummaryCard title="Contatos criados" count={Number(result?.contatosCriados || 0)} helper="Novos contatos gerados no Freshsales." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Modo" count={result?.apply ? "Aplicar" : "Simular"} helper="Execucao da reconciliacao." accent="text-[#C5A059]" />
      </div>
      {rows.length ? rows.slice(0, 20).map((row, index) => <div key={`${row.numero_cnj || row.processo_id || index}`} className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm">
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
  return rows.length ? <div className="space-y-3"><div className="grid gap-3 md:grid-cols-7"><QueueSummaryCard title="Persistidos" count={counters.persistidos} helper="Consultas ou dados gravados no Supabase." accent="text-[#B7F7C6]" /><QueueSummaryCard title="Movimentos novos" count={counters.movimentos} helper="Andamentos agregados no lote." accent="text-[#B7F7C6]" /><QueueSummaryCard title="Gaps reduzidos" count={counters.gaps} helper="Campos antes vazios que foram preenchidos." accent="text-[#B7F7C6]" /><QueueSummaryCard title="CRM only" count={counters.crmOnly} helper="Itens que foram direto ao reparo CRM." accent="text-[#C5A059]" /><QueueSummaryCard title="CRM reparado" count={counters.reparados} helper="Accounts refletidas no Freshsales." accent="text-[#B7F7C6]" /><QueueSummaryCard title="Pendentes" count={counters.pendentes} helper="Processos ainda sem reparo no CRM." accent="text-[#FDE68A]" /><QueueSummaryCard title="Falhas" count={counters.falhas} helper="Itens que pedem revisao manual." accent="text-[#FECACA]" /></div><div className="rounded-2xl border border-[#1D2321] bg-[rgba(4,6,6,0.45)] px-4 py-3 text-xs uppercase tracking-[0.16em] opacity-65">Amostra operacional: {rows.length} item(ns)</div>{rows.slice(0, 20).map((row, index) => { const showPayloads = shouldShowProcessPayloadDetails(row); return <div key={`${row.numero_cnj || row.id || index}`} className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm"><p className="font-semibold">{row.numero_cnj || row.id || `Linha ${index + 1}`}</p>{row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}<p className="mt-2 text-sm opacity-80">{buildProcessResultHeadline(row)}</p>{renderProcessSyncStatuses(row).length ? <div className="mt-2 flex flex-wrap gap-2">{renderProcessSyncStatuses(row).map((item) => <StatusBadge key={item.label} tone={item.tone}>{item.label}</StatusBadge>)}</div> : null}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-65">{row.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Abrir account {row.account_id_freshsales}</a> : <span>Sem Sales Account</span>}{row.processo_id ? <span>Processo ID: {row.processo_id}</span> : null}{row.before ? <span>Antes: {row.before.quantidade_movimentacoes || 0} mov.</span> : null}{row.after ? <span>Depois: {row.after.quantidade_movimentacoes || 0} mov.</span> : null}</div>{showPayloads ? <><PayloadDetails title="Detalhes CRM" payload={row.freshsales_repair} /><PayloadDetails title="Detalhes persistencia" payload={row.result} /><PayloadDetails title="Detalhes DataJud" payload={row.datajud} /></> : null}</div>; })}</div> : <PayloadDetails title="Resultado completo" payload={result} />;
}
function HistoryCard({ entry, onReuse }) {
  return <div className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold">{entry.label}</p>{entry.meta?.intentLabel ? <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#C5A059]">{entry.meta.intentLabel}</p> : null}<p className="text-xs opacity-60">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p></div>
      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${entry.status === "running" ? "border-[#6E5630] text-[#FDE68A]" : entry.status === "error" ? "border-[#4B2222] text-red-200" : "border-[#2D2E2E] opacity-70"}`}>{entry.status}</span>
    </div>
    {entry.preview ? <p className="mt-3 opacity-70">{entry.preview}</p> : null}
    {entry.meta?.selectedCount ? <p className="mt-2 text-xs opacity-60">Itens selecionados: {entry.meta.selectedCount}</p> : null}
    {entry.meta?.limit ? <p className="mt-1 text-xs opacity-60">Lote: {entry.meta.limit}</p> : null}
    {entry.meta?.processNumbersPreview ? <p className="mt-2 break-all text-xs opacity-60">CNJs: {entry.meta.processNumbersPreview}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2"><ActionButton onClick={() => onReuse(entry)} className="px-3 py-2 text-xs">Reusar parametros</ActionButton></div>
  </div>;
}
function JobCard({ job, active = false }) {
  const processed = Number(job?.processed_count || 0);
  const requested = Number(job?.requested_count || 0);
  const percent = requested ? Math.min(100, Math.round((processed / requested) * 100)) : 0;
  return <div className={`rounded-[24px] border p-4 text-sm ${active ? "border-[#C5A059] bg-[rgba(76,57,26,0.18)]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold">{getProcessActionLabel(job?.acao, job?.payload || {})}</p>
        <p className="text-xs opacity-60">{job?.created_at ? new Date(job.created_at).toLocaleString("pt-BR") : "sem horario"}</p>
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
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
      <div className="h-full rounded-full bg-[#C5A059]" style={{ width: `${percent}%` }} />
    </div>
    <p className="mt-2 text-xs opacity-65">{buildJobPreview(job)}</p>
    {job?.last_error ? <p className="mt-2 text-xs text-red-200">{job.last_error}</p> : null}
  </div>;
}
function QueueSummaryCard({ title, count, helper, accent = "text-[#C5A059]" }) {
  return <div className="w-full rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-left">
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">{title}</p>
    <p className={`mt-2 font-serif text-3xl ${accent}`}>{count}</p>
    <p className="mt-2 text-sm opacity-65">{helper}</p>
  </div>;
}
function RemoteRunSummary({ entry }) {
  if (!entry) return null;
  const summary = entry.result_summary || {};
  const items = Object.entries(summary).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return <div className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">Ultimo ciclo HMADV</p>
        <p className="mt-1 font-semibold">{getProcessActionLabel(entry.acao, entry.payload || {})}</p>
        <p className="mt-1 text-xs opacity-60">{new Date(entry.created_at).toLocaleString("pt-BR")}</p>
      </div>
      <StatusBadge tone={entry.status === "error" ? "danger" : entry.status === "success" ? "success" : "default"}>{entry.status}</StatusBadge>
    </div>
    <div className="mt-3 flex flex-wrap gap-2">
      <StatusBadge>Solicitados {entry.requested_count || 0}</StatusBadge>
      <StatusBadge tone="success">Afetados {entry.affected_count || 0}</StatusBadge>
      {items.slice(0, 4).map(([key, value]) => <StatusBadge key={key} tone="warning">{key}: {String(value)}</StatusBadge>)}
    </div>
    {entry.resumo ? <p className="mt-3 text-sm opacity-70">{entry.resumo}</p> : null}
  </div>;
}
function deriveRemoteHealth(history = []) {
  const latest = history[0] || null;
  if (!latest) return [];
  const sameAction = history.filter((item) => item.acao === latest.acao).slice(0, 3);
  const badges = [];
  if (latest.status === "error") badges.push({ label: "ultima execucao com erro", tone: "danger" });
  if (Number(latest.affected_count || 0) === 0) badges.push({ label: "sem progresso", tone: "warning" });
  if (sameAction.length >= 2 && sameAction.every((item) => Number(item.affected_count || 0) === 0)) badges.push({ label: "fila reincidente", tone: "danger" });
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
  if (bands.critical > 0) return { title: "Ataque estrutural imediato", body: "Existem itens 4x+ reaparecendo. Priorize gargalos cronicos antes de rodar novos lotes amplos." };
  if (summary.manual > 0) return { title: "Revisao manual prioritaria", body: "Ha casos que continuam pedindo intervencao humana. Vale revisar retorno e regra antes de repetir a fila." };
  if (summary.freshsales > 0) return { title: "Corrigir CRM primeiro", body: "Os bloqueios recorrentes estao concentrados no Freshsales. Priorize criacao de account e reparo de campos." };
  if (summary.datajud > 0) return { title: "Reenriquecer via DataJud", body: "O principal gargalo recorrente esta no enriquecimento ou nas movimentacoes do DataJud." };
  if (summary.stagnant > 0) return { title: "Auditar lote sem progresso", body: "Ha recorrencias sem ganho util. Revise selecao, regra e cobertura antes de insistir no mesmo lote." };
  return { title: "Ciclo sob controle", body: "As recorrencias atuais parecem operacionais e podem ser drenadas pela fila normal com lotes menores." };
}
function deriveSuggestedProcessBatch(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) return { size: 5, reason: "Use lote minimo para validar correcao estrutural ou manual." };
  if (summary.freshsales > 0 || summary.datajud > 0) return { size: 10, reason: "Use lote curto para medir ganho antes de ampliar a rodada." };
  if (summary.stagnant > 0) return { size: 8, reason: "Reduza o lote para isolar por que a fila nao esta progredindo." };
  return { size: 20, reason: "A fila parece sob controle para um lote operacional padrao." };
}
function deriveSuggestedProcessActions(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) return ["Rodar auditoria", "Sincronizar Supabase + Freshsales", "Buscar movimentacoes no DataJud"];
  if (summary.freshsales > 0) return ["Criar accounts no Freshsales", "Corrigir campos no Freshsales", "Sincronizar Supabase + Freshsales"];
  if (summary.datajud > 0) return ["Buscar movimentacoes no DataJud", "Reenriquecer via DataJud", "Sincronizar Supabase + Freshsales"];
  if (summary.stagnant > 0) return ["Rodar auditoria", "Sincronizar Supabase + Freshsales"];
  return ["Sincronizar Supabase + Freshsales", "Rodar sync-worker"];
}
function derivePrimaryProcessAction(actions = []) {
  return actions[0] || "Sincronizar Supabase + Freshsales";
}
function deriveSuggestedProcessChecklist(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) {
    return [
      "Audite primeiro a amostra reincidente antes de ampliar o lote.",
      "Rode um lote curto de sincronismo Supabase + Freshsales.",
      "Se ainda faltar progresso, reconsulte movimentacoes no DataJud.",
    ];
  }
  if (summary.freshsales > 0) {
    return [
      "Crie ou recupere as accounts ausentes no Freshsales.",
      "Rode a correcao de campos do CRM.",
      "Feche o ciclo com sincronismo Supabase + Freshsales.",
    ];
  }
  if (summary.datajud > 0) {
    return [
      "Busque movimentacoes para os processos mais vazios.",
      "Reenriqueca os campos DataJud do lote curto.",
      "Sincronize o resultado consolidado no CRM.",
    ];
  }
  return [
    "Execute o sincronismo principal em lote controlado.",
    "Revise os itens que permanecerem sem progresso.",
    "Aumente o lote apenas se o ganho vier consistente.",
  ];
}
function suggestProcessNextAction(source, row, current) {
  if (current?.needsManualReview) return "revisar manualmente o retorno";
  if (source === "freshsales") {
    if (!row?.account_id_freshsales) return "criar account no freshsales";
    return "corrigir campos no freshsales";
  }
  if (source === "datajud") {
    if (row?.quantidade_movimentacoes === 0 || row?.before?.quantidade_movimentacoes === row?.after?.quantidade_movimentacoes) {
      return "buscar movimentacoes no datajud";
    }
    return "reenriquecer via datajud";
  }
  if (row?.monitoramento_ativo === false) return "reativar monitoramento";
  if (current?.noProgress) return "rodar auditoria do lote";
  return "sincronizar supabase + freshsales";
}
function RecurringProcessItem({ item }) {
  return <div className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-semibold break-all">{item.key}</p>
      <StatusBadge tone="danger">{item.hits} ciclos</StatusBadge>
      {recurrenceBand(item.hits) ? <StatusBadge tone={recurrenceBand(item.hits).tone}>{recurrenceBand(item.hits).label}</StatusBadge> : null}
      <StatusBadge tone="warning">{ACTION_LABELS[item.lastAction] || item.lastAction}</StatusBadge>
      <StatusBadge tone={sourceTone(item.source)}>{sourceLabel(item.source)}</StatusBadge>
      {item.noProgress ? <StatusBadge tone="warning">sem progresso estrutural</StatusBadge> : null}
      {item.needsManualReview ? <StatusBadge tone="danger">precisa intervencao manual</StatusBadge> : null}
      {item.nextAction ? <StatusBadge tone="success">{item.nextAction}</StatusBadge> : null}
    </div>
    {item.titulo ? <p className="mt-2 opacity-70">{item.titulo}</p> : null}
  </div>;
}
function RecurringProcessGroup({ title, helper, items }) {
  if (!items.length) return null;
  return <div className="space-y-3">
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs opacity-60">{helper}</p>
    </div>
    <div className="space-y-3">
      {items.map((item) => <RecurringProcessItem key={item.key} item={item} />)}
    </div>
  </div>;
}

export default function InternoProcessosPage() {
  return <RequireAdmin>{(profile) => <InternoLayout profile={profile} title="Gestao de Processos" description="Painel operacional para sincronizacao DataJud, criacao de accounts, correcao de gaps no Freshsales e vinculacao de processos relacionados."><InternoProcessosContent /></InternoLayout>}</RequireAdmin>;
}

function InternoProcessosContent() {
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
  const bootstrappedRef = useRef(false);
  const snapshotPayloadRef = useRef("");
  const [limit, setLimit] = useState(2);
  const [processNumbers, setProcessNumbers] = useState("");
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
  const [relations, setRelations] = useState({ loading: true, error: null, items: [], totalRows: 0, page: 1 });
  const [search, setSearch] = useState("");
  const [lookup, setLookup] = useState({ loading: false, items: [] });
  const [lookupTerm, setLookupTerm] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingRelationId, setEditingRelationId] = useState(null);

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
    setModuleHistory("processos", { executionHistory, remoteHistory });
  }, [executionHistory, remoteHistory]);
  useEffect(() => {
    const saved = loadUiState();
    if (saved) {
      if (saved.view && PROCESS_VIEW_ITEMS.some((item) => item.key === saved.view)) setView(saved.view);
      if (saved.processNumbers) setProcessNumbers(String(saved.processNumbers));
      if (saved.limit) setLimit(Number(saved.limit) || 2);
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
      if (Array.isArray(saved.selectedWithoutMovements)) setSelectedWithoutMovements(saved.selectedWithoutMovements);
      if (Array.isArray(saved.selectedMovementBacklog)) setSelectedMovementBacklog(saved.selectedMovementBacklog);
      if (Array.isArray(saved.selectedPublicationBacklog)) setSelectedPublicationBacklog(saved.selectedPublicationBacklog);
      if (Array.isArray(saved.selectedPartesBacklog)) setSelectedPartesBacklog(saved.selectedPartesBacklog);
      if (Array.isArray(saved.selectedAudienciaCandidates)) setSelectedAudienciaCandidates(saved.selectedAudienciaCandidates);
      if (Array.isArray(saved.selectedMonitoringActive)) setSelectedMonitoringActive(saved.selectedMonitoringActive);
      if (Array.isArray(saved.selectedMonitoringInactive)) setSelectedMonitoringInactive(saved.selectedMonitoringInactive);
      if (Array.isArray(saved.selectedFieldGaps)) setSelectedFieldGaps(saved.selectedFieldGaps);
      if (Array.isArray(saved.selectedOrphans)) setSelectedOrphans(saved.selectedOrphans);
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
      processNumbers,
      limit,
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
      selectedWithoutMovements,
      selectedMovementBacklog,
      selectedPublicationBacklog,
      selectedPartesBacklog,
      selectedAudienciaCandidates,
      selectedMonitoringActive,
      selectedMonitoringInactive,
      selectedFieldGaps,
      selectedOrphans,
    });
  }, [view, processNumbers, limit, wmPage, movPage, pubPage, partesPage, audPage, maPage, miPage, fgPage, orphanPage, covPage, search, selectedWithoutMovements, selectedMovementBacklog, selectedPublicationBacklog, selectedPartesBacklog, selectedAudienciaCandidates, selectedMonitoringActive, selectedMonitoringInactive, selectedFieldGaps, selectedOrphans]);
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
      const relationCalls = shouldLoadRelations ? [loadRelations(1, search)] : [];
      await Promise.all([...baseCalls, ...queueCalls, ...coverageCalls, ...relationCalls]);
      if (!cancelled) bootstrappedRef.current = true;
    }
    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [uiHydrated, view]);
  useEffect(() => {
    if (globalError) {
      setOperationalStatus({ mode: "error", message: globalError, updatedAt: new Date().toISOString() });
      return;
    }
    const queues = [withoutMovements, movementBacklog, publicationBacklog, partesBacklog, audienciaCandidates, monitoringActive, monitoringInactive, fieldGaps, orphans];
    const limitedCount = queues.filter((queue) => queue?.limited).length;
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
      setProcessCoverage({ loading: false, items: [], totalRows: 0, page, pageSize: 20, unsupported: true });
      pushQueueRefresh("cobertura");
      return;
    }
    setProcessCoverage((state) => ({ ...state, loading: true }));
    try {
      const payload = await adminFetch(`/api/admin-hmadv-processos?action=cobertura_processos&page=${page}&pageSize=20`);
      setProcessCoverage({ loading: false, items: payload.data.items || [], totalRows: payload.data.totalRows || 0, page: payload.data.page || page, pageSize: payload.data.pageSize || 20, unsupported: false });
      pushQueueRefresh("cobertura");
    } catch {
      setProcessCoverage({ loading: false, items: [], totalRows: 0, page, pageSize: 20, unsupported: false });
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
    try { const payload = await adminFetch(`/api/admin-hmadv-processos?action=relacoes&page=${page}&pageSize=20&query=${encodeURIComponent(query || "")}`); setRelations({ loading: false, error: null, items: payload.data.items || [], totalRows: payload.data.totalRows || 0, page: payload.data.page || page }); } catch (error) { setRelations({ loading: false, error: error.message || "Falha ao carregar relacoes.", items: [], totalRows: 0, page }); }
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
  function useCoverageProcess(number) {
    if (!number) return;
    const next = uniqueProcessNumbers([...getCombinedSelectedNumbers(), String(number || "").trim()]);
    setProcessNumbers(next.join("\n"));
    updateView("operacao");
  }
  function updateView(nextView) {
    setView(nextView);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    url.hash = nextView;
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
      setActionState({ loading: false, error: null, result: payload.data }); setForm(EMPTY_FORM); setEditingRelationId(null); await loadRelations(relations.page, search);
    } catch (error) { setActionState({ loading: false, error: error.message || "Falha ao salvar relacao.", result: null }); }
  }
  async function handleDeleteRelation(id) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-processos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "remover_relacao", id }) });
      setActionState({ loading: false, error: null, result: payload.data }); await loadRelations(relations.page, search);
    } catch (error) { setActionState({ loading: false, error: error.message || "Falha ao remover relacao.", result: null }); }
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
  const quickStats = useMemo(() => [{ label: "Processos totais", value: data.processosTotal || 0, helper: "Carteira persistida no HMADV." }, { label: "Com account", value: data.processosComAccount || 0, helper: "Sales Accounts ja vinculadas." }, { label: "Sem account", value: data.processosSemAccount || 0, helper: "Processos orfaos." }, { label: "Sem movimentacoes", value: data.processosSemMovimentacao || 0, helper: "Fila de reconsulta DataJud." }, { label: "Movimentacoes pendentes", value: movementBacklog.totalRows || data.movimentacoesPendentes || 0, helper: "Andamentos ainda sem activity no Freshsales." }, { label: "Publicacoes pendentes", value: publicationBacklog.totalRows || data.publicacoesPendentes || 0, helper: "Publicacoes ainda sem activity no Freshsales." }, { label: "Partes sem contato", value: partesBacklog.totalRows || data.partesSemContato || 0, helper: "Processos com partes ainda sem contato vinculado." }, { label: "Cobertura auditada", value: processCoverage.totalRows || 0, helper: "Processos com leitura consolidada de cobertura nesta consulta." }, { label: "Audiencias detectaveis", value: audienciaCandidates.totalRows || 0, helper: "Processos com audiencia pendente nas publicacoes." }, { label: "Audiencias no banco", value: data.audienciasTotal || 0, helper: "Persistidas em judiciario.audiencias." }], [data, movementBacklog.totalRows, publicationBacklog.totalRows, partesBacklog.totalRows, processCoverage.totalRows, audienciaCandidates.totalRows]);
  const relationTypeSummary = useMemo(() => relations.items.reduce((acc, item) => { acc[item.tipo_relacao] = (acc[item.tipo_relacao] || 0) + 1; return acc; }, {}), [relations.items]);
  const latestHistory = executionHistory[0] || null;
  const latestRemoteRun = remoteHistory[0] || null;
  const latestJob = jobs[0] || null;
  const remoteHealth = deriveRemoteHealth(remoteHistory);
  const monitoringUnsupported = Boolean(monitoringActive.unsupported || monitoringInactive.unsupported);
  const recurringProcesses = deriveRecurringProcessEntries(remoteHistory);
  const recurringProcessSummary = summarizeRecurringProcessEntries(recurringProcesses);
  const recurringProcessBands = summarizeRecurrenceBands(recurringProcesses);
  const recurringProcessGroups = groupRecurringProcessEntries(recurringProcesses);
  const recurringProcessFocus = deriveRecurringProcessFocus(recurringProcessSummary, recurringProcessBands);
  const recurringProcessBatch = deriveSuggestedProcessBatch(recurringProcessSummary, recurringProcessBands);
  const recurringProcessActions = deriveSuggestedProcessActions(recurringProcessSummary, recurringProcessBands);
  const recurringProcessChecklist = deriveSuggestedProcessChecklist(recurringProcessSummary, recurringProcessBands);
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
  const isSuggestedAction = (action, intent = "") => {
    if (!selectionSuggestedAction) return false;
    return selectionSuggestedAction.key === action && String(selectionSuggestedAction.intent || "") === String(intent || "");
  };
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

  return <div className="space-y-8">
    <section className="rounded-[34px] border border-[#2D2E2E] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_35%),linear-gradient(180deg,rgba(13,15,14,0.98),rgba(8,10,10,0.98))] px-6 py-6 md:px-7">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-3xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C5A059]">Centro operacional</p>
          <h3 className="mt-3 font-serif text-4xl leading-tight">Sincronismo de processos, monitoramento e reparo CRM em uma unica trilha.</h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 opacity-65">A tela agora separa operacao, filas, relacoes e resultado em visoes distintas. Isso reduz ruido visual e preserva memoria do que foi executado nesta sessao de trabalho.</p>
        </div>
        <div className="flex flex-col gap-3 rounded-[26px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] p-4 text-sm">
          <div className="flex items-center justify-between gap-4"><span className="opacity-60">Selecionados no momento</span><strong className="font-serif text-2xl">{selectedSummary}</strong></div>
          <div className="flex items-center justify-between gap-4"><span className="opacity-60">Ultima acao</span><span className="text-right text-xs uppercase tracking-[0.16em] text-[#C5A059]">{actionState.loading ? "executando" : actionState.error ? "erro" : actionState.result ? "concluida" : "aguardando"}</span></div>
          {latestHistory ? <p className="text-xs opacity-60">{latestHistory.label}: {latestHistory.preview}</p> : null}
        </div>
      </div>
        <div className="mt-6 space-y-4">
          <ViewToggle value={view} onChange={updateView} />
          <div className={`rounded-[20px] border p-4 text-xs ${operationalStatus.mode === "error" ? "border-[#4B2222] bg-[rgba(127,29,29,0.15)] text-red-200" : operationalStatus.mode === "limited" ? "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#FDE68A]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] text-[#C5A059]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="uppercase tracking-[0.18em] text-[10px]">Status operacional</span>
              <span className="text-[10px] uppercase tracking-[0.16em] opacity-70">{operationalStatus.updatedAt ? new Date(operationalStatus.updatedAt).toLocaleTimeString("pt-BR") : ""}</span>
            </div>
            <p className="mt-2">{operationalStatus.message || "Operacao normal"}</p>
          </div>
          <div className={`rounded-[20px] border p-4 text-xs ${backendHealth.status === "error" ? "border-[#4B2222] bg-[rgba(127,29,29,0.15)] text-red-200" : backendHealth.status === "warning" ? "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#FDE68A]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] text-[#C5A059]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="uppercase tracking-[0.18em] text-[10px]">Saude do backend</span>
              <span className="text-[10px] uppercase tracking-[0.16em] opacity-70">{backendHealth.updatedAt ? new Date(backendHealth.updatedAt).toLocaleTimeString("pt-BR") : ""}</span>
            </div>
            <p className="mt-2">{backendHealth.message || "Sem historico recente."}</p>
          </div>
          <div className="rounded-[26px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.55)] p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">Ciclo completo</p>
              <p className="mt-1 text-sm opacity-75">Disparo unico para DataJud + Advise + Freshsales com drenagem automatica.</p>
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
          <div className="mt-3 grid gap-2 text-xs opacity-75 md:grid-cols-2">
            <p><strong>Cobertura:</strong> {Number(runnerCoverage?.coverage_coveredRows || 0)} cobertos / {Number(runnerCoverage?.coverage_totalRows || 0)} total</p>
            <p><strong>Tag datajud:</strong> {Number(runnerTagged?.tagged_fullyCovered || 0)} completos</p>
          </div>
          {runnerAction?.datajud_action_manualActionRequired ? <p className="mt-2 text-xs text-[#FECACA]">A prioridade atual ainda depende de acao manual no Freshsales.</p> : null}
        </div>
        {queueRefreshLog.length ? (
          <div className="rounded-[22px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] p-4 text-xs">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">Ultimas filas atualizadas</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {queueRefreshLog.map((item) => (
                <span key={item.key} className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.14em] opacity-70">
                  {item.label} • {new Date(item.ts).toLocaleTimeString("pt-BR")}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {latestRemoteRun ? <RemoteRunSummary entry={latestRemoteRun} /> : null}
        {remoteHealth.length ? <div className="flex flex-wrap gap-2">{remoteHealth.map((item) => <StatusBadge key={item.label} tone={item.tone}>{item.label}</StatusBadge>)}</div> : null}
      </div>
    </section>

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{quickStats.map((card) => <MetricCard key={card.label} label={card.label} value={card.value} helper={card.helper} />)}</div>

    {view === "operacao" ? <div id="operacao" className="grid gap-6 xl:grid-cols-2">
      <Panel title="Fila operacional" eyebrow="Sincronismo Freshsales + Supabase">
        <div className="space-y-4">
          {latestJob ? <JobCard job={latestJob} active={latestJob.id === activeJobId} /> : null}
          <label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">CNJs para foco manual</span><textarea value={processNumbers} onChange={(e) => setProcessNumbers(e.target.value)} rows={4} placeholder="Opcional: cole CNJs manualmente, um por linha." className="w-full rounded-[22px] border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none transition focus:border-[#C5A059]" /></label>
          <label className="block max-w-[220px]"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">Lote</span><input type="number" min="1" max="30" value={limit} onChange={(e) => setLimit(Number(e.target.value || 2))} className="w-full rounded-2xl border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none transition focus:border-[#C5A059]" /><span className="mt-2 block text-xs leading-5 opacity-55">Lotes maiores ficam disponiveis na operacao, com reducao automatica so quando a acao tiver um teto tecnico mais baixo.</span></label>
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
            <div className="rounded-[22px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] p-4 text-xs leading-6 opacity-70">
              <p><strong className="text-[#F4F1EA]">Selecao atual:</strong> {combinedSelectedNumbers.length ? combinedSelectedNumbers.slice(0, 8).join(", ") : "nenhum processo selecionado nas filas"}</p>
              <p className="mt-2">As acoes principais agora podem virar job persistido no HMADV. O painel acompanha progresso, continua em lote curto e avisa ao concluir sem depender de cliques repetidos.</p>
              {snapshotAt ? <p className="mt-2 opacity-55">Memoria local restauravel atualizada em {new Date(snapshotAt).toLocaleString("pt-BR")}.</p> : null}
            </div>
          <div className="rounded-[22px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] p-4 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">Proximo passo sugerido</p>
            <p className="mt-2 font-semibold">{selectionActionHint.title}</p>
            <p className="mt-2 opacity-70">{selectionActionHint.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectionActionHint.badges.map((badge) => <StatusBadge key={badge} tone="warning">{badge}</StatusBadge>)}
            </div>
          </div>
        </div>
      </Panel>
      <Panel title="Reenriquecimento DataJud" eyebrow="Consulta e persistencia">
        <div className="space-y-4">
          <p className="text-sm opacity-70">Aqui ficam os passos granulares. Eles usam primeiro a selecao da fila atual e, se ela estiver vazia, aproveitam os CNJs digitados manualmente.</p>
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
            <div className="rounded-[22px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] p-4 text-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">Fluxo 1</p><p className="mt-2 font-semibold">Persistir consulta</p><p className="mt-2 opacity-65">Salvar DataJud no Supabase sem depender de reparo imediato no CRM.</p></div>
            <div className="rounded-[22px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] p-4 text-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">Fluxo 2</p><p className="mt-2 font-semibold">Corrigir CRM</p><p className="mt-2 opacity-65">Refletir os campos no Freshsales depois que o processo ja estiver consistente no banco.</p></div>
            <div className="rounded-[22px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] p-4 text-sm"><p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">Fluxo 3</p><p className="mt-2 font-semibold">Usar pipeline unica</p><p className="mt-2 opacity-65">O comando combinado executa as duas etapas e devolve o que foi persistido e o que foi reparado.</p></div>
          </div>
        </div>
      </Panel>
    </div> : null}

    {view === "filas" ? <div id="filas" className="space-y-6">
      {recurringProcesses.length ? <Panel title="Pendencias reincidentes" eyebrow="Prioridade operacional">
        <div className="space-y-4">
          <div className="rounded-[24px] border border-[#6E5630] bg-[rgba(76,57,26,0.16)] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F8E7B5]">Foco recomendado</p>
            <p className="mt-2 font-semibold">{recurringProcessFocus.title}</p>
            <p className="mt-2 text-sm opacity-75">{recurringProcessFocus.body}</p>
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
              {recurringProcessChecklist.map((step, index) => <div key={step} className="flex items-start gap-3 text-sm opacity-80">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#6E5630] text-[11px] font-semibold text-[#F8E7B5]">{index + 1}</span>
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
      <Panel title="Cobertura por processo" eyebrow="Auditoria local">
        {processCoverage.unsupported ? (
          <div className="rounded-[22px] border border-dashed border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#F8E7B5]">
            O schema de cobertura ainda nao foi aplicado no HMADV. Assim que a migracao estiver ativa, esta leitura vai mostrar o percentual real de cobertura por processo.
          </div>
        ) : (
          <CoverageList rows={processCoverage.items} page={covPage} setPage={setCovPage} loading={processCoverage.loading} totalRows={processCoverage.totalRows} pageSize={processCoverage.pageSize} onSelectProcess={useCoverageProcess} />
        )}
      </Panel>
      <Panel title="Processos sem movimentacoes" eyebrow="Fila paginada"><QueueList title="Sem movimentacoes" helper="Itens sem andamento local para reconsulta no DataJud." rows={withoutMovements.items} selected={selectedWithoutMovements} onToggle={(key) => toggleSelection(setSelectedWithoutMovements, selectedWithoutMovements, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedWithoutMovements, selectedWithoutMovements, withoutMovements.items, nextState)} page={wmPage} setPage={setWmPage} loading={withoutMovements.loading} totalRows={withoutMovements.totalRows} pageSize={withoutMovements.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "sem_movimentacoes")} lastUpdated={withoutMovements.updatedAt} limited={withoutMovements.limited} /></Panel>
      <Panel title="Movimentacoes pendentes" eyebrow="Fila paginada"><QueueList title="Andamentos sem activity" helper="Processos com movimentacoes no HMADV ainda sem reflexo em sales_activities do Freshsales." rows={movementBacklog.items} selected={selectedMovementBacklog} onToggle={(key) => toggleSelection(setSelectedMovementBacklog, selectedMovementBacklog, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedMovementBacklog, selectedMovementBacklog, movementBacklog.items, nextState)} page={movPage} setPage={setMovPage} loading={movementBacklog.loading} totalRows={movementBacklog.totalRows} pageSize={movementBacklog.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "movimentacoes_pendentes")} lastUpdated={movementBacklog.updatedAt} limited={movementBacklog.limited} /></Panel>
      <Panel title="Publicacoes pendentes" eyebrow="Fila paginada"><QueueList title="Publicacoes sem activity" helper="Processos com publicacoes no HMADV ainda sem reflexo em sales_activities do Freshsales." rows={publicationBacklog.items} selected={selectedPublicationBacklog} onToggle={(key) => toggleSelection(setSelectedPublicationBacklog, selectedPublicationBacklog, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedPublicationBacklog, selectedPublicationBacklog, publicationBacklog.items, nextState)} page={pubPage} setPage={setPubPage} loading={publicationBacklog.loading} totalRows={publicationBacklog.totalRows} pageSize={publicationBacklog.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "publicacoes_pendentes")} lastUpdated={publicationBacklog.updatedAt} limited={publicationBacklog.limited} /></Panel>
      <Panel title="Partes sem contato" eyebrow="Fila paginada"><QueueList title="Partes a reconciliar" helper="Processos com partes ainda sem contato_freshsales_id, prontos para reconciliacao com o modulo de contatos." rows={partesBacklog.items} selected={selectedPartesBacklog} onToggle={(key) => toggleSelection(setSelectedPartesBacklog, selectedPartesBacklog, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedPartesBacklog, selectedPartesBacklog, partesBacklog.items, nextState)} page={partesPage} setPage={setPartesPage} loading={partesBacklog.loading} totalRows={partesBacklog.totalRows} pageSize={partesBacklog.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "partes_sem_contato")} lastUpdated={partesBacklog.updatedAt} limited={partesBacklog.limited} /></Panel>
      <Panel title="Audiencias detectaveis" eyebrow="Fila paginada"><QueueList title="Retroativo de audiencias" helper="Processos com sinais concretos de audiencia nas publicacoes e ainda sem persistencia equivalente." rows={audienciaCandidates.items} selected={selectedAudienciaCandidates} onToggle={(key) => toggleSelection(setSelectedAudienciaCandidates, selectedAudienciaCandidates, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedAudienciaCandidates, selectedAudienciaCandidates, audienciaCandidates.items, nextState)} page={audPage} setPage={setAudPage} loading={audienciaCandidates.loading} totalRows={audienciaCandidates.totalRows} pageSize={audienciaCandidates.pageSize} renderStatuses={(row) => [{ label: `${row.audiencias_pendentes || 0} audiencias pendentes`, tone: "warning" }, row.proxima_data_audiencia ? { label: `proxima ${new Date(row.proxima_data_audiencia).toLocaleDateString("pt-BR")}`, tone: "default" } : null].filter(Boolean)} lastUpdated={audienciaCandidates.updatedAt} limited={audienciaCandidates.limited} /></Panel>
      <Panel title="Monitoramento ativo" eyebrow="Fila paginada"><div className="space-y-4">{monitoringUnsupported ? <div className="rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#F8E7B5]">A coluna <strong>monitoramento_ativo</strong> ainda nao existe no HMADV. A fila segue em modo de leitura por fallback, mas ativar/desativar monitoramento fica indisponivel ate a migracao do schema.</div> : null}<QueueList title="Monitorados" helper="Se a base ainda nao marca monitoramento_ativo, o painel usa fallback pelos processos com account." rows={monitoringActive.items} selected={selectedMonitoringActive} onToggle={(key) => toggleSelection(setSelectedMonitoringActive, selectedMonitoringActive, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedMonitoringActive, selectedMonitoringActive, monitoringActive.items, nextState)} page={maPage} setPage={setMaPage} loading={monitoringActive.loading} totalRows={monitoringActive.totalRows} pageSize={monitoringActive.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "monitoramento_ativo", { monitoringUnsupported })} lastUpdated={monitoringActive.updatedAt} limited={monitoringActive.limited} />{monitoringUnsupported ? <div className="rounded-[18px] border border-dashed border-[#6E5630] px-4 py-3 text-xs leading-6 text-[#F8E7B5]">Escrita de monitoramento temporariamente indisponivel: aplique a migracao do schema para liberar ativacao e desativacao pela fila.</div> : <div className="flex flex-wrap gap-3"><ActionButton onClick={() => handleAction("monitoramento_status", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringActive.items, selectedMonitoringActive).join("\n")), active: false, limit })} disabled={actionState.loading}>Desativar monitoramento</ActionButton></div>}</div></Panel>
      <Panel title="Monitoramento inativo" eyebrow="Fila paginada"><div className="space-y-4">{monitoringUnsupported ? <div className="rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#F8E7B5]">Sem a coluna <strong>monitoramento_ativo</strong>, esta fila nao consegue gravar alteracoes. O painel mostra apenas o que precisa de adequacao de schema.</div> : null}<QueueList title="Nao monitorados" helper="Use esta fila para reativar o sync dos processos que ficaram fora da rotina." rows={monitoringInactive.items} selected={selectedMonitoringInactive} onToggle={(key) => toggleSelection(setSelectedMonitoringInactive, selectedMonitoringInactive, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedMonitoringInactive, selectedMonitoringInactive, monitoringInactive.items, nextState)} page={miPage} setPage={setMiPage} loading={monitoringInactive.loading} totalRows={monitoringInactive.totalRows} pageSize={monitoringInactive.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "monitoramento_inativo", { monitoringUnsupported })} lastUpdated={monitoringInactive.updatedAt} limited={monitoringInactive.limited} />{monitoringUnsupported ? <div className="rounded-[18px] border border-dashed border-[#6E5630] px-4 py-3 text-xs leading-6 text-[#F8E7B5]">A reativacao fica bloqueada ate a criacao da coluna <strong>monitoramento_ativo</strong> no HMADV.</div> : <div className="flex flex-wrap gap-3"><ActionButton tone="primary" onClick={() => handleAction("monitoramento_status", { processNumbers: resolveActionProcessNumbers(getSelectedNumbers(monitoringInactive.items, selectedMonitoringInactive).join("\n")), active: true, limit })} disabled={actionState.loading}>Ativar monitoramento</ActionButton></div>}</div></Panel>
      <Panel title="GAP DataJud -> CRM" eyebrow="Campos orfaos"><QueueList title="Campos pendentes no Freshsales" helper="Processos vinculados cujo espelho ainda tem campos importantes em branco." rows={fieldGaps.items} selected={selectedFieldGaps} onToggle={(key) => toggleSelection(setSelectedFieldGaps, selectedFieldGaps, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedFieldGaps, selectedFieldGaps, fieldGaps.items, nextState)} page={fgPage} setPage={setFgPage} loading={fieldGaps.loading} totalRows={fieldGaps.totalRows} pageSize={fieldGaps.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "campos_orfaos")} lastUpdated={fieldGaps.updatedAt} limited={fieldGaps.limited} /></Panel>
      <Panel title="Sem Sales Account" eyebrow="Processos orfaos"><QueueList title="Orfaos" helper="Itens do HMADV que ainda nao viraram Sales Account." rows={orphans.items} selected={selectedOrphans} onToggle={(key) => toggleSelection(setSelectedOrphans, selectedOrphans, key)} onTogglePage={(nextState) => togglePageSelection(setSelectedOrphans, selectedOrphans, orphans.items, nextState)} page={orphanPage} setPage={setOrphanPage} loading={orphans.loading} totalRows={orphans.totalRows} pageSize={orphans.pageSize} renderStatuses={(row) => renderQueueRowStatuses(row, "orfaos")} lastUpdated={orphans.updatedAt} limited={orphans.limited} /></Panel>
      </div>
    </div> : null}

    {view === "relacoes" ? <div id="relacoes" className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <Panel title="Vincular processos relacionados" eyebrow="Arvore processual">
        <div className="space-y-4">{editingRelationId ? <div className="rounded-2xl border border-[#6E5630] bg-[rgba(76,57,26,0.22)] px-4 py-3 text-sm">Editando relacao existente. Salve novamente para atualizar o vinculo.</div> : null}<Field label="Processo principal / pai" value={form.numero_cnj_pai} onChange={(value) => setForm((current) => ({ ...current, numero_cnj_pai: value }))} placeholder="CNJ do processo principal" /><Field label="Processo relacionado / filho" value={form.numero_cnj_filho} onChange={(value) => setForm((current) => ({ ...current, numero_cnj_filho: value }))} placeholder="CNJ do apenso, incidente, recurso ou dependencia" /><div className="grid gap-4 md:grid-cols-2"><SelectField label="Tipo de relacao" value={form.tipo_relacao} onChange={(value) => setForm((current) => ({ ...current, tipo_relacao: value }))} options={[{ value: "dependencia", label: "Dependencia" }, { value: "apenso", label: "Apenso" }, { value: "incidente", label: "Incidente" }, { value: "recurso", label: "Recurso" }]} /><SelectField label="Status" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[{ value: "ativo", label: "Ativo" }, { value: "inativo", label: "Inativo" }]} /></div><label className="block"><span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] opacity-50">Observacoes</span><textarea value={form.observacoes} onChange={(e) => setForm((current) => ({ ...current, observacoes: e.target.value }))} rows={4} className="w-full rounded-[22px] border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none transition focus:border-[#C5A059]" placeholder="Ex.: recurso distribuido por dependencia do principal." /></label><div className="flex flex-wrap gap-3"><ActionButton tone="primary" onClick={handleSaveRelation} disabled={actionState.loading}>{editingRelationId ? "Atualizar relacao" : "Salvar relacao"}</ActionButton><ActionButton onClick={() => { setForm(EMPTY_FORM); setEditingRelationId(null); }} disabled={actionState.loading}>{editingRelationId ? "Cancelar edicao" : "Limpar formulario"}</ActionButton></div></div>
      </Panel>
      <Panel title="Busca rapida de processos" eyebrow="Apoio operacional">
        <div className="space-y-4"><Field label="Buscar por CNJ ou titulo" value={lookupTerm} onChange={setLookupTerm} placeholder="Digite o CNJ ou parte do titulo" />{lookup.loading ? <p className="text-sm opacity-60">Buscando processos...</p> : null}{!lookup.loading && !lookup.items.length && lookupTerm.trim() ? <p className="text-sm opacity-60">Nenhum processo encontrado para esse termo.</p> : null}<div className="space-y-3">{lookup.items.map((item) => <div key={item.id || item.numero_cnj} className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4 text-sm"><p className="font-semibold">{item.numero_cnj || "Sem CNJ"}</p><p className="mt-1 opacity-70">{item.titulo || "Sem titulo"}</p><div className="mt-2 flex flex-wrap gap-3 text-xs opacity-60"><span>Status: {item.status || "sem_status"}</span>{item.account_id_freshsales ? <a href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${item.account_id_freshsales}`} target="_blank" rel="noreferrer" className="underline hover:text-[#C5A059]">Account {item.account_id_freshsales}</a> : null}</div><div className="mt-3 flex flex-wrap gap-2"><ActionButton onClick={() => setForm((current) => ({ ...current, numero_cnj_pai: item.numero_cnj || current.numero_cnj_pai }))} className="px-3 py-2 text-xs">Usar como pai</ActionButton><ActionButton onClick={() => setForm((current) => ({ ...current, numero_cnj_filho: item.numero_cnj || current.numero_cnj_filho }))} className="px-3 py-2 text-xs">Usar como filho</ActionButton></div></div>)}</div></div>
      </Panel>
    </div> : null}

    {view === "relacoes" ? <Panel title="Relacoes processuais cadastradas" eyebrow="Reflexo no portal">
      <div className="mb-4 flex flex-wrap items-center gap-3"><input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filtrar por CNJ relacionado" className="min-w-[280px] rounded-2xl border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm outline-none focus:border-[#C5A059]" /><ActionButton onClick={() => loadRelations(1, search)} className="px-4 py-2">Atualizar</ActionButton><ActionButton onClick={() => loadRelations(Math.max(1, relations.page - 1), search)} disabled={relations.loading || relations.page <= 1} className="px-4 py-2">Anterior</ActionButton><ActionButton onClick={() => loadRelations(relations.page + 1, search)} disabled={relations.loading || !relations.items.length} className="px-4 py-2">Proxima</ActionButton></div>
      {relations.items.length ? <div className="mb-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.15em] opacity-70">{Object.entries(relationTypeSummary).map(([key, value]) => <span key={key} className="border border-[#2D2E2E] px-2 py-1">{key}: {value}</span>)}</div> : null}
      {relations.loading ? <p className="text-sm opacity-60">Carregando relacoes...</p> : null}
      {relations.error ? <p className="text-sm text-red-300">{relations.error}</p> : null}
      {!relations.loading && !relations.items.length ? <p className="text-sm opacity-60">Nenhuma relacao cadastrada ainda.</p> : null}
      <div className="space-y-4">{relations.items.map((item) => <div key={item.id} className="rounded-[28px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.72)] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.15em]"><span className="border border-[#2D2E2E] px-2 py-1">{item.tipo_relacao}</span><span className="border border-[#2D2E2E] px-2 py-1">{item.status}</span></div><div className="flex gap-2"><ActionButton onClick={() => startEditing(item)} disabled={actionState.loading} className="px-3 py-2 text-xs">Editar</ActionButton><ActionButton tone="danger" onClick={() => handleDeleteRelation(item.id)} disabled={actionState.loading} className="px-3 py-2 text-xs">Remover</ActionButton></div></div><div className="mt-4 grid gap-4 md:grid-cols-2"><RelationProcessCard title="Processo principal" process={item.processo_pai} fallbackNumber={item.numero_cnj_pai} /><RelationProcessCard title="Processo relacionado" process={item.processo_filho} fallbackNumber={item.numero_cnj_filho} /></div>{item.observacoes ? <p className="mt-3 text-sm opacity-65">{item.observacoes}</p> : null}</div>)}</div>
    </Panel> : null}

    {view === "resultado" ? <div id="resultado" className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <Panel title="Resultado da ultima acao" eyebrow="Retorno operacional">{actionState.loading ? <p className="text-sm opacity-65">Executando acao...</p> : null}{actionState.error ? <p className="rounded-2xl border border-[#4B2222] bg-[rgba(127,29,29,0.18)] p-4 text-sm text-red-200">{actionState.error}</p> : null}{!actionState.loading && actionState.result?.drain ? <div className="mb-4 rounded-[20px] border border-[#30543A] bg-[rgba(48,84,58,0.12)] p-4 text-sm"><p className="font-semibold">Drenagem de fila</p><p className="mt-2 opacity-75">{buildDrainPreview(actionState.result.drain)}</p></div> : null}{jobs.length ? <div className="mb-4 space-y-3"><p className="text-xs uppercase tracking-[0.16em] opacity-55">Jobs persistidos</p>{jobs.slice(0, 4).map((job) => <JobCard key={job.id} job={job} active={job.id === activeJobId} />)}</div> : null}{!actionState.loading && !actionState.error && actionState.result ? <OperationResult result={actionState.result} /> : null}{!actionState.loading && !actionState.error && !actionState.result ? <p className="text-sm opacity-65">Nenhuma acao executada ainda nesta sessao.</p> : null}</Panel>
      <CompactHistoryPanel localHistory={executionHistory} remoteHistory={remoteHistory} />
    </div> : null}
  </div>;
}
