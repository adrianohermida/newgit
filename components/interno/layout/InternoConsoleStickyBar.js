export default function InternoConsoleStickyBar(props) {
  const { activePaneLabel, activityCount, isLightTheme, logFilters, visibleCount } = props;
  const badgeClass = isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]";
  return <div className={`sticky top-0 z-10 -mx-4 border-b px-4 py-3 backdrop-blur md:-mx-5 md:px-5 ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(247,249,252,0.94)]" : "border-[#1E2E29] bg-[rgba(8,10,9,0.92)]"}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#6F837B]"}`}>Fluxo ativo</p><p className={`mt-1 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{activePaneLabel}</p></div>
      <div className={`flex flex-wrap items-center gap-2 font-mono text-[11px] ${isLightTheme ? "text-[#51606B]" : "text-[#C7D0CA]"}`}><span>{visibleCount} visiveis</span><span className="opacity-45">/</span><span>{activityCount} totais</span>{logFilters?.module ? <span className={`rounded-full border px-2 py-1 font-sans text-[10px] uppercase tracking-[0.14em] ${badgeClass}`}>modulo {logFilters.module}</span> : null}{logFilters?.tag ? <span className={`rounded-full border px-2 py-1 font-sans text-[10px] uppercase tracking-[0.14em] ${badgeClass}`}>tag {logFilters.tag}</span> : null}</div>
    </div>
  </div>;
}
