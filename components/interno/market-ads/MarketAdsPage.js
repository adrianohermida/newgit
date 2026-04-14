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
          title="Market Ads"
          description="Centro de campanhas para inteligencia publicitaria juridica, criacao de anuncios e conformidade com a OAB."
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
    <div className="space-y-10">
      <SummarySection state={state} data={data} load={controller.load} generateOptimizations={controller.generateOptimizations} />

      {!state.loading && !state.error && data ? (
        <>
          <PageSection
            label="Conectividade"
            title="Leitura externa antes de mover verba"
            description="Integracoes devem aparecer como uma camada clara de prontidao, sem poluir a experiencia com acoes dispersas."
            aside={<Tag tone="neutral">{data.integrations?.providers?.length || 0} provedores</Tag>}
          >
            <IntegrationsSection data={data} {...controller} />
          </PageSection>

          <PageSection
            label="Workspace"
            title="Criacao, edicao e validacao no mesmo plano"
            description="Monte campanhas, organize anuncios, abra testes e revise a copy em um fluxo unico e mais comercial."
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

