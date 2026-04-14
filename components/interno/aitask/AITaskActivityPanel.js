import { useState } from "react";
import LogRow from "./LogRow";
import ThinkingBlock from "./ThinkingBlock";
import { useInternalTheme } from "../InternalThemeProvider";

function TabButton({ active, children, onClick }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition ${active ? "border-[#C79B2C] bg-[#C79B2C] text-[#07110E]" : isLightTheme ? "border-[#D7DEE8] bg-white text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]"}`}
    >
      {children}
    </button>
  );
}

export default function AITaskActivityPanel({ compactLogs, thinking }) {
  const { isLightTheme } = useInternalTheme();
  const [activeTab, setActiveTab] = useState(thinking.length ? "thinking" : "logs");
  const showingThinking = activeTab === "thinking";
  const items = showingThinking ? thinking : compactLogs.slice(-20);

  return (
    <section className={`rounded-[22px] border p-4 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[rgba(255,255,255,0.02)]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>Atividade</p>
          <p className={`mt-2 text-sm font-semibold ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>Auditoria separada da conversa</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <TabButton active={showingThinking} onClick={() => setActiveTab("thinking")}>Raciocinio {thinking.length}</TabButton>
          <TabButton active={!showingThinking} onClick={() => setActiveTab("logs")}>Logs {compactLogs.length}</TabButton>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.length ? items.map((item) => showingThinking ? <ThinkingBlock key={item.id} block={item} /> : <LogRow key={item.id} log={item} />) : (
          <div className={`rounded-[18px] border border-dashed p-4 text-sm ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#22342F] text-[#9BAEA8]"}`}>
            {showingThinking ? "O orquestrador ainda nao registrou blocos de raciocinio." : "Nenhum log operacional foi emitido ate agora."}
          </div>
        )}
      </div>
    </section>
  );
}
