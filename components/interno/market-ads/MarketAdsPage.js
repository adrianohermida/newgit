import InternoLayout from "../InternoLayout";
import RequireAdmin from "../RequireAdmin";
import CompetitorInsightsPanel from "./CompetitorInsightsPanel";
import FormsWorkspaceSection from "./FormsWorkspaceSection";
import IntegrationsSection from "./IntegrationsSection";
import OperationsInsightsPanel from "./OperationsInsightsPanel";
import SummarySection from "./SummarySection";
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
    <div className="space-y-6">
      <SummarySection state={state} data={data} />

      {!state.loading && !state.error && data ? (
        <>
          <IntegrationsSection data={data} {...controller} />
          <FormsWorkspaceSection {...controller} />

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <CompetitorInsightsPanel data={data} />
            <OperationsInsightsPanel data={data} {...controller} />
          </div>
        </>
      ) : null}
    </div>
  );
}

