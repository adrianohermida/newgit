import { useInternalTheme } from "../InternalThemeProvider";

export default function ThinkingBlock({ block }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <details open={Boolean(block.expanded)} className={`rounded-[22px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]"}`}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-[10px] uppercase tracking-[0.2em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{block.title}</p>
            <p className={`mt-2 text-sm leading-6 ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{block.summary}</p>
          </div>
          <span className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#9BAEA8]"}`}>{new Date(block.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </summary>
      <div className={`mt-3 space-y-2 text-sm ${isLightTheme ? "text-[#51606B]" : "text-[#C6D1CC]"}`}>
        {block.details.map((line) => <p key={line} className={`rounded-2xl border px-3 py-2 leading-6 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC]" : "border-[#22342F] bg-[rgba(7,9,8,0.75)]"}`}>{line}</p>)}
      </div>
    </details>
  );
}
