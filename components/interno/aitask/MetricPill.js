import { useInternalTheme } from "../InternalThemeProvider";

function formatInlineValue(value) {
  if (value == null || value === "") return "n/a";
  if (["string", "number", "boolean"].includes(typeof value)) return String(value);
  if (Array.isArray(value)) return value.map((entry) => formatInlineValue(entry)).join(", ");
  if (typeof value === "object") {
    if (typeof value.label === "string" && value.label.trim()) return value.label;
    if (typeof value.value === "string" || typeof value.value === "number") return String(value.value);
    if (typeof value.type === "string" && value.type.trim()) return value.type;
    try { return JSON.stringify(value); } catch { return "[objeto]"; }
  }
  return String(value);
}

export default function MetricPill({ label, value, tone = "default" }) {
  const { isLightTheme } = useInternalTheme();
  const toneClass = tone === "accent" ? "border-[#C5A059] text-[#F1D39A]" : tone === "success" ? "border-[#234034] text-[#8FCFA9]" : tone === "danger" ? "border-[#5b2d2d] text-[#f2b2b2]" : isLightTheme ? "border-[#D7DEE8] text-[#51606B]" : "border-[#22342F] text-[#D8DEDA]";
  return <div className={`rounded-[18px] border px-3 py-2 ${isLightTheme ? "bg-white" : "bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0.012))]"} ${toneClass}`}><p className="text-[10px] uppercase tracking-[0.18em] opacity-70">{label}</p><p className="mt-1 text-sm font-medium">{formatInlineValue(value)}</p></div>;
}
