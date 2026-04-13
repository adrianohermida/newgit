import InternoLayout from "../InternoLayout";
import RequireAdmin from "../RequireAdmin";
import CompetitorInsightsPanel from "./CompetitorInsightsPanel";
import FormsWorkspaceSection from "./FormsWorkspaceSection";
import IntegrationsSection from "./IntegrationsSection";
import OperationsInsightsPanel from "./OperationsInsightsPanel";
import SummarySection from "./SummarySection";
import { PageSection, Tag } from "./shared";
import useMarketAdsController from "./useMarketAdsController";

export default function InternoMarketAdsPage() {
  return (
    <RequireAdmin>
      {(profile) => (
        <InternoLayout
          profile={profile}
          title="HMADV Market Ads"
          description="Cockpit executivo para inteligencia publicitaria juridica, geracao de anuncios e compliance com a OAB."
        >
          <MarketAdsContent />
        </InternoLayout>
      )}
    </RequireAdmin>
  );
}

function MarketAdsContent() {
  const controller = useMarketAdsController();
  const { state, data } = controller;

  return (
    <div className="space-y-10 pb-10">
      <SummarySection state={state} data={data} load={controller.load} generateOptimizations={controller.generateOptimizations} />

      {!state.loading && !state.error && data ? (
        <>
          <PageSection
            label="Conectividade"
            title="Leitura externa antes de mover verba"
            description="Integracoes devem aparecer como uma camada de prontidao operacional, nao como mais uma lista de botoes espalhados."
            aside={<Tag tone="neutral">{data.integrations?.providers?.length || 0} provedores</Tag>}
          >
            <IntegrationsSection data={data} {...controller} />
          </PageSection>

          <PageSection
            label="Workspace"
            title="Criacao, edicao e validacao no mesmo plano"
            description="A operacao principal do modulo fica aqui: montar campanha, registrar anuncios, abrir testes e revisar a copy antes da publicacao."
          >
            <FormsWorkspaceSection {...controller} />
          </PageSection>

          <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
            <CompetitorInsightsPanel data={data} />
            <OperationsInsightsPanel data={data} {...controller} />
          </div>
        </>
      ) : null}
    </div>
  );
}

