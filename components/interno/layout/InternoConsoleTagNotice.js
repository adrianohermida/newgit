export default function InternoConsoleTagNotice(props) {
  const { activePaneLabel, isLightTheme, paneEntries, unclassifiedTagEntriesCount } = props;
  return <div className={`rounded-xl border p-3 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#1E2E29] bg-[rgba(10,12,11,0.6)] text-[#9BAEA8]"}`}>Trilha automatica: <span className="text-[#F4E7C2]">{activePaneLabel}</span>. Os eventos entram aqui pela taxonomia do console.{!paneEntries.length && unclassifiedTagEntriesCount ? <span className={`mt-2 block ${isLightTheme ? "text-[#5B6670]" : "text-[#C7D0CA]"}`}>Nenhuma entrada classificada nesta trilha. Existem {unclassifiedTagEntriesCount} evento(s) ainda sem classificacao compativel.</span> : null}</div>;
}
