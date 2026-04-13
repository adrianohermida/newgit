import { useEffect, useState } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog } from "../../../lib/admin/activity-log";
import buildMarketAdsControllerValue from "./buildMarketAdsControllerValue";
import { isMarketAdsLocalModeError, loadMarketAdsLocalData } from "./marketAdsLocalMode";
import { mergeById } from "./shared";
import useMarketAdsCreativeActions from "./useMarketAdsCreativeActions";
import useMarketAdsDerivedData from "./useMarketAdsDerivedData";
import useMarketAdsForms from "./useMarketAdsForms";
import useMarketAdsCrudActions from "./useMarketAdsCrudActions";
import useMarketAdsIntegrationActions from "./useMarketAdsIntegrationActions";

export default function useMarketAdsController() {
    const [state, setState] = useState({ loading: true, error: null, data: null, meta: { localMode: false, localModeReason: "" } });
    const forms = useMarketAdsForms();
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
        setState((current) => ({ ...current, loading: false, error: null, data: payload.data || null, meta: { localMode: false, localModeReason: "" } }));
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
        if (isMarketAdsLocalModeError(error)) {
          const fallback = loadMarketAdsLocalData();
          setState((current) => ({
            ...current,
            loading: false,
            error: null,
            data: fallback.data,
            meta: fallback.meta,
          }));
          return;
        }
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
      generator: forms.generator,
      setGenerator: forms.setGenerator,
      attributionForm: forms.attributionForm,
      complianceInput: forms.complianceInput,
      patchDashboardCollection,
      patchTemplateLibraryTemplate,
      refreshDashboardSilently,
    });

    const crudActions = useMarketAdsCrudActions({
      campaignForm: forms.campaignForm,
      setCampaignForm: forms.setCampaignForm,
      editingCampaignId: forms.editingCampaignId,
      setEditingCampaignId: forms.setEditingCampaignId,
      adForm: forms.adForm,
      editingAdId: forms.editingAdId,
      setEditingAdId: forms.setEditingAdId,
      abForm: forms.abForm,
      editingAbId: forms.editingAbId,
      setEditingAbId: forms.setEditingAbId,
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
