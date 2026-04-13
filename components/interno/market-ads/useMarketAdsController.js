import { useEffect, useState } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog } from "../../../lib/admin/activity-log";
import buildMarketAdsControllerValue from "./buildMarketAdsControllerValue";
import { mergeById } from "./shared";
import useMarketAdsCreativeActions from "./useMarketAdsCreativeActions";
import useMarketAdsDerivedData from "./useMarketAdsDerivedData";
import useMarketAdsForms from "./useMarketAdsForms";
import useMarketAdsCrudActions from "./useMarketAdsCrudActions";
import useMarketAdsIntegrationActions from "./useMarketAdsIntegrationActions";

export default function useMarketAdsController() {
    const [state, setState] = useState({ loading: true, error: null, data: null });
    const forms = useMarketAdsForms();
    const {
      generator,
      setGenerator,
      campaignForm,
      setCampaignForm,
      editingCampaignId,
      setEditingCampaignId,
      attributionForm,
      setAttributionForm,
      adForm,
      setAdForm,
      editingAdId,
      setEditingAdId,
      abForm,
      setAbForm,
      editingAbId,
      setEditingAbId,
      complianceInput,
      setComplianceInput,
      beginEditCampaign,
      beginEditAd,
      beginEditAbTest,
      resetCampaignForm,
      resetAdForm,
      resetAbForm,
    } = forms;
    function patchDashboardData(updater) {
      setState((current) => {
        if (!current.data) return current;
        const nextData = updater(current.data);
        return nextData ? { ...current, data: nextData } : current;
      });
    }
  
    function patchDashboardCollection(collectionKey, nextItem, options = {}) {
      if (!nextItem?.id) return;
      patchDashboardData((current) => ({
        ...current,
        [collectionKey]: mergeById(current[collectionKey], nextItem, options),
      }));
    }
  
    function patchTemplateLibraryTemplate(nextTemplate, options = {}) {
      if (!nextTemplate?.id) return;
      patchDashboardData((current) => ({
        ...current,
        templateLibrary: current.templateLibrary
          ? {
            ...current.templateLibrary,
            templates: mergeById(current.templateLibrary.templates, nextTemplate, options),
          }
          : current.templateLibrary,
      }));
    }
  
    async function load(options = {}) {
      const silent = Boolean(options?.silent);
      if (!silent) {
        setState((current) => ({ ...current, loading: true, error: null }));
      } else {
        setState((current) => ({ ...current, error: null }));
      }
      try {
        const payload = await adminFetch("/api/admin-market-ads");
        setState((current) => ({ ...current, loading: false, error: null, data: payload.data || null }));
        appendActivityLog({
          label: "Leitura HMADV Market Ads",
          action: "market_ads_load",
          method: "UI",
          module: "market-ads",
          page: "/interno/market-ads",
          status: "success",
          response: `Campanhas ${payload.data?.campaigns?.length || 0}, benchmarks ${payload.data?.competitorAds?.length || 0}.`,
          tags: ["market-ads", "ads", "compliance"],
        });
      } catch (error) {
        setState((current) => ({
          ...current,
          loading: false,
          error: error.message || "Falha ao carregar HMADV Market Ads.",
          data: silent ? current.data : null,
        }));
      }
    }
  
    function refreshDashboardSilently() {
      void load({ silent: true });
    }
    const creativeActions = useMarketAdsCreativeActions({
      generator,
      setGenerator,
      attributionForm,
      complianceInput,
      patchDashboardCollection,
      patchTemplateLibraryTemplate,
      refreshDashboardSilently,
    });

    const crudActions = useMarketAdsCrudActions({
      campaignForm,
      setCampaignForm,
      editingCampaignId,
      setEditingCampaignId,
      adForm,
      editingAdId,
      setEditingAdId,
      abForm,
      editingAbId,
      setEditingAbId,
      patchDashboardCollection,
      refreshDashboardSilently,
    });

    const integrationActions = useMarketAdsIntegrationActions({
      load,
      patchDashboardData,
      refreshDashboardSilently,
    });
  
    useEffect(() => {
      load();
    }, []);

    const derived = useMarketAdsDerivedData({
      state,
      creativeActions: { ...creativeActions, optimizationState: integrationActions.optimizationState },
    });

  return buildMarketAdsControllerValue({ state, derived, forms, creativeActions, crudActions, integrationActions, load });
}
