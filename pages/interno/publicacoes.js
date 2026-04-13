import { useEffect, useMemo, useRef, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import { OperationalHistoryCompactCard, OperationalResultCard } from "../../components/interno/OperationalResultPanels";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch as adminFetchRaw } from "../../lib/admin/api";
import { appendActivityLog, appendFrontendIssue, setModuleHistory, updateActivityLog } from "../../lib/admin/activity-log";

const PUBLICACOES_VIEW_ITEMS = [
  { key: "operacao", label: "Operacao" },
  { key: "filas", label: "Filas" },
  { key: "resultado", label: "Resultado" },
];
const HISTORY_STORAGE_KEY = "hmadv:interno-publicacoes:history:v1";
const UI_STATE_STORAGE_KEY = "hmadv:interno-publicacoes:ui:v1";
const VALIDATION_STORAGE_KEY = "hmadv:interno-publicacoes:validations:v1";
const ACTION_LABELS = {
  criar_processos_publicacoes: "Criar processos das publicacoes",
  backfill_partes: "Extracao retroativa de partes",
  sincronizar_partes: "Salvar partes + atualizar polos + corrigir CRM",
  reconciliar_partes_contatos: "Reconciliar partes com contatos",
  run_sync_worker: "Rodar sync-worker (activities/CRM)",
  run_pending_jobs: "Drenar fila HMADV",
};
const CONTACT_TYPE_OPTIONS = [
  "Cliente",
  "Parte Adversa",
  "Advogado Adverso",
  "Correspondente",
  "Terceiro Interessado",
  "Prestador de Servico",
  "Fornecedor",
  "Perito",
  "Juiz",
  "Promotor",
  "Desembargador",
  "Testemunha",
];
const ASYNC_PUBLICACOES_ACTIONS = new Set([
  "criar_processos_publicacoes",
  "backfill_partes",
  "sincronizar_partes",
  "reconciliar_partes_contatos",
]);
const QUEUE_ERROR_TTL_MS = 1000 * 60 * 3;
const GLOBAL_ERROR_TTL_MS = 1000 * 60 * 2;
const PROCESS_QUEUE_REFRESH_TTL_MS = 1000 * 8;
const PARTES_QUEUE_REFRESH_TTL_MS = 1000 * 45;
const PARTES_QUEUE_RESOURCE_ERROR_TTL_MS = 1000 * 90;
const MODULE_LIMITS = {
  maxCreateProcess: 15,
  maxBackfillPartes: 50,
  maxSyncPartes: 20,
  maxSyncWorker: 2,
  maxDefault: 20,
};
const PUBLICACOES_QUEUE_VIEWS = new Set(["operacao", "filas"]);
const QUEUE_LABELS = {
  candidatos_processos: "Processos criaveis",
  candidatos_partes: "Partes extraiveis",
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

function getSafePublicacoesActionLimit(action, requestedLimit) {
  const normalized = Number(requestedLimit || 0) || 0;
  if (action === "sincronizar_partes") return Math.max(1, Math.min(normalized || 10, MODULE_LIMITS.maxSyncPartes));
  if (action === "criar_processos_publicacoes") return Math.max(1, Math.min(normalized || 10, MODULE_LIMITS.maxCreateProcess));
  if (action === "backfill_partes") return Math.max(1, Math.min(normalized || 15, MODULE_LIMITS.maxBackfillPartes));
  if (action === "reconciliar_partes_contatos") return Math.max(1, Math.min(normalized || 5, 10));
  if (action === "run_sync_worker") return Math.max(1, Math.min(normalized || 2, MODULE_LIMITS.maxSyncWorker));
  return Math.max(1, Math.min(normalized || MODULE_LIMITS.maxDefault, MODULE_LIMITS.maxDefault));
}

function getPublicacoesActionLabel(action) {
  return ACTION_LABELS[action] || action || "publicacoes";
}

function buildHistoryPreview(result) {
  if (!result) return "";
  if (result.erro) return String(result.erro);
  if (result.uiHint) return String(result.uiHint);
  if (typeof result.processosCriados === "number") return `Processos criados: ${result.processosCriados}`;
  if (typeof result.partesInseridas === "number") return `Partes inseridas: ${result.partesInseridas}`;
  if (typeof result.processosAtualizados === "number") return `Processos atualizados: ${result.processosAtualizados}`;
  if (typeof result.accountsReparadas === "number") return `Accounts reparadas: ${result.accountsReparadas}`;
  if (typeof result.publicacoes === "number") return `Publicacoes processadas: ${result.publicacoes}`;
  if (typeof result.total === "number") return `Total: ${result.total}`;
  if (typeof result.affected_count === "number" || typeof result.requested_count === "number") {
    return `Sync-worker: ${Number(result.affected_count || 0)} afetado(s) de ${Number(result.requested_count || 0)} solicitado(s)`;
  }
  if (typeof result.items?.length === "number") return `Itens retornados: ${result.items.length}`;
  if (typeof result.sample?.length === "number") return `Amostra: ${result.sample.length}`;
  return "Execucao concluida";
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

function isResourceLimitError(error) {
  const text = String(error?.payload || error?.message || error || "").toLowerCase();
  return text.includes("worker exceeded resource limits");
}

function parseCopilotContext(rawValue) {
  if (!rawValue) return null;
  try {
    return JSON.parse(String(rawValue));
  } catch {
    return null;
  }
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

function getPublicacaoSelectionValue(row) {
  return String(row?.numero_cnj || row?.publicacao_id || row?.id || row?.key || "").trim();
}

function matchesPublicacaoSelection(row, selectedValues = []) {
  const selectionValue = getPublicacaoSelectionValue(row);
  return Boolean(selectionValue) && selectedValues.includes(selectionValue);
}

function loadValidationState() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(VALIDATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistValidationState(value) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VALIDATION_STORAGE_KEY, JSON.stringify(value || {}));
  } catch {}
}

function validationTone(status) {
  if (status === "validado") return "success";
  if (status === "bloqueado") return "danger";
  if (status === "revisar") return "warning";
  return "default";
}

function validationLabel(status) {
  if (status === "validado") return "validado";
  if (status === "bloqueado") return "bloqueado";
  if (status === "revisar") return "revisar";
  return "sem validacao";
}

function formatValidationMeta(validation) {
  if (!validation?.updatedAt && !validation?.updatedBy) return "";
  const parts = [];
  if (validation.updatedBy) parts.push(String(validation.updatedBy));
  if (validation.updatedAt) {
    const date = new Date(validation.updatedAt);
    parts.push(Number.isNaN(date.getTime()) ? String(validation.updatedAt) : date.toLocaleString("pt-BR"));
  }
  return parts.join(" • ");
}

function formatDateTimeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("pt-BR");
}

function formatFallbackReason(reason) {
  if (reason === "edge_function_unavailable") return "Fallback local apos falha da edge function.";
  if (reason === "local_backlog_path") return "Processamento local orientado pelo backlog.";
  if (reason === "edge_function_unavailable_or_empty") return "Fallback local apos resposta vazia ou indisponivel.";
  return reason ? String(reason) : "";
}

function formatUpstreamWarningText(upstreamWarning) {
  if (!upstreamWarning) return "";
  const parts = [];
  if (upstreamWarning.functionName) parts.push(`Funcao: ${upstreamWarning.functionName}`);
  if (upstreamWarning.status) parts.push(`HTTP ${upstreamWarning.status}`);
  if (upstreamWarning.message) parts.push(upstreamWarning.message);
  return parts.join(" - ");
}

function CompactHistoryPanel({ localHistory, remoteHistory, className = "" }) {
  const latestLocal = localHistory[0];
  const latestRemote = remoteHistory[0];
  return (
    <div className={`border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 ${className}`.trim()}>
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">Historico (compacto)</p>
      <div className="space-y-3 text-sm">
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
            <p className="mt-1">{latestRemote.acao} • {latestRemote.status}</p>
          ) : (
            <p className="mt-1 opacity-60">Sem registros remotos.</p>
          )}
        </div>
        <p className="text-xs opacity-60">Detalhes completos no Console &gt; Log.</p>
      </div>
    </div>
  );
}

function candidateQueueHasReadMismatch(queue) {
  return Number(queue?.totalRows || 0) > 0 && !(queue?.items || []).length;
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

function MetricCard({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">{label}</p>
      <p className="font-serif text-3xl mb-2">{value}</p>
      {helper ? <p className="text-sm opacity-65 leading-relaxed">{helper}</p> : null}
    </div>
  );
}

function QueueSummaryCard({ title, count, helper, accent = "text-[#C5A059]" }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">{title}</p>
      <p className={`font-serif text-3xl mb-2 ${accent}`}>{count}</p>
      <p className="text-sm opacity-65 leading-relaxed">{helper}</p>
    </div>
  );
}

function RemoteRunSummary({ entry, actionLabels }) {
  if (!entry) return null;
  const summary = entry.result_summary || {};
  const items = Object.entries(summary).filter(([, value]) => value !== undefined && value !== null && value !== "");
  const statusTone = entry.status === "error" ? "border-[#5B2D2D] text-[#FECACA]" : entry.status === "success" ? "border-[#30543A] text-[#B7F7C6]" : "border-[#2D2E2E] text-[#F4F1EA]";
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.15em] uppercase opacity-50">Ultimo ciclo HMADV</p>
          <p className="mt-1 font-semibold">{actionLabels[entry.acao] || entry.acao}</p>
          <p className="mt-1 text-xs opacity-60">{new Date(entry.created_at).toLocaleString("pt-BR")}</p>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${statusTone}`}>{entry.status}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-[#2D2E2E] px-2 py-1">Solicitados {entry.requested_count || 0}</span>
        <span className="rounded-full border border-[#30543A] px-2 py-1 text-[#B7F7C6]">Afetados {entry.affected_count || 0}</span>
        {items.slice(0, 4).map(([key, value]) => <span key={key} className="rounded-full border border-[#6E5630] px-2 py-1 text-[#FDE68A]">{key}: {String(value)}</span>)}
      </div>
      {entry.resumo ? <p className="mt-3 text-sm opacity-70">{entry.resumo}</p> : null}
    </div>
  );
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
function deriveRecurringPublicacoes(history = []) {
  const counts = new Map();
  for (const entry of history.slice(0, 6)) {
    const rows = Array.isArray(entry?.result_sample) ? entry.result_sample : [];
    for (const row of rows) {
      const key = row?.numero_cnj || row?.processo_id || row?.id;
      if (!key) continue;
      const current = counts.get(key) || {
        key,
        titulo: row?.titulo || row?.titulo_processo || "",
        hits: 0,
        lastAction: entry.acao,
        source: "advise",
        needsManualReview: false,
        noProgress: false,
        nextAction: "rodar sync-worker",
      };
      current.hits += 1;
      if (!current.titulo && (row?.titulo || row?.titulo_processo)) current.titulo = row?.titulo || row?.titulo_processo;
      current.lastAction = entry.acao;
      current.source = classifyPublicacaoRecurringSource(entry, row);
      current.needsManualReview = current.needsManualReview || publicacaoNeedsManualReview(row);
      current.noProgress = current.noProgress || publicacaoHasNoProgress(entry, row);
      current.nextAction = suggestPublicacaoNextAction(current.source, row, current);
      counts.set(key, current);
    }
  }
  return Array.from(counts.values()).filter((item) => item.hits > 1).sort((a, b) => b.hits - a.hits).slice(0, 8);
}
function summarizeRecurringPublicacoes(items = []) {
  return items.reduce((acc, item) => {
    acc.total += 1;
    acc[item.source] = (acc[item.source] || 0) + 1;
    if (item.needsManualReview) acc.manual += 1;
    if (item.noProgress) acc.stagnant += 1;
    return acc;
  }, { total: 0, supabase: 0, freshsales: 0, datajud: 0, advise: 0, manual: 0, stagnant: 0 });
}
function classifyPublicacaoRecurringSource(entry, row) {
  if (entry?.acao === "run_sync_worker") return "freshsales";
  if (entry?.acao === "criar_processos_publicacoes") return "advise";
  if (row?.accountsReparadas || row?.freshsales_repair) return "freshsales";
  if ((row?.partes_detectadas || row?.partes_novas || 0) > 0 || row?.publicacoes_lidas > 0) return "advise";
  return "supabase";
}
function publicacaoNeedsManualReview(row) {
  return Boolean(
    row?.erro ||
    row?.freshsales_repair?.ok === false ||
    row?.freshsales_repair?.skipped
  );
}
function publicacaoHasNoProgress(entry, row) {
  if (Number(entry?.affected_count || 0) === 0) return true;
  return Number(row?.partesInseridas || 0) === 0 &&
    Number(row?.processosAtualizados || 0) === 0 &&
    Number(row?.accountsReparadas || 0) === 0 &&
    !row?.processo_criado;
}
function recurringSourceTone(source) {
  if (source === "freshsales") return "warning";
  if (source === "advise") return "danger";
  if (source === "datajud") return "danger";
  return "default";
}
function recurringSourceLabel(source) {
  if (source === "freshsales") return "gargalo freshsales";
  if (source === "advise") return "gargalo advise";
  if (source === "datajud") return "gargalo datajud";
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
function groupRecurringPublicacoes(items = []) {
  return {
    critical: items.filter((item) => item.hits >= 4),
    reincident: items.filter((item) => item.hits === 3),
    recurring: items.filter((item) => item.hits === 2),
  };
}
function deriveRecurringPublicacoesFocus(summary, bands) {
  if (bands.critical > 0) return { title: "Ataque estrutural imediato", body: "Existem publicacoes 4x+ reaparecendo. Priorize o gargalo cronico antes de ampliar o lote." };
  if (summary.manual > 0) return { title: "Revisao manual prioritaria", body: "Ha publicacoes que continuam pedindo leitura humana ou ajuste de regra." };
  if (summary.advise > 0) return { title: "Extracao Advise primeiro", body: "O principal gargalo recorrente esta na leitura, criacao de processo ou extracao de partes das publicacoes." };
  if (summary.freshsales > 0) return { title: "Drenar CRM e activities", body: "A fila recorrente esta mais concentrada no reflexo para Freshsales e nas activities." };
  if (summary.stagnant > 0) return { title: "Auditar lote sem progresso", body: "Ha recorrencias sem ganho util. Revise selecao, regra de extracao e limite do lote." };
  return { title: "Ciclo sob controle", body: "As recorrencias atuais parecem operacionais e podem ser drenadas com lotes menores e correcoes pontuais." };
}
function deriveSuggestedPublicacoesBatch(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) return { size: 5, reason: "Use lote minimo para validar regra e evitar retrabalho em massa." };
  if (summary.advise > 0 || summary.freshsales > 0) return { size: 10, reason: "Use lote curto para medir extracao, reparo e reflexo em CRM." };
  if (summary.stagnant > 0) return { size: 8, reason: "Reduza o lote para isolar por que a fila nao esta ganhando progresso." };
  return { size: 20, reason: "A fila parece sob controle para uma rodada operacional padrao." };
}
function deriveSuggestedPublicacoesActions(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) return ["Extracao retroativa de partes", "Salvar partes + atualizar polos + corrigir CRM", "Auditar publicacoes reincidentes"];
  if (summary.advise > 0) return ["Criar processos das publicacoes", "Extracao retroativa de partes", "Salvar partes + atualizar polos + corrigir CRM"];
  if (summary.freshsales > 0) return ["Rodar sync-worker (activities/CRM)", "Salvar partes + atualizar polos + corrigir CRM"];
  if (summary.stagnant > 0) return ["Extracao retroativa de partes", "Salvar partes + atualizar polos + corrigir CRM"];
  return ["Salvar partes + atualizar polos + corrigir CRM", "Extracao retroativa de partes"];
}
function derivePrimaryPublicacoesAction(actions = []) {
  return actions[0] || "Salvar partes + atualizar polos + corrigir CRM";
}
function deriveSuggestedPublicacoesChecklist(summary, bands) {
  if (bands.critical > 0 || summary.manual > 0) {
    return [
      "Revise primeiro a amostra das publicacoes criticas.",
      "Rode extracao retroativa em lote minimo.",
      "So depois repare polos e CRM no lote validado.",
    ];
  }
  if (summary.advise > 0) {
    return [
      "Crie os processos faltantes a partir das publicacoes.",
      "Extraia e salve as partes no Supabase.",
      "Atualize polos e corrija o reflexo no Freshsales.",
    ];
  }
  if (summary.freshsales > 0) {
    return [
      "Rode o sync-worker em lote curto apenas para pendencias de activity/CRM.",
      "Reaplique a consolidacao de partes e polos.",
      "Confirme que as activities passaram a refletir no CRM.",
    ];
  }
  return [
    "Execute a trilha principal em lote controlado.",
    "Reavalie os itens sem progresso antes de ampliar a rodada.",
    "Aumente o lote apenas quando o ganho vier consistente.",
  ];
}
function suggestPublicacaoNextAction(source, row, current) {
  if (current?.needsManualReview) return "revisar manualmente a publicacao";
  if (source === "freshsales") return "rodar sync-worker";
  if (source === "advise") {
    if (!row?.processo_criado && !row?.processo_depois) return "criar processo da publicacao";
    if ((row?.partes_detectadas || row?.partes_novas || 0) > 0) return "salvar partes e atualizar polos";
    return "reler publicacao no advise";
  }
  if (current?.noProgress) return "auditar fila de publicacoes";
  return "salvar partes + corrigir crm";
}
function RecurringPublicacaoItem({ item }) {
  return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <p className="font-semibold break-all">{item.key}</p>
      <HealthBadge label={`${item.hits} ciclos`} tone="danger" />
      {recurrenceBand(item.hits) ? <HealthBadge label={recurrenceBand(item.hits).label} tone={recurrenceBand(item.hits).tone} /> : null}
      <HealthBadge label={ACTION_LABELS[item.lastAction] || item.lastAction} tone="warning" />
      <HealthBadge label={recurringSourceLabel(item.source)} tone={recurringSourceTone(item.source)} />
      {item.noProgress ? <HealthBadge label="sem progresso estrutural" tone="warning" /> : null}
      {item.needsManualReview ? <HealthBadge label="precisa intervencao manual" tone="danger" /> : null}
      {item.nextAction ? <HealthBadge label={item.nextAction} tone="success" /> : null}
    </div>
    {item.titulo ? <p className="mt-2 opacity-70">{item.titulo}</p> : null}
  </div>;
}
function RecurringPublicacaoGroup({ title, helper, items }) {
  if (!items.length) return null;
  return <div className="space-y-3">
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs opacity-60">{helper}</p>
    </div>
    <div className="space-y-3">
      {items.map((item) => <RecurringPublicacaoItem key={item.key} item={item} />)}
    </div>
  </div>;
}

function HealthBadge({ label, tone }) {
  const classes = {
    success: "border-[#30543A] text-[#B7F7C6]",
    warning: "border-[#6E5630] text-[#FDE68A]",
    danger: "border-[#5B2D2D] text-[#FECACA]",
    default: "border-[#2D2E2E] text-[#F4F1EA]",
  };
  return <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${classes[tone] || classes.default}`}>{label}</span>;
}

function Panel({ title, eyebrow, children, className = "" }) {
  return (
    <section className={`border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 ${className}`.trim()}>
      {eyebrow ? (
        <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#C5A059" }}>
          {eyebrow}
        </p>
      ) : null}
      <h3 className="font-serif text-2xl mb-4">{title}</h3>
      {children}
    </section>
  );
}

function ViewToggle({ value, onChange }) {
  return <div className="flex flex-wrap gap-2">{PUBLICACOES_VIEW_ITEMS.map((item) => {
    const active = item.key === value;
    return <button key={item.key} type="button" onClick={() => onChange(item.key)} className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${active ? "border-[#C5A059] bg-[rgba(197,160,89,0.12)] text-[#F8E7B5]" : "border-[#2D2E2E] text-[#C5A059] hover:border-[#C5A059]"}`}>{item.label}</button>;
  })}</div>;
}

function QueueList({
  title,
  helper,
  rows,
  selected,
  onToggle,
  onTogglePage,
  page,
  setPage,
  loading,
  totalRows = 0,
  pageSize = 20,
  totalEstimated = false,
  lastUpdated = null,
  limited = false,
  errorMessage = "",
}) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(getPublicacaoSelectionValue(row)));
  const totalPages = Math.max(1, Math.ceil(Number(totalRows || 0) / Math.max(1, pageSize)));
  function freshsalesUrl(accountId) {
    return accountId ? `https://hmadv-org.myfreshworks.com/crm/sales/accounts/${accountId}` : null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          {helper ? <p className="text-xs opacity-60">{helper}</p> : null}
          {totalRows ? <p className="text-xs opacity-50 mt-1">Pagina {page} de {totalPages} - {totalRows} no total</p> : null}
          {lastUpdated !== undefined ? <p className="text-xs opacity-50 mt-1">Atualizado em {lastUpdated ? new Date(lastUpdated).toLocaleString("pt-BR") : "nao atualizado"}</p> : null}
          {limited ? <p className="text-xs text-[#FDE68A] mt-1">Fila em modo reduzido para evitar sobrecarga.</p> : null}
          {errorMessage ? <p className="text-xs text-[#FECACA] mt-1">{errorMessage}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onTogglePage(!allSelected)}
            className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]"
          >
            {allSelected ? "Desmarcar pagina" : "Selecionar pagina"}
          </button>
          <button
            type="button"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={loading || page <= 1}
            className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setPage(page + 1)}
            disabled={loading || page >= totalPages}
            className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40"
          >
            Proxima
          </button>
        </div>
      </div>

      {loading ? <p className="text-sm opacity-60">Carregando fila...</p> : null}
      {!loading && !rows.length ? <p className="text-sm opacity-60">Nenhum item encontrado nesta pagina.</p> : null}
      <div className="space-y-3">
        {rows.map((row) => {
          const selectionValue = getPublicacaoSelectionValue(row);
          return (
          <label key={selectionValue || row.key} className="block border border-[#2D2E2E] p-4 cursor-pointer">
            <div className="flex gap-3">
              <input
                type="checkbox"
                checked={selected.includes(selectionValue)}
                onChange={() => onToggle(selectionValue)}
                className="mt-1"
              />
              <div className="min-w-0 flex-1 space-y-1 text-sm">
                <p className="font-semibold break-all">{row.numero_cnj || row.key}</p>
                {row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}
                {row.snippet ? <p className="opacity-60 line-clamp-3">{row.snippet}</p> : null}
                <div className="flex flex-wrap gap-x-4 gap-y-1 opacity-60 text-xs">
                  {row.publicacoes ? <span>Publicacoes: {row.publicacoes}</span> : null}
                  {row.ultima_publicacao ? <span>Ultima publicacao: {row.ultima_publicacao}</span> : null}
                  {row.partes_novas ? <span>Partes novas: {row.partes_novas}</span> : null}
                  {row.partes_existentes !== undefined ? <span>Partes existentes: {row.partes_existentes}</span> : null}
                  {row.account_id_freshsales ? (
                    <a
                      href={freshsalesUrl(row.account_id_freshsales)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline hover:text-[#C5A059]"
                      onClick={(event) => event.stopPropagation()}
                    >
                      Processo: {row.numero_cnj || row.account_id_freshsales}
                    </a>
                  ) : null}
                </div>
                {row.sample_partes_novas?.length ? (
                  <p className="text-xs opacity-60">
                    Novas: {row.sample_partes_novas.map((item) => `${item.nome} (${item.polo})`).join(" | ")}
                  </p>
                ) : null}
                {row.sample_partes_existentes?.length ? (
                  <p className="text-xs opacity-50">
                    Ja existentes: {row.sample_partes_existentes.map((item) => `${item.nome} (${item.polo})`).join(" | ")}
                  </p>
                ) : null}
              </div>
            </div>
          </label>
        )})}
      </div>
    </div>
  );
}

function IntegratedQueueList({
  rows,
  totalRows,
  selectedCount,
  page,
  setPage,
  pageSize,
  onOpenDetail,
  onToggleRow,
  onTogglePage,
  onToggleAllFiltered,
  allPageSelected,
  allFilteredSelected,
  limited = false,
  totalEstimated = false,
  errorMessage = "",
}) {
  const totalPages = Math.max(1, Math.ceil(Number(totalRows || rows.length || 0) / Math.max(1, pageSize)));
  const pagedRows = rows;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">Lista operacional integrada</p>
          <p className="text-xs opacity-60">Mesma leitura de filas, agora em modo de lista para validar, editar e agir em lote.</p>
          <p className="mt-1 text-xs opacity-50">{totalRows || rows.length || 0} item(ns) filtrado(s). {selectedCount} marcado(s).</p>
          {limited ? <p className="mt-1 text-xs text-[#FDE68A]">Leitura parcial protegida. A lista e a selecao de filtrados podem representar apenas a amostra carregada.</p> : null}
          {totalEstimated ? <p className="mt-1 text-xs opacity-60">O total atual e estimado porque a fila foi consolidada em multiplas leituras paginadas.</p> : null}
          {errorMessage ? <p className="mt-1 text-xs text-[#FECACA]">{errorMessage}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onTogglePage(!allPageSelected)} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">
            {allPageSelected ? "Desmarcar pagina" : "Selecionar pagina"}
          </button>
          <button type="button" onClick={() => onToggleAllFiltered(!allFilteredSelected)} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">
            {allFilteredSelected ? "Desmarcar filtrados" : "Selecionar filtrados"}
          </button>
          <button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40">
            Anterior
          </button>
          <button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40">
            Proxima
          </button>
        </div>
      </div>
      {!pagedRows.length ? <p className="text-sm opacity-60">Nenhum item atende aos filtros atuais.</p> : null}
      <div className="space-y-3">
        {pagedRows.map((row) => {
          const isSelected = Boolean(row.selected);
          return (
            <div key={row.unifiedKey} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4">
              <div className="flex gap-3">
                <input type="checkbox" checked={isSelected} onChange={() => onToggleRow(row)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold break-all">{row.numero_cnj || row.key}</p>
                    <HealthBadge label={row.queueSource === "partes" ? "enriquecimento de partes" : "criacao de processo"} tone={row.queueSource === "partes" ? "warning" : "default"} />
                    <HealthBadge label={validationLabel(row.validation?.status)} tone={validationTone(row.validation?.status)} />
                    {row.account_id_freshsales ? <HealthBadge label={`account ${row.account_id_freshsales}`} tone="success" /> : null}
                    {row.partes_novas ? <HealthBadge label={`${row.partes_novas} novas`} tone="warning" /> : null}
                  </div>
                  {row.titulo ? <p className="mt-2 opacity-75">{row.titulo}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60">
                    <span>Origem: {row.queueSource}</span>
                    <span>{row.enrichmentLabel}: {row.enrichmentCount || 0}</span>
                    {row.partes_existentes !== undefined ? <span>Partes existentes: {row.partes_existentes}</span> : null}
                    {row.partes_detectadas !== undefined ? <span>Detectadas: {row.partes_detectadas}</span> : null}
                  </div>
                  {row.validation?.note ? <p className="mt-2 text-xs opacity-60">Validacao: {row.validation.note}</p> : null}
                  {formatValidationMeta(row.validation) ? <p className="mt-1 text-xs opacity-50">Auditoria: {formatValidationMeta(row.validation)}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => onOpenDetail(row)} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">
                      Ver detalhe
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PublicacaoDetailPanel({
  detailState,
  detailEditForm,
  setDetailEditForm,
  detailLinkType,
  setDetailLinkType,
  selectedPendingParteIds,
  selectedLinkedParteIds,
  onTogglePendingParte,
  onToggleLinkedParte,
  onTogglePendingPage,
  onToggleLinkedPage,
  onLinkPendingPartes,
  onMoveLinkedPartes,
  onReclassifyLinkedPartes,
  onUnlinkLinkedPartes,
  onRefresh,
  onSaveContact,
  onApplyValidation,
  actionLoading,
}) {
  const row = detailState?.row || null;
  const data = detailState?.data || null;
  const linkedItems = data?.linkedPartes?.items || [];
  const pendingItems = data?.pendingPartes?.items || [];
  const firstLinkedContact = linkedItems.find((item) => item?.contact?.freshsales_contact_id)?.contact || data?.contactDetail?.contact || null;
  const allPendingSelected = pendingItems.length > 0 && pendingItems.every((item) => selectedPendingParteIds.includes(item.id));
  const allLinkedSelected = linkedItems.length > 0 && linkedItems.every((item) => selectedLinkedParteIds.includes(item.id));
  return (
    <div className="space-y-4">
      {!row ? <p className="text-sm opacity-60">Selecione um item da lista para abrir o detalhe integrado.</p> : null}
      {row ? <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold break-all">{row.numero_cnj}</p>
          <HealthBadge label={row.queueSource} tone={row.queueSource === "partes" ? "warning" : "default"} />
          <HealthBadge label={validationLabel(row.validation?.status)} tone={validationTone(row.validation?.status)} />
        </div>
        {row.titulo ? <p className="mt-2 text-sm opacity-75">{row.titulo}</p> : null}
        {formatValidationMeta(row.validation) ? <p className="mt-2 text-xs opacity-55">Ultima validacao: {formatValidationMeta(row.validation)}</p> : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={onRefresh} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">
            Recarregar detalhe
          </button>
          <button type="button" onClick={() => onApplyValidation("validado")} className="border border-[#30543A] px-3 py-2 text-xs text-[#B7F7C6]">
            Validar
          </button>
          <button type="button" onClick={() => onApplyValidation("revisar")} className="border border-[#6E5630] px-3 py-2 text-xs text-[#FDE68A]">
            Marcar revisar
          </button>
          <button type="button" onClick={() => onApplyValidation("bloqueado")} className="border border-[#5B2D2D] px-3 py-2 text-xs text-[#FECACA]">
            Bloquear
          </button>
        </div>
      </div> : null}
      {detailState.loading ? <p className="text-sm opacity-60">Carregando detalhe integrado...</p> : null}
      {detailState.error ? <p className="text-sm text-red-300">{detailState.error}</p> : null}
      {data?.coverage?.totalRows > 0 && !data?.coverage?.items?.length ? <div className="border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#FDE68A]">
        <p className="font-semibold">Cobertura parcial do processo</p>
        <p className="mt-2 opacity-90">O processo foi encontrado na contagem, mas os detalhes nao vieram completos nesta leitura. Recarregue o detalhe para uma nova tentativa.</p>
      </div> : null}
      {data?.coverage?.items?.[0] ? <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm">
        <p className="font-semibold">Processo no HMADV</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-65">
          <span>CNJ: {data.coverage.items[0].numero_cnj || row?.numero_cnj}</span>
          {data.coverage.items[0].account_id_freshsales ? <span>Account: {data.coverage.items[0].account_id_freshsales}</span> : null}
          {data.coverage.items[0].status_atual_processo ? <span>Status: {data.coverage.items[0].status_atual_processo}</span> : null}
        </div>
        {data.coverage.items[0].titulo ? <p className="mt-2 opacity-70">{data.coverage.items[0].titulo}</p> : null}
      </div> : null}
      {(data?.linkedPartes?.limited || data?.pendingPartes?.limited) ? <div className="border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#FDE68A]">
        <p className="font-semibold">Partes carregadas em modo reduzido</p>
        <p className="mt-2 opacity-90">A listagem de partes pode estar parcial nesta leitura. Use "Recarregar detalhe" antes de editar em lote se precisar de garantia total.</p>
      </div> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Partes vinculadas</p>
              <p className="mt-1 text-xs opacity-60">{linkedItems.length} carregada(s)</p>
            </div>
            <button type="button" onClick={() => onToggleLinkedPage(!allLinkedSelected)} disabled={!linkedItems.length} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-40">
              {allLinkedSelected ? "Desmarcar lista" : "Selecionar lista"}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {linkedItems.slice(0, 8).map((item) => <label key={item.id} className="block border border-[#2D2E2E] p-3 cursor-pointer">
              <div className="flex gap-3">
                <input type="checkbox" checked={selectedLinkedParteIds.includes(item.id)} onChange={() => onToggleLinkedParte(item.id)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.nome}</p>
                  <p className="mt-1 text-xs opacity-60">{item.tipo_contato || "sem tipo"} {item.contact?.name ? `• ${item.contact.name}` : ""}</p>
                </div>
              </div>
            </label>)}
            {!linkedItems.length ? <p className="text-xs opacity-60">Nenhuma parte vinculada carregada.</p> : null}
          </div>
        </div>
        <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Partes pendentes</p>
              <p className="mt-1 text-xs opacity-60">{pendingItems.length} carregada(s)</p>
            </div>
            <button type="button" onClick={() => onTogglePendingPage(!allPendingSelected)} disabled={!pendingItems.length} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-40">
              {allPendingSelected ? "Desmarcar lista" : "Selecionar lista"}
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {pendingItems.slice(0, 8).map((item) => <label key={item.id} className="block border border-[#2D2E2E] p-3 cursor-pointer">
              <div className="flex gap-3">
                <input type="checkbox" checked={selectedPendingParteIds.includes(item.id)} onChange={() => onTogglePendingParte(item.id)} className="mt-1" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.nome}</p>
                  <p className="mt-1 text-xs opacity-60">{item.polo || "sem polo"} {item.tipo_pessoa ? `• ${item.tipo_pessoa}` : ""}</p>
                </div>
              </div>
            </label>)}
            {!pendingItems.length ? <p className="text-xs opacity-60">Nenhuma parte pendente carregada.</p> : null}
          </div>
        </div>
      </div>
      {(linkedItems.length || pendingItems.length) ? <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm">
        <div className="grid gap-3 md:grid-cols-[240px_auto_auto_auto_auto]">
          <label className="text-xs uppercase tracking-[0.14em] opacity-60">Tipo alvo
            <select value={detailLinkType} onChange={(event) => setDetailLinkType(event.target.value)} className="mt-2 w-full border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm text-[#F4F1EA]">
              {CONTACT_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
          <button type="button" onClick={onLinkPendingPartes} disabled={actionLoading || !selectedPendingParteIds.length || !firstLinkedContact?.freshsales_contact_id} className="self-end border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-40">
            Vincular pendentes
          </button>
          <button type="button" onClick={onMoveLinkedPartes} disabled={actionLoading || !selectedLinkedParteIds.length || !firstLinkedContact?.freshsales_contact_id} className="self-end border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-40">
            Mover vinculadas
          </button>
          <button type="button" onClick={onReclassifyLinkedPartes} disabled={actionLoading || !selectedLinkedParteIds.length} className="self-end border border-[#6E5630] px-3 py-2 text-xs text-[#F8E7B5] disabled:opacity-40">
            Reclassificar
          </button>
          <button type="button" onClick={onUnlinkLinkedPartes} disabled={actionLoading || !selectedLinkedParteIds.length} className="self-end border border-[#5B2D2D] px-3 py-2 text-xs text-[#FECACA] disabled:opacity-40">
            Desvincular
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs opacity-65">
          <span>Pendentes marcadas: {selectedPendingParteIds.length}</span>
          <span>Vinculadas marcadas: {selectedLinkedParteIds.length}</span>
          <span>Tipo alvo: {detailLinkType}</span>
        </div>
      </div> : null}
      {data?.validationHistory?.length ? <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Historico de validacao</p>
            <p className="text-xs opacity-60">Ultimas alteracoes registradas para este CNJ.</p>
          </div>
          <HealthBadge label={`${data.validationHistory.length} evento(s)`} tone="default" />
        </div>
        <div className="mt-4 space-y-3">
          {data.validationHistory.map((entry) => <div key={entry.id} className="border border-[#2D2E2E] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <HealthBadge label={validationLabel(entry.status)} tone={validationTone(entry.status)} />
              {entry.updatedBy ? <span className="text-xs opacity-60">{entry.updatedBy}</span> : null}
              {entry.createdAt ? <span className="text-xs opacity-50">{formatDateTimeLabel(entry.createdAt)}</span> : null}
            </div>
            {entry.note ? <p className="mt-2 opacity-75">{entry.note}</p> : null}
          </div>)}
        </div>
      </div> : null}
      {firstLinkedContact ? <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Contato integrado</p>
            <p className="text-xs opacity-60">{firstLinkedContact.freshsales_contact_id || data?.contactDetail?.contact?.freshsales_contact_id}</p>
          </div>
          {firstLinkedContact.freshsales_url ? <a href={firstLinkedContact.freshsales_url} target="_blank" rel="noreferrer" className="text-xs underline hover:text-[#C5A059]">Abrir no Freshsales</a> : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="text-xs uppercase tracking-[0.14em] opacity-60">Nome
            <input value={detailEditForm.name} onChange={(event) => setDetailEditForm((state) => ({ ...state, name: event.target.value }))} className="mt-2 w-full border border-[#2D2E2E] bg-transparent px-3 py-2 text-sm text-[#F4F1EA]" />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] opacity-60">Email
            <input value={detailEditForm.email} onChange={(event) => setDetailEditForm((state) => ({ ...state, email: event.target.value }))} className="mt-2 w-full border border-[#2D2E2E] bg-transparent px-3 py-2 text-sm text-[#F4F1EA]" />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] opacity-60">Telefone
            <input value={detailEditForm.phone} onChange={(event) => setDetailEditForm((state) => ({ ...state, phone: event.target.value }))} className="mt-2 w-full border border-[#2D2E2E] bg-transparent px-3 py-2 text-sm text-[#F4F1EA]" />
          </label>
          <label className="text-xs uppercase tracking-[0.14em] opacity-60">Observacao operacional
            <input value={detailEditForm.note} onChange={(event) => setDetailEditForm((state) => ({ ...state, note: event.target.value }))} className="mt-2 w-full border border-[#2D2E2E] bg-transparent px-3 py-2 text-sm text-[#F4F1EA]" />
          </label>
        </div>
        <div className="mt-3">
          <button type="button" onClick={onSaveContact} disabled={actionLoading} className="bg-[#C5A059] px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50">
            Salvar contato
          </button>
        </div>
      </div> : null}
    </div>
  );
}

function HistoryCard({ entry, onReuse }) {
  return <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold">{entry.label}</p><p className="text-xs opacity-60">{new Date(entry.createdAt).toLocaleString("pt-BR")}</p></div>
      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${entry.status === "running" ? "border-[#6E5630] text-[#FDE68A]" : entry.status === "error" ? "border-[#4B2222] text-red-200" : "border-[#2D2E2E] opacity-70"}`}>{entry.status}</span>
    </div>
    {entry.preview ? <p className="mt-3 opacity-70">{entry.preview}</p> : null}
    {entry.meta?.selectedCount ? <p className="mt-2 text-xs opacity-60">Itens selecionados: {entry.meta.selectedCount}</p> : null}
    {entry.meta?.limit ? <p className="mt-1 text-xs opacity-60">Lote: {entry.meta.limit}</p> : null}
    {entry.meta?.processNumbersPreview ? <p className="mt-2 break-all text-xs opacity-60">CNJs: {entry.meta.processNumbersPreview}</p> : null}
    <div className="mt-3"><button type="button" onClick={() => onReuse(entry)} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">Reusar parametros</button></div>
  </div>;
}

function JobCard({ job, active = false }) {
  const processed = Number(job?.processed_count || 0);
  const requested = Number(job?.requested_count || 0);
  const percent = requested ? Math.min(100, Math.round((processed / requested) * 100)) : 0;
  const statusTone = job?.status === "completed" ? "success" : job?.status === "error" ? "danger" : "warning";
  return <div className={`border p-4 text-sm ${active ? "border-[#C5A059] bg-[rgba(76,57,26,0.18)]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold">{ACTION_LABELS[job?.acao] || job?.acao}</p>
        <p className="text-xs opacity-60">{job?.created_at ? new Date(job.created_at).toLocaleString("pt-BR") : "sem horario"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <HealthBadge label={job?.status || "pending"} tone={statusTone} />
        {active ? <HealthBadge label="ativo na tela" tone="default" /> : null}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
      <span className="rounded-full border border-[#2D2E2E] px-2 py-1">Solicitados {requested}</span>
      <span className="rounded-full border border-[#30543A] px-2 py-1 text-[#B7F7C6]">Processados {processed}</span>
      <span className="rounded-full border border-[#6E5630] px-2 py-1 text-[#FDE68A]">Falhas {Number(job?.error_count || 0)}</span>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
      <div className="h-full rounded-full bg-[#C5A059]" style={{ width: `${percent}%` }} />
    </div>
    <p className="mt-2 text-xs opacity-65">{buildJobPreview(job)}</p>
    {job?.last_error ? <p className="mt-2 text-xs text-red-200">{job.last_error}</p> : null}
  </div>;
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

function renderSyncStatuses(row) {
  const statuses = [];
  if (row.processo_criado) {
    statuses.push({ label: "processo criado", tone: "success" });
  } else if (row.processo_depois) {
    statuses.push({ label: "processo localizado", tone: "default" });
  }
  if (row.partes_novas?.length) {
    statuses.push({ label: `detectadas ${row.partes_novas.length}`, tone: "warning" });
  } else if (typeof row.partes_detectadas === "number") {
    statuses.push({ label: "sem novas partes", tone: "default" });
  }
  if (row.polos_atualizados?.polo_ativo || row.polos_atualizados?.polo_passivo) {
    statuses.push({ label: "polos atualizados", tone: "success" });
  }
  if (row.freshsales_repair?.skipped) {
    statuses.push({ label: "crm pendente", tone: "warning" });
  } else if (row.freshsales_repair) {
    statuses.push({ label: "crm reparado", tone: "success" });
  }
  return statuses;
}

function OperationResult({ result }) {
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [result]);
  if (result?.job) {
    return <JobCard job={result.job} active />;
  }
  const pageSize = 10;
  const rows = Array.isArray(result?.sample)
    ? result.sample
    : Array.isArray(result?.items)
      ? result.items
      : Array.isArray(result?.sample_partes)
        ? result.sample_partes
        : [];
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const counters = rows.reduce((acc, row) => {
    if (row.processo_criado) acc.processosCriados += 1;
    if (Array.isArray(row.partes_novas) && row.partes_novas.length) acc.detectadas += row.partes_novas.length;
    if (row.polos_atualizados?.polo_ativo || row.polos_atualizados?.polo_passivo) acc.polosAtualizados += 1;
    if (row.freshsales_repair?.skipped) acc.pendentes += 1;
    else if (row.freshsales_repair) acc.crmReparado += 1;
    if (row.result?.ok === false || row.freshsales_repair?.ok === false) acc.falhas += 1;
    return acc;
  }, { processosCriados: 0, detectadas: 0, polosAtualizados: 0, crmReparado: 0, pendentes: 0, falhas: 0 });

  return (
    <div className="space-y-4">
      {result?.fallbackReason || result?.upstreamWarning ? (
        <div className="rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#FDE68A]">
          <p className="font-semibold">Execucao em modo degradado</p>
          {result?.fallbackReason ? <p className="mt-2 opacity-90">{formatFallbackReason(result.fallbackReason)}</p> : null}
          {result?.upstreamWarning ? <p className="mt-2 opacity-90">{formatUpstreamWarningText(result.upstreamWarning)}</p> : null}
        </div>
      ) : null}
      {result?.uiHint ? (
        <div className="rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#FDE68A]">
          <p className="font-semibold">Leitura operacional</p>
          <p className="mt-2 opacity-90">{result.uiHint}</p>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-6 text-sm">
        <QueueSummaryCard title="Processos criados" count={counters.processosCriados} helper="Publicacoes que viraram processo no HMADV." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Partes detectadas" count={counters.detectadas} helper="Novas partes encontradas no lote." accent="text-[#FDE68A]" />
        <QueueSummaryCard title="Partes salvas" count={result?.partesInseridas || 0} helper="Registros inseridos em judiciario.partes." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Polos atualizados" count={counters.polosAtualizados} helper="Processos com polo ativo/passivo recalculado." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="CRM reparado" count={counters.crmReparado} helper="Accounts refletidas no Freshsales." accent="text-[#B7F7C6]" />
        <QueueSummaryCard title="Pendentes" count={counters.pendentes + counters.falhas} helper="Itens que ainda pedem acao ou revisao." accent="text-[#FECACA]" />
      </div>
      <div className="grid gap-3 md:grid-cols-4 text-sm">
        {Object.entries(result || {})
          .filter(([, value]) => !Array.isArray(value) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean"))
          .slice(0, 8)
          .map(([key, value]) => (
            <div key={key} className="border border-[#2D2E2E] p-3">
              <p className="text-[11px] uppercase tracking-[0.15em] opacity-50">{key}</p>
              <p className="mt-1 break-all">{String(value)}</p>
            </div>
          ))}
      </div>

      {rows.length ? (
        <>
          <div className="space-y-3">
            {paged.map((row, index) => (
              <div key={`${row.numero_cnj || row.processo_id || index}`} className="border border-[#2D2E2E] p-4 text-sm">
                <p className="font-semibold">{row.numero_cnj || row.processo_id || `Linha ${index + 1}`}</p>
                {row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}
                {renderSyncStatuses(row).length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {renderSyncStatuses(row).map((item) => <StatusBadge key={item.label} tone={item.tone}>{item.label}</StatusBadge>)}
                  </div>
                ) : null}
                {row.status === "fallback_local" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge tone="warning">fallback local</StatusBadge>
                    {row.functionName ? <StatusBadge tone="default">{row.functionName}</StatusBadge> : null}
                    {row.http_status ? <StatusBadge tone="default">HTTP {row.http_status}</StatusBadge> : null}
                  </div>
                ) : null}
                {row.detalhe ? <p className="mt-2 text-xs text-[#FDE68A]">{row.detalhe}</p> : null}
                {row.account_id_freshsales ? (
                  <a
                    href={`https://hmadv-org.myfreshworks.com/crm/sales/accounts/${row.account_id_freshsales}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline opacity-70 hover:text-[#C5A059]"
                  >
                    Abrir account {row.account_id_freshsales}
                  </a>
                ) : null}
                {row.titulo_processo ? <p className="mt-2 text-xs opacity-70">Processo HMADV: {row.titulo_processo}</p> : null}
                {row.partes_novas?.length ? (
                  <p className="mt-2 text-xs opacity-70">
                    Partes novas: {row.partes_novas.map((item) => `${item.nome} (${item.polo})`).join(" | ")}
                  </p>
                ) : null}
                {row.partes_existentes_preview?.length ? (
                  <p className="mt-2 text-xs opacity-50">
                    Partes existentes: {row.partes_existentes_preview.map((item) => `${item.nome} (${item.polo})`).join(" | ")}
                  </p>
                ) : null}
                {row.polos_atualizados?.polo_ativo || row.polos_atualizados?.polo_passivo ? (
                  <div className="mt-2 text-xs opacity-70">
                    {row.polos_atualizados?.polo_ativo ? <p>Polo ativo: {row.polos_atualizados.polo_ativo}</p> : null}
                    {row.polos_atualizados?.polo_passivo ? <p>Polo passivo: {row.polos_atualizados.polo_passivo}</p> : null}
                  </div>
                ) : null}
                {row.result ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs opacity-70">{JSON.stringify(row.result, null, 2)}</pre> : null}
              </div>
            ))}
          </div>
          {totalPages > 1 ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1}
                className="border border-[#2D2E2E] px-3 py-2 text-sm disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page >= totalPages}
                className="border border-[#2D2E2E] px-3 py-2 text-sm disabled:opacity-40"
              >
                Proxima
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs opacity-80">{JSON.stringify(result, null, 2)}</pre>
      )}
    </div>
  );
}

export default function InternoPublicacoesPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="Gestao de Publicacoes"
          description="Modulo interno para drenagem do backlog Advise, criacao de processos, extracao retroativa de partes e sincronizacao com Freshsales."
        >
          <PublicacoesContent />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function PublicacoesContent() {
  const [view, setView] = useState("operacao");
  const [overview, setOverview] = useState({ loading: true, error: null, data: null });
  const [processCandidates, setProcessCandidates] = useState({ loading: true, error: null, items: [], totalRows: 0, pageSize: 20, updatedAt: null, limited: false, errorUntil: null });
  const [partesCandidates, setPartesCandidates] = useState({ loading: true, error: null, items: [], totalRows: 0, pageSize: 20, updatedAt: null, limited: false, errorUntil: null });
  const [actionState, setActionState] = useState({ loading: false, error: null, result: null });
  const [executionHistory, setExecutionHistory] = useState([]);
  const [remoteHistory, setRemoteHistory] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null);
  const [drainInFlight, setDrainInFlight] = useState(false);
  const [processNumbers, setProcessNumbers] = useState("");
  const [copilotContext, setCopilotContext] = useState(null);
  const copilotQueryAppliedRef = useRef(false);
  const [queueRefreshLog, setQueueRefreshLog] = useState([]);
  const [pageVisible, setPageVisible] = useState(true);
  const [lastFocusHash, setLastFocusHash] = useState("");
  const [globalError, setGlobalError] = useState(null);
  const [globalErrorUntil, setGlobalErrorUntil] = useState(null);
  const [operationalStatus, setOperationalStatus] = useState({ mode: "ok", message: "", updatedAt: null });
  const [backendHealth, setBackendHealth] = useState({ status: "ok", message: "", updatedAt: null });
  const [limit, setLimit] = useState(10);
  const [processPage, setProcessPage] = useState(1);
  const [partesPage, setPartesPage] = useState(1);
  const [selectedProcessKeys, setSelectedProcessKeys] = useState([]);
  const [selectedPartesKeys, setSelectedPartesKeys] = useState([]);
  const [validationMap, setValidationMap] = useState({});
  const [integratedQueue, setIntegratedQueue] = useState({ loading: false, error: null, items: [], totalRows: 0, pageSize: 12, updatedAt: null, limited: false, totalEstimated: false, hasMore: false });
  const [integratedFilters, setIntegratedFilters] = useState({ query: "", source: "todos", validation: "todos", sort: "pendencia" });
  const [integratedPage, setIntegratedPage] = useState(1);
  const [selectedIntegratedNumbers, setSelectedIntegratedNumbers] = useState([]);
  const [detailState, setDetailState] = useState({ loading: false, error: null, row: null, data: null });
  const [detailEditForm, setDetailEditForm] = useState({ name: "", email: "", phone: "", note: "" });
  const [detailLinkType, setDetailLinkType] = useState("Cliente");
  const [selectedDetailPendingPartes, setSelectedDetailPendingPartes] = useState([]);
  const [selectedDetailLinkedPartes, setSelectedDetailLinkedPartes] = useState([]);
  const [bulkValidationStatus, setBulkValidationStatus] = useState("validado");
  const [bulkValidationNote, setBulkValidationNote] = useState("");
  const processCandidatesRequestRef = useRef({ promise: null, page: null });
  const partesCandidatesRequestRef = useRef({ promise: null, page: null });
  const integratedQueueRequestRef = useRef({ promise: null, key: "" });
  const integratedPageSize = 12;
  const integratedRows = useMemo(
    () => (integratedQueue.items || []).map((row) => ({
      ...row,
      validation: validationMap[row.numero_cnj] || { status: "", note: "", updatedAt: null },
    })),
    [integratedQueue.items, validationMap]
  );
  const filteredIntegratedRows = useMemo(() => {
    const filtered = integratedRows.filter((row) => {
      if (integratedFilters.validation !== "todos" && (row.validation?.status || "") !== integratedFilters.validation) return false;
      return true;
    });
    const sorted = [...filtered];
    if (integratedFilters.sort === "cnj") {
      sorted.sort((a, b) => String(a.numero_cnj || "").localeCompare(String(b.numero_cnj || "")));
      return sorted;
    }
    if (integratedFilters.sort === "validacao_recente") {
      sorted.sort((a, b) => new Date(b.validation?.updatedAt || 0).getTime() - new Date(a.validation?.updatedAt || 0).getTime());
      return sorted;
    }
    if (integratedFilters.sort === "validado_por") {
      sorted.sort((a, b) => String(a.validation?.updatedBy || "").localeCompare(String(b.validation?.updatedBy || "")));
      return sorted;
    }
    sorted.sort((a, b) => {
      const aCount = Number(a?.partes_novas || a?.partes_detectadas || a?.publicacoes || 0);
      const bCount = Number(b?.partes_novas || b?.partes_detectadas || b?.publicacoes || 0);
      if (bCount !== aCount) return bCount - aCount;
      return String(a.numero_cnj || "").localeCompare(String(b.numero_cnj || ""));
    });
    return sorted;
  }, [integratedFilters.sort, integratedFilters.validation, integratedRows]);
  const pagedIntegratedRows = useMemo(() => {
    return filteredIntegratedRows.map((row) => ({
      ...row,
      selected: selectedIntegratedNumbers.includes(row.numero_cnj),
    }));
  }, [filteredIntegratedRows, selectedIntegratedNumbers]);
  const selectedUnifiedNumbers = useMemo(
    () => selectedIntegratedNumbers,
    [selectedIntegratedNumbers]
  );

  function logUiEvent(label, action, response, patch = {}) {
    appendActivityLog({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      module: "publicacoes",
      component: patch.component || "publicacoes-ui",
      label,
      action,
      method: "UI",
      path: "/interno/publicacoes",
      expectation: patch.expectation || label,
      status: patch.status || "success",
      request: patch.request || "",
      response: stringifyLogPayload(response),
      error: patch.error || "",
    });
  }

  function buildAdminErrorDetail(path, meta, error) {
    const status = error?.status ? `HTTP ${error.status}` : "sem status";
    const payloadType = error?.payload?.errorType ? `payload ${error.payload.errorType}` : "payload n/d";
    const expectation = meta.expectation || meta.label || meta.action || "consultar backend";
    return `[layout/publicacoes] ${meta.component || "publicacoes"} falhou em ${path} (${status}; ${payloadType}). Impacto esperado na UI: ${expectation}. Mensagem: ${error?.message || "falha administrativa"}`;
  }

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
        module: "publicacoes",
        component: meta.component || "publicacoes",
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
      const errorDetail = buildAdminErrorDetail(path, meta, error);
      updateActivityLog(entryId, {
        status: "error",
        durationMs: Date.now() - startedAt,
        error: stringifyLogPayload({
          message: error?.message || "Falha administrativa",
          status: error?.status || null,
          payload: error?.payload || null,
          path,
          component: meta.component || "publicacoes",
          action,
          expectation: meta.expectation || null,
          detail: errorDetail,
        }),
      });
      appendFrontendIssue({
        page: "/interno/publicacoes",
        component: meta.component || "publicacoes",
        detail: errorDetail,
        status: "aberto",
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
      if (!queryView && !hashView) {
        const saved = loadUiState();
        if (saved?.view && PUBLICACOES_VIEW_ITEMS.some((item) => item.key === saved.view)) {
          setView(saved.view);
          if (saved.lastFocusHash) {
            setLastFocusHash(String(saved.lastFocusHash));
            const nextUrl = new URL(window.location.href);
            nextUrl.searchParams.set("view", saved.view);
            nextUrl.hash = String(saved.lastFocusHash);
            window.history.replaceState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
          }
          return;
        }
      }
      const nextView = PUBLICACOES_VIEW_ITEMS.some((item) => item.key === queryView)
        ? queryView
        : PUBLICACOES_VIEW_ITEMS.some((item) => item.key === hashView)
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
  useEffect(() => {
    if (typeof window === "undefined" || copilotQueryAppliedRef.current) return;
    const url = new URL(window.location.href);
    const queryProcessNumbers = String(url.searchParams.get("processNumbers") || "").trim();
    const queryContext = parseCopilotContext(url.searchParams.get("copilotContext") || "");
    if (queryProcessNumbers) setProcessNumbers(queryProcessNumbers);
    if (queryContext) setCopilotContext(queryContext);
    copilotQueryAppliedRef.current = true;
  }, []);
  useEffect(() => { setExecutionHistory(loadHistoryEntries()); }, []);
  useEffect(() => { setValidationMap(loadValidationState()); }, []);
  useEffect(() => { persistValidationState(validationMap); }, [validationMap]);
  useEffect(() => {
    persistUiState({ view, lastFocusHash });
  }, [view, lastFocusHash]);
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
    setModuleHistory("publicacoes", {
      executionHistory,
      remoteHistory,
      jobs,
      overview: overview?.data || null,
      queues: {
        candidatosProcessos: {
          totalRows: Number(processCandidates?.totalRows || 0),
          pageSize: Number(processCandidates?.pageSize || 20),
          updatedAt: processCandidates?.updatedAt || null,
          limited: Boolean(processCandidates?.limited),
          error: processCandidates?.error || null,
        },
        candidatosPartes: {
          totalRows: Number(partesCandidates?.totalRows || 0),
          pageSize: Number(partesCandidates?.pageSize || 20),
          updatedAt: partesCandidates?.updatedAt || null,
          limited: Boolean(partesCandidates?.limited),
          error: partesCandidates?.error || null,
        },
      },
      queueRefreshLog,
      operationalStatus,
      backendHealth,
      actionState: {
        loading: Boolean(actionState?.loading),
        error: actionState?.error || null,
        result: actionState?.result || null,
      },
      ui: {
        view,
        limit,
        processPage,
        partesPage,
        selectedProcessCount: selectedProcessKeys.length,
        selectedPartesCount: selectedPartesKeys.length,
      },
    });
  }, [
    executionHistory,
    remoteHistory,
    jobs,
    overview,
    processCandidates,
    partesCandidates,
    queueRefreshLog,
    operationalStatus,
    backendHealth,
    actionState,
    view,
    limit,
    processPage,
    partesPage,
    selectedProcessKeys,
    selectedPartesKeys,
  ]);
  useEffect(() => { loadRemoteHistory(); }, []);
  useEffect(() => { loadJobs(); }, []);

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (!PUBLICACOES_QUEUE_VIEWS.has(view)) return;
    loadProcessCandidates(processPage);
  }, [processPage, view]);

  useEffect(() => {
    if (!PUBLICACOES_QUEUE_VIEWS.has(view)) return;
    if (activeJobId) return;
    loadPartesCandidates(partesPage);
  }, [partesPage, view, activeJobId]);
  useEffect(() => {
    if (view !== "filas") return;
    loadIntegratedQueue(integratedPage);
  }, [integratedPage, integratedFilters, view]);
  useEffect(() => {
    setIntegratedPage(1);
  }, [integratedFilters]);
  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil((integratedQueue.totalRows || 0) / integratedPageSize));
    if (integratedPage > totalPages) setIntegratedPage(totalPages);
  }, [integratedQueue.totalRows, integratedPage, integratedPageSize]);
  useEffect(() => {
    if (!detailState?.row?.numero_cnj) return;
    const nextValidation = validationMap[detailState.row.numero_cnj] || { status: "", note: "", updatedAt: null };
    setDetailState((state) => state?.row?.numero_cnj === detailState.row.numero_cnj ? {
      ...state,
      row: { ...state.row, validation: nextValidation },
    } : state);
  }, [detailState?.row?.numero_cnj, validationMap]);
  useEffect(() => {
    setSelectedDetailPendingPartes([]);
    setSelectedDetailLinkedPartes([]);
  }, [detailState?.row?.numero_cnj]);
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
    async function runLoop() {
      while (!cancelled) {
        try {
          const idleDelayMs = pageVisible ? 1800 : 6000;
          if (!pageVisible) {
            setDrainInFlight(false);
            await new Promise((resolve) => setTimeout(resolve, idleDelayMs));
            continue;
          }
          setDrainInFlight(true);
          const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "run_pending_jobs", id: activeJobId, maxChunks: 1 }),
          }, { timeoutMs: 120000, maxRetries: 0 });
          const result = payload.data || {};
          const job = result.job || null;
          if (cancelled) return;
          await Promise.all([loadJobs(), loadRemoteHistory()]);
          setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result } : { drain: result } });
          if (result.completedAll || !job?.id || job?.status === "completed" || job?.status === "error" || job?.status === "cancelled") {
            setActiveJobId(null);
            if (job?.acao) {
              await refreshAfterAction(job.acao);
            } else {
              await refreshOperationalContext();
            }
            if (typeof window !== "undefined" && "Notification" in window) {
              if (Notification.permission === "default") {
                Notification.requestPermission().catch(() => {});
              } else if (Notification.permission === "granted") {
                new Notification("HMADV concluiu um job de publicacoes", {
                  body: result.completedAll
                    ? "Todas as pendencias de publicacoes desta fila foram drenadas."
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
  }, [activeJobId, processPage, partesPage, pageVisible]);

  useEffect(() => {
    if (globalError) {
      setOperationalStatus({ mode: "error", message: globalError, updatedAt: new Date().toISOString() });
      return;
    }
    const queues = [processCandidates, partesCandidates];
    const queueErrorCount = queues.filter((queue) => queue?.error).length;
    const mismatchCount = queues.filter((queue) => candidateQueueHasReadMismatch(queue)).length;
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
  }, [globalError, processCandidates, partesCandidates]);

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
    const fallbackRows = latestRows.filter((row) => row?.status === "fallback_local").length;
    if (fallbackRows > 0) {
      setBackendHealth({ status: "warning", message: `Ultimo ciclo operou em fallback local para ${fallbackRows} item(ns).`, updatedAt: latest.created_at });
      return;
    }
    if (Number(latest.affected_count || 0) === 0) {
      setBackendHealth({ status: "warning", message: "Ultimo ciclo nao teve progresso.", updatedAt: latest.created_at });
      return;
    }
    setBackendHealth({ status: "ok", message: "Ciclo HMADV saudavel.", updatedAt: latest.created_at });
  }, [remoteHistory]);

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
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=overview", {}, {
        action: "overview",
        component: "publicacoes-overview",
        label: "Carregar overview de publicacoes",
        expectation: "Atualizar indicadores e leitura do modulo",
      });
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
    if (!force && processCandidatesRequestRef.current.promise && processCandidatesRequestRef.current.page === page) {
      return processCandidatesRequestRef.current.promise;
    }
    if (!force && processCandidates?.updatedAt) {
      const lastUpdatedAt = new Date(processCandidates.updatedAt).getTime();
      if (!Number.isNaN(lastUpdatedAt) && now - lastUpdatedAt < PROCESS_QUEUE_REFRESH_TTL_MS) {
        return processCandidates;
      }
    }
    setProcessCandidates((state) => {
      if (state?.errorUntil && now < state.errorUntil) {
        return { ...state, loading: false };
      }
      return { ...state, loading: true, error: null };
    });
    const request = (async () => {
      try {
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=candidatos_processos&page=${page}&pageSize=20`, {}, {
        action: "candidatos_processos",
        component: "publicacoes-filas",
        label: `Carregar fila de processos criaveis (pagina ${page})`,
        expectation: "Atualizar a fila de processos derivados de publicacoes",
      });
      const payloadError = payload.data?.error || null;
      const nextErrorUntil = payloadError ? Date.now() + QUEUE_ERROR_TTL_MS : null;
      const nextState = {
        loading: false,
        error: payloadError,
        items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })),
        totalRows: Number(payload.data.totalRows || 0),
        totalEstimated: Boolean(payload.data.totalEstimated),
        pageSize: payload.data.pageSize || 20,
        updatedAt: new Date().toISOString(),
        limited: Boolean(payload.data.limited),
        errorUntil: nextErrorUntil,
      };
      setProcessCandidates(nextState);
      pushQueueRefresh("candidatos_processos");
      return nextState;
    } catch (error) {
      const message = error.message || "Falha ao carregar candidatos.";
      const nextState = {
        loading: false,
        error: message,
        items: processCandidates?.items || [],
        totalRows: processCandidates?.totalRows || 0,
        totalEstimated: false,
        pageSize: 20,
        updatedAt: processCandidates?.updatedAt || new Date().toISOString(),
        limited: Boolean(processCandidates?.limited),
        errorUntil: Date.now() + QUEUE_ERROR_TTL_MS,
      };
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
    const now = Date.now();
    if (!force && partesCandidatesRequestRef.current.promise && partesCandidatesRequestRef.current.page === page) {
      return partesCandidatesRequestRef.current.promise;
    }
    if (!force && partesCandidates?.updatedAt) {
      const lastUpdatedAt = new Date(partesCandidates.updatedAt).getTime();
      if (!Number.isNaN(lastUpdatedAt) && now - lastUpdatedAt < PARTES_QUEUE_REFRESH_TTL_MS) {
        return partesCandidates;
      }
    }
    setPartesCandidates((state) => {
      if (state?.errorUntil && now < state.errorUntil) {
        return { ...state, loading: false };
      }
      return { ...state, loading: true, error: null };
    });
    const request = (async () => {
      try {
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=candidatos_partes&page=${page}&pageSize=20`, {}, {
        action: "candidatos_partes",
        component: "publicacoes-filas",
        label: `Carregar fila de partes extraiveis (pagina ${page})`,
        expectation: "Atualizar a fila de extracao retroativa de partes",
      });
      const payloadError = payload.data?.error || null;
      const nextErrorUntil = payloadError ? Date.now() + QUEUE_ERROR_TTL_MS : null;
      const nextState = {
        loading: false,
        error: payloadError,
        items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })),
        totalRows: Number(payload.data.totalRows || 0),
        totalEstimated: Boolean(payload.data.totalEstimated),
        pageSize: payload.data.pageSize || 20,
        updatedAt: new Date().toISOString(),
        limited: Boolean(payload.data.limited),
        errorUntil: nextErrorUntil,
      };
      setPartesCandidates(nextState);
      pushQueueRefresh("candidatos_partes");
      return nextState;
    } catch (error) {
      const message = error.message || "Falha ao carregar candidatos de partes.";
      const errorTtl = isResourceLimitError(error) ? PARTES_QUEUE_RESOURCE_ERROR_TTL_MS : QUEUE_ERROR_TTL_MS;
      const nextState = {
        loading: false,
        error: message,
        items: partesCandidates?.items || [],
        totalRows: partesCandidates?.totalRows || 0,
        totalEstimated: false,
        pageSize: 20,
        updatedAt: partesCandidates?.updatedAt || new Date().toISOString(),
        limited: true,
        errorUntil: Date.now() + errorTtl,
      };
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
    const key = JSON.stringify({ page, query: integratedFilters.query, source: integratedFilters.source });
    if (!force && integratedQueueRequestRef.current.promise && integratedQueueRequestRef.current.key === key) {
      return integratedQueueRequestRef.current.promise;
    }
    setIntegratedQueue((state) => ({ ...state, loading: true, error: null }));
    const request = (async () => {
      try {
        const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=mesa_integrada&page=${page}&pageSize=${integratedPageSize}&query=${encodeURIComponent(integratedFilters.query || "")}&source=${encodeURIComponent(integratedFilters.source || "todos")}`, {}, {
          action: "mesa_integrada",
          component: "publicacoes-mesa-integrada",
          label: `Carregar mesa integrada (pagina ${page})`,
          expectation: "Trazer fila integrada e paginada de publicacoes",
        });
        const nextState = {
          loading: false,
          error: payload.data?.error || null,
          items: payload.data?.items || [],
          totalRows: Number(payload.data?.totalRows || 0),
          pageSize: Number(payload.data?.pageSize || integratedPageSize),
          updatedAt: new Date().toISOString(),
          limited: Boolean(payload.data?.limited),
          totalEstimated: Boolean(payload.data?.totalEstimated),
          hasMore: Boolean(payload.data?.hasMore),
        };
        if (Array.isArray(payload.data?.items)) {
          setValidationMap((current) => {
            const next = { ...current };
            for (const item of payload.data.items) {
              if (item?.numero_cnj && item?.validation) next[item.numero_cnj] = item.validation;
            }
            return next;
          });
        }
        setIntegratedQueue(nextState);
        return nextState;
      } catch (error) {
        const nextState = {
          loading: false,
          error: error.message || "Falha ao carregar mesa integrada.",
          items: [],
          totalRows: 0,
          pageSize: integratedPageSize,
          updatedAt: new Date().toISOString(),
          limited: false,
          totalEstimated: false,
          hasMore: false,
        };
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
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=historico&limit=20", {}, {
        action: "historico",
        component: "publicacoes-console",
        label: "Carregar historico remoto de publicacoes",
        expectation: "Sincronizar o historico HMADV no console",
      });
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
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=jobs&limit=12", {}, {
        action: "jobs",
        component: "publicacoes-jobs",
        label: "Carregar jobs de publicacoes",
        expectation: "Atualizar a fila operacional de jobs",
      });
      setJobs(payload.data.items || []);
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch {
      setJobs([]);
    }
  }

  async function refreshOperationalContext(options = {}) {
    const { forceAll = false, forceQueues = false } = options;
    const shouldLoadQueues = forceAll || PUBLICACOES_QUEUE_VIEWS.has(view);
    const calls = [loadOverview(), loadRemoteHistory(), loadJobs()];
    if (shouldLoadQueues) {
      calls.push(loadProcessCandidates(processPage, { force: forceAll || forceQueues }));
      if (!activeJobId || forceAll || forceQueues) {
        calls.push(loadPartesCandidates(partesPage, { force: forceAll || forceQueues }));
      }
      calls.push(loadIntegratedQueue(integratedPage, { force: forceAll || forceQueues }));
    }
    await Promise.all(calls);
  }

  async function refreshAfterAction(action) {
    const calls = [loadOverview(), loadRemoteHistory(), loadJobs()];
    if (PUBLICACOES_QUEUE_VIEWS.has(view)) {
      calls.push(loadIntegratedQueue(integratedPage, { force: true }));
      if (action === "criar_processos_publicacoes") {
        calls.push(loadProcessCandidates(processPage, { force: true }));
      }
      if ((action === "backfill_partes" || action === "sincronizar_partes") && !activeJobId) {
        calls.push(loadPartesCandidates(partesPage, { force: false }));
      }
    }
    await Promise.all(calls);
  }

  function toggleSelection(setter, current, key) {
    setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function togglePageSelection(setter, current, rows, nextState) {
    const keys = rows.map((item) => getPublicacaoSelectionValue(item)).filter(Boolean);
    if (nextState) {
      setter([...new Set([...current, ...keys])]);
      return;
    }
    setter(current.filter((item) => !keys.includes(item)));
  }

  function toggleUnifiedRow(row) {
    const numero = row?.numero_cnj;
    if (!numero) return;
    setSelectedIntegratedNumbers((current) => current.includes(numero) ? current.filter((item) => item !== numero) : [...current, numero]);
  }

  function toggleIntegratedPage(nextState) {
    const numbers = pagedIntegratedRows.map((row) => row.numero_cnj).filter(Boolean);
    if (nextState) {
      setSelectedIntegratedNumbers((current) => [...new Set([...current, ...numbers])]);
      return;
    }
    setSelectedIntegratedNumbers((current) => current.filter((item) => !numbers.includes(item)));
  }

  async function toggleIntegratedFiltered(nextState) {
    if (!nextState) {
      const numbers = filteredIntegratedRows.map((row) => row.numero_cnj).filter(Boolean);
      setSelectedIntegratedNumbers((current) => current.filter((item) => !numbers.includes(item)));
      return;
    }
    if (!integratedQueue.hasMore && filteredIntegratedRows.length >= (integratedQueue.totalRows || 0)) {
      const numbers = filteredIntegratedRows.map((row) => row.numero_cnj).filter(Boolean);
      setSelectedIntegratedNumbers((current) => [...new Set([...current, ...numbers])]);
      return;
    }
    try {
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=mesa_integrada_selecao&query=${encodeURIComponent(integratedFilters.query || "")}&source=${encodeURIComponent(integratedFilters.source || "todos")}&limit=500`, {}, {
        action: "mesa_integrada_selecao",
        component: "publicacoes-mesa-integrada",
        label: "Selecionar todos os itens filtrados",
        expectation: "Trazer todos os CNJs filtrados da mesa integrada",
      });
      const numbers = payload.data?.items || [];
      setSelectedIntegratedNumbers((current) => [...new Set([...current, ...numbers])]);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao selecionar todos os itens filtrados.", result: null });
    }
  }

  function applyValidationToNumbers(numbers, status, note = "") {
    if (!numbers.length) return Promise.resolve();
    return adminFetch("/api/admin-hmadv-publicacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "salvar_validacao",
        processNumbers: numbers.join("\n"),
        status,
        note,
      }),
    }, {
      action: "salvar_validacao",
      component: "publicacoes-validacao",
      label: `Salvar validacao (${status || "limpar"})`,
      expectation: "Persistir validacao operacional da mesa de publicacoes",
    }).then((payload) => {
      const validations = payload.data?.validations || {};
      setValidationMap((current) => ({ ...current, ...validations }));
      return payload.data || {};
    }).catch((error) => {
      setActionState({ loading: false, error: error.message || "Falha ao salvar validacao.", result: null });
      throw error;
    });
  }

  async function loadIntegratedDetail(row) {
    if (!row?.numero_cnj) return;
    setDetailState({ loading: true, error: null, row, data: null });
    try {
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=detalhe_integrado&numero_cnj=${encodeURIComponent(row.numero_cnj)}`, {}, {
        action: "detalhe_integrado",
        component: "publicacoes-integrated-detail",
        label: `Carregar detalhe integrado de ${row.numero_cnj}`,
        expectation: "Trazer processo, partes e contato no mesmo payload",
      });
      const nextData = payload.data || null;
      if (row?.numero_cnj && nextData?.validation) {
        setValidationMap((current) => ({ ...current, [row.numero_cnj]: nextData.validation }));
      }
      setDetailState({ loading: false, error: null, row, data: nextData });
      const linkedItems = nextData?.linkedPartes?.items || [];
      const contact = nextData.contactDetail?.contact || linkedItems.find((item) => item?.contact)?.contact || null;
      setDetailEditForm({
        name: contact?.name || "",
        email: contact?.email || "",
        phone: contact?.phone || "",
        note: row?.validation?.note || "",
      });
    } catch (error) {
      setDetailState({ loading: false, error: error.message || "Falha ao carregar detalhe integrado.", row, data: null });
    }
  }

  async function saveDetailContact() {
    const contactId = detailState?.data?.contactDetail?.contact?.freshsales_contact_id || detailState?.data?.linkedPartes?.items?.find((item) => item?.contact?.freshsales_contact_id)?.contact?.freshsales_contact_id;
    if (!contactId) {
      setActionState({ loading: false, error: "Nao existe contato vinculado para edicao simples neste item.", result: null });
      return;
    }
    setActionState({ loading: true, error: null, result: null });
    try {
      const payload = await adminFetch("/api/admin-hmadv-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_contact",
          contactId,
          name: detailEditForm.name,
          email: detailEditForm.email,
          phone: detailEditForm.phone,
        }),
      }, {
        action: "update_contact",
        component: "publicacoes-integrated-detail",
        label: `Atualizar contato ${contactId} pela mesa de publicacoes`,
        expectation: "Salvar edicao simples do contato relacionado ao processo",
      });
      if (detailState?.row?.numero_cnj) {
        await applyValidationToNumbers([detailState.row.numero_cnj], detailState.row.validation?.status || "", detailEditForm.note || "");
        await loadIntegratedDetail(detailState.row);
      }
      setActionState({ loading: false, error: null, result: payload.data || { ok: true } });
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao salvar contato.", result: null });
    }
  }

  async function runBulkContactsReconcile(apply) {
    if (!selectedUnifiedNumbers.length) {
      setActionState({ loading: false, error: "Selecione ao menos um CNJ para reconciliar partes e contatos.", result: null });
      return;
    }
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    try {
      await queueAsyncAction("reconciliar_partes_contatos", apply, selectedUnifiedNumbers);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao reconciliar partes e contatos.", result: null });
    }
  }

  function toggleDetailPendingParte(id) {
    setSelectedDetailPendingPartes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleDetailLinkedParte(id) {
    setSelectedDetailLinkedPartes((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function toggleDetailPendingPage(nextState) {
    const ids = (detailState?.data?.pendingPartes?.items || []).map((item) => item.id).filter(Boolean);
    if (nextState) {
      setSelectedDetailPendingPartes(ids);
      return;
    }
    setSelectedDetailPendingPartes([]);
  }

  function toggleDetailLinkedPage(nextState) {
    const ids = (detailState?.data?.linkedPartes?.items || []).map((item) => item.id).filter(Boolean);
    if (nextState) {
      setSelectedDetailLinkedPartes(ids);
      return;
    }
    setSelectedDetailLinkedPartes([]);
  }

  async function runDetailParteAction(action, payload, successMessage) {
    setActionState({ loading: true, error: null, result: null });
    try {
      const response = await adminFetch("/api/admin-hmadv-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      }, {
        action,
        component: "publicacoes-integrated-detail",
        label: successMessage,
        expectation: successMessage,
      });
      if (detailState?.row) {
        await loadIntegratedDetail(detailState.row);
      }
      setActionState({ loading: false, error: null, result: response.data || { ok: true } });
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao atualizar partes do detalhe.", result: null });
    }
  }

  async function linkPendingDetailPartes() {
    const contactId = detailState?.data?.contactDetail?.contact?.freshsales_contact_id || detailState?.data?.linkedPartes?.items?.find((item) => item?.contact?.freshsales_contact_id)?.contact?.freshsales_contact_id;
    if (!contactId || !selectedDetailPendingPartes.length) return;
    await runDetailParteAction("vincular_partes", {
      parteIds: selectedDetailPendingPartes,
      contactId,
      type: detailLinkType,
    }, "Vincular partes pendentes ao contato do detalhe");
    setSelectedDetailPendingPartes([]);
  }

  async function moveLinkedDetailPartes() {
    const contactId = detailState?.data?.contactDetail?.contact?.freshsales_contact_id || detailState?.data?.linkedPartes?.items?.find((item) => item?.contact?.freshsales_contact_id)?.contact?.freshsales_contact_id;
    if (!contactId || !selectedDetailLinkedPartes.length) return;
    await runDetailParteAction("vincular_partes", {
      parteIds: selectedDetailLinkedPartes,
      contactId,
      type: detailLinkType,
    }, "Mover partes vinculadas para o contato em foco");
    setSelectedDetailLinkedPartes([]);
  }

  async function reclassifyLinkedDetailPartes() {
    if (!selectedDetailLinkedPartes.length) return;
    await runDetailParteAction("reclassificar_partes", {
      parteIds: selectedDetailLinkedPartes,
      type: detailLinkType,
    }, "Reclassificar tipo de contato das partes vinculadas");
    setSelectedDetailLinkedPartes([]);
  }

  async function unlinkLinkedDetailPartes() {
    if (!selectedDetailLinkedPartes.length) return;
    await runDetailParteAction("desvincular_partes", {
      parteIds: selectedDetailLinkedPartes,
    }, "Desvincular partes do contato atual");
    setSelectedDetailLinkedPartes([]);
  }

  const selectedProcessNumbers = useMemo(
    () => processCandidates.items.filter((item) => matchesPublicacaoSelection(item, selectedProcessKeys)).map((item) => item.numero_cnj).filter(Boolean),
    [processCandidates.items, selectedProcessKeys]
  );
  const selectedPartesNumbers = useMemo(
    () => partesCandidates.items.filter((item) => matchesPublicacaoSelection(item, selectedPartesKeys)).map((item) => item.numero_cnj).filter(Boolean),
    [partesCandidates.items, selectedPartesKeys]
  );
  const data = overview.data || {};
  const adviseSync = data.adviseSync || null;
  const adviseConfig = adviseSync?.config || {};
  const adviseCursor = adviseSync?.status_cursor || adviseSync?.ultima_execucao || {};
  const adviseLastRunAt = adviseCursor?.ultima_execucao || null;
  const adviseTokenOk = adviseConfig?.token_ok === true;
  const adviseMode = adviseConfig?.modo || "indisponivel";
  const adviseLastCycleTotal = Number(adviseCursor?.total_registros || 0);
  const syncWorkerLastPublicacoes = Number(data?.syncWorker?.worker?.ultimo_lote?.publicacoes || 0);
  const latestHistory = executionHistory[0] || null;
  const latestRemoteRun = remoteHistory[0] || null;
  const latestJob = jobs[0] || null;
  const pendingOrRunningJobs = jobs.filter((item) => ["pending", "running"].includes(String(item.status || "")));
  const blockingJob = pendingOrRunningJobs[0] || null;
  const hasBlockingJob = pendingOrRunningJobs.length > 0;
  const hasMultipleBlockingJobs = pendingOrRunningJobs.length > 1;
  const currentDrainJobId = activeJobId || blockingJob?.id || null;
  const canManuallyDrainActiveJob = Boolean(currentDrainJobId);
  const candidateQueues = [processCandidates, partesCandidates];
  const candidateQueueErrorCount = candidateQueues.filter((queue) => queue?.error).length;
  const candidateQueueMismatchCount = candidateQueues.filter((queue) => candidateQueueHasReadMismatch(queue)).length;
  const healthQueueTarget = processCandidates.error || candidateQueueHasReadMismatch(processCandidates)
    ? { hash: "publicacoes-fila-processos-criaveis", label: "Criar processos", view: "filas" }
    : partesCandidates.error || candidateQueueHasReadMismatch(partesCandidates)
      ? { hash: "publicacoes-fila-partes-extraiveis", label: "Salvar + CRM", view: "filas" }
      : integratedQueue.error
        ? { hash: "publicacoes-mesa-integrada", label: "Revisar mesa integrada", view: "operacao" }
        : { hash: "filas", label: "Abrir filas", view: "filas" };
  const healthSuggestedActions = [];
  if (candidateQueueErrorCount > 0 || candidateQueueMismatchCount > 0) {
    healthSuggestedActions.push({ key: "filas", label: healthQueueTarget.label, onClick: () => updateView(healthQueueTarget.view, healthQueueTarget.hash) });
  }
  if (backendHealth.status === "warning" || backendHealth.status === "error") {
    healthSuggestedActions.push({ key: "resultado", label: "Ver resultado", onClick: () => updateView("resultado", "resultado") });
  }
  if (canManuallyDrainActiveJob) {
    healthSuggestedActions.push({ key: "drain", label: drainInFlight ? "Drenando..." : "Drenar fila", onClick: runPendingJobsNow, disabled: actionState.loading || drainInFlight || !canManuallyDrainActiveJob });
  }
  if (!healthSuggestedActions.length || (candidateQueueErrorCount === 0 && candidateQueueMismatchCount === 0 && backendHealth.status === "ok" && !canManuallyDrainActiveJob)) {
    healthSuggestedActions.push({ key: "operacao", label: "Ir para operacao", onClick: () => updateView("operacao", "operacao") });
  }
  const remoteHealth = deriveRemoteHealth(remoteHistory);
  const recurringPublicacoes = deriveRecurringPublicacoes(remoteHistory);
  const recurringPublicacoesSummary = summarizeRecurringPublicacoes(recurringPublicacoes);
  const recurringPublicacoesBands = summarizeRecurrenceBands(recurringPublicacoes);
  const recurringPublicacoesGroups = groupRecurringPublicacoes(recurringPublicacoes);
  const recurringPublicacoesFocus = deriveRecurringPublicacoesFocus(recurringPublicacoesSummary, recurringPublicacoesBands);
  const recurringPublicacoesBatch = deriveSuggestedPublicacoesBatch(recurringPublicacoesSummary, recurringPublicacoesBands);
  const recurringPublicacoesActions = deriveSuggestedPublicacoesActions(recurringPublicacoesSummary, recurringPublicacoesBands);
  const recurringPublicacoesChecklist = deriveSuggestedPublicacoesChecklist(recurringPublicacoesSummary, recurringPublicacoesBands);
  const queueDiagnostics = [
    processCandidates.error ? {
      key: "processos",
      title: "Fila de processos criaveis",
      message: processCandidates.error,
      target: { view: "filas", hash: "publicacoes-fila-processos-criaveis" },
    } : null,
    partesCandidates.error ? {
      key: "partes",
      title: "Fila de partes extraiveis",
      message: partesCandidates.error,
      target: { view: "filas", hash: "publicacoes-fila-partes-extraiveis" },
    } : null,
    integratedQueue.error ? {
      key: "mesa",
      title: "Mesa integrada",
      message: integratedQueue.error,
      target: { view: "filas", hash: "publicacoes-mesa-integrada" },
    } : null,
  ].filter(Boolean);
  const primaryPublicacoesAction = derivePrimaryPublicacoesAction(recurringPublicacoesActions);
  const partesBacklogCount = Number(partesCandidates.totalRows || partesCandidates.items.length || 0);
  const syncWorkerShouldFocusCrm = Number(data.publicacoesPendentesComAccount || 0) > 0;
  const selectedUnifiedCount = selectedIntegratedNumbers.length;
  const allIntegratedPageSelected = pagedIntegratedRows.length > 0 && pagedIntegratedRows.every((row) => row.selected);
  const allIntegratedFilteredSelected = filteredIntegratedRows.length > 0 && filteredIntegratedRows.every((row) => selectedIntegratedNumbers.includes(row.numero_cnj));

  function selectVisibleRecurringPublicacoes() {
    const recurringKeys = new Set(recurringPublicacoes.map((item) => item.key));
    setSelectedProcessKeys(processCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getPublicacaoSelectionValue(item)).filter(Boolean));
    setSelectedPartesKeys(partesCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getPublicacaoSelectionValue(item)).filter(Boolean));
    setSelectedIntegratedNumbers(filteredIntegratedRows.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => item.numero_cnj).filter(Boolean));
    logUiEvent("Selecionar reincidentes visiveis", "selecionar_reincidentes_publicacoes", {
      selectedProcessos: processCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).length,
      selectedPartes: partesCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).length,
      selectedIntegrado: filteredIntegratedRows.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).length,
    }, { component: "publicacoes-recorrencia" });
    updateView("filas");
  }
  function selectVisibleSevereRecurringPublicacoes() {
    const recurringKeys = new Set(recurringPublicacoes.filter((item) => item.hits >= 3).map((item) => item.key));
    setSelectedProcessKeys(processCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getPublicacaoSelectionValue(item)).filter(Boolean));
    setSelectedPartesKeys(partesCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => getPublicacaoSelectionValue(item)).filter(Boolean));
    setSelectedIntegratedNumbers(filteredIntegratedRows.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => item.numero_cnj).filter(Boolean));
    logUiEvent("Selecionar reincidentes severos", "selecionar_reincidentes_severos_publicacoes", {
      selectedProcessos: processCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).length,
      selectedPartes: partesCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).length,
      selectedIntegrado: filteredIntegratedRows.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).length,
    }, { component: "publicacoes-recorrencia" });
    updateView("filas");
  }
  function applySevereRecurringPreset() {
    setLimit(recurringPublicacoesBatch.size);
    logUiEvent("Aplicar lote prioritario", "aplicar_preset_publicacoes", {
      limit: recurringPublicacoesBatch.size,
      recurringSummary: recurringPublicacoesSummary,
    }, { component: "publicacoes-recorrencia" });
    selectVisibleSevereRecurringPublicacoes();
  }
  function clearQueueSelections() {
    setSelectedProcessKeys([]);
    setSelectedPartesKeys([]);
    setSelectedIntegratedNumbers([]);
    logUiEvent("Limpar selecoes de filas", "limpar_selecoes_publicacoes", {
      selectedProcessos: 0,
      selectedPartes: 0,
      selectedIntegrado: 0,
    }, { component: "publicacoes-filas" });
  }
  const visibleRecurringCount = [...processCandidates.items, ...partesCandidates.items]
    .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index)
    .filter((item) => recurringPublicacoes.some((recurring) => recurring.key === (item.numero_cnj || item.key))).length;
  const visibleSevereRecurringCount = [...processCandidates.items, ...partesCandidates.items]
    .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index)
    .filter((item) => recurringPublicacoes.some((recurring) => recurring.key === (item.numero_cnj || item.key) && recurring.hits >= 3)).length;
  const selectedVisibleSevereRecurringCount = [...processCandidates.items, ...partesCandidates.items]
    .filter((item, index, array) => array.findIndex((other) => (other.numero_cnj || other.key) === (item.numero_cnj || item.key)) === index)
    .filter((item) => recurringPublicacoes.some((recurring) => recurring.key === (item.numero_cnj || item.key) && recurring.hits >= 3))
    .filter((item) => matchesPublicacaoSelection(item, selectedProcessKeys) || matchesPublicacaoSelection(item, selectedPartesKeys))
    .length;
  const priorityBatchReady = visibleSevereRecurringCount > 0 && selectedVisibleSevereRecurringCount >= visibleSevereRecurringCount && limit === recurringPublicacoesBatch.size;

  function updateView(nextView, nextHash = nextView) {
    setView(nextView);
    setLastFocusHash(nextHash || nextView);
    logUiEvent(`Alternar view para ${nextView}`, "alterar_view_publicacoes", { view: nextView }, { component: "publicacoes-navigation" });
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    url.hash = nextHash || nextView;
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function buildActionMeta(numbers = []) {
    const explicit = numbers.length ? numbers.join("\n") : String(processNumbers || "");
    return {
      limit,
      selectedCount: selectedProcessKeys.length + selectedPartesKeys.length,
      processNumbersPreview: explicit.split(/\r?\n|,|;/).map((item) => item.trim()).filter(Boolean).slice(0, 6).join(", "),
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

  async function queueAsyncAction(action, apply = false, numbers = []) {
    if (hasBlockingJob) {
      const message = `Ja existe um job de publicacoes em andamento (${getPublicacoesActionLabel(blockingJob?.acao)}). Aguarde a conclusao antes de criar outro lote.`;
      setActionState({ loading: false, error: message, result: blockingJob ? { job: blockingJob } : null });
      throw new Error(message);
    }
    const safeLimit = getSafePublicacoesActionLimit(action, limit);
    const response = await adminFetch("/api/admin-hmadv-publicacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_job",
        jobAction: action,
        apply,
        limit: safeLimit,
        processNumbers: numbers.length ? numbers.join("\n") : processNumbers,
      }),
    }, {
      action,
      component: "publicacoes-actions",
      label: `${getPublicacoesActionLabel(action)} (criar job)`,
      expectation: `Criar job de publicacoes com lote ${safeLimit}`,
    });
    if (response.data?.legacy_inline) {
      setActionState({ loading: false, error: null, result: response.data.result });
      setActiveJobId(null);
      await refreshAfterAction(action);
      return response.data;
    }
    const job = response.data;
    setActionState({ loading: false, error: null, result: { job } });
    setActiveJobId(job?.id || null);
    await Promise.all([loadJobs(), loadRemoteHistory()]);
    return job;
  }

  async function runPendingJobsNow() {
    if (!canManuallyDrainActiveJob) {
      const message = "Nao ha job pendente ou em andamento disponivel para drenagem manual.";
      setActionState({ loading: false, error: message, result: blockingJob ? { job: blockingJob } : null });
      return;
    }
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    try {
      if (!activeJobId && currentDrainJobId) {
        setActiveJobId(currentDrainJobId);
      }
      const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_pending_jobs", id: currentDrainJobId, maxChunks: 1 }),
      }, {
        action: "run_pending_jobs",
        component: "publicacoes-jobs",
        label: "Drenar fila de publicacoes",
        expectation: "Processar o proximo chunk da fila HMADV",
        timeoutMs: 120000,
        maxRetries: 0,
      });
      const result = payload.data || {};
      setActionState({ loading: false, error: null, result: result.job ? { job: result.job, drain: result } : { drain: result } });
      setActiveJobId(result.completedAll ? null : (result.job?.id || null));
      if (result.job?.acao) {
        await refreshAfterAction(result.job.acao);
      } else {
        await refreshOperationalContext();
      }
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao drenar fila.", result: null });
    }
  }

  async function handleAction(action, apply = false, numbers = []) {
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    const historyId = `${action}:${Date.now()}`;
    const safeLimit = getSafePublicacoesActionLimit(action, limit);
    pushHistoryEntry({
      id: historyId,
      action,
      label: ACTION_LABELS[action] || action,
      status: "running",
      createdAt: new Date().toISOString(),
      preview: "Execucao iniciada",
      meta: buildActionMeta(numbers),
      payload: { action, apply, limit: safeLimit, processNumbers: numbers.length ? numbers.join("\n") : processNumbers },
    });
    try {
      if (ASYNC_PUBLICACOES_ACTIONS.has(action)) {
        const job = await queueAsyncAction(action, apply, numbers);
        replaceHistoryEntry(historyId, {
          status: "success",
          preview: job?.legacy_inline
            ? `Fallback inline: ${buildHistoryPreview(job.result)}`
            : `Job criado: ${buildJobPreview(job)}`,
          result: job?.legacy_inline ? job.result : { job },
        });
        return;
      }
      const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          apply,
          limit: safeLimit,
          processNumbers: numbers.length ? numbers.join("\n") : processNumbers,
        }),
      }, {
        action,
        component: "publicacoes-actions",
        label: getPublicacoesActionLabel(action),
        expectation: `Executar ${getPublicacoesActionLabel(action)} com lote ${safeLimit}`,
      });
      const resultData = (() => {
        if (action !== "run_sync_worker") return payload.data;
        const hasNoProgress = Number(payload.data?.affected_count || 0) === 0;
        if (!hasNoProgress) return payload.data;
        if (partesBacklogCount > 0) {
          return {
            ...payload.data,
            uiHint: `O sync-worker concluiu sem progresso e nao drena a fila de partes. Ha ${partesBacklogCount} processo(s) em candidatos_partes; use Extracao retroativa de partes ou Salvar partes + corrigir CRM para atuar nessa fila.`,
          };
        }
        if (syncWorkerShouldFocusCrm) {
          return {
            ...payload.data,
            uiHint: "O sync-worker concluiu sem progresso nesta rodada. Ele atua em pendencias de activity/CRM, nao em extracao retroativa de partes.",
          };
        }
        return {
          ...payload.data,
          uiHint: "O sync-worker concluiu sem trabalho pendente nesta rodada.",
        };
      })();
      setActionState({ loading: false, error: null, result: resultData });
      replaceHistoryEntry(historyId, {
        status: "success",
        preview: buildHistoryPreview(resultData),
        result: resultData,
      });
      await refreshAfterAction(action);
    } catch (error) {
      setActionState({ loading: false, error: error.message || "Falha ao executar acao.", result: null });
      replaceHistoryEntry(historyId, {
        status: "error",
        preview: error.message || "Falha ao executar acao.",
        error: error.message || "Falha ao executar acao.",
      });
    }
  }

  function reuseHistoryEntry(entry) {
    if (entry?.payload?.processNumbers) setProcessNumbers(entry.payload.processNumbers);
    if (entry?.payload?.limit) setLimit(Number(entry.payload.limit) || 10);
    logUiEvent("Reusar parametros do historico", "reusar_historico_publicacoes", {
      action: entry?.action || "",
      limit: entry?.payload?.limit || null,
    }, { component: "publicacoes-history" });
    updateView("operacao");
  }

  function clearHistory() {
    setExecutionHistory([]);
    persistHistoryEntries([]);
  }

  const isResultView = view === "resultado";
  const isDockedPublicacoesView = view === "operacao" || view === "resultado";

  return (
    <div className={`${isDockedPublicacoesView ? "flex min-h-full flex-1 flex-col gap-6" : isResultView ? "space-y-6" : "space-y-8"}`.trim()}>
      {copilotContext ? (
        <section className="rounded-[22px] border border-[#35554B] bg-[rgba(12,22,19,0.72)] p-4 text-sm text-[#C6D1CC]">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#7FC4AF]">Contexto vindo do Copilot</p>
          <p className="mt-2 font-semibold text-[#F5F1E8]">{copilotContext.conversationTitle || "Conversa ativa"}</p>
          {copilotContext.mission ? <p className="mt-2 leading-6 text-[#9BAEA8]">{copilotContext.mission}</p> : null}
          {processNumbers ? <p className="mt-2 text-xs leading-6 text-[#7F928C]">CNJs pré-carregados para operação de publicações.</p> : null}
        </section>
      ) : null}
      <section className="rounded-[30px] border border-[#2D2E2E] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_35%),linear-gradient(180deg,rgba(13,15,14,0.98),rgba(8,10,10,0.98))] px-4 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#C5A059]">Centro de publicacoes</p>
            <h3 className="mt-3 font-serif text-4xl leading-tight">Criacao de processos, extracao de partes e drenagem do backlog em uma trilha operacional.</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 opacity-65">A tela foi segmentada por foco de trabalho para reduzir ruido visual e guardar memoria do que foi executado na sessao.</p>
          </div>
          <div className="flex flex-col gap-3 rounded-[26px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] p-4 text-sm">
            <div className="flex items-center justify-between gap-4"><span className="opacity-60">Selecionados no momento</span><strong className="font-serif text-2xl">{selectedProcessKeys.length + selectedPartesKeys.length}</strong></div>
            <div className="flex items-center justify-between gap-4"><span className="opacity-60">Ultima acao</span><span className="text-right text-xs uppercase tracking-[0.16em] text-[#C5A059]">{actionState.loading ? "executando" : actionState.error ? "erro" : actionState.result ? "concluida" : "aguardando"}</span></div>
            {latestHistory ? <p className="text-xs opacity-60">{latestHistory.label}: {latestHistory.preview}</p> : null}
            {latestJob ? <JobCard job={latestJob} active={latestJob.id === activeJobId} /> : null}
            {hasMultipleBlockingJobs ? <p className="text-xs text-[#FDE68A]">Ha {pendingOrRunningJobs.length} jobs pesados concorrendo. Evite criar novos lotes ate a fila estabilizar.</p> : null}
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <ViewToggle value={view} onChange={updateView} />
          <div className={`border p-4 text-sm ${operationalStatus.mode === "error" || backendHealth.status === "error" ? "border-[#4B2222] bg-[rgba(127,29,29,0.12)]" : operationalStatus.mode === "limited" || backendHealth.status === "warning" ? "border-[#6E5630] bg-[rgba(76,57,26,0.16)]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.45)]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-60">Barra de saude operacional</p>
                <p className="mt-2">{operationalStatus.message || "Operacao normal"} • {backendHealth.message || "Sem historico recente."}</p>
                <p className="mt-2 text-xs opacity-70">Acao sugerida: {healthSuggestedActions[0]?.label || "Ir para operacao"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone={operationalStatus.mode === "error" ? "danger" : operationalStatus.mode === "limited" ? "warning" : "success"}>{operationalStatus.mode === "error" ? "operacao com alerta" : operationalStatus.mode === "limited" ? "operacao degradada" : "operacao estavel"}</StatusBadge>
                <StatusBadge tone={backendHealth.status === "error" ? "danger" : backendHealth.status === "warning" ? "warning" : "success"}>{backendHealth.status === "error" ? "backend com falha" : backendHealth.status === "warning" ? "backend com ressalva" : "backend saudavel"}</StatusBadge>
                {candidateQueueErrorCount ? <StatusBadge tone="danger">{candidateQueueErrorCount} fila(s) com erro</StatusBadge> : null}
                {candidateQueueMismatchCount ? <StatusBadge tone="warning">{candidateQueueMismatchCount} fila(s) com leitura parcial</StatusBadge> : null}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {healthSuggestedActions.map((action) => <button key={action.key} type="button" onClick={action.onClick} disabled={action.disabled} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">{action.label}</button>)}
            </div>
          </div>
          <div className={`border p-4 text-xs ${operationalStatus.mode === "error" ? "border-[#4B2222] bg-[rgba(127,29,29,0.15)] text-red-200" : operationalStatus.mode === "limited" ? "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#FDE68A]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] text-[#C5A059]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="uppercase tracking-[0.18em] text-[10px]">Status operacional</span>
              <span className="text-[10px] uppercase tracking-[0.16em] opacity-70">{operationalStatus.updatedAt ? new Date(operationalStatus.updatedAt).toLocaleTimeString("pt-BR") : ""}</span>
            </div>
            <p className="mt-2">{operationalStatus.message || "Operacao normal"}</p>
          </div>
          <div className={`border p-4 text-xs ${backendHealth.status === "error" ? "border-[#4B2222] bg-[rgba(127,29,29,0.15)] text-red-200" : backendHealth.status === "warning" ? "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#FDE68A]" : "border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] text-[#C5A059]"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="uppercase tracking-[0.18em] text-[10px]">Saude do backend</span>
              <span className="text-[10px] uppercase tracking-[0.16em] opacity-70">{backendHealth.updatedAt ? new Date(backendHealth.updatedAt).toLocaleTimeString("pt-BR") : ""}</span>
            </div>
            <p className="mt-2">{backendHealth.message || "Sem historico recente."}</p>
          </div>
          {queueRefreshLog.length ? (
            <div className="border border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] p-4 text-xs">
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
          {latestRemoteRun ? <RemoteRunSummary entry={latestRemoteRun} actionLabels={ACTION_LABELS} /> : null}
          {remoteHealth.length ? <div className="flex flex-wrap gap-2">{remoteHealth.map((item) => <HealthBadge key={item.label} label={item.label} tone={item.tone} />)}</div> : null}
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Publicacoes totais" value={data.publicacoesTotal || 0} helper="Estoque atualmente persistido no HMADV." />
        <MetricCard label="Com activity" value={data.publicacoesComActivity || 0} helper="Ja refletidas como activity no Freshsales." />
        <MetricCard label="Pendentes" value={data.publicacoesPendentesComAccount || 0} helper="Ainda sem activity em processos com account vinculado." />
        <MetricCard label="Sem processo" value={data.publicacoesSemProcesso || 0} helper="Publicacoes ainda sem processo vinculado no HMADV." />
      </div>

      {adviseSync ? (
        <Panel title="Status do Advise" eyebrow="Observabilidade da ingestao">
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <HealthBadge label={adviseTokenOk ? "token advise ok" : "token advise indisponivel"} tone={adviseTokenOk ? "success" : "danger"} />
              <HealthBadge label={`modo ${adviseMode}`} tone="default" />
              <HealthBadge label={`cursor ${String(adviseCursor?.status || "desconhecido")}`} tone={String(adviseCursor?.erro || "") ? "danger" : "default"} />
              <HealthBadge label={adviseLastRunAt ? `ultimo ciclo ${new Date(adviseLastRunAt).toLocaleString("pt-BR")}` : "ultimo ciclo indisponivel"} tone="default" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <QueueSummaryCard title="Recebidas do Advise" count={Number(adviseSync.publicacoes_total || 0)} helper="Estoque de publicacoes de origem Advise no projeto HMADV." />
              <QueueSummaryCard title="Pendentes CRM" count={Number(adviseSync.publicacoes_pendentes_fs || 0)} helper="Publicacoes Advise ainda sem reflexo no Freshsales." />
              <QueueSummaryCard title="Ultimo ciclo" count={adviseLastCycleTotal} helper="Total reportado pelo cursor do advise-sync no ciclo mais recente." />
              <QueueSummaryCard title="Ultimo lote worker" count={syncWorkerLastPublicacoes} helper="Quantidade de publicacoes no ultimo lote do sync-worker." />
            </div>
            {adviseCursor?.erro ? (
              <div className="rounded-[20px] border border-[#4B2222] bg-[rgba(127,29,29,0.12)] p-4 text-sm text-red-100">
                <p className="font-semibold">Erro recente do advise-sync</p>
                <p className="mt-2 opacity-80">{String(adviseCursor.erro)}</p>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {view === "operacao" ? <div id="operacao" className="grid flex-1 auto-rows-fr gap-6 lg:grid-cols-2">
        <Panel title="Criacao de processos a partir das publicacoes" eyebrow="Operacao orientada por fila" className="h-full">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <QueueSummaryCard
                title="Processos criaveis"
                count={processCandidates.totalRows || processCandidates.items.length || 0}
                helper={`${selectedProcessKeys.length} selecionado(s) nesta sessao.${processCandidates.totalEstimated ? " Total estimado de processos unicos ainda sem vinculo." : ""}`}
              />
              <QueueSummaryCard
                title="Sem processo vinculado"
                count={data.publicacoesSemProcesso || 0}
                helper="Publicacoes prontas para gerar processo no HMADV."
              />
            </div>
            <p className="text-sm opacity-70">
              Use a visao <strong>Filas</strong> para selecionar processos individualmente ou por pagina.
              Esta visao fica focada em disparar a operacao e acompanhar o lote.
            </p>
            <div className="rounded-[20px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.35)] p-4 text-sm opacity-80">
              <p className="font-semibold">Sync-worker e fila de partes sao fluxos diferentes.</p>
              <p className="mt-2">
                Use <strong>Rodar sync-worker</strong> para activities e sincronizacao com CRM.
                Para itens em <strong>candidatos_partes</strong>, use a trilha de extracao de partes abaixo.
              </p>
            </div>
            <label className="block">
              <span className="block text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">CNJs para foco manual</span>
              <textarea
                value={processNumbers}
                onChange={(event) => setProcessNumbers(event.target.value)}
                rows={4}
                placeholder="Opcional: cole CNJs manualmente, um por linha."
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">Lote</span>
              <input
                type="number"
                min="1"
                max="50"
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value || 10))}
                className="w-full border border-[#2D2E2E] bg-[#050706] p-3 text-sm outline-none focus:border-[#C5A059]"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => updateView("filas")}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                Abrir filas
              </button>
              <button
                type="button"
                onClick={() => handleAction("criar_processos_publicacoes", false, selectedProcessNumbers)}
                disabled={actionState.loading || hasBlockingJob}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
              >
                Criar processos das publicacoes
              </button>
              <button
                type="button"
                onClick={() => handleAction("run_sync_worker", false)}
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Rodar sync-worker (activities/CRM)
              </button>
              <button
                type="button"
                onClick={runPendingJobsNow}
                disabled={actionState.loading || drainInFlight || !canManuallyDrainActiveJob}
                className="border border-[#6E5630] bg-[rgba(197,160,89,0.08)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#F8E7B5] hover:border-[#C5A059] disabled:opacity-50"
              >
                {drainInFlight ? "Drenando fila..." : "Drenar fila HMADV"}
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Extracao retroativa de partes" eyebrow="Operacao orientada por fila" className="h-full">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <QueueSummaryCard
                title="Partes extraiveis"
                count={partesCandidates.totalRows || partesCandidates.items.length || 0}
                helper={`${selectedPartesKeys.length} selecionado(s) nesta sessao.${partesCandidates.totalEstimated ? " Total estimado." : ""}`}
              />
              <QueueSummaryCard
                title="Partes totais"
                count={data.partesTotal || 0}
                helper="Base atual persistida em judiciario.partes."
              />
            </div>
            <p className="text-sm opacity-70">
              A extracao sempre precisa enriquecer o Supabase primeiro. Selecione os processos na visao <strong>Filas</strong> e volte aqui para simular ou aplicar.
            </p>
            {partesBacklogCount > 0 ? (
              <div className="rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#FDE68A]">
                <p className="font-semibold">Fila certa para o backlog atual</p>
                <p className="mt-2">
                  Existem {partesBacklogCount} processo(s) em <strong>candidatos_partes</strong>. Esse backlog nao e drenado pelo sync-worker; ele depende de <strong>Extracao retroativa de partes</strong> e, quando necessario, de <strong>Salvar + corrigir CRM</strong>.
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => updateView("filas")}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Abrir filas
              </button>
              <button
                type="button"
                onClick={() => handleAction("backfill_partes", false, selectedPartesNumbers)}
                disabled={actionState.loading || hasBlockingJob}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Simular extracao
              </button>
              <button
                type="button"
                onClick={() => handleAction("backfill_partes", true, selectedPartesNumbers)}
                disabled={actionState.loading || hasBlockingJob}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
              >
                Aplicar extracao
              </button>
              <button
                type="button"
                onClick={() => handleAction("sincronizar_partes", true, selectedPartesNumbers)}
                disabled={actionState.loading || hasBlockingJob}
                className="border border-[#6E5630] bg-[rgba(197,160,89,0.08)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#F8E7B5] hover:border-[#C5A059] disabled:opacity-50"
              >
                Salvar + corrigir CRM
              </button>
              <button
                type="button"
                onClick={async () => {
                  await Promise.all([
                    loadOverview(),
                    loadProcessCandidates(processPage, { force: true }),
                    loadPartesCandidates(partesPage, { force: true }),
                  ]);
                }}
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Atualizar leitura
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Leitura de backlog" eyebrow="Operacao" className="h-full">
          {overview.loading ? <p className="text-sm opacity-65">Carregando leitura...</p> : null}
          {overview.error ? <p className="text-sm text-red-300">{overview.error}</p> : null}
          {!overview.loading && !overview.error ? (
            <div className="space-y-3 text-sm opacity-75">
              <p>Partes totais: {data.partesTotal || 0}</p>
              <p>Publicacoes totais: {data.publicacoesTotal || 0}</p>
              <p>Publicacoes com activity: {data.publicacoesComActivity || 0}</p>
              <p>Publicacoes pendentes com account: {data.publicacoesPendentesComAccount || 0}</p>
              <p>Publicacoes sem processo: {data.publicacoesSemProcesso || 0}</p>
              <p>Publicacoes marcadas como leilao ignorado: {data.publicacoesLeilaoIgnorado || 0}</p>
            </div>
          ) : null}
        </Panel>
      </div> : null}

      {view === "filas" ? <div className="space-y-6">
        {queueDiagnostics.length ? <Panel title="Diagnostico de leitura" eyebrow="Falhas atuais do modulo">
          <div className="space-y-4">
            <div className="rounded-[20px] border border-[#4B2222] bg-[rgba(127,29,29,0.12)] p-4 text-sm text-red-100">
              <p className="font-semibold">O modulo continua navegavel, mas ha filas com erro de backend.</p>
              <p className="mt-2 opacity-80">Os detalhes tecnicos tambem foram enviados ao Console {"->"} Log e ao tracker interno de debitos de frontend.</p>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              {queueDiagnostics.map((item) => <div key={item.key} className="rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.16)] p-4 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F8E7B5]">{item.title}</p>
                <p className="mt-2 leading-6 text-[#F4E6C4]">{item.message}</p>
                <div className="mt-3">
                  <button type="button" onClick={() => updateView(item.target.view, item.target.hash)} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">
                    Abrir trecho afetado
                  </button>
                </div>
              </div>)}
            </div>
          </div>
        </Panel> : null}
        {recurringPublicacoes.length ? <Panel title="Pendencias reincidentes" eyebrow="Prioridade operacional">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-[#6E5630] bg-[rgba(76,57,26,0.16)] p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F8E7B5]">Foco recomendado</p>
              <p className="mt-2 font-semibold">{recurringPublicacoesFocus.title}</p>
              <p className="mt-2 text-sm opacity-75">{recurringPublicacoesFocus.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <HealthBadge label={`lote sugerido ${recurringPublicacoesBatch.size}`} tone="success" />
                <HealthBadge label={recurringPublicacoesBatch.reason} tone="default" />
                <HealthBadge label={`${visibleRecurringCount} reincidentes visiveis`} tone="default" />
                <HealthBadge label={`${visibleSevereRecurringCount} graves visiveis`} tone="warning" />
                <HealthBadge label={`selecao cobre ${selectedVisibleSevereRecurringCount}/${visibleSevereRecurringCount || 0} graves`} tone={visibleSevereRecurringCount > 0 && selectedVisibleSevereRecurringCount >= visibleSevereRecurringCount ? "success" : "default"} />
                <HealthBadge label={priorityBatchReady ? "lote prioritario pronto" : "lote prioritario pendente"} tone={priorityBatchReady ? "success" : "warning"} />
                <button type="button" onClick={() => setLimit(recurringPublicacoesBatch.size)} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">Usar lote sugerido</button>
                <button type="button" onClick={applySevereRecurringPreset} className="bg-[#C5A059] px-3 py-2 text-xs text-[#050706] hover:brightness-110">Montar lote prioritario</button>
                <button type="button" onClick={selectVisibleRecurringPublicacoes} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">Selecionar reincidentes visiveis</button>
                <button type="button" onClick={selectVisibleSevereRecurringPublicacoes} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">Selecionar 3x+ visiveis</button>
                <button type="button" onClick={clearQueueSelections} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">Limpar selecao</button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {recurringPublicacoesActions.map((action) => <HealthBadge key={action} label={action} tone="warning" />)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <HealthBadge label={`proximo disparo: ${primaryPublicacoesAction}`} tone="success" />
                <button type="button" onClick={() => updateView("operacao")} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">Ir para operacao</button>
                <button type="button" onClick={runPendingJobsNow} disabled={actionState.loading || drainInFlight || !canManuallyDrainActiveJob} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">{drainInFlight ? "Drenando..." : "Rodar drenagem agora"}</button>
              </div>
              <div className="mt-4 space-y-2">
                {recurringPublicacoesChecklist.map((step, index) => <div key={step} className="flex items-start gap-3 text-sm opacity-80">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[#6E5630] text-[11px] font-semibold text-[#F8E7B5]">{index + 1}</span>
                  <p>{step}</p>
                </div>)}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              <QueueSummaryCard title="Advise" count={recurringPublicacoesSummary.advise} helper="Leitura ou extracao ainda sem fechamento." />
              <QueueSummaryCard title="Freshsales" count={recurringPublicacoesSummary.freshsales} helper="Activity ou reparo de CRM pendente." />
              <QueueSummaryCard title="Supabase" count={recurringPublicacoesSummary.supabase} helper="Persistencia interna ou vinculo ainda incompleto." />
              <QueueSummaryCard title="Manual" count={recurringPublicacoesSummary.manual} helper="Publicacoes que pedem revisao humana." accent="text-[#FECACA]" />
              <QueueSummaryCard title="Sem progresso" count={recurringPublicacoesSummary.stagnant} helper="Lotes recorrentes sem ganho util." accent="text-[#FDE68A]" />
              <QueueSummaryCard title="Recorrentes" count={recurringPublicacoesSummary.total} helper="Itens que voltaram em multiplos ciclos recentes." />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <QueueSummaryCard title="Faixa 2x" count={recurringPublicacoesBands.recurring} helper="Pendencias que reapareceram em dois ciclos." />
              <QueueSummaryCard title="Faixa 3x" count={recurringPublicacoesBands.reincident} helper="Itens reincidentes que merecem atencao prioritaria." accent="text-[#FDE68A]" />
              <QueueSummaryCard title="Faixa 4x+" count={recurringPublicacoesBands.critical} helper="Gargalos cronicos que pedem acao estrutural." accent="text-[#FECACA]" />
            </div>
            <div className="space-y-6">
              <RecurringPublicacaoGroup title="Criticos (4x+)" helper="Gargalos cronicos que repetem em quatro ou mais ciclos." items={recurringPublicacoesGroups.critical} />
              <RecurringPublicacaoGroup title="Reincidentes (3x)" helper="Itens que persistem por tres ciclos e merecem prioridade alta." items={recurringPublicacoesGroups.reincident} />
              <RecurringPublicacaoGroup title="Recorrentes (2x)" helper="Itens que reapareceram duas vezes e ainda cabem em correcao operacional." items={recurringPublicacoesGroups.recurring} />
            </div>
          </div>
        </Panel> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <QueueSummaryCard title="Processos criaveis" count={processCandidates.totalRows || processCandidates.items.length || 0} helper="Fila para gerar processo a partir da publicacao." />
          <QueueSummaryCard title="Partes extraiveis" count={partesCandidates.totalRows || partesCandidates.items.length || 0} helper={partesCandidates.totalEstimated ? "Fila estimada para enriquecer judiciario.partes." : "Fila para enriquecer judiciario.partes."} />
          <QueueSummaryCard title="Com activity" count={data.publicacoesComActivity || 0} helper="Publicacoes ja refletidas no Freshsales." />
          <QueueSummaryCard title="Pendentes" count={data.publicacoesPendentesComAccount || 0} helper="Publicacoes ainda sem activity." />
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <div id="publicacoes-mesa-integrada"><Panel title="Mesa integrada" eyebrow="Lista paginada + selecao multipla">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs uppercase tracking-[0.14em] opacity-60">Buscar por CNJ, titulo ou parte
                  <input
                    value={integratedFilters.query}
                    onChange={(event) => setIntegratedFilters((state) => ({ ...state, query: event.target.value }))}
                    className="mt-2 w-full border border-[#2D2E2E] bg-transparent px-3 py-2 text-sm text-[#F4F1EA]"
                    placeholder="0004600-54.2009..."
                  />
                </label>
                <label className="text-xs uppercase tracking-[0.14em] opacity-60">Origem
                  <select value={integratedFilters.source} onChange={(event) => setIntegratedFilters((state) => ({ ...state, source: event.target.value }))} className="mt-2 w-full border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm text-[#F4F1EA]">
                    <option value="todos">Todos</option>
                    <option value="processos">Criacao de processo</option>
                    <option value="partes">Enriquecimento de partes</option>
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.14em] opacity-60">Validacao
                  <select value={integratedFilters.validation} onChange={(event) => setIntegratedFilters((state) => ({ ...state, validation: event.target.value }))} className="mt-2 w-full border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm text-[#F4F1EA]">
                    <option value="todos">Todos</option>
                    <option value="validado">Validado</option>
                    <option value="revisar">Revisar</option>
                    <option value="bloqueado">Bloqueado</option>
                    <option value="">Sem validacao</option>
                  </select>
                </label>
                <label className="text-xs uppercase tracking-[0.14em] opacity-60">Ordenacao
                  <select value={integratedFilters.sort} onChange={(event) => setIntegratedFilters((state) => ({ ...state, sort: event.target.value }))} className="mt-2 w-full border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm text-[#F4F1EA]">
                    <option value="pendencia">Maior pendencia</option>
                    <option value="validacao_recente">Validacao mais recente</option>
                    <option value="validado_por">Validado por</option>
                    <option value="cnj">CNJ</option>
                  </select>
                </label>
              </div>
              <div className="rounded-[20px] border border-[#2D2E2E] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <HealthBadge label={`${selectedUnifiedCount} selecionado(s)`} tone="default" />
                  <HealthBadge label={`${selectedUnifiedNumbers.length} CNJ(s) unicos`} tone="default" />
                  <HealthBadge label={`${integratedQueue.totalRows || filteredIntegratedRows.length} filtrado(s)`} tone="warning" />
                  {integratedQueue.limited ? <HealthBadge label="leitura parcial protegida" tone="warning" /> : null}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-[0.9fr_1.1fr_auto_auto_auto_auto]">
                  <label className="text-xs uppercase tracking-[0.14em] opacity-60">Validacao em massa
                    <select value={bulkValidationStatus} onChange={(event) => setBulkValidationStatus(event.target.value)} className="mt-2 w-full border border-[#2D2E2E] bg-[#050706] px-3 py-2 text-sm text-[#F4F1EA]">
                      <option value="validado">Validado</option>
                      <option value="revisar">Revisar</option>
                      <option value="bloqueado">Bloqueado</option>
                    </select>
                  </label>
                  <label className="text-xs uppercase tracking-[0.14em] opacity-60">Observacao
                    <input value={bulkValidationNote} onChange={(event) => setBulkValidationNote(event.target.value)} className="mt-2 w-full border border-[#2D2E2E] bg-transparent px-3 py-2 text-sm text-[#F4F1EA]" placeholder="Motivo, proximo passo, responsavel..." />
                  </label>
                  <button type="button" onClick={() => applyValidationToNumbers(selectedUnifiedNumbers, bulkValidationStatus, bulkValidationNote)} disabled={!selectedUnifiedNumbers.length} className="self-end border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-40">
                    Validar lote
                  </button>
                  <button type="button" onClick={() => runBulkContactsReconcile(false)} disabled={actionState.loading || !selectedUnifiedNumbers.length} className="self-end border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-40">
                    Simular contatos
                  </button>
                  <button type="button" onClick={() => runBulkContactsReconcile(true)} disabled={actionState.loading || !selectedUnifiedNumbers.length} className="self-end border border-[#6E5630] px-3 py-2 text-xs text-[#F8E7B5] disabled:opacity-40">
                    Aplicar contatos
                  </button>
                  <button type="button" onClick={clearQueueSelections} className="self-end border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059]">
                    Limpar selecao
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => handleAction("criar_processos_publicacoes", true, selectedUnifiedNumbers)} disabled={actionState.loading || hasBlockingJob || !selectedUnifiedNumbers.length} className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40">
                    Criar processos
                  </button>
                  <button type="button" onClick={() => handleAction("backfill_partes", true, selectedUnifiedNumbers)} disabled={actionState.loading || hasBlockingJob || !selectedUnifiedNumbers.length} className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40">
                    Backfill partes
                  </button>
                  <button type="button" onClick={() => handleAction("sincronizar_partes", true, selectedUnifiedNumbers)} disabled={actionState.loading || hasBlockingJob || !selectedUnifiedNumbers.length} className="border border-[#6E5630] px-3 py-2 text-xs text-[#F8E7B5] disabled:opacity-40">
                    Salvar + CRM
                  </button>
                </div>
              </div>
              <IntegratedQueueList
                rows={pagedIntegratedRows}
                totalRows={integratedQueue.totalRows || filteredIntegratedRows.length}
                selectedCount={selectedUnifiedCount}
                page={integratedPage}
                setPage={setIntegratedPage}
                pageSize={integratedPageSize}
                onOpenDetail={loadIntegratedDetail}
                onToggleRow={toggleUnifiedRow}
                onTogglePage={toggleIntegratedPage}
                onToggleAllFiltered={toggleIntegratedFiltered}
                allPageSelected={allIntegratedPageSelected}
                allFilteredSelected={allIntegratedFilteredSelected}
                limited={integratedQueue.limited}
                totalEstimated={integratedQueue.totalEstimated}
                errorMessage={integratedQueue.error}
              />
            </div>
          </Panel></div>
          <Panel title="Detalhe integrado" eyebrow="Processo + contatos + validacao">
            <PublicacaoDetailPanel
              detailState={detailState}
              detailEditForm={detailEditForm}
              setDetailEditForm={setDetailEditForm}
              detailLinkType={detailLinkType}
              setDetailLinkType={setDetailLinkType}
              selectedPendingParteIds={selectedDetailPendingPartes}
              selectedLinkedParteIds={selectedDetailLinkedPartes}
              onTogglePendingParte={toggleDetailPendingParte}
              onToggleLinkedParte={toggleDetailLinkedParte}
              onTogglePendingPage={toggleDetailPendingPage}
              onToggleLinkedPage={toggleDetailLinkedPage}
              onLinkPendingPartes={linkPendingDetailPartes}
              onMoveLinkedPartes={moveLinkedDetailPartes}
              onReclassifyLinkedPartes={reclassifyLinkedDetailPartes}
              onUnlinkLinkedPartes={unlinkLinkedDetailPartes}
              onRefresh={() => detailState.row ? loadIntegratedDetail(detailState.row) : Promise.resolve()}
              onSaveContact={saveDetailContact}
              onApplyValidation={(status) => detailState.row?.numero_cnj ? applyValidationToNumbers([detailState.row.numero_cnj], status, detailEditForm.note || "") : null}
              actionLoading={actionState.loading}
            />
          </Panel>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
        <div id="publicacoes-fila-processos-criaveis"><Panel title="Fila de processos criaveis" eyebrow="Criacao a partir das publicacoes">
          <QueueList
            title="Processos criaveis"
            helper="Selecione itens da pagina para disparar a criacao do processo no HMADV via DataJud."
            rows={processCandidates.items}
            selected={selectedProcessKeys}
            onToggle={(key) => toggleSelection(setSelectedProcessKeys, selectedProcessKeys, key)}
            onTogglePage={(nextState) => togglePageSelection(setSelectedProcessKeys, selectedProcessKeys, processCandidates.items, nextState)}
            page={processPage}
            setPage={setProcessPage}
            loading={processCandidates.loading}
            totalRows={processCandidates.totalRows}
            pageSize={processCandidates.pageSize}
            totalEstimated={processCandidates.totalEstimated}
            lastUpdated={processCandidates.updatedAt}
            limited={processCandidates.limited}
            errorMessage={processCandidates.error}
          />
        </Panel></div>
        <div id="publicacoes-fila-partes-extraiveis"><Panel title="Fila de partes extraiveis" eyebrow="Backfill pelo conteudo das publicacoes">
          <QueueList
            title="Processos com partes extraiveis"
            helper="Selecione processos vinculados que ainda tenham partes detectadas no conteudo das publicacoes."
            rows={partesCandidates.items}
            selected={selectedPartesKeys}
            onToggle={(key) => toggleSelection(setSelectedPartesKeys, selectedPartesKeys, key)}
            onTogglePage={(nextState) => togglePageSelection(setSelectedPartesKeys, selectedPartesKeys, partesCandidates.items, nextState)}
            page={partesPage}
            setPage={setPartesPage}
            loading={partesCandidates.loading}
            totalRows={partesCandidates.totalRows}
            pageSize={partesCandidates.pageSize}
            totalEstimated={partesCandidates.totalEstimated}
            lastUpdated={partesCandidates.updatedAt}
            limited={partesCandidates.limited}
            errorMessage={partesCandidates.error}
          />
        </Panel></div>
        </div>
      </div> : null}

      {view === "resultado" ? <div id="resultado" className="grid flex-1 auto-rows-fr items-stretch gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <OperationalResultCard
          className="h-full"
          loading={actionState.loading}
          error={actionState.error}
          result={actionState.result ? <>{actionState.result?.drain ? <div className="mb-4 rounded-[20px] border border-[#30543A] bg-[rgba(48,84,58,0.12)] p-4 text-sm"><p className="font-semibold">Drenagem de fila</p><p className="mt-2 opacity-75">{buildDrainPreview(actionState.result.drain)}</p></div> : null}{jobs.length ? <div className="mb-4 space-y-3"><p className="text-xs uppercase tracking-[0.16em] opacity-55">Jobs persistidos</p>{jobs.slice(0, 4).map((job) => <JobCard key={job.id} job={job} active={job.id === activeJobId} />)}</div> : null}<OperationResult result={actionState.result} /></> : null}
          emptyText="Nenhuma acao executada ainda nesta sessao."
          footer="Resultado compacto, sem afastar visualmente o console do fim do modulo."
        />
        <OperationalHistoryCompactCard className="h-full"
          primaryText={executionHistory[0] ? `${executionHistory[0].label || executionHistory[0].action} • ${executionHistory[0].status}` : ""}
          secondaryLabel="Ultimo HMADV"
          secondaryText={remoteHistory[0] ? `${remoteHistory[0].acao} • ${remoteHistory[0].status}` : ""}
        />
      </div> : null}
    </div>
  );
}
