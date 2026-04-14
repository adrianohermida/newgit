import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import { PROCESS_VIEW_ITEMS } from "./constants";

export function MetricCard({ label, value, helper }) {
  return <div className="rounded-[24px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.45)] p-4"><p className="text-[11px] uppercase tracking-[0.18em] opacity-50">{label}</p><p className="mt-3 text-3xl font-semibold text-[#F5E7C4]">{value}</p><p className="mt-2 text-sm opacity-60">{helper}</p></div>;
}

export function Panel({ title, eyebrow, children, className = "" }) {
  return <section className={`rounded-[28px] border border-[#2D2E2E] bg-[rgba(7,9,8,0.82)] p-6 ${className}`.trim()}>{eyebrow ? <p className="text-[11px] uppercase tracking-[0.2em] text-[#C5A059]">{eyebrow}</p> : null}{title ? <h2 className="mt-3 text-xl font-semibold text-[#F5E7C4]">{title}</h2> : null}<div className={title || eyebrow ? "mt-4" : ""}>{children}</div></section>;
}

export function Field({ label, value, onChange, placeholder }) {
  const { isLightTheme } = useInternalTheme();
  return <label className="block"><span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`w-full rounded-[22px] border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`} /></label>;
}

export function SelectField({ label, value, onChange, options }) {
  const { isLightTheme } = useInternalTheme();
  return <label className="block"><span className={`mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] ${isLightTheme ? "text-[#6b7280]" : "opacity-50"}`}>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)} className={`w-full rounded-[22px] border p-3 text-sm outline-none transition ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937] focus:border-[#9a6d14]" : "border-[#2D2E2E] bg-[#050706] focus:border-[#C5A059]"}`}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

export function ActionButton({ children, tone = "subtle", className = "", ...props }) {
  const tones = {
    subtle: "border-[#2D2E2E] bg-[#0E1110] text-[#F5E7C4] hover:border-[#C5A059]",
    primary: "border-[#C5A059] bg-[#C5A059] text-[#181512] hover:brightness-105",
    danger: "border-[#7f1d1d] bg-[#3b0c0c] text-[#fecaca] hover:border-[#b91c1c]",
  };
  return <button className={`rounded-[18px] border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone] || tones.subtle} ${className}`.trim()} {...props}>{children}</button>;
}

export function ViewToggle({ value, onChange }) {
  return <div className="flex flex-wrap gap-2">{PROCESS_VIEW_ITEMS.map((item) => <button key={item.key} onClick={() => onChange(item.key)} className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.18em] transition ${value === item.key ? "border-[#C5A059] bg-[#C5A059] text-[#171411]" : "border-[#2D2E2E] text-[#F5E7C4] hover:border-[#C5A059]"}`}>{item.label}</button>)}</div>;
}

export function StatusBadge({ children, tone = "default" }) {
  const tones = {
    default: "border-[#2D2E2E] bg-[rgba(255,255,255,0.02)] text-[#F5E7C4]",
    success: "border-[#30543A] bg-[rgba(48,84,58,0.14)] text-[#B7F7C6]",
    warning: "border-[#6E5630] bg-[rgba(76,57,26,0.16)] text-[#F8E7B5]",
    danger: "border-[#4B2222] bg-[rgba(75,34,34,0.18)] text-[#FECACA]",
  };
  return <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${tones[tone] || tones.default}`}>{children}</span>;
}

export function QueueSummaryCard({ title, count, helper, accent = "text-[#C5A059]" }) {
  return <div className="rounded-[22px] border border-[#2D2E2E] bg-[rgba(4,6,6,0.42)] p-4"><p className="text-[11px] uppercase tracking-[0.18em] opacity-50">{title}</p><p className={`mt-3 text-3xl font-semibold ${accent}`}>{count}</p><p className="mt-2 text-sm opacity-60">{helper}</p></div>;
}
