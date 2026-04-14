import { useInternalTheme } from "../InternalThemeProvider";

export default function RailPanel({ title, subtitle, children }) {
  const { isLightTheme } = useInternalTheme();
  return (
    <section className={`rounded-[20px] border p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)] ${isLightTheme ? "border-[#D7DEE8] bg-white" : "border-[#22342F] bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))]"}`}>
      <p className={`text-[10px] uppercase tracking-[0.18em] ${isLightTheme ? "text-[#7B8B98]" : "text-[#7E918B]"}`}>{title}</p>
      {subtitle ? <p className={`mt-2 text-sm font-medium ${isLightTheme ? "text-[#152421]" : "text-[#F5F1E8]"}`}>{subtitle}</p> : null}
      <div className={`mt-3 text-sm leading-6 ${isLightTheme ? "text-[#6B7C88]" : "text-[#92A59F]"}`}>{children}</div>
    </section>
  );
}
