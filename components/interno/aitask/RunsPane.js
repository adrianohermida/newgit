import RunHistoryCard from "./RunHistoryCard";
import { useInternalTheme } from "../InternalThemeProvider";

export default function RunsPane({
  className = "",
  recentHistory,
  visibleHistory = recentHistory,
  activeRunId,
  formatHistoryStatus,
  formatExecutionSourceLabel,
  nowIso,
  onSelectRun,
  historyPage = 1,
  historyTotalPages = 1,
  onPrevPage,
  onNextPage,
}) {
  const { isLightTheme } = useInternalTheme();
  return (
    <aside className={`min-h-0 rounded-[28px] border p-4 shadow-[0_16px_48px_rgba(0,0,0,0.12)] ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.025)]"} ${className}`.trim()}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-[#7F928C]">Histórico</p>
          <p className="mt-1 text-sm text-[#9BAEA8]">Conversas, runs e retomadas mais recentes.</p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>{recentHistory.length}</span>
      </div>
      <div className="mt-4 max-h-[34vh] space-y-3 overflow-y-auto pr-1 2xl:max-h-none">
        {visibleHistory.length ? visibleHistory.map((item) => <RunHistoryCard key={`${item.id}_${item.updated_at || item.created_at || ""}`} item={item} isActive={activeRunId === item.id} onSelect={onSelectRun} formatHistoryStatus={formatHistoryStatus} formatExecutionSourceLabel={formatExecutionSourceLabel} nowIso={nowIso} />) : <p className="text-sm text-[#9BAEA8]">Nenhuma conversa registrada.</p>}
      </div>
      {historyTotalPages > 1 ? <div className={`mt-4 flex items-center justify-between gap-2 border-t pt-4 ${isLightTheme ? "border-[#E3EAF2]" : "border-[#1B2925]"}`}><button type="button" onClick={onPrevPage} disabled={historyPage <= 1} className={`rounded-full border px-3 py-1 text-[11px] transition disabled:opacity-40 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>Anterior</button><span className="text-[11px] text-[#7F928C]">Página {historyPage} de {historyTotalPages}</span><button type="button" onClick={onNextPage} disabled={historyPage >= historyTotalPages} className={`rounded-full border px-3 py-1 text-[11px] transition disabled:opacity-40 ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>Próxima</button></div> : null}
    </aside>
  );
}
