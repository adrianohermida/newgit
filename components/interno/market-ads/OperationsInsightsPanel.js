import { Panel, Tag, toneFor } from "./shared";
import AbTestsCard from "./operations/AbTestsCard";
import AttributionCard from "./operations/AttributionCard";
import CampaignCards from "./operations/CampaignCards";
import CreativeRankingCard from "./operations/CreativeRankingCard";
import FunnelCard from "./operations/FunnelCard";
import LeadForecastCard from "./operations/LeadForecastCard";
import OptimizationCard from "./operations/OptimizationCard";
import TemplateLibraryCard from "./operations/TemplateLibraryCard";

export default function OperationsInsightsPanel(props) {
  const { data, beginEditAd } = props;

  return (
    <Panel eyebrow="Operacao" title="Testes, landing pages e stack" helper="Base inicial para escalar o modulo com integracoes reais.">
      <div className="space-y-4">
        <AbTestsCard items={data.abTests} beginEditAbTest={props.beginEditAbTest} />
        <CampaignCards campaigns={data.campaigns} beginEditCampaign={props.beginEditCampaign} />
        <OptimizationCard {...props} />
        <LandingPagesCard items={data.landingPages} />
        <CreativeRankingCard ranking={data.creativeRanking} generateFromWinner={props.generateFromWinner} />
        <TemplateLibraryCard {...props} />
        <AttributionCard {...props} />
        <FunnelCard funnel={data.funnel} funnelRecentLeads={props.funnelRecentLeads} />
        <LeadForecastCard forecast={data.leadForecast} leadForecastQueue={props.leadForecastQueue} />
        <ArchitectureCard data={data.architecture} />
        <SimpleDraftsCard items={data.drafts} />
        <ComplianceLogCard items={data.complianceLog} />
        <AdsLibraryCard items={data.adItems} beginEditAd={beginEditAd} />
      </div>
    </Panel>
  );
}

function LandingPagesCard({ items }) {
  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="font-semibold text-[#F7F2E8]">Landing pages</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => <p key={item.id} className="text-sm leading-6 text-[#C7D0CA]">{item.title} · {item.slug}</p>)}
      </div>
    </div>
  );
}

function ArchitectureCard({ data }) {
  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="font-semibold text-[#F7F2E8]">Arquitetura tecnica</p>
      <div className="mt-3 space-y-2 text-sm leading-6 text-[#C7D0CA]">
        {data.backend.concat(data.integrations).concat(data.safeguards).map((item) => <p key={item}>{item}</p>)}
      </div>
    </div>
  );
}

function SimpleDraftsCard({ items }) {
  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="font-semibold text-[#F7F2E8]">Drafts salvos</p>
      <div className="mt-3 space-y-2">
        {items?.length ? items.map((item) => (
          <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <p>{item.title}</p>
            <p className="mt-1 text-[#8FA29B]">{item.headline}</p>
          </div>
        )) : <p className="text-sm text-[#8FA29B]">Nenhum draft persistido ainda.</p>}
      </div>
    </div>
  );
}

function ComplianceLogCard({ items }) {
  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="font-semibold text-[#F7F2E8]">Historico de compliance</p>
      <div className="mt-3 space-y-2">
        {items?.length ? items.map((item) => (
          <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tag tone={toneFor(item.status)}>{item.status}</Tag>
              <Tag tone="accent">score {item.score}</Tag>
            </div>
            <p className="mt-1 text-[#8FA29B]">{item.headline || "Validacao sem headline"}</p>
          </div>
        )) : <p className="text-sm text-[#8FA29B]">Nenhum log persistido ainda.</p>}
      </div>
    </div>
  );
}

function AdsLibraryCard({ items, beginEditAd }) {
  return (
    <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="font-semibold text-[#F7F2E8]">Anuncios salvos</p>
      <div className="mt-3 space-y-2">
        {items?.length ? items.map((item) => (
          <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p>{item.name}</p>
                <p className="mt-1 text-[#8FA29B]">{item.headline}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Tag tone={toneFor(item.status)}>{item.status}</Tag>
                <Tag tone={toneFor(item.complianceStatus)}>{item.complianceStatus}</Tag>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => beginEditAd(item)}
                className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
              >
                Editar anuncio
              </button>
            </div>
          </div>
        )) : <p className="text-sm text-[#8FA29B]">Nenhum anuncio persistido ainda.</p>}
      </div>
    </div>
  );
}
