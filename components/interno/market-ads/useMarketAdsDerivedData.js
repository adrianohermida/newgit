import { useEffect, useMemo } from "react";
import { setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

export default function useMarketAdsDerivedData({ state, creativeActions }) {
  const data = state.data;
  const preview = creativeActions.previewState.result || data?.generatedSeed || null;
  const complianceResult = creativeActions.complianceState.result || preview?.compliance || null;
  const campaigns = useMemo(() => data?.campaigns || [], [data?.campaigns]);
  const adItems = useMemo(() => data?.adItems || [], [data?.adItems]);
  const strategyQueue = useMemo(() => data?.strategyQueue || [], [data?.strategyQueue]);
  const optimizationRecommendations = useMemo(() => (creativeActions.optimizationState || data?.optimizationPlan)?.recommendations || [], [data?.optimizationPlan, creativeActions.optimizationState]);
  const persistedTemplates = useMemo(() => ((data?.templateLibrary?.templates) || []).filter((item) => !String(item.id).startsWith("tpl-")), [data?.templateLibrary?.templates]);
  const funnelRecentLeads = useMemo(() => data?.funnel?.recentLeads || [], [data?.funnel?.recentLeads]);
  const leadForecastQueue = useMemo(() => data?.leadForecast?.queue || [], [data?.leadForecast?.queue]);

  const snapshot = useMemo(() => buildModuleSnapshot("market-ads", {
    routePath: "/interno/market-ads",
    loading: state.loading,
    error: state.error,
    activeCampaigns: campaigns.length,
    adItemsCount: adItems.length,
    benchmarkCount: data?.competitorAds?.length || 0,
    queueCount: strategyQueue.length,
    complianceScore: complianceResult?.score || null,
    complianceApproved: complianceResult?.approved || false,
    coverage: { routeTracked: true, consoleIntegrated: true, filtersTracked: true, actionsTracked: true },
  }), [adItems.length, campaigns.length, complianceResult?.approved, complianceResult?.score, data?.competitorAds?.length, state.error, state.loading, strategyQueue.length]);

  useEffect(() => {
    setModuleHistory("market-ads", snapshot);
  }, [snapshot]);

  return { data, preview, complianceResult, campaigns, adItems, strategyQueue, optimizationRecommendations, persistedTemplates, funnelRecentLeads, leadForecastQueue };
}
