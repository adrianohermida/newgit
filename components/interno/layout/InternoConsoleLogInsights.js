export default function InternoConsoleLogInsights(props) {
  const { getSeverityTone, isLightTheme, logFilters, logPane, noteClass, paneBulkGuardrail, paneRisk, paneSla, paneTagPlaybook, updateFilters } = props;
  return <>
    {paneTagPlaybook ? <div className={`rounded-xl border p-3 ${noteClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{paneTagPlaybook.title}</p><p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Checklist sugerido para a trilha atual do console.</p></div>
        <button type="button" onClick={() => updateFilters({ ...logFilters, tag: logPane })} className="rounded-full border border-[#C5A059] px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-[#F4E7C2]">Fixar filtro</button>
      </div>
      <div className={`mt-3 space-y-2 text-[11px] ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{paneTagPlaybook.checklist.map((step) => <div key={`${logPane}_${step}`} className={`rounded-lg border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(8,10,9,0.45)]"}`}>{step}</div>)}</div>
    </div> : null}
    {paneBulkGuardrail ? <div className={`rounded-xl border p-3 ${noteClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{paneBulkGuardrail.title}</p><p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{paneBulkGuardrail.summary}</p></div>
        <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(paneBulkGuardrail.tone)}`}>itens {paneBulkGuardrail.metrics.total} · erros {paneBulkGuardrail.metrics.errors} · running {paneBulkGuardrail.metrics.running}</span>
      </div>
      <div className={`mt-3 space-y-2 text-[11px] ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>{paneBulkGuardrail.actions.map((step) => <div key={`${logPane}_${step}`} className={`rounded-lg border px-3 py-2 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(8,10,9,0.45)]"}`}>{step}</div>)}</div>
    </div> : null}
    <div className={`rounded-xl border p-3 xl:col-span-2 ${noteClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Risco da trilha</p><p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Score baseado em erros, warnings e recorrencia recente.</p></div>
        <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(paneRisk.tone)}`}>risco {paneRisk.label} · {paneRisk.score}</span>
      </div>
    </div>
    <div className={`rounded-xl border p-3 xl:col-span-2 ${noteClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>SLA e idade dos erros</p><p className={`mt-1 text-[11px] ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>Envelhecimento dos erros ainda nao resolvidos nesta trilha.</p></div>
        <span className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(paneSla.tone)}`}>aberto {paneSla.openRecurring} · acompanhando {paneSla.watchingRecurring} · resolvido {paneSla.resolvedRecurring}</span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">{[{ label: "até 4h", value: paneSla.buckets.ate_4h }, { label: "4h - 24h", value: paneSla.buckets.ate_24h }, { label: "24h - 72h", value: paneSla.buckets.ate_72h }, { label: "acima de 72h", value: paneSla.buckets.acima_72h, tone: paneSla.buckets.acima_72h ? "text-[#FECACA]" : isLightTheme ? "text-[#152421]" : "text-[#F4F1EA]" }, { label: "sem data", value: paneSla.buckets.sem_data, tone: paneSla.buckets.sem_data ? "text-[#FDE68A]" : isLightTheme ? "text-[#152421]" : "text-[#F4F1EA]" }].map((item) => <div key={item.label} className={`rounded-lg border px-3 py-2 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(8,10,9,0.45)]"}`}><div className="text-[#7F928C]">{item.label}</div><div className={`mt-1 font-semibold ${item.tone || (isLightTheme ? "text-[#152421]" : "text-[#F4F1EA]")}`}>{item.value}</div></div>)}</div>
    </div>
  </>;
}
