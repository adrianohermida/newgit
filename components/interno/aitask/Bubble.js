import { useInternalTheme } from "../InternalThemeProvider";

export default function Bubble({ role = "assistant", title, body, details = [], time }) {
  const { isLightTheme } = useInternalTheme();
  const isUser = role === "user";
  const isSystem = role === "system";
  const alignClass = isUser ? "justify-end" : "justify-start";
  const bubbleClass = isUser ? (isLightTheme ? "border-[#E6D29A] bg-[#FFF8EA] text-[#5B4A22]" : "border-[#3C3320] bg-[rgba(40,32,19,0.28)] text-[#F7F1E6]") : isSystem ? (isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#6B7C88]" : "border-[#2E3A36] bg-[rgba(255,255,255,0.02)] text-[#9FB1AA]") : (isLightTheme ? "border-[#D7DEE8] bg-white text-[#2B3A42]" : "border-[#22342F] bg-[rgba(255,255,255,0.03)] text-[#F4F1EA]");

  return (
    <div className={`flex ${alignClass}`}>
      <article className={`max-w-[min(46rem,92%)] rounded-[26px] border px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${bubbleClass}`}>
        <div className="mb-2 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.2em] opacity-60">
          <span>{title || (isUser ? "Equipe" : isSystem ? "Sistema" : "Hermida Maia IA")}</span>
          <span>{time ? new Date(time).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "agora"}</span>
        </div>
        <p className="whitespace-pre-wrap leading-7">{String(body || "")}</p>
        {Array.isArray(details) && details.length ? <div className="mt-3 space-y-2">{details.slice(0, 6).map((line, index) => <p key={`${index}_${line}`} className={`rounded-2xl border px-3 py-2 text-xs leading-6 ${isLightTheme ? "border-[#D7DEE8] bg-[#F7F9FC] text-[#51606B]" : "border-[#22342F] bg-[rgba(7,9,8,0.75)] text-[#C6D1CC]"}`}>{line}</p>)}</div> : null}
      </article>
    </div>
  );
}
