import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import { ACTION_LABELS, PUBLICACOES_VIEW_ITEMS } from "./constants";
import { buildJobPreview } from "./action-utils";

export function CompactHistoryPanel({ localHistory, remoteHistory, className = "" }) {
  const latestLocal = localHistory[0];
  const latestRemote = remoteHistory[0];
  return (
    <div className={`border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4 ${className}`.trim()}>
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">Historico (compacto)</p>
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">Ultimo local</p>
          {latestLocal ? <p className="mt-1">{latestLocal.label || latestLocal.action} • {latestLocal.status}</p> : <p className="mt-1 opacity-60">Sem registros locais.</p>}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] opacity-60">Ultima leitura remota</p>
          {latestRemote ? <p className="mt-1">{latestRemote.acao} • {latestRemote.status}</p> : <p className="mt-1 opacity-60">Sem registros remotos.</p>}
        </div>
        <p className="text-xs opacity-60">Detalhes completos no Console &gt; Log.</p>
      </div>
    </div>
  );
}

export function MetricCard({ label, value, helper }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">{label}</p>
      <p className="font-serif text-3xl mb-2">{value}</p>
      {helper ? <p className="text-sm opacity-65 leading-relaxed">{helper}</p> : null}
    </div>
  );
}

export function QueueSummaryCard({ title, count, helper, accent = "text-[#C5A059]" }) {
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-5">
      <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-2 opacity-50">{title}</p>
      <p className={`font-serif text-3xl mb-2 ${accent}`}>{count}</p>
      <p className="text-sm opacity-65 leading-relaxed">{helper}</p>
    </div>
  );
}
export function RemoteRunSummary({ entry, actionLabels }) {
  if (!entry) return null;
  const summary = entry.result_summary || {};
  const items = Object.entries(summary).filter(([, value]) => value !== undefined && value !== null && value !== "");
  const statusTone = entry.status === "error" ? "border-[#5B2D2D] text-[#FECACA]" : entry.status === "success" ? "border-[#30543A] text-[#B7F7C6]" : "border-[#2D2E2E] text-[#F4F1EA]";
  return (
    <div className="border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.15em] uppercase opacity-50">Ultima rodada remota</p>
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

export function HealthBadge({ label, tone }) {
  const classes = {
    success: "border-[#30543A] text-[#B7F7C6]",
    warning: "border-[#6E5630] text-[#FDE68A]",
    danger: "border-[#5B2D2D] text-[#FECACA]",
    default: "border-[#2D2E2E] text-[#F4F1EA]",
  };
  return <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${classes[tone] || classes.default}`}>{label}</span>;
}

export function Panel({ title, eyebrow, children, className = "" }) {
  return (
    <section className={`border border-[#2D2E2E] bg-[rgba(13,15,14,0.96)] p-6 ${className}`.trim()}>
      {eyebrow ? <p className="text-xs font-semibold tracking-[0.15em] uppercase mb-3" style={{ color: "#C5A059" }}>{eyebrow}</p> : null}
      <h3 className="font-serif text-2xl mb-4">{title}</h3>
      {children}
    </section>
  );
}

export function ViewToggle({ value, onChange }) {
  return <div className="flex flex-wrap gap-2">{PUBLICACOES_VIEW_ITEMS.map((item) => {
    const active = item.key === value;
    return <button key={item.key} type="button" onClick={() => onChange(item.key)} className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.16em] transition ${active ? "border-[#C5A059] bg-[rgba(197,160,89,0.12)] text-[#F8E7B5]" : "border-[#2D2E2E] text-[#C5A059] hover:border-[#C5A059]"}`}>{item.label}</button>;
  })}</div>;
}

export function HistoryCard({ entry, onReuse }) {
  const { isLightTheme } = useInternalTheme();
  return <div className={`border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="font-semibold">{entry.label}</p><p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{new Date(entry.createdAt).toLocaleString("pt-BR")}</p></div>
      <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${entry.status === "running" ? (isLightTheme ? "border-[#e4d2a8] bg-[#fff8e8] text-[#8a6217]" : "border-[#6E5630] text-[#FDE68A]") : entry.status === "error" ? (isLightTheme ? "border-[#E7C4C4] bg-[#FFF4F4] text-[#B25E5E]" : "border-[#4B2222] text-red-200") : (isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E] opacity-70")}`}>{entry.status}</span>
    </div>
    {entry.preview ? <p className={`mt-3 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{entry.preview}</p> : null}
    {entry.meta?.selectedCount ? <p className={`mt-2 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Itens selecionados: {entry.meta.selectedCount}</p> : null}
    {entry.meta?.limit ? <p className={`mt-1 text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>Lote: {entry.meta.limit}</p> : null}
    {entry.meta?.processNumbersPreview ? <p className={`mt-2 break-all text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>CNJs: {entry.meta.processNumbersPreview}</p> : null}
    <div className="mt-3"><button type="button" onClick={() => onReuse(entry)} className={`border px-3 py-2 text-xs transition ${isLightTheme ? "border-[#d7d4cb] text-[#4b5563] hover:border-[#9a6d14] hover:text-[#9a6d14]" : "border-[#2D2E2E] hover:border-[#C5A059] hover:text-[#C5A059]"}`}>Reusar parametros</button></div>
  </div>;
}

export function JobCard({ job, active = false }) {
  const { isLightTheme } = useInternalTheme();
  const processed = Number(job?.processed_count || 0);
  const requested = Number(job?.requested_count || 0);
  const percent = requested ? Math.min(100, Math.round((processed / requested) * 100)) : 0;
  const statusTone = job?.status === "completed" ? "success" : job?.status === "error" ? "danger" : "warning";
  return <div className={`border p-4 text-sm ${active ? (isLightTheme ? "border-[#c79b2c] bg-[#fff8e8] text-[#1f2937]" : "border-[#C5A059] bg-[rgba(76,57,26,0.18)]") : (isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(13,15,14,0.96)]")}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold">{ACTION_LABELS[job?.acao] || job?.acao}</p>
        <p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{job?.created_at ? new Date(job.created_at).toLocaleString("pt-BR") : "sem horario"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <HealthBadge label={job?.status || "pending"} tone={statusTone} />
        {active ? <HealthBadge label="ativo na tela" tone="default" /> : null}
      </div>
    </div>
    <div className="mt-3 flex flex-wrap gap-2 text-xs">
      <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#d7d4cb] text-[#6b7280]" : "border-[#2D2E2E]"}`}>Solicitados {requested}</span>
      <span className="rounded-full border border-[#30543A] px-2 py-1 text-[#B7F7C6]">Processados {processed}</span>
      <span className="rounded-full border border-[#6E5630] px-2 py-1 text-[#FDE68A]">Falhas {Number(job?.error_count || 0)}</span>
    </div>
    <div className={`mt-3 h-2 overflow-hidden rounded-full ${isLightTheme ? "bg-[#ece7da]" : "bg-[rgba(255,255,255,0.08)]"}`}>
      <div className={`h-full rounded-full ${isLightTheme ? "bg-[#c79b2c]" : "bg-[#C5A059]"}`} style={{ width: `${percent}%` }} />
    </div>
    <p className={`mt-2 text-xs ${isLightTheme ? "text-[#4b5563]" : "opacity-65"}`}>{buildJobPreview(job)}</p>
    {job?.last_error ? <p className={`mt-2 text-xs ${isLightTheme ? "text-[#B25E5E]" : "text-red-200"}`}>{job.last_error}</p> : null}
  </div>;
}

export function StatusBadge({ children, tone = "default" }) {
  const tones = {
    default: "border-[#2D2E2E] text-[#F4F1EA]",
    success: "border-[#30543A] text-[#B7F7C6]",
    warning: "border-[#6E5630] text-[#FDE68A]",
    danger: "border-[#5B2D2D] text-[#FECACA]",
  };
  return <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.16em] ${tones[tone] || tones.default}`}>{children}</span>;
}
