export default function InternoConsoleFilterBar(props) {
  const { isLightTheme, logFilters, logSearch, setLogSearch, updateFilters } = props;
  const inputClass = isLightTheme ? "border-[#D7DEE8] text-[#51606B] placeholder:text-[#93A1AD]" : "border-[#22342F] text-[#E6E0D3] placeholder:text-[#53625C]";
  const buttonClass = isLightTheme ? "border-[#D7DEE8] bg-white text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]";
  return <div className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 text-[10px] uppercase tracking-[0.14em] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#7B8B98]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)] text-[#7F928C]"}`}>
    <span>Filtros</span>
    {[["module", "Modulo", "w-[110px]"], ["page", "Pagina", "w-[140px]"], ["component", "Componente", "w-[140px]"], ["status", "Status", "w-[90px]"], ["tag", "Tag", "w-[90px]"]].map(([key, placeholder, size]) => <input key={key} value={logFilters[key] || ""} onChange={(event) => updateFilters({ ...logFilters, [key]: event.target.value })} placeholder={placeholder} className={`h-7 ${size} rounded-full border bg-transparent px-2 text-[10px] outline-none ${inputClass}`} />)}
    <input value={logSearch} onChange={(event) => setLogSearch(event.target.value)} placeholder="Buscar detalhes" className={`h-7 min-w-[160px] flex-1 rounded-full border bg-transparent px-2 text-[10px] outline-none ${inputClass}`} />
    {[["severity:error", "So erro", "border-[#5B2D2D] text-[#FECACA] transition hover:border-[#FCA5A5]"], ["severity:warn", "So alerta", "border-[#6E5630] text-[#FDE68A] transition hover:border-[#FDE68A]"]].map(([tag, label, tone]) => <button key={tag} type="button" onClick={() => updateFilters({ ...logFilters, tag })} className={`rounded-full border px-3 py-1 text-[10px] ${tone}`}>{label}</button>)}
    <button type="button" onClick={() => { setLogSearch(""); updateFilters({}); }} className={`rounded-full border px-3 py-1 text-[10px] transition hover:border-[#C5A059] hover:text-[#C5A059] ${buttonClass}`}>Limpar filtros</button>
  </div>;
}
