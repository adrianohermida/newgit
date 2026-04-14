import ContextRail from "./ContextRail";
import RunsPane from "./RunsPane";
import { useInternalTheme } from "../InternalThemeProvider";

function RailTab({ active, label, onClick }) {
  const { isLightTheme } = useInternalTheme();
  return <button type="button" onClick={onClick} className={`rounded-full border px-3 py-1.5 text-[11px] transition ${active ? "border-[#C79B2C] text-[#8A6217]" : isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{label}</button>;
}

export default function AITaskTechnicalRail(props) {
  const { isLightTheme } = useInternalTheme();
  const { railTab, setRailTab, showTechnicalRail, setShowTechnicalRail } = props;

  return (
    <aside className={`min-h-0 overflow-hidden rounded-[24px] border ${isLightTheme ? "border-[#D7DEE8] bg-[rgba(255,255,255,0.8)]" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
      <div className={`border-b px-4 py-4 ${isLightTheme ? "border-[#D7DEE8]" : "border-[#22342F]"}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Contexto técnico</p>
            <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Runs e contexto</p>
          </div>
          <button type="button" onClick={() => setShowTechnicalRail((value) => !value)} className={`rounded-full border px-3 py-1.5 text-[11px] ${isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}>{showTechnicalRail ? "Ocultar" : "Mostrar"}</button>
        </div>
        {showTechnicalRail ? <div className="mt-3 flex flex-wrap gap-2"><RailTab active={railTab === "context"} label="Contexto" onClick={() => setRailTab("context")} /><RailTab active={railTab === "runs"} label="Runs" onClick={() => setRailTab("runs")} /></div> : null}
      </div>
      {showTechnicalRail ? <div className="max-h-[70vh] overflow-y-auto p-3">{railTab === "runs" ? <RunsPane {...props.runsPaneProps} /> : <ContextRail {...props.contextRailProps} />}</div> : null}
    </aside>
  );
}
