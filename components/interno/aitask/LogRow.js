import { useInternalTheme } from "../InternalThemeProvider";

export default function LogRow({ log }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <div className={`rounded-[18px] border px-4 py-3 ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.012))]"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7F928C]"}`}>{log.type}</p>
        <span className={`text-[10px] ${isLightTheme ? "text-[#7B8B98]" : "text-[#9BAEA8]"}`}>{new Date(log.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
      </div>
      <p className={`mt-2 text-sm ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{log.action}</p>
      <p className={`mt-1 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#9BAEA8]"}`}>{log.result}</p>
    </div>
  );
}
