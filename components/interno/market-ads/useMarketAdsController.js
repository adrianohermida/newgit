import { useEffect, useMemo, useState } from "react";
import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog, setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";
import { mergeById, toNumber } from "./shared";

export default function useMarketAdsController() {
    const [state, setState] = useState({ loading: true, error: null, data: null });
    const [generator, setGenerator] = useState({
      area: "Superendividamento",
      audience: "Pessoa fisica",
      objective: "Captacao",
      platform: "Google Ads",
      location: "Sao Paulo",
    });
    const [previewState, setPreviewState] = useState({ loading: false, error: null, result: null });
    const [draftState, setDraftState] = useState({ loading: false, error: null, result: null });
    const [campaignForm, setCampaignForm] = useState({
      name: "Campanha juridica | Google Ads",
      platform: "Google Ads",
      objective: "Captacao",
      status: "Draft",
      legalArea: "Superendividamento",
      audience: "Pessoa fisica",
      location: "Sao Paulo",
      budget: "2500",
      roi: "0",
      ctr: "0",
      cpc: "0",
      cpa: "0",
      conversionRate: "0",
      complianceStatus: "revisao",
      landingPage: "/servicos/superendividamento",
    });
    const [campaignState, setCampaignState] = useState({ loading: false, error: null, result: null });
    const [editingCampaignId, setEditingCampaignId] = useState("");
    const [landingState, setLandingState] = useState({ loading: false, error: null, result: null });
    const [integrationState, setIntegrationState] = useState({ loading: false, error: null, result: null });
    const [remoteSyncState, setRemoteSyncState] = useState({ loading: false, error: null, result: null });
    const [remoteImportState, setRemoteImportState] = useState({ loading: false, error: null, result: null });
    const [remoteAdSyncState, setRemoteAdSyncState] = useState({ loading: false, error: null, result: null });
    const [remoteAdImportState, setRemoteAdImportState] = useState({ loading: false, error: null, result: null });
    const [optimizationState, setOptimizationState] = useState({ loading: false, error: null, result: null });
    const [applyOptimizationState, setApplyOptimizationState] = useState({ loading: false, error: null, result: null });
    const [templateState, setTemplateState] = useState({ loading: false, error: null, result: null });
    const [attributionForm, setAttributionForm] = useState({
      campaignId: "",
      adItemId: "",
      templateId: "",
      leadName: "",
      leadEmail: "",
      leadPhone: "",
      stage: "lead",
      source: "google",
      medium: "cpc",
      campaignUtm: "",
      contentUtm: "",
      termUtm: "",
      value: "0",
      notes: "",
    });
    const [attributionState, setAttributionState] = useState({ loading: false, error: null, result: null });
    const [adForm, setAdForm] = useState({
      campaignId: "",
      name: "Anuncio juridico | Search",
      platform: "Google Ads",
      status: "draft",
      headline: "Entenda seus direitos em superendividamento",
      description: "Conteudo informativo com orientacao juridica e linguagem discreta.",
      cta: "Saiba como funciona",
      creativeHint: "Criativo limpo com foco na dor juridica e chamada informativa.",
      audience: "Pessoa fisica",
      keywordSuggestions: "superendividamento advogado, superendividamento direitos",
    });
    const [adState, setAdState] = useState({ loading: false, error: null, result: null });
    const [editingAdId, setEditingAdId] = useState("");
    const [abForm, setAbForm] = useState({
      campaignId: "",
      area: "Superendividamento",
      hypothesis: "Headline mais objetiva gera CTR maior que headline com tom emocional.",
      metric: "CTR",
      variantALabel: "Variante A",
      variantBLabel: "Variante B",
      winner: "Variante B",
      uplift: "18",
      status: "running",
      recommendation: "Escalar a variante vencedora e manter CTA informativo.",
    });
    const [abState, setAbState] = useState({ loading: false, error: null, result: null });
    const [editingAbId, setEditingAbId] = useState("");
    const [complianceInput, setComplianceInput] = useState({
      headline: "Conheca seus direitos em casos de superendividamento",
      description: "Explicacao juridica clara sobre reorganizacao financeira e avaliacao tecnica do caso.",
      cta: "Saiba como funciona",
    });
    const [complianceState, setComplianceState] = useState({ loading: false, error: null, result: null });
  
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
  
    async function generatePreview() {
      setPreviewState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate_preview", input: generator }),
        });
        setPreviewState({ loading: false, error: null, result: payload.data || null });
      } catch (error) {
        setPreviewState({ loading: false, error: error.message || "Falha ao gerar preview.", result: null });
      }
    }
  
    async function generateFromWinner(item) {
      setPreviewState({ loading: true, error: null, result: null });
      try {
        const nextGenerator = {
          area: item.area || generator.area,
          audience: item.audience || generator.audience,
          objective: item.objective || generator.objective,
          platform: item.platform || generator.platform,
          location: generator.location,
        };
        setGenerator(nextGenerator);
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate_from_winner",
            input: {
              ...nextGenerator,
              source: item,
            },
          }),
        });
        setPreviewState({ loading: false, error: null, result: payload.data || null });
      } catch (error) {
        setPreviewState({ loading: false, error: error.message || "Falha ao gerar variacoes a partir do criativo vencedor.", result: null });
      }
    }
  
    async function generateFromTemplate(template) {
      setPreviewState({ loading: true, error: null, result: null });
      try {
        const nextGenerator = {
          area: template.area || generator.area,
          audience: template.audience || generator.audience,
          objective: template.objective || generator.objective,
          platform: template.platform || generator.platform,
          location: generator.location,
        };
        setGenerator(nextGenerator);
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate_from_template",
            input: {
              ...nextGenerator,
              template,
            },
          }),
        });
        setPreviewState({ loading: false, error: null, result: payload.data || null });
      } catch (error) {
        setPreviewState({ loading: false, error: error.message || "Falha ao gerar variacoes a partir do template.", result: null });
      }
    }
  
    async function saveTemplate(template) {
      setTemplateState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_template",
            input: template,
          }),
        });
        setTemplateState({ loading: false, error: null, result: payload.data || null });
        if (payload.data?.template) {
          patchTemplateLibraryTemplate(payload.data.template, { prepend: true, limit: 24 });
        }
        refreshDashboardSilently();
      } catch (error) {
        setTemplateState({ loading: false, error: error.message || "Falha ao salvar template na biblioteca.", result: null });
      }
    }
  
    async function toggleTemplateFavorite(template) {
      if (!template?.id) return;
      setTemplateState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "toggle_template_favorite",
            templateId: template.id,
            isFavorite: !template.isFavorite,
          }),
        });
        setTemplateState({ loading: false, error: null, result: payload.data || null });
        if (payload.data?.template) {
          patchTemplateLibraryTemplate(payload.data.template, { prepend: true, limit: 24 });
        }
        refreshDashboardSilently();
      } catch (error) {
        setTemplateState({ loading: false, error: error.message || "Falha ao atualizar favorito do template.", result: null });
      }
    }
  
    async function toggleTemplateVisibility(template) {
      if (!template?.id || String(template.id).startsWith("tpl-")) return;
      setTemplateState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_template_visibility",
            templateId: template.id,
            visibility: template.visibility === "publico" ? "privado" : "publico",
          }),
        });
        setTemplateState({ loading: false, error: null, result: payload.data || null });
        if (payload.data?.template) {
          patchTemplateLibraryTemplate(payload.data.template, { prepend: true, limit: 24 });
        }
        refreshDashboardSilently();
      } catch (error) {
        setTemplateState({ loading: false, error: error.message || "Falha ao atualizar visibilidade do template.", result: null });
      }
    }
  
    async function toggleTemplateEditScope(template) {
      if (!template?.id || String(template.id).startsWith("tpl-")) return;
      setTemplateState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update_template_edit_scope",
            templateId: template.id,
            editScope: template.editScope === "autor" ? "admins" : "autor",
          }),
        });
        setTemplateState({ loading: false, error: null, result: payload.data || null });
        if (payload.data?.template) {
          patchTemplateLibraryTemplate(payload.data.template, { prepend: true, limit: 24 });
        }
        refreshDashboardSilently();
      } catch (error) {
        setTemplateState({ loading: false, error: error.message || "Falha ao atualizar escopo de edicao do template.", result: null });
      }
    }
  
    async function saveAttribution() {
      setAttributionState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save_attribution",
            input: {
              ...attributionForm,
              value: toNumber(attributionForm.value),
            },
          }),
        });
        setAttributionState({ loading: false, error: null, result: payload.data || null });
        if (payload.data?.attribution) {
          patchDashboardCollection("attributions", payload.data.attribution, { prepend: true, limit: 50 });
        }
        refreshDashboardSilently();
      } catch (error) {
        setAttributionState({ loading: false, error: error.message || "Falha ao registrar atribuicao.", result: null });
      }
    }
  
    async function validateCompliance() {
      setComplianceState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "validate_copy", input: complianceInput }),
        });
        setComplianceState({ loading: false, error: null, result: payload.data || null });
      } catch (error) {
        setComplianceState({ loading: false, error: error.message || "Falha ao validar compliance.", result: null });
      }
    }
  
    async function saveDraft() {
      setDraftState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save_draft", input: generator }),
        });
        setDraftState({ loading: false, error: null, result: payload.data || null });
        if (payload.data?.draft) {
          patchDashboardCollection("drafts", payload.data.draft, { prepend: true, limit: 6 });
        }
        refreshDashboardSilently();
      } catch (error) {
        setDraftState({ loading: false, error: error.message || "Falha ao salvar draft.", result: null });
      }
    }
  
    async function saveCampaign() {
      setCampaignState({ loading: true, error: null, result: null });
      try {
        const action = editingCampaignId ? "update_campaign" : "save_campaign";
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
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
          }),
        });
        setCampaignState({ loading: false, error: null, result: payload.data || null });
        setEditingCampaignId("");
        if (payload.data?.campaign) {
          patchDashboardCollection("campaigns", payload.data.campaign, { prepend: true, limit: 6 });
        }
        refreshDashboardSilently();
      } catch (error) {
        setCampaignState({ loading: false, error: error.message || "Falha ao salvar campanha.", result: null });
      }
    }
  
    async function recommendLanding() {
      setLandingState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "recommend_landing",
            input: {
              legalArea: campaignForm.legalArea,
              objective: campaignForm.objective,
            },
          }),
        });
        setLandingState({ loading: false, error: null, result: payload.data || null });
      } catch (error) {
        setLandingState({ loading: false, error: error.message || "Falha ao recomendar landing page.", result: null });
      }
    }
  
    async function inspectIntegrations() {
      setIntegrationState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "inspect_integrations" }),
        });
        setIntegrationState({ loading: false, error: null, result: payload.data || null });
      } catch (error) {
        setIntegrationState({ loading: false, error: error.message || "Falha ao inspecionar integracoes.", result: null });
      }
    }
  
    async function syncRemoteCampaigns() {
      setRemoteSyncState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync_remote_campaigns" }),
        });
        setRemoteSyncState({ loading: false, error: null, result: payload.data || null });
      } catch (error) {
        setRemoteSyncState({ loading: false, error: error.message || "Falha ao sincronizar campanhas remotas.", result: null });
      }
    }
  
    async function importRemoteCampaigns() {
      setRemoteImportState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "import_remote_campaigns" }),
        });
        setRemoteImportState({ loading: false, error: null, result: payload.data || null });
        await load();
      } catch (error) {
        setRemoteImportState({ loading: false, error: error.message || "Falha ao importar campanhas para a base local.", result: null });
      }
    }
  
    async function syncRemoteAds() {
      setRemoteAdSyncState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "sync_remote_ads" }),
        });
        setRemoteAdSyncState({ loading: false, error: null, result: payload.data || null });
      } catch (error) {
        setRemoteAdSyncState({ loading: false, error: error.message || "Falha ao ler anuncios remotos.", result: null });
      }
    }
  
    async function importRemoteAds() {
      setRemoteAdImportState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "import_remote_ads" }),
        });
        setRemoteAdImportState({ loading: false, error: null, result: payload.data || null });
        await load();
      } catch (error) {
        setRemoteAdImportState({ loading: false, error: error.message || "Falha ao importar anuncios remotos.", result: null });
      }
    }
  
    async function generateOptimizations() {
      setOptimizationState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate_optimizations" }),
        });
        setOptimizationState({ loading: false, error: null, result: payload.data || null });
      } catch (error) {
        setOptimizationState({ loading: false, error: error.message || "Falha ao gerar plano de otimizacao.", result: null });
      }
    }
  
    async function applyOptimizations() {
      setApplyOptimizationState({ loading: true, error: null, result: null });
      try {
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "apply_optimizations" }),
        });
        setApplyOptimizationState({ loading: false, error: null, result: payload.data || null });
        if (payload.data?.applied?.length) {
          patchDashboardData((current) => {
            const nextCampaigns = (current.campaigns || []).map((campaign) => {
              const appliedItem = payload.data.applied.find((item) => item.campaignId === campaign.id && item.action === "updated");
              if (!appliedItem) return campaign;
              return {
                ...campaign,
                status: appliedItem.status || campaign.status,
              };
            });
  
            return {
              ...current,
              campaigns: nextCampaigns,
            };
          });
        }
        refreshDashboardSilently();
      } catch (error) {
        setApplyOptimizationState({ loading: false, error: error.message || "Falha ao aplicar recomendacoes nas campanhas locais.", result: null });
      }
    }
  
    function applyRecommendedLanding() {
      const slug = landingState.result?.best?.slug;
      if (!slug) return;
      setCampaignForm((current) => ({ ...current, landingPage: slug }));
    }
  
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
  
    function resetCampaignForm() {
      setEditingCampaignId("");
      setCampaignForm({
        name: "Campanha juridica | Google Ads",
        platform: "Google Ads",
        objective: "Captacao",
        status: "Draft",
        legalArea: "Superendividamento",
        audience: "Pessoa fisica",
        location: "Sao Paulo",
        budget: "2500",
        roi: "0",
        ctr: "0",
        cpc: "0",
        cpa: "0",
        conversionRate: "0",
        complianceStatus: "revisao",
        landingPage: "/servicos/superendividamento",
      });
    }
  
    async function saveAdItem() {
      setAdState({ loading: true, error: null, result: null });
      try {
        const action = editingAdId ? "update_ad_item" : "save_ad_item";
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            itemId: editingAdId || null,
            input: {
              ...adForm,
              keywordSuggestions: String(adForm.keywordSuggestions || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            },
          }),
        });
        setAdState({ loading: false, error: null, result: payload.data || null });
        setEditingAdId("");
        if (payload.data?.adItem) {
          patchDashboardCollection("adItems", payload.data.adItem, { prepend: true, limit: 12 });
        }
        refreshDashboardSilently();
      } catch (error) {
        setAdState({ loading: false, error: error.message || "Falha ao salvar anuncio.", result: null });
      }
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
  
    function resetAdForm() {
      setEditingAdId("");
      setAdForm({
        campaignId: "",
        name: "Anuncio juridico | Search",
        platform: "Google Ads",
        status: "draft",
        headline: "Entenda seus direitos em superendividamento",
        description: "Conteudo informativo com orientacao juridica e linguagem discreta.",
        cta: "Saiba como funciona",
        creativeHint: "Criativo limpo com foco na dor juridica e chamada informativa.",
        audience: "Pessoa fisica",
        keywordSuggestions: "superendividamento advogado, superendividamento direitos",
      });
    }
  
    async function saveAbTest() {
      setAbState({ loading: true, error: null, result: null });
      try {
        const action = editingAbId ? "update_ab_test" : "save_ab_test";
        const payload = await adminFetch("/api/admin-market-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            testId: editingAbId || null,
            input: {
              ...abForm,
              uplift: toNumber(abForm.uplift),
            },
          }),
        });
        setAbState({ loading: false, error: null, result: payload.data || null });
        setEditingAbId("");
        if (payload.data?.abTest) {
          patchDashboardCollection("abTests", payload.data.abTest, { prepend: true, limit: 12 });
        }
        refreshDashboardSilently();
      } catch (error) {
        setAbState({ loading: false, error: error.message || "Falha ao salvar teste A/B.", result: null });
      }
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
  
    function resetAbForm() {
      setEditingAbId("");
      setAbForm({
        campaignId: "",
        area: "Superendividamento",
        hypothesis: "Headline mais objetiva gera CTR maior que headline com tom emocional.",
        metric: "CTR",
        variantALabel: "Variante A",
        variantBLabel: "Variante B",
        winner: "Variante B",
        uplift: "18",
        status: "running",
        recommendation: "Escalar a variante vencedora e manter CTA informativo.",
      });
    }
  
    useEffect(() => {
      load();
    }, []);
  
    const data = state.data;
    const preview = previewState.result || data?.generatedSeed || null;
    const complianceResult = complianceState.result || preview?.compliance || null;
    const campaigns = useMemo(() => data?.campaigns || [], [data?.campaigns]);
    const adItems = useMemo(() => data?.adItems || [], [data?.adItems]);
    const strategyQueue = useMemo(() => data?.strategyQueue || [], [data?.strategyQueue]);
    const optimizationRecommendations = useMemo(() => (optimizationState.result || data?.optimizationPlan)?.recommendations || [], [data?.optimizationPlan, optimizationState.result]);
    const persistedTemplates = useMemo(
      () => ((data?.templateLibrary?.templates) || []).filter((item) => !String(item.id).startsWith("tpl-")),
      [data?.templateLibrary?.templates],
    );
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
      coverage: {
        routeTracked: true,
        consoleIntegrated: true,
        filtersTracked: true,
        actionsTracked: true,
      },
    }), [adItems.length, campaigns.length, complianceResult?.approved, complianceResult?.score, data?.competitorAds?.length, state.error, state.loading, strategyQueue.length]);
  
    useEffect(() => {
      setModuleHistory("market-ads", snapshot);
    }, [snapshot]);

  return {
    state,
    data,
    campaigns,
    adItems,
    persistedTemplates,
    preview,
    complianceResult,
    strategyQueue,
    optimizationRecommendations,
    funnelRecentLeads,
    leadForecastQueue,
    generator,
    setGenerator,
    previewState,
    draftState,
    campaignForm,
    setCampaignForm,
    campaignState,
    editingCampaignId,
    landingState,
    integrationState,
    remoteSyncState,
    remoteImportState,
    remoteAdSyncState,
    remoteAdImportState,
    optimizationState,
    applyOptimizationState,
    templateState,
    attributionForm,
    setAttributionForm,
    attributionState,
    adForm,
    setAdForm,
    adState,
    editingAdId,
    abForm,
    setAbForm,
    abState,
    editingAbId,
    complianceInput,
    setComplianceInput,
    complianceState,
    load,
    inspectIntegrations,
    syncRemoteCampaigns,
    importRemoteCampaigns,
    syncRemoteAds,
    importRemoteAds,
    saveCampaign,
    recommendLanding,
    resetCampaignForm,
    applyRecommendedLanding,
    saveAdItem,
    resetAdForm,
    saveAbTest,
    resetAbForm,
    generatePreview,
    saveDraft,
    validateCompliance,
    generateOptimizations,
    applyOptimizations,
    beginEditAbTest,
    beginEditCampaign,
    generateFromWinner,
    saveTemplate,
    toggleTemplateFavorite,
    toggleTemplateVisibility,
    toggleTemplateEditScope,
    generateFromTemplate,
    saveAttribution,
    beginEditAd,
  };
}
