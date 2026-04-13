import { useState } from "react";
import {
  initialAbForm,
  initialAdForm,
  initialAttributionForm,
  initialCampaignForm,
  initialComplianceInput,
  initialGenerator,
} from "./marketAdsDefaults";

export default function useMarketAdsForms() {
  const [generator, setGenerator] = useState(initialGenerator);
  const [campaignForm, setCampaignForm] = useState(initialCampaignForm);
  const [editingCampaignId, setEditingCampaignId] = useState("");
  const [attributionForm, setAttributionForm] = useState(initialAttributionForm);
  const [adForm, setAdForm] = useState(initialAdForm);
  const [editingAdId, setEditingAdId] = useState("");
  const [abForm, setAbForm] = useState(initialAbForm);
  const [editingAbId, setEditingAbId] = useState("");
  const [complianceInput, setComplianceInput] = useState(initialComplianceInput);

  function beginEditCampaign(campaign) {
    setEditingCampaignId(campaign.id || "");
    setCampaignForm({
      name: campaign.name || "",
      platform: campaign.platform || "Google Ads",
      objective: campaign.objective || "Captacao",
      status: campaign.status || "Draft",
      legalArea: campaign.legalArea || campaign.area || "",
      audience: campaign.audience || "",
      location: campaign.location || "",
      budget: String(campaign.budget ?? 0),
      roi: String(campaign.roi ?? 0),
      ctr: String(campaign.ctr ?? 0),
      cpc: String(campaign.cpc ?? 0),
      cpa: String(campaign.cpa ?? 0),
      conversionRate: String(campaign.conversionRate ?? 0),
      complianceStatus: campaign.complianceStatus || "revisao",
      landingPage: campaign.landingPage || "",
    });
  }

  function beginEditAd(item) {
    setEditingAdId(item.id || "");
    setAdForm({
      campaignId: item.campaignId || "",
      name: item.name || "",
      platform: item.platform || "Google Ads",
      status: item.status || "draft",
      headline: item.headline || "",
      description: item.description || "",
      cta: item.cta || "",
      creativeHint: item.creativeHint || "",
      audience: item.audience || "",
      keywordSuggestions: Array.isArray(item.keywordSuggestions) ? item.keywordSuggestions.join(", ") : "",
    });
  }

  function beginEditAbTest(item) {
    setEditingAbId(item.id || "");
    setAbForm({
      campaignId: item.campaignId || "",
      area: item.area || "",
      hypothesis: item.hypothesis || "",
      metric: item.metric || "CTR",
      variantALabel: item.variantALabel || "Variante A",
      variantBLabel: item.variantBLabel || "Variante B",
      winner: item.winner || "",
      uplift: String(item.uplift ?? 0),
      status: item.status || "draft",
      recommendation: item.recommendation || "",
    });
  }

  function resetCampaignForm() {
    setEditingCampaignId("");
    setCampaignForm(initialCampaignForm);
  }

  function resetAdForm() {
    setEditingAdId("");
    setAdForm(initialAdForm);
  }

  function resetAbForm() {
    setEditingAbId("");
    setAbForm(initialAbForm);
  }

  return {
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
  };
}
