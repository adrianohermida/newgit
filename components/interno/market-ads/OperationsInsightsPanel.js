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
  return (
    <div className="space-y-6">
      <Panel eyebrow="Operacao" title="Execucao, previsao e biblioteca" helper="A coluna operacional precisa responder tres perguntas: o que esta funcionando, o que merece atencao agora e o que vale reaproveitar.">
        <div className="flex flex-wrap gap-2">
          <Tag tone="accent">{props.data.campaigns?.length || 0} campanhas</Tag>
          <Tag tone="neutral">{props.data.adItems?.length || 0} anuncios</Tag>
          <Tag tone="success">{props.optimizationRecommendations?.length || 0} recomendacoes</Tag>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
        <div className="space-y-6">
          <Panel eyebrow="Performance" title="Campanhas e otimizacoes" helper="Use este bloco para decidir onde editar, pausar, escalar ou revisar criativos.">
            <div className="space-y-4">
              <CampaignCards campaigns={props.data.campaigns} beginEditCampaign={props.beginEditCampaign} />
              <OptimizationCard {...props} />
              <AbTestsCard items={props.data.abTests} beginEditAbTest={props.beginEditAbTest} />
            </div>
          </Panel>

          <Panel eyebrow="Conversao" title="Funil e previsao de fechamento" helper="As leituras de atribuicao e forecast precisam ficar proximas porque fazem parte da mesma decisao comercial.">
            <div className="space-y-4">
              <AttributionCard {...props} />
              <FunnelCard funnel={props.data.funnel} funnelRecentLeads={props.funnelRecentLeads} />
              <LeadForecastCard forecast={props.data.leadForecast} leadForecastQueue={props.leadForecastQueue} />
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel eyebrow="Biblioteca" title="Criativos, templates e acervo local" helper="Essa area concentra os insumos que ajudam a reaproveitar aprendizado sem perder controle editorial.">
            <div className="space-y-4">
              <CreativeRankingCard ranking={props.data.creativeRanking} generateFromWinner={props.generateFromWinner} />
              <TemplateLibraryCard {...props} />
              <SimpleDraftsCard items={props.data.drafts} />
              <AdsLibraryCard items={props.data.adItems} beginEditAd={props.beginEditAd} />
            </div>
          </Panel>

          <Panel eyebrow="Governanca" title="Compliance e arquitetura" helper="Mantem visivel o historico de validacao e a stack tecnica que sustenta o modulo.">
            <div className="space-y-4">
              <ComplianceLogCard items={props.data.complianceLog} />
              <ArchitectureCard data={props.data.architecture} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ArchitectureCard({ data }) {
  return <Block title="Arquitetura tecnica" items={data.backend.concat(data.integrations).concat(data.safeguards)} />;
}

function SimpleDraftsCard({ items }) {
  return (
    <Block title="Drafts salvos" empty="Nenhum draft persistido ainda.">
      {items?.map((item) => (
        <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
          <p>{item.title}</p>
          <p className="mt-1 text-[#8FA29B]">{item.headline}</p>
        </div>
      ))}
    </Block>
  );
}

function ComplianceLogCard({ items }) {
  return (
    <Block title="Historico de compliance" empty="Nenhum log persistido ainda.">
      {items?.map((item) => (
        <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tag tone={toneFor(item.status)}>{item.status}</Tag>
            <Tag tone="accent">score {item.score}</Tag>
          </div>
          <p className="mt-1 text-[#8FA29B]">{item.headline || "Validacao sem headline"}</p>
        </div>
      ))}
    </Block>
  );
}

function AdsLibraryCard({ items, beginEditAd }) {
  return (
    <Block title="Anuncios salvos" empty="Nenhum anuncio persistido ainda.">
      {items?.map((item) => (
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
          <button type="button" onClick={() => beginEditAd(item)} className="mt-3 rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C09554] hover:text-[#F3E4C5]">
            Editar anuncio
          </button>
        </div>
      ))}
    </Block>
  );
}

function Block({ title, items = [], children, empty }) {
  const content = children || items.map((item) => <p key={item} className="text-sm leading-6 text-[#C7D0CA]">{item}</p>);
  const hasContent = Array.isArray(children) ? children.length > 0 : Boolean(children) || items.length > 0;

  return (
    <div className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="font-semibold text-[#F7F2E8]">{title}</p>
      <div className="mt-3 space-y-2">{hasContent ? content : <p className="text-sm text-[#8FA29B]">{empty}</p>}</div>
    </div>
  );
}
