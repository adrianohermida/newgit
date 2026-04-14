import { useEffect, useState } from "react";
import { HealthBadge, JobCard, QueueSummaryCard, StatusBadge } from "./ui-primitives";

function formatUpstreamWarningText(upstreamWarning) {
  if (!upstreamWarning) return "";
  const parts = [];
  if (upstreamWarning.functionName) parts.push(`Funcao: ${upstreamWarning.functionName}`);
  if (upstreamWarning.status) parts.push(`HTTP ${upstreamWarning.status}`);
  if (upstreamWarning.message) parts.push(upstreamWarning.message);
  return parts.join(" - ");
}

function renderSyncStatuses(row) {
  const statuses = [];
  if (row.processo_criado) statuses.push({ label: "processo criado", tone: "success" });
  else if (row.processo_depois) statuses.push({ label: "processo localizado", tone: "default" });
  if (row.partes_novas?.length) statuses.push({ label: `detectadas ${row.partes_novas.length}`, tone: "warning" });
  else if (typeof row.partes_detectadas === "number") statuses.push({ label: "sem novas partes", tone: "default" });
  if (row.polos_atualizados?.polo_ativo || row.polos_atualizados?.polo_passivo) statuses.push({ label: "polos atualizados", tone: "success" });
  if (row.freshsales_repair?.skipped) statuses.push({ label: "crm pendente", tone: "warning" });
  else if (row.freshsales_repair) statuses.push({ label: "crm ajustado", tone: "success" });
  return statuses;
}

export function OperationResult({ result, formatFallbackReason }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [result]);
  if (result?.job) return <JobCard job={result.job} active />;

  const pageSize = 10;
  const rows = Array.isArray(result?.sample) ? result.sample : Array.isArray(result?.items) ? result.items : Array.isArray(result?.sample_partes) ? result.sample_partes : [];
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
  const activityTypeStatus = result?.activityTypeStatus || null;

  return (
    <div className="space-y-4">
      {result?.fallbackReason || result?.upstreamWarning ? <div className="rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#FDE68A]"><p className="font-semibold">Execucao em modo protegido</p>{result?.fallbackReason ? <p className="mt-2 opacity-90">{formatFallbackReason(result.fallbackReason)}</p> : null}{result?.upstreamWarning ? <p className="mt-2 opacity-90">{formatUpstreamWarningText(result.upstreamWarning)}</p> : null}</div> : null}
      {result?.uiHint ? <div className="rounded-[20px] border border-[#6E5630] bg-[rgba(76,57,26,0.18)] p-4 text-sm text-[#FDE68A]"><p className="font-semibold">Leitura guiada</p><p className="mt-2 opacity-90">{result.uiHint}</p></div> : null}
      {activityTypeStatus ? <div className={`rounded-[20px] border p-4 text-sm ${activityTypeStatus.matched ? "border-[#30543A] bg-[rgba(48,84,58,0.12)] text-[#C7F1D7]" : "border-[#6E5630] bg-[rgba(76,57,26,0.18)] text-[#FDE68A]"}`}><p className="font-semibold">Tipo de atividade no CRM</p><div className="mt-2 flex flex-wrap gap-2"><HealthBadge label={activityTypeStatus.ok ? "catalogo ok" : "catalogo indisponivel"} tone={activityTypeStatus.ok ? "success" : "danger"} /><HealthBadge label={`tipos ${Number(activityTypeStatus.total || 0)}`} tone="default" /><HealthBadge label={activityTypeStatus.matched ? `tipo ${activityTypeStatus.matchedName}` : "tipo nao localizado"} tone={activityTypeStatus.matched ? "success" : "warning"} />{activityTypeStatus.fallbackOnly ? <HealthBadge label="catalogo em fallback" tone="warning" /> : null}</div>{activityTypeStatus.error ? <p className="mt-2 opacity-90">{activityTypeStatus.error}</p> : null}</div> : null}
      <div className="grid gap-3 md:grid-cols-6 text-sm"><QueueSummaryCard title="Processos criados" count={counters.processosCriados} helper="Publicacoes que viraram processo na base." accent="text-[#B7F7C6]" /><QueueSummaryCard title="Partes detectadas" count={counters.detectadas} helper="Novas partes encontradas no lote." accent="text-[#FDE68A]" /><QueueSummaryCard title="Partes salvas" count={result?.partesInseridas || 0} helper="Registros inseridos na base de partes." accent="text-[#B7F7C6]" /><QueueSummaryCard title="Polos atualizados" count={counters.polosAtualizados} helper="Processos com polo ativo/passivo recalculado." accent="text-[#B7F7C6]" /><QueueSummaryCard title="CRM ajustado" count={counters.crmReparado} helper="Contas refletidas no CRM." accent="text-[#B7F7C6]" /><QueueSummaryCard title="Pendentes" count={counters.pendentes + counters.falhas} helper="Itens que ainda pedem acao ou revisao." accent="text-[#FECACA]" /></div>
      <div className="grid gap-3 md:grid-cols-4 text-sm">{Object.entries(result || {}).filter(([, value]) => !Array.isArray(value) && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")).slice(0, 8).map(([key, value]) => <div key={key} className="border border-[#2D2E2E] p-3"><p className="text-[11px] uppercase tracking-[0.15em] opacity-50">{key}</p><p className="mt-1 break-all">{String(value)}</p></div>)}</div>
      {rows.length ? <><div className="space-y-3">{paged.map((row, index) => <div key={`${row.numero_cnj || row.processo_id || index}`} className="border border-[#2D2E2E] p-4 text-sm"><p className="font-semibold">{row.numero_cnj || row.processo_id || `Linha ${index + 1}`}</p>{row.titulo ? <p className="opacity-70">{row.titulo}</p> : null}{renderSyncStatuses(row).length ? <div className="mt-2 flex flex-wrap gap-2">{renderSyncStatuses(row).map((item) => <StatusBadge key={item.label} tone={item.tone}>{item.label}</StatusBadge>)}</div> : null}{row.status === "fallback_local" ? <div className="mt-2 flex flex-wrap gap-2"><StatusBadge tone="warning">fallback local</StatusBadge>{row.functionName ? <StatusBadge tone="default">{row.functionName}</StatusBadge> : null}</div> : null}{row.error ? <p className="mt-2 text-xs text-[#FECACA]">{row.error}</p> : null}</div>)}</div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs opacity-60">Pagina {page} de {totalPages}</p><div className="flex gap-2"><button type="button" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40">Anterior</button><button type="button" onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="border border-[#2D2E2E] px-3 py-2 text-xs disabled:opacity-40">Proxima</button></div></div></> : <p className="text-sm opacity-60">Sem amostra detalhada para exibir.</p>}
    </div>
  );
}
