function HistoryEntry(props) {
  const { bodyClass, dateValue, entry, isLightTheme, mutedClass } = props;
  const cardClass = isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)]";
  const statusClass = entry.status === "error" ? (isLightTheme ? "text-[#B25E5E]" : "text-red-200") : "text-[#11D473]";
  return <div className={`rounded-lg border px-3 py-2 text-[11px] ${cardClass}`}>
    <div className="flex items-center justify-between">
      <span className={`font-semibold ${isLightTheme ? "text-[#152421]" : ""}`}>{entry.label || entry.action || entry.acao || "acao"}</span>
      <span className={statusClass}>{entry.status || "status"}</span>
    </div>
    <div className={`mt-1 text-[10px] ${mutedClass}`}>{dateValue ? new Date(dateValue).toLocaleString("pt-BR") : "sem data"}</div>
    {entry.preview || entry.resumo ? <div className={`mt-1 ${bodyClass}`}>{entry.preview || entry.resumo}</div> : null}
  </div>;
}

export default function InternoConsoleHistoryListCard(props) {
  const { copyLabel, emptyLocalText, emptyRemoteText, handleCopy, isLightTheme, localEntries, remoteEntries, subtitle, title } = props;
  const cardClass = isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#1E2E29] bg-[rgba(8,10,9,0.5)]";
  const itemMutedClass = isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]";
  const titleClass = isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]";
  const bodyClass = isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]";
  const subtitleClass = isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]";
  const buttonClass = isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]";
  return <div className={`rounded-xl border p-3 ${cardClass}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className={`text-[10px] uppercase tracking-[0.18em] ${titleClass}`}>{title}</p>
        <p className={`mt-1 text-[11px] ${subtitleClass}`}>{subtitle}</p>
      </div>
      <button type="button" onClick={handleCopy} className={`rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.14em] transition hover:border-[#C5A059] hover:text-[#C5A059] ${buttonClass}`}>{copyLabel}</button>
    </div>
    {remoteEntries.length ? <div className="mt-3 space-y-2">{remoteEntries.slice(0, 6).map((entry) => <HistoryEntry key={entry.id} bodyClass={bodyClass} dateValue={entry.created_at} entry={entry} isLightTheme={isLightTheme} mutedClass={itemMutedClass} />)}</div> : <div className="mt-2 text-[11px] opacity-60">{emptyRemoteText}</div>}
    {localEntries.length ? <div className="mt-3">
      <p className={`text-[10px] uppercase tracking-[0.18em] ${titleClass}`}>Memoria local</p>
      <div className="mt-2 space-y-2">{localEntries.slice(0, 6).map((entry) => <HistoryEntry key={entry.id} bodyClass={bodyClass} dateValue={entry.startedAt} entry={entry} isLightTheme={isLightTheme} mutedClass={itemMutedClass} />)}</div>
    </div> : <div className="mt-2 text-[11px] opacity-60">{emptyLocalText}</div>}
  </div>;
}
