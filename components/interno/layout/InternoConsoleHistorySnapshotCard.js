function SnapshotEntry(props) {
  const { bodyClass, entry, isLightTheme } = props;
  const cardClass = isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]";
  const statusClass = entry.status === "error" ? (isLightTheme ? "text-[#B25E5E]" : "text-red-200") : entry.status === "success" ? "text-[#11D473]" : "text-[#D9B46A]";
  return <div className={`rounded-lg border px-3 py-2 ${cardClass}`}>
    <div className="flex items-center justify-between">
      <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>{entry.label || entry.action}</span>
      <span className={statusClass}>{entry.status || "running"}</span>
    </div>
    {entry.preview ? <div className={`mt-1 ${bodyClass}`}>{entry.preview}</div> : null}
  </div>;
}

export default function InternoConsoleHistorySnapshotCard(props) {
  const { emptyText, handleCopy, history, isLightTheme, primaryLines, title } = props;
  const cardClass = isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(8,10,9,0.5)]";
  const itemClass = isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]";
  const titleClass = isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]";
  const bodyClass = isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]";
  const subtitleClass = isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]";
  const buttonClass = isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]";
  const stateClass = history?.error ? (isLightTheme ? "text-[#B25E5E]" : "text-red-200") : "text-[#11D473]";
  return <div className={`rounded-xl border p-3 ${cardClass}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className={`text-[10px] uppercase tracking-[0.18em] ${titleClass}`}>{title}</p><p className={`mt-1 text-[11px] ${subtitleClass}`}>{primaryLines.subtitle}</p></div>
      <button type="button" onClick={handleCopy} className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${buttonClass}`}>Copiar snapshot</button>
    </div>
    {history ? <div className="mt-3 space-y-2 text-[11px]">
      <div className={`rounded-lg border px-3 py-2 ${itemClass}`}>
        <div className="flex items-center justify-between">
          <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>{primaryLines.label}</span>
          <span className={stateClass}>{primaryLines.value}</span>
        </div>
        {primaryLines.details.map((line) => <div key={line} className={`mt-1 ${line.startsWith("modo ") ? `text-[10px] ${titleClass}` : bodyClass}`}>{line}</div>)}
      </div>
      {Array.isArray(history.executionHistory) && history.executionHistory.length ? <div className="space-y-2">{history.executionHistory.slice(0, 4).map((entry) => <SnapshotEntry key={entry.id} bodyClass={bodyClass} entry={entry} isLightTheme={isLightTheme} />)}</div> : null}
    </div> : <div className="mt-2 text-[11px] opacity-60">{emptyText}</div>}
  </div>;
}
