import { useInternalTheme } from "../../../components/interno/InternalThemeProvider";
import { ACTION_LABELS } from "./constants";
import { StatusBadge } from "./ui-primitives";
import { recurrenceBand, sourceLabel, sourceTone } from "./recurrence-model";

function RecurringProcessItem({ item }) {
  const { isLightTheme } = useInternalTheme();
  const band = recurrenceBand(item.hits);
  return <div className={`rounded-[24px] border p-4 text-sm ${isLightTheme ? "border-[#d7d4cb] bg-white text-[#1f2937]" : "border-[#2D2E2E] bg-[rgba(5,7,6,0.72)]"}`}><div className="flex flex-wrap items-center gap-2"><p className="font-semibold break-all">{item.key}</p><StatusBadge tone="danger">{item.hits} ciclos</StatusBadge>{band ? <StatusBadge tone={band.tone}>{band.label}</StatusBadge> : null}<StatusBadge tone="warning">{ACTION_LABELS[item.lastAction] || item.lastAction}</StatusBadge><StatusBadge tone={sourceTone(item.source)}>{sourceLabel(item.source)}</StatusBadge>{item.noProgress ? <StatusBadge tone="warning">sem progresso relevante</StatusBadge> : null}{item.needsManualReview ? <StatusBadge tone="danger">precisa revisao manual</StatusBadge> : null}{item.nextAction ? <StatusBadge tone="success">{item.nextAction}</StatusBadge> : null}</div>{item.titulo ? <p className={`mt-2 ${isLightTheme ? "text-[#4b5563]" : "opacity-70"}`}>{item.titulo}</p> : null}</div>;
}

export function RecurringProcessGroup({ title, helper, items }) {
  const { isLightTheme } = useInternalTheme();
  if (!items.length) return null;
  return <div className="space-y-3"><div><p className="text-sm font-semibold">{title}</p><p className={`text-xs ${isLightTheme ? "text-[#6b7280]" : "opacity-60"}`}>{helper}</p></div><div className="space-y-3">{items.map((item) => <RecurringProcessItem key={item.key} item={item} />)}</div></div>;
}
