import { useEffect, useMemo, useRef, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch as adminFetchRaw } from "../../lib/admin/api";

const PUBLICACOES_VIEW_ITEMS = [
  { key: "operacao", label: "Operacao" },
  { key: "filas", label: "Filas" },
  { key: "resultado", label: "Resultado" },
];
const HISTORY_STORAGE_KEY = "hmadv:interno-publicacoes:history:v1";
const ACTION_LABELS = {
  criar_processos_publicacoes: "Criar processos das publicacoes",
  backfill_partes: "Extracao retroativa de partes",
  sincronizar_partes: "Salvar partes + atualizar polos + corrigir CRM",
  run_sync_worker: "Rodar sync-worker",
  run_pending_jobs: "Drenar fila HMADV",
};
const ASYNC_PUBLICACOES_ACTIONS = new Set([
  "criar_processos_publicacoes",
  "backfill_partes",
  "sincronizar_partes",
]);
const QUEUE_ERROR_TTL_MS = 1000 * 60 * 3;
const GLOBAL_ERROR_TTL_MS = 1000 * 60 * 2;
const MODULE_LIMITS = {
  maxCreateProcess: 5,
  maxBackfillPartes: 5,
  maxSyncPartes: 3,
  maxSyncWorker: 2,
  maxDefault: 10,
};
const ACTIVITY_LOG_LIMIT = 120;
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
  if (action === "sincronizar_partes") return Math.max(1, Math.min(normalized || 3, MODULE_LIMITS.maxSyncPartes));
  if (action === "criar_processos_publicacoes") return Math.max(1, Math.min(normalized || 5, MODULE_LIMITS.maxCreateProcess));
  if (action === "backfill_partes") return Math.max(1, Math.min(normalized || 5, MODULE_LIMITS.maxBackfillPartes));
  if (action === "run_sync_worker") return Math.max(1, Math.min(normalized || 2, MODULE_LIMITS.maxSyncWorker));
  return Math.max(1, Math.min(normalized || MODULE_LIMITS.maxDefault, MODULE_LIMITS.maxDefault));
}

function buildHistoryPreview(result) {
  if (!result) return "";
  if (result.erro) return String(result.erro);
  if (typeof result.processosCriados === "number") return `Processos criados: ${result.processosCriados}`;
  if (typeof result.partesInseridas === "number") return `Partes inseridas: ${result.partesInseridas}`;
  if (typeof result.processosAtualizados === "number") return `Processos atualizados: ${result.processosAtualizados}`;
  if (typeof result.accountsReparadas === "number") return `Accounts reparadas: ${result.accountsReparadas}`;
  if (typeof result.publicacoes === "number") return `Publicacoes processadas: ${result.publicacoes}`;
  if (typeof result.total === "number") return `Total: ${result.total}`;
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
  if (bands.critical > 0 || summary.manual > 0) return ["Extracao retroativa de partes", "Salvar partes + atualizar polos + corrigir CRM", "Rodar sync-worker"];
  if (summary.advise > 0) return ["Criar processos das publicacoes", "Extracao retroativa de partes", "Salvar partes + atualizar polos + corrigir CRM"];
  if (summary.freshsales > 0) return ["Rodar sync-worker", "Salvar partes + atualizar polos + corrigir CRM"];
  if (summary.stagnant > 0) return ["Extracao retroativa de partes", "Rodar sync-worker"];
  return ["Salvar partes + atualizar polos + corrigir CRM", "Rodar sync-worker"];
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
      "Rode o sync-worker em lote curto.",
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

function Panel({ title, eyebrow, children }) {
  return (
    <section className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6">
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
  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.key));
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
        {rows.map((row) => (
          <label key={row.key} className="block border border-[#2D2E2E] p-4 cursor-pointer">
            <div className="flex gap-3">
              <input
                type="checkbox"
                checked={selected.includes(row.key)}
                onChange={() => onToggle(row.key)}
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
        ))}
      </div>
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
  if (result?.job) {
    return <JobCard job={result.job} active />;
  }
  const [page, setPage] = useState(1);
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
  const [queueRefreshLog, setQueueRefreshLog] = useState([]);
  const [activityLogOpen, setActivityLogOpen] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [pageVisible, setPageVisible] = useState(true);
  const [globalError, setGlobalError] = useState(null);
  const [globalErrorUntil, setGlobalErrorUntil] = useState(null);
  const [operationalStatus, setOperationalStatus] = useState({ mode: "ok", message: "", updatedAt: null });
  const [backendHealth, setBackendHealth] = useState({ status: "ok", message: "", updatedAt: null });
  const [limit, setLimit] = useState(10);
  const [processPage, setProcessPage] = useState(1);
  const [partesPage, setPartesPage] = useState(1);
  const [selectedProcessKeys, setSelectedProcessKeys] = useState([]);
  const [selectedPartesKeys, setSelectedPartesKeys] = useState([]);
  const activityLogRef = useRef([]);

  function appendActivityLog(entry) {
    setActivityLog((current) => {
      const next = [entry, ...current].slice(0, ACTIVITY_LOG_LIMIT);
      activityLogRef.current = next;
      return next;
    });
  }

  function updateActivityLog(entryId, patch) {
    setActivityLog((current) => {
      const next = current.map((entry) => (entry.id === entryId ? { ...entry, ...patch } : entry));
      activityLogRef.current = next;
      return next;
    });
  }

  function clearActivityLog() {
    setActivityLog([]);
    activityLogRef.current = [];
  }

  async function copyActivityText(text) {
    if (!text || typeof window === "undefined" || !navigator?.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
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
      const nextView = PUBLICACOES_VIEW_ITEMS.some((item) => item.key === queryView)
        ? queryView
        : PUBLICACOES_VIEW_ITEMS.some((item) => item.key === hashView)
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
    loadPartesCandidates(partesPage);
  }, [partesPage, view]);
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
    const limitedCount = [processCandidates, partesCandidates].filter((queue) => queue?.limited).length;
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
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=overview");
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

  async function loadProcessCandidates(page) {
    const now = Date.now();
    setProcessCandidates((state) => {
      if (state?.errorUntil && now < state.errorUntil) {
        return { ...state, loading: false };
      }
      return { ...state, loading: true, error: null };
    });
    try {
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=candidatos_processos&page=${page}&pageSize=20`);
      const payloadError = payload.data?.error || null;
      const nextErrorUntil = payloadError ? Date.now() + QUEUE_ERROR_TTL_MS : null;
      setProcessCandidates({
        loading: false,
        error: payloadError,
        items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })),
        totalRows: Number(payload.data.totalRows || 0),
        totalEstimated: Boolean(payload.data.totalEstimated),
        pageSize: payload.data.pageSize || 20,
        updatedAt: new Date().toISOString(),
        limited: Boolean(payload.data.limited),
        errorUntil: nextErrorUntil,
      });
      pushQueueRefresh("candidatos_processos");
    } catch (error) {
      const message = error.message || "Falha ao carregar candidatos.";
      setProcessCandidates((state) => ({
        loading: false,
        error: message,
        items: state?.items || [],
        totalRows: state?.totalRows || 0,
        totalEstimated: false,
        pageSize: 20,
        updatedAt: state?.updatedAt || new Date().toISOString(),
        limited: Boolean(state?.limited),
        errorUntil: Date.now() + QUEUE_ERROR_TTL_MS,
      }));
      pushQueueRefresh("candidatos_processos");
    }
  }

  async function loadPartesCandidates(page) {
    const now = Date.now();
    setPartesCandidates((state) => {
      if (state?.errorUntil && now < state.errorUntil) {
        return { ...state, loading: false };
      }
      return { ...state, loading: true, error: null };
    });
    try {
      const payload = await adminFetch(`/api/admin-hmadv-publicacoes?action=candidatos_partes&page=${page}&pageSize=20`);
      const payloadError = payload.data?.error || null;
      const nextErrorUntil = payloadError ? Date.now() + QUEUE_ERROR_TTL_MS : null;
      setPartesCandidates({
        loading: false,
        error: payloadError,
        items: (payload.data.items || []).map((item) => ({ ...item, key: item.numero_cnj || item.id })),
        totalRows: Number(payload.data.totalRows || 0),
        totalEstimated: Boolean(payload.data.totalEstimated),
        pageSize: payload.data.pageSize || 20,
        updatedAt: new Date().toISOString(),
        limited: Boolean(payload.data.limited),
        errorUntil: nextErrorUntil,
      });
      pushQueueRefresh("candidatos_partes");
    } catch (error) {
      const message = error.message || "Falha ao carregar candidatos de partes.";
      setPartesCandidates((state) => ({
        loading: false,
        error: message,
        items: state?.items || [],
        totalRows: state?.totalRows || 0,
        totalEstimated: false,
        pageSize: 20,
        updatedAt: state?.updatedAt || new Date().toISOString(),
        limited: Boolean(state?.limited),
        errorUntil: Date.now() + QUEUE_ERROR_TTL_MS,
      }));
      pushQueueRefresh("candidatos_partes");
    }
  }
  async function loadRemoteHistory() {
    if (globalErrorUntil && Date.now() < globalErrorUntil) {
      return;
    }
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=historico&limit=20");
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
      const payload = await adminFetch("/api/admin-hmadv-publicacoes?action=jobs&limit=12");
      setJobs(payload.data.items || []);
      setGlobalError(null);
      setGlobalErrorUntil(null);
    } catch {
      setJobs([]);
    }
  }

  async function refreshOperationalContext(options = {}) {
    const { forceAll = false } = options;
    const shouldLoadQueues = forceAll || PUBLICACOES_QUEUE_VIEWS.has(view);
    const calls = [loadOverview(), loadRemoteHistory(), loadJobs()];
    if (shouldLoadQueues) {
      calls.push(loadProcessCandidates(processPage), loadPartesCandidates(partesPage));
    }
    await Promise.all(calls);
  }

  async function refreshAfterAction(action) {
    const calls = [loadOverview(), loadRemoteHistory(), loadJobs()];
    if (PUBLICACOES_QUEUE_VIEWS.has(view)) {
      if (action === "criar_processos_publicacoes") {
        calls.push(loadProcessCandidates(processPage));
      }
      if (action === "backfill_partes" || action === "sincronizar_partes") {
        calls.push(loadPartesCandidates(partesPage));
      }
    }
    await Promise.all(calls);
  }

  function toggleSelection(setter, current, key) {
    setter(current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  function togglePageSelection(setter, current, rows, nextState) {
    const keys = rows.map((item) => item.key);
    if (nextState) {
      setter([...new Set([...current, ...keys])]);
      return;
    }
    setter(current.filter((item) => !keys.includes(item)));
  }

  const selectedProcessNumbers = useMemo(
    () => processCandidates.items.filter((item) => selectedProcessKeys.includes(item.key)).map((item) => item.numero_cnj),
    [processCandidates.items, selectedProcessKeys]
  );
  const selectedPartesNumbers = useMemo(
    () => partesCandidates.items.filter((item) => selectedPartesKeys.includes(item.key)).map((item) => item.numero_cnj),
    [partesCandidates.items, selectedPartesKeys]
  );
  function selectVisibleRecurringPublicacoes() {
    const recurringKeys = new Set(recurringPublicacoes.map((item) => item.key));
    setSelectedProcessKeys(processCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => item.key));
    setSelectedPartesKeys(partesCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => item.key));
    updateView("filas");
  }
  function selectVisibleSevereRecurringPublicacoes() {
    const recurringKeys = new Set(recurringPublicacoes.filter((item) => item.hits >= 3).map((item) => item.key));
    setSelectedProcessKeys(processCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => item.key));
    setSelectedPartesKeys(partesCandidates.items.filter((item) => recurringKeys.has(item.numero_cnj || item.key)).map((item) => item.key));
    updateView("filas");
  }
  function applySevereRecurringPreset() {
    setLimit(recurringPublicacoesBatch.size);
    selectVisibleSevereRecurringPublicacoes();
  }
  function clearQueueSelections() {
    setSelectedProcessKeys([]);
    setSelectedPartesKeys([]);
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
    .filter((item) => selectedProcessKeys.includes(item.key) || selectedPartesKeys.includes(item.key))
    .length;

  function updateView(nextView) {
    setView(nextView);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", nextView);
    url.hash = nextView;
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
    setActionState({ loading: true, error: null, result: null });
    updateView("resultado");
    try {
      const payload = await adminFetch("/api/admin-hmadv-publicacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_pending_jobs", id: activeJobId, maxChunks: 1 }),
      }, { timeoutMs: 120000, maxRetries: 0 });
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
      });
      setActionState({ loading: false, error: null, result: payload.data });
      replaceHistoryEntry(historyId, {
        status: "success",
        preview: buildHistoryPreview(payload.data),
        result: payload.data,
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
    updateView("operacao");
  }

  function clearHistory() {
    setExecutionHistory([]);
    persistHistoryEntries([]);
  }

  const data = overview.data || {};
  const latestHistory = executionHistory[0] || null;
  const latestRemoteRun = remoteHistory[0] || null;
  const latestJob = jobs[0] || null;
  const remoteHealth = deriveRemoteHealth(remoteHistory);
  const recurringPublicacoes = deriveRecurringPublicacoes(remoteHistory);
  const recurringPublicacoesSummary = summarizeRecurringPublicacoes(recurringPublicacoes);
  const recurringPublicacoesBands = summarizeRecurrenceBands(recurringPublicacoes);
  const recurringPublicacoesGroups = groupRecurringPublicacoes(recurringPublicacoes);
  const recurringPublicacoesFocus = deriveRecurringPublicacoesFocus(recurringPublicacoesSummary, recurringPublicacoesBands);
  const recurringPublicacoesBatch = deriveSuggestedPublicacoesBatch(recurringPublicacoesSummary, recurringPublicacoesBands);
  const recurringPublicacoesActions = deriveSuggestedPublicacoesActions(recurringPublicacoesSummary, recurringPublicacoesBands);
  const recurringPublicacoesChecklist = deriveSuggestedPublicacoesChecklist(recurringPublicacoesSummary, recurringPublicacoesBands);
  const primaryPublicacoesAction = derivePrimaryPublicacoesAction(recurringPublicacoesActions);
  const priorityBatchReady = visibleSevereRecurringCount > 0 && selectedVisibleSevereRecurringCount >= visibleSevereRecurringCount && limit === recurringPublicacoesBatch.size;

  return (
    <div className="space-y-8">
      {activityLogOpen ? (
        <section className="fixed right-0 top-0 bottom-0 z-[70] w-[min(420px,92vw)] overflow-hidden border-l border-[#2D2E2E] bg-[rgba(6,8,8,0.96)] shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <header className="flex items-center justify-between gap-3 border-b border-[#2D2E2E] px-4 py-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-[#C5A059]">Modo dev</p>
              <h4 className="text-lg font-semibold">Log de atividades</h4>
              <p className="text-xs opacity-60">API, respostas, erros e traces em tempo real.</p>
            </div>
            <button
              type="button"
              onClick={() => setActivityLogOpen(false)}
              className="rounded-full border border-[#2D2E2E] px-3 py-1.5 text-xs text-[#D8DEDA] transition hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              Fechar
            </button>
          </header>
          <div className="flex flex-wrap items-center gap-2 border-b border-[#2D2E2E] px-4 py-3 text-xs">
            <button
              type="button"
              onClick={clearActivityLog}
              disabled={!activityLog.length}
              className="border border-[#2D2E2E] px-3 py-2 text-xs uppercase tracking-[0.14em] transition disabled:opacity-40 hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              Limpar log
            </button>
            <span className="rounded-full border border-[#2D2E2E] px-2 py-1 text-[10px] uppercase tracking-[0.14em] opacity-70">
              {activityLog.length} entradas
            </span>
          </div>
          <div className="h-full overflow-y-auto px-4 pb-5 pt-4">
            {activityLog.length ? (
              <div className="space-y-3">
                {activityLog.map((entry) => (
                  <article key={entry.id} className="rounded-[22px] border border-[#2D2E2E] bg-[rgba(5,7,6,0.7)] p-4 text-xs">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">{entry.method}</p>
                        <p className="text-sm font-semibold">{entry.label}</p>
                        <p className="text-[11px] opacity-60">{entry.action || entry.path}</p>
                      </div>
                      <div className="text-right">
                        <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${entry.status === "error" ? "border-[#4B2222] text-red-200" : entry.status === "success" ? "border-[#2D2E2E] text-[#C5A059]" : "border-[#2D2E2E] text-[#9CA3AF]"}`}>
                          {entry.status}
                        </span>
                        <p className="mt-2 text-[10px] opacity-50">{entry.startedAt ? new Date(entry.startedAt).toLocaleTimeString("pt-BR") : ""}</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em] opacity-60">
                      <span className="rounded-full border border-[#2D2E2E] px-2 py-1">duracao {entry.durationMs ?? "--"}ms</span>
                      {entry.expectation ? <span className="rounded-full border border-[#2D2E2E] px-2 py-1">{entry.expectation}</span> : null}
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[11px] uppercase tracking-[0.16em] text-[#C5A059]">Detalhes</summary>
                      {entry.request ? (
                        <div className="mt-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">Request</p>
                            <button type="button" onClick={() => copyActivityText(entry.request)} className="text-[10px] uppercase tracking-[0.16em] text-[#C5A059]">
                              Copiar
                            </button>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap rounded-[18px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.8)] p-3 text-[11px] leading-5">
                            {entry.request}
                          </pre>
                        </div>
                      ) : null}
                      {entry.response ? (
                        <div className="mt-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">Response</p>
                            <button type="button" onClick={() => copyActivityText(entry.response)} className="text-[10px] uppercase tracking-[0.16em] text-[#C5A059]">
                              Copiar
                            </button>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap rounded-[18px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.8)] p-3 text-[11px] leading-5">
                            {entry.response}
                          </pre>
                        </div>
                      ) : null}
                      {entry.error ? (
                        <div className="mt-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-red-200">Erro</p>
                            <button type="button" onClick={() => copyActivityText(entry.error)} className="text-[10px] uppercase tracking-[0.16em] text-[#FCA5A5]">
                              Copiar
                            </button>
                          </div>
                          <pre className="mt-2 whitespace-pre-wrap rounded-[18px] border border-[#4B2222] bg-[rgba(60,23,23,0.6)] p-3 text-[11px] leading-5 text-red-200">
                            {entry.error}
                          </pre>
                        </div>
                      ) : null}
                    </details>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-[#2D2E2E] px-4 py-6 text-sm opacity-60">
                Nenhuma chamada registrada ainda.
              </div>
            )}
          </div>
        </section>
      ) : null}
      {activityLogOpen ? (
        <button
          type="button"
          onClick={() => setActivityLogOpen(false)}
          className="group fixed right-0 top-1/2 z-[75] -translate-y-1/2 rounded-l-2xl border border-[#2D2E2E] bg-[#0d0f0e] px-2 py-5 text-[10px] uppercase tracking-[0.28em] text-[#C5A059] shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
          style={{ writingMode: "vertical-rl", textOrientation: "mixed" }}
        >
          <span className="group-hover:hidden">Log</span>
          <span className="hidden group-hover:block text-[12px]">X</span>
        </button>
      ) : null}
      <section className="rounded-[34px] border border-[#2D2E2E] bg-[radial-gradient(circle_at_top_left,rgba(197,160,89,0.12),transparent_35%),linear-gradient(180deg,rgba(13,15,14,0.98),rgba(8,10,10,0.98))] px-6 py-6 md:px-7">
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
          </div>
        </div>
        <div className="mt-6 space-y-4">
          <ViewToggle value={view} onChange={updateView} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActivityLogOpen((current) => !current)}
              className="border border-[#2D2E2E] px-4 py-2 text-xs uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              {activityLogOpen ? "Fechar log de atividades" : "Log de atividades"}
            </button>
            <button
              type="button"
              onClick={clearActivityLog}
              disabled={!activityLog.length}
              className="border border-[#2D2E2E] px-4 py-2 text-xs uppercase tracking-[0.14em] transition disabled:opacity-40 hover:border-[#C5A059] hover:text-[#C5A059]"
            >
              Limpar log
            </button>
            <span className="text-[10px] uppercase tracking-[0.16em] opacity-60">
              {activityLog.length} entradas
            </span>
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Publicacoes totais" value={data.publicacoesTotal || 0} helper="Estoque atualmente persistido no HMADV." />
        <MetricCard label="Com activity" value={data.publicacoesComActivity || 0} helper="Ja refletidas como activity no Freshsales." />
        <MetricCard label="Pendentes" value={data.publicacoesPendentesComAccount || 0} helper="Ainda sem activity em processos com account vinculado." />
        <MetricCard label="Sem processo" value={data.publicacoesSemProcesso || 0} helper="Publicacoes ainda sem processo vinculado no HMADV." />
      </div>

      {view === "operacao" ? <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Criacao de processos a partir das publicacoes" eyebrow="Operacao orientada por fila">
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
                max="20"
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
                disabled={actionState.loading}
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
                Rodar sync-worker
              </button>
              <button
                type="button"
                onClick={runPendingJobsNow}
                disabled={actionState.loading || drainInFlight || !jobs.some((item) => ["pending", "running"].includes(String(item.status || "")))}
                className="border border-[#6E5630] bg-[rgba(197,160,89,0.08)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#F8E7B5] hover:border-[#C5A059] disabled:opacity-50"
              >
                {drainInFlight ? "Drenando fila..." : "Drenar fila HMADV"}
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Extracao retroativa de partes" eyebrow="Operacao orientada por fila">
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
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Simular extracao
              </button>
              <button
                type="button"
                onClick={() => handleAction("backfill_partes", true, selectedPartesNumbers)}
                disabled={actionState.loading}
                className="bg-[#C5A059] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#050706] disabled:opacity-50"
              >
                Aplicar extracao
              </button>
              <button
                type="button"
                onClick={() => handleAction("sincronizar_partes", true, selectedPartesNumbers)}
                disabled={actionState.loading}
                className="border border-[#6E5630] bg-[rgba(197,160,89,0.08)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-[#F8E7B5] hover:border-[#C5A059] disabled:opacity-50"
              >
                Salvar + corrigir CRM
              </button>
              <button
                type="button"
                onClick={async () => {
                  await Promise.all([loadOverview(), loadProcessCandidates(processPage), loadPartesCandidates(partesPage)]);
                }}
                disabled={actionState.loading}
                className="border border-[#2D2E2E] px-5 py-3 text-sm hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
              >
                Atualizar leitura
              </button>
            </div>
          </div>
        </Panel>

        <Panel title="Leitura de backlog" eyebrow="Operacao">
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
                <button type="button" onClick={runPendingJobsNow} disabled={actionState.loading || drainInFlight} className="border border-[#2D2E2E] px-3 py-2 text-xs hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">{drainInFlight ? "Drenando..." : "Rodar drenagem agora"}</button>
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
        <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Fila de processos criaveis" eyebrow="Criacao a partir das publicacoes">
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
        </Panel>
        <Panel title="Fila de partes extraiveis" eyebrow="Backfill pelo conteudo das publicacoes">
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
        </Panel>
        </div>
      </div> : null}

      {view === "resultado" ? <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Resultado da ultima acao" eyebrow="Retorno operacional">
          {actionState.loading ? <p className="text-sm opacity-65">Executando acao...</p> : null}
          {actionState.error ? <p className="text-sm text-red-300">{actionState.error}</p> : null}
          {!actionState.loading && actionState.result?.drain ? <div className="mb-4 rounded-[20px] border border-[#30543A] bg-[rgba(48,84,58,0.12)] p-4 text-sm"><p className="font-semibold">Drenagem de fila</p><p className="mt-2 opacity-75">{buildDrainPreview(actionState.result.drain)}</p></div> : null}
          {jobs.length ? <div className="mb-4 space-y-3"><p className="text-xs uppercase tracking-[0.16em] opacity-55">Jobs persistidos</p>{jobs.slice(0, 4).map((job) => <JobCard key={job.id} job={job} active={job.id === activeJobId} />)}</div> : null}
          {!actionState.loading && !actionState.error && actionState.result ? <OperationResult result={actionState.result} /> : null}
          {!actionState.loading && !actionState.error && !actionState.result ? <p className="text-sm opacity-65">Nenhuma acao executada ainda nesta sessao.</p> : null}
        </Panel>
        <Panel title="Historico de execucao" eyebrow="Memoria local da operacao">
          <div className="mb-4 flex flex-wrap gap-3">
            <button type="button" onClick={() => updateView("operacao")} className="border border-[#2D2E2E] px-4 py-2 text-sm hover:border-[#C5A059] hover:text-[#C5A059]">Voltar para operacao</button>
            <button type="button" onClick={clearHistory} className="border border-[#2D2E2E] px-4 py-2 text-sm hover:border-[#C5A059] hover:text-[#C5A059]">Limpar historico</button>
          </div>
          {remoteHistory.length ? <div className="mb-5 space-y-3"><p className="text-xs uppercase tracking-[0.16em] opacity-55">Historico persistido no HMADV</p>{remoteHistory.map((entry) => <div key={entry.id} className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 text-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{entry.acao}</p><p className="text-xs opacity-60">{new Date(entry.created_at).toLocaleString("pt-BR")}</p></div><span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${entry.status === "error" ? "border-[#4B2222] text-red-200" : "border-[#2D2E2E] opacity-70"}`}>{entry.status}</span></div>{entry.resumo ? <p className="mt-3 opacity-70">{entry.resumo}</p> : null}<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-60"><span>Solicitados: {entry.requested_count || 0}</span><span>Afetados: {entry.affected_count || 0}</span></div></div>)}</div> : null}
          {!executionHistory.length ? <p className="text-sm opacity-65">Nenhuma solicitacao registrada ainda neste navegador.</p> : <div className="space-y-3">{executionHistory.map((entry) => <HistoryCard key={entry.id} entry={entry} onReuse={reuseHistoryEntry} />)}</div>}
        </Panel>
      </div> : null}
    </div>
  );
}
