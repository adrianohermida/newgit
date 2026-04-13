import { Tag } from "../shared";

export default function FunnelCard({ funnel, funnelRecentLeads }) {
  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[#F7F2E8]">Funil comercial</p>
        <Tag tone="accent">fonte {(funnel?.source || "estimated").replace("_", " ")}</Tag>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(funnel?.stages || []).map((stage) => (
          <div key={stage.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">{stage.label}</p>
            <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{stage.value}</p>
            <p className="mt-2 text-[#8FA29B]">{stage.helper}</p>
          </div>
        ))}
      </div>
      {funnelRecentLeads.length ? (
        <div className="mt-4 space-y-3">
          {funnelRecentLeads.slice(0, 4).map((lead) => (
            <div key={lead.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-[#F5F1E8]">{lead.name}</p>
                <div className="flex flex-wrap gap-2">
                  <Tag tone="neutral">status {lead.status}</Tag>
                  <Tag tone="accent">prioridade {lead.priority}</Tag>
                </div>
              </div>
              <p className="mt-1 text-[#8FA29B]">{lead.subject}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
