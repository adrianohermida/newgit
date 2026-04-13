import { useState } from "react";
import executeMarketAdsAction from "./executeMarketAdsAction";
import { toNumber } from "./shared";

export default function useMarketAdsCrudActions({
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
}) {
  const [campaignState, setCampaignState] = useState({ loading: false, error: null, result: null });
  const [landingState, setLandingState] = useState({ loading: false, error: null, result: null });
  const [adState, setAdState] = useState({ loading: false, error: null, result: null });
  const [abState, setAbState] = useState({ loading: false, error: null, result: null });

  async function saveCampaign() {
    setCampaignState({ loading: true, error: null, result: null });
    try {
      const { payload } = await executeMarketAdsAction(editingCampaignId ? "update_campaign" : "save_campaign", {
        campaignId: editingCampaignId || null,
        input: {
          ...campaignForm,
          budget: toNumber(campaignForm.budget),
          roi: toNumber(campaignForm.roi),
          ctr: toNumber(campaignForm.ctr),
          cpc: toNumber(campaignForm.cpc),
          cpa: toNumber(campaignForm.cpa),
          conversionRate: toNumber(campaignForm.conversionRate),
        },
      });
      setCampaignState({ loading: false, error: null, result: payload.data || null });
      setEditingCampaignId("");
      if (payload.data?.campaign) patchDashboardCollection("campaigns", payload.data.campaign, { prepend: true, limit: 6 });
      refreshDashboardSilently();
    } catch (error) {
      setCampaignState({ loading: false, error: error.message || "Falha ao salvar campanha.", result: null });
    }
  }

  async function recommendLanding() {
    setLandingState({ loading: true, error: null, result: null });
    try {
      const { payload } = await executeMarketAdsAction("recommend_landing", { input: { legalArea: campaignForm.legalArea, objective: campaignForm.objective } });
      setLandingState({ loading: false, error: null, result: payload.data || null });
    } catch (error) {
      setLandingState({ loading: false, error: error.message || "Falha ao recomendar landing page.", result: null });
    }
  }

  function applyRecommendedLanding() {
    const slug = landingState.result?.best?.slug;
    if (!slug) return;
    setCampaignForm((current) => ({ ...current, landingPage: slug }));
  }

  async function saveAdItem() {
    setAdState({ loading: true, error: null, result: null });
    try {
      const { payload } = await executeMarketAdsAction(editingAdId ? "update_ad_item" : "save_ad_item", {
        itemId: editingAdId || null,
        input: { ...adForm, keywordSuggestions: String(adForm.keywordSuggestions || "").split(",").map((item) => item.trim()).filter(Boolean) },
      });
      setAdState({ loading: false, error: null, result: payload.data || null });
      setEditingAdId("");
      if (payload.data?.adItem) patchDashboardCollection("adItems", payload.data.adItem, { prepend: true, limit: 12 });
      refreshDashboardSilently();
    } catch (error) {
      setAdState({ loading: false, error: error.message || "Falha ao salvar anuncio.", result: null });
    }
  }

  async function saveAbTest() {
    setAbState({ loading: true, error: null, result: null });
    try {
      const { payload } = await executeMarketAdsAction(editingAbId ? "update_ab_test" : "save_ab_test", {
        testId: editingAbId || null,
        input: { ...abForm, uplift: toNumber(abForm.uplift) },
      });
      setAbState({ loading: false, error: null, result: payload.data || null });
      setEditingAbId("");
      if (payload.data?.abTest) patchDashboardCollection("abTests", payload.data.abTest, { prepend: true, limit: 12 });
      refreshDashboardSilently();
    } catch (error) {
      setAbState({ loading: false, error: error.message || "Falha ao salvar teste A/B.", result: null });
    }
  }

  return { campaignState, landingState, adState, abState, saveCampaign, recommendLanding, applyRecommendedLanding, saveAdItem, saveAbTest };
}
