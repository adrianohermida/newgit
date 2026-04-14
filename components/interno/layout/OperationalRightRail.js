import { useInternalTheme } from "../InternalThemeProvider";

function formatRelativeTime(value) {
  if (!value) return "sem horario";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "sem horario";
  const diffMin = Math.max(0, Math.round((Date.now() - parsed.getTime()) / (1000 * 60)));
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours} h`;
  return `${Math.round(diffHours / 24)} d`;
}

function getJobStatusTone(status) {
  const normalized = String(status || "").trim();
  if (normalized === "completed") return "border-[#30543A] text-[#B7F7C6]";
  if (normalized === "running") return "border-[#6E5630] text-[#FDE68A]";
  if (normalized === "paused" || normalized === "retry_wait" || normalized === "scheduled") return "border-[#2D4D60] text-[#B8D9F0]";
  if (normalized === "error" || normalized === "cancelled") return "border-[#5B2D2D] text-[#FECACA]";
  return "border-[#22342F] text-[#D8DEDA]";
}

export default function OperationalRightRail({ data, onOpenConsole, onOpenJobsLog }) {
  const { isLightTheme } = useInternalTheme();
  if (!data) return null;
  return (
    <div className="space-y-4">
      <section className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>Execucao em tempo real</p>
            <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{data.moduleLabel}</p>
            <p className={`mt-2 text-xs leading-5 ${isLightTheme ? "text-[#6B7C88]" : "text-[#92A59F]"}`}>Lotes protegidos, fila persistida, erros correlacionados com o console e prioridade para nao estourar rate limit.</p>
          </div>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={onOpenConsole} className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] hover:border-[#C5A059] hover:text-[#C5A059] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>Console</button>
            <button type="button" onClick={onOpenJobsLog} className="rounded-full border border-[#6E5630] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#FDE68A] hover:border-[#C5A059]">Jobs</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.14em]">
          {data.backendHealth?.status ? <span className={`rounded-full border px-2 py-1 ${getJobStatusTone(data.backendHealth.status)}`}>backend {data.backendHealth.status}</span> : null}
          {data.operationalStatus?.mode ? <span className={`rounded-full border px-2 py-1 ${getJobStatusTone(data.operationalStatus.mode)}`}>operacao {data.operationalStatus.mode}</span> : null}
          {data.limit ? <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>lote base {data.limit}</span> : null}
          {data.selectedCount ? <span className={`rounded-full border px-2 py-1 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{data.selectedCount} selecionados</span> : null}
          {data.drainInFlight ? <span className="rounded-full border border-[#6E5630] px-2 py-1 text-[#FDE68A]">drenando fila</span> : null}
          {data.actionState?.loading ? <span className="rounded-full border border-[#6E5630] px-2 py-1 text-[#FDE68A]">acao em execucao</span> : null}
        </div>
      </section>
      {data.activeJobs.length ? <section className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>Jobs ativos</p>
        <div className="mt-3 space-y-2">{data.activeJobs.map((job) => {
          const requested = Number(job?.requested_count || 0);
          const processed = Number(job?.processed_count || 0);
          const progress = requested ? Math.max(0, Math.min(100, Math.round((processed / requested) * 100))) : 0;
          return <div key={job.id} className={`rounded-xl border p-3 ${job.id === data.activeJobId ? "border-[#C5A059] bg-[rgba(197,160,89,0.08)]" : isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(8,10,9,0.45)]"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`text-[11px] font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{job.acao || "job"}</span>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getJobStatusTone(job.status)}`}>{job.status || "pending"}</span>
            </div>
            <p className={`mt-2 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{processed}/{requested || processed} processado(s) • atualizado ha {formatRelativeTime(job.updated_at || job.started_at || job.created_at)}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]"><div className="h-full bg-[#C5A059]" style={{ width: `${progress}%` }} /></div>
            {job.last_error ? <p className="mt-2 text-[11px] text-[#FECACA]">{job.last_error}</p> : null}
          </div>;
        })}</div>
      </section> : null}
      {data.queues.length ? <section className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>Filas monitoradas</p>
        <div className="mt-3 space-y-2">{data.queues.map((queue) => <div key={queue.key} className={`rounded-xl border p-3 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(8,10,9,0.45)]"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{queue.label}</span>
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${queue.error ? "border-[#5B2D2D] text-[#FECACA]" : "border-[#22342F] text-[#D8DEDA]"}`}>{queue.totalRows} itens</span>
          </div>
          <p className={`mt-2 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Atualizada ha {formatRelativeTime(queue.updatedAt)}{queue.limited ? " • leitura limitada" : ""}</p>
          {queue.error ? <p className="mt-2 text-[11px] text-[#FECACA]">{queue.error}</p> : null}
        </div>)}</div>
      </section> : null}
      {data.batchHints.length ? <section className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>Janela segura de lote</p>
        <div className="mt-3 flex flex-wrap gap-2">{data.batchHints.map((item) => <span key={item.key} className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{item.label}: {item.value}</span>)}</div>
      </section> : null}
      {data.recentErrors.length || data.actionState?.error ? <section className={`rounded-[20px] border p-4 ${isLightTheme ? "border-[#F0CACA] bg-[#FFF4F4]" : "border-[#5B2D2D] bg-[rgba(91,45,45,0.14)]"}`}>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#B25E5E]" : "text-[#E8B4B4]"}`}>Erros correlacionados</p>
        <div className="mt-3 space-y-2 text-[11px]">
          {data.actionState?.error ? <div className={`rounded-xl border p-3 ${isLightTheme ? "border-[#F0CACA] bg-white text-[#8C4545]" : "border-[#5B2D2D] bg-[rgba(34,12,14,0.45)] text-[#FECACA]"}`}>{data.actionState.error}</div> : null}
          {data.recentErrors.map((item) => <div key={item.id} className={`rounded-xl border p-3 ${isLightTheme ? "border-[#F0CACA] bg-white" : "border-[#5B2D2D] bg-[rgba(34,12,14,0.45)]"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`font-semibold ${isLightTheme ? "text-[#8C4545]" : "text-[#F8D6D6]"}`}>{item.label}</span>
              <span className={isLightTheme ? "text-[#A46A14]" : "text-[#D9B46A]"}>{formatRelativeTime(item.createdAt)}</span>
            </div>
            <p className={`mt-2 ${isLightTheme ? "text-[#A65F5F]" : "text-[#F1C3C3]"}`}>{item.message}</p>
          </div>)}
        </div>
      </section> : null}
    </div>
  );
}
