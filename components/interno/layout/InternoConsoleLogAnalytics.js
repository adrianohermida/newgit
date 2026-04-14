export default function InternoConsoleLogAnalytics(props) {
  const {
    getFingerprintStatusTone,
    getSeverityTone,
    handleBulkFingerprintReset,
    handleBulkFingerprintStateChange,
    handleFingerprintNote,
    handleFingerprintStateChange,
    isLightTheme,
    paneFingerprintSummary,
    paneRecommendationSummary,
    paneTimeline,
  } = props;
  const cardClass = isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]";
  const itemClass = isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(8,10,9,0.45)]";
  const titleClass = isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]";
  const bodyClass = isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]";
  const emptyClass = isLightTheme ? "text-[#7B8B98]" : "";
  const strongClass = isLightTheme ? "text-[#152421]" : "";
  const subtleButtonClass = isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]";
  return <>
    <div className={`rounded-xl border p-3 ${cardClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-[10px] uppercase tracking-[0.18em] ${titleClass}`}>Recorrencia</p>
        {paneFingerprintSummary.length ? <div className="flex flex-wrap gap-2">
          {[["acompanhando", "Acompanhar todos", "border-[#6E5630] text-[#FDE68A]"], ["resolvido", "Resolver todos", "border-[#30543A] text-[#B7F7C6]"]].map(([status, label, tone]) => <button key={status} type="button" onClick={() => handleBulkFingerprintStateChange(status)} className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${tone}`}>{label}</button>)}
          <button type="button" onClick={handleBulkFingerprintReset} className="rounded-full border border-[#5B2D2D] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-[#FECACA]">Reabrir</button>
        </div> : null}
      </div>
      {!paneFingerprintSummary.length ? <p className={`mt-2 text-[11px] opacity-60 ${emptyClass}`}>Nenhum fingerprint recorrente nesta trilha.</p> : <div className="mt-2 space-y-2">
        {paneFingerprintSummary.map((item) => <div key={item.fingerprint} className={`rounded-lg border px-3 py-2 text-[11px] ${itemClass}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`font-semibold ${strongClass}`}>{item.label}</span>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getFingerprintStatusTone(item.status)}`}>{item.status}</span>
              <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(item.severity)}`}>{item.count}x</span>
            </div>
          </div>
          <div className={`mt-1 ${titleClass}`}>{item.fingerprint}</div>
          {item.note ? <div className={`mt-2 ${bodyClass}`}>{item.note}</div> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {[["aberto", "Aberto", "border-[#5B2D2D] text-[#FECACA]"], ["acompanhando", "Acompanhar", "border-[#6E5630] text-[#FDE68A]"], ["resolvido", "Resolver", "border-[#30543A] text-[#B7F7C6]"]].map(([status, label, tone]) => <button key={status} type="button" onClick={() => handleFingerprintStateChange(item.fingerprint, status, item.note || "")} className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${tone}`}>{label}</button>)}
            <button type="button" onClick={() => handleFingerprintNote(item.fingerprint)} className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${subtleButtonClass}`}>Nota</button>
          </div>
        </div>)}
      </div>}
    </div>
    <div className={`rounded-xl border p-3 ${cardClass}`}>
      <p className={`text-[10px] uppercase tracking-[0.18em] ${titleClass}`}>Acao recomendada</p>
      {!paneRecommendationSummary.length ? <p className={`mt-2 text-[11px] opacity-60 ${emptyClass}`}>Sem recomendacoes consolidadas ainda.</p> : <div className="mt-2 space-y-2">
        {paneRecommendationSummary.map((item) => <div key={item.action} className={`rounded-lg border px-3 py-2 text-[11px] ${itemClass}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`font-semibold ${strongClass}`}>{item.action}</span>
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(item.severity)}`}>{item.count}</span>
          </div>
        </div>)}
      </div>}
    </div>
    <div className={`rounded-xl border p-3 xl:col-span-2 ${cardClass}`}>
      <p className={`text-[10px] uppercase tracking-[0.18em] ${titleClass}`}>Timeline operacional</p>
      {!paneTimeline.length ? <p className={`mt-2 text-[11px] opacity-60 ${emptyClass}`}>Sem jobId/runId/contactId/processoId identificados nesta trilha.</p> : <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {paneTimeline.map((item) => <div key={item.key} className={`rounded-lg border px-3 py-2 text-[11px] ${itemClass}`}>
          <div className="flex items-center justify-between gap-2">
            <span className={`font-semibold ${strongClass}`}>{item.label}</span>
            <span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.14em] ${getSeverityTone(item.severity)}`}>{item.count}</span>
          </div>
          <div className={`mt-1 ${titleClass}`}>{item.lastAt ? new Date(item.lastAt).toLocaleString("pt-BR") : "sem data"}</div>
        </div>)}
      </div>}
    </div>
  </>;
}
