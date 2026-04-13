import { ActionButton, Tag, money, toneFor } from "../shared";

export default function CampaignCards({ campaigns, beginEditCampaign }) {
  return (
    <>
      {campaigns.map((campaign) => (
        <article key={campaign.id} className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-[#F7F2E8]">{campaign.name}</p>
              <p className="mt-1 text-xs text-[#8FA29B]">{campaign.platform} | {campaign.objective}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Tag tone={toneFor(campaign.status)}>{campaign.status}</Tag>
              <Tag tone={toneFor(campaign.complianceStatus)}>{campaign.complianceStatus}</Tag>
              <Tag tone={toneFor(campaign.healthBand)}>saude {campaign.healthBand}</Tag>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Budget {money(campaign.budget)}</div>
            <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">CPA {money(campaign.cpa)}</div>
            <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">CTR {Number(campaign.ctr || 0).toFixed(1)}%</div>
            <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Score {campaign.healthScore || 0}/100</div>
          </div>
          <div className="mt-3 rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <p className="font-semibold text-[#F7F2E8]">Proxima acao</p>
            <p className="mt-1 text-[#8FA29B]">{campaign.nextActions?.[0] || "Sem recomendacao no momento."}</p>
          </div>
          <div className="mt-3">
            <ActionButton tone="ghost" className="px-4 py-2 text-xs" onClick={() => beginEditCampaign(campaign)}>Editar campanha</ActionButton>
          </div>
        </article>
      ))}
    </>
  );
}
