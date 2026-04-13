import { Tag, money } from "../shared";

export default function LeadForecastCard({ forecast, leadForecastQueue }) {
  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[#F7F2E8]">Previsao de fechamento</p>
        <Tag tone="accent">{forecast?.summary || "Sem previsao ainda"}</Tag>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Quentes" value={forecast?.totals?.hot || 0} />
        <Metric label="Mornos" value={forecast?.totals?.warm || 0} />
        <Metric label="Frios" value={forecast?.totals?.cold || 0} />
        <Metric label="Clientes" value={forecast?.totals?.clients || 0} />
      </div>
      {leadForecastQueue.length ? (
        <div className="mt-4 space-y-3">
          {leadForecastQueue.slice(0, 4).map((lead) => (
            <div key={lead.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-[#F5F1E8]">{lead.leadName}</p>
                <div className="flex flex-wrap gap-2">
                  <Tag tone={lead.temperature === "quente" ? "success" : lead.temperature === "morno" ? "warn" : "neutral"}>{lead.temperature}</Tag>
                  <Tag tone="accent">score {lead.score}</Tag>
                </div>
              </div>
              <p className="mt-2 text-[#8FA29B]">{lead.recommendation}</p>
              {Number(lead.value || 0) > 0 ? <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#6F837C]">valor {money(lead.value)}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{value}</p>
    </div>
  );
}
