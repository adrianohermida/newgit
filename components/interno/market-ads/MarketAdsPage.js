import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../InternoLayout";
import RequireAdmin from "../RequireAdmin";
import IntegrationsSection from "./IntegrationsSection";
import SummarySection from "./SummarySection";
import { Panel, Tag, Tile, mergeById, money, toNumber, toneFor } from "./shared";
import { adminFetch } from "../../../lib/admin/api";
import { appendActivityLog, setModuleHistory } from "../../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../../lib/admin/module-registry";

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

  return (
    <div className="space-y-6">
      <Panel
        eyebrow="Publicidade juridica"
        title="HMADV Market Ads"
        helper="Modulo criado para unir inteligencia de mercado, criacao de anuncios, landing pages, operacao de campanhas e filtro etico obrigatorio."
      >
        <div className="grid gap-4 xl:grid-cols-5">
          <Tile label="Campanhas ativas" value={data?.overview?.activeCampaigns || 0} helper="Google Ads e Meta Ads no mesmo cockpit." />
          <Tile label="Verba mensal" value={data?.overview?.monthlyBudget || "R$ 0,00"} helper="Investimento consolidado das campanhas visiveis." />
          <Tile label="ROI medio" value={data?.overview?.averageRoi || "0.0"} helper="Retorno medio das campanhas ativas." />
          <Tile label="CTR medio" value={`${data?.overview?.averageCtr || "0.0"}%`} helper="Aderencia atual entre mensagem e publico." />
          <Tile label="CPA medio" value={data?.overview?.averageCpa || "R$ 0,00"} helper="Custo medio de aquisicao no recorte atual." />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Tile label="Receita atribuida" value={data?.overview?.realRevenue || "R$ 0,00"} helper="Valor real registrado nas atribuicoes do modulo." />
          <Tile label="ROI real" value={data?.overview?.realRoi || "0.00"} helper="Receita atribuida dividida pela verba consolidada." />
        </div>
      </Panel>

      {state.loading ? <Panel title="Carregando modulo" helper="Buscando benchmarks, campanhas e compliance." /> : null}
      {state.error ? <Panel title="Falha no modulo" helper={state.error} /> : null}

      {!state.loading && !state.error && data ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
            <Panel eyebrow="Arquitetura operacional" title="7 pilares do modulo" helper="Estrutura pronta para descoberta, criacao, sincronizacao, teste e monitoramento.">
              <div className="grid gap-3 md:grid-cols-2">
                {data.pillars.map((pillar) => (
                  <article key={pillar.id} className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                    <p className="text-sm font-semibold text-[#F7F3EA]">{pillar.title}</p>
                    <p className="mt-2 text-sm leading-6 text-[#8DA19A]">{pillar.helper}</p>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel eyebrow="Risco e compliance" title="Alertas ativos" helper="Leituras preventivas para evitar saturacao, CPA alto e violações eticas.">
              <div className="space-y-3">
                {data.alerts.map((alert, index) => (
                  <article key={`${alert.title}-${index}`} className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[#F8F4EB]">{alert.title}</p>
                      <Tag tone={toneFor(alert.level)}>{alert.level}</Tag>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#8DA19A]">{alert.message}</p>
                  </article>
                ))}
              </div>
            </Panel>
          </div>

          <Panel eyebrow="Integracoes externas" title="Google Ads e Meta Ads" helper="Diagnostico de prontidao para leitura real das plataformas antes da sincronizacao operacional.">
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={inspectIntegrations} disabled={integrationState.loading} className="rounded-full border border-[#C5A059] px-5 py-3 text-sm font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E] disabled:opacity-50">
                {integrationState.loading ? "Inspecionando..." : "Inspecionar integracoes"}
              </button>
              <button type="button" onClick={syncRemoteCampaigns} disabled={remoteSyncState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
                {remoteSyncState.loading ? "Sincronizando campanhas..." : "Ler campanhas remotas"}
              </button>
              <button type="button" onClick={importRemoteCampaigns} disabled={remoteImportState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
                {remoteImportState.loading ? "Importando para a base..." : "Importar para campanhas locais"}
              </button>
              <button type="button" onClick={syncRemoteAds} disabled={remoteAdSyncState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
                {remoteAdSyncState.loading ? "Lendo anuncios..." : "Ler anuncios remotos"}
              </button>
              <button type="button" onClick={importRemoteAds} disabled={remoteAdImportState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
                {remoteAdImportState.loading ? "Importando anuncios..." : "Importar anuncios locais"}
              </button>
              <Tag tone="accent">{(integrationState.result || data.integrations)?.summary || "Sem leitura ainda"}</Tag>
            </div>
            {integrationState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{integrationState.error}</p> : null}
            {remoteSyncState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{remoteSyncState.error}</p> : null}
            {remoteImportState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{remoteImportState.error}</p> : null}
            {remoteAdSyncState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{remoteAdSyncState.error}</p> : null}
            {remoteAdImportState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{remoteAdImportState.error}</p> : null}
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {((integrationState.result || data.integrations)?.providers || []).map((item) => (
                <article key={item.provider} className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-[#F7F2E8]">{item.provider}</p>
                    <Tag tone={toneFor(item.status)}>{item.status}</Tag>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#8FA29B]">{item.summary}</p>
                  {item.missing?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.missing.map((missing) => <Tag key={missing} tone="warn">{missing}</Tag>)}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            {remoteSyncState.result ? (
              <div className="mt-5 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-[#F7F2E8]">Leitura remota</p>
                  <Tag tone="accent">{remoteSyncState.result.summary}</Tag>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(remoteSyncState.result.remoteCampaigns || []).map((item) => (
                    <article key={item.id} className="rounded-[18px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#F5F1E8]">{item.name}</p>
                        <Tag tone={toneFor(item.status)}>{item.provider}</Tag>
                      </div>
                      <p className="mt-1 text-[#8FA29B]">{item.objective}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Tag tone="neutral">{item.status}</Tag>
                        <Tag tone="accent">budget {money(item.budget || 0)}</Tag>
                        {item.cpc !== null && item.cpc !== undefined ? <Tag tone="neutral">cpc {money(item.cpc)}</Tag> : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            {remoteImportState.result ? (
              <div className="mt-5 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-[#F7F2E8]">Importacao conciliada</p>
                  <Tag tone="accent">{remoteImportState.result.summary}</Tag>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Tag tone="success">criadas {remoteImportState.result.created || 0}</Tag>
                  <Tag tone="warn">atualizadas {remoteImportState.result.updated || 0}</Tag>
                  <Tag tone="neutral">lidas {(remoteImportState.result.remoteCampaigns || []).length}</Tag>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(remoteImportState.result.imported || []).map((item, index) => (
                    <article key={`${item.remote?.id || index}-${item.action}`} className="rounded-[18px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#F5F1E8]">{item.campaign?.name || item.remote?.name || "Campanha remota"}</p>
                        <Tag tone={item.action === "created" ? "success" : item.action === "updated" ? "warn" : "danger"}>{item.action}</Tag>
                      </div>
                      <p className="mt-1 text-[#8FA29B]">{item.remote?.provider || "Ads"} · {item.remote?.objective || "sem objetivo"}</p>
                      {item.error ? <p className="mt-3 text-[#F8C5C5]">{item.error}</p> : null}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            {remoteAdSyncState.result ? (
              <div className="mt-5 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-[#F7F2E8]">Leitura remota de anuncios</p>
                  <Tag tone="accent">{remoteAdSyncState.result.summary}</Tag>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(remoteAdSyncState.result.remoteItems || []).map((item) => (
                    <article key={item.id} className="rounded-[18px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#F5F1E8]">{item.name}</p>
                        <Tag tone={toneFor(item.status)}>{item.provider}</Tag>
                      </div>
                      <p className="mt-1 text-[#8FA29B]">{item.remoteCampaignName}</p>
                      <p className="mt-2 text-[#8FA29B]">{item.headline}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Tag tone="neutral">imp {item.impressions || 0}</Tag>
                        <Tag tone="neutral">cliques {item.clicks || 0}</Tag>
                        <Tag tone="accent">ctr {Number(item.ctr || 0).toFixed(1)}%</Tag>
                        <Tag tone="neutral">cpc {money(item.cpc || 0)}</Tag>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            {remoteAdImportState.result ? (
              <div className="mt-5 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-[#F7F2E8]">Importacao conciliada de anuncios</p>
                  <Tag tone="accent">{remoteAdImportState.result.summary}</Tag>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Tag tone="success">criados {remoteAdImportState.result.created || 0}</Tag>
                  <Tag tone="warn">atualizados {remoteAdImportState.result.updated || 0}</Tag>
                  <Tag tone="neutral">lidos {(remoteAdImportState.result.remoteItems || []).length}</Tag>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {(remoteAdImportState.result.imported || []).map((item, index) => (
                    <article key={`${item.remote?.id || index}-${item.action}`} className="rounded-[18px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#F5F1E8]">{item.adItem?.name || item.remote?.name || "Anuncio remoto"}</p>
                        <Tag tone={item.action === "created" ? "success" : item.action === "updated" ? "warn" : "danger"}>{item.action}</Tag>
                      </div>
                      <p className="mt-1 text-[#8FA29B]">{item.remote?.remoteCampaignName || item.remote?.provider || "Ads"}</p>
                      {item.error ? <p className="mt-3 text-[#F8C5C5]">{item.error}</p> : null}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel eyebrow="Gestao de campanhas" title="Cadastrar ou editar campanha" helper="Use este bloco para montar a campanha operacional que vai alimentar verba, status, landing page e performance.">
              <div className="grid gap-4 md:grid-cols-2">
                <input value={campaignForm.name} onChange={(event) => setCampaignForm({ ...campaignForm, name: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Nome da campanha" />
                <select value={campaignForm.platform} onChange={(event) => setCampaignForm({ ...campaignForm, platform: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option>Google Ads</option>
                  <option>Meta Ads</option>
                  <option>Instagram Ads</option>
                </select>
                <select value={campaignForm.objective} onChange={(event) => setCampaignForm({ ...campaignForm, objective: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option>Captacao</option>
                  <option>Autoridade</option>
                  <option>Remarketing</option>
                </select>
                <select value={campaignForm.status} onChange={(event) => setCampaignForm({ ...campaignForm, status: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option>Draft</option>
                  <option>Ativa</option>
                  <option>Em otimizacao</option>
                  <option>Alerta</option>
                  <option>Pausada</option>
                </select>
                <input value={campaignForm.legalArea} onChange={(event) => setCampaignForm({ ...campaignForm, legalArea: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Area juridica" />
                <input value={campaignForm.audience} onChange={(event) => setCampaignForm({ ...campaignForm, audience: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Publico" />
                <input value={campaignForm.location} onChange={(event) => setCampaignForm({ ...campaignForm, location: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Localizacao" />
                <input value={campaignForm.landingPage} onChange={(event) => setCampaignForm({ ...campaignForm, landingPage: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Landing page" />
                <input value={campaignForm.budget} onChange={(event) => setCampaignForm({ ...campaignForm, budget: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Budget" />
                <input value={campaignForm.roi} onChange={(event) => setCampaignForm({ ...campaignForm, roi: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="ROI" />
                <input value={campaignForm.ctr} onChange={(event) => setCampaignForm({ ...campaignForm, ctr: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="CTR" />
                <input value={campaignForm.cpc} onChange={(event) => setCampaignForm({ ...campaignForm, cpc: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="CPC" />
                <input value={campaignForm.cpa} onChange={(event) => setCampaignForm({ ...campaignForm, cpa: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="CPA" />
                <input value={campaignForm.conversionRate} onChange={(event) => setCampaignForm({ ...campaignForm, conversionRate: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Taxa de conversao" />
                <select value={campaignForm.complianceStatus} onChange={(event) => setCampaignForm({ ...campaignForm, complianceStatus: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option value="aprovada">aprovada</option>
                  <option value="revisao">revisao</option>
                  <option value="bloqueada">bloqueada</option>
                </select>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={saveCampaign} disabled={campaignState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
                  {campaignState.loading ? "Salvando..." : editingCampaignId ? "Atualizar campanha" : "Criar campanha"}
                </button>
                <button type="button" onClick={recommendLanding} disabled={landingState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
                  {landingState.loading ? "Analisando destino..." : "Recomendar landing"}
                </button>
                <button type="button" onClick={resetCampaignForm} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                  Limpar formulario
                </button>
              </div>
              {campaignState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{campaignState.error}</p> : null}
              {campaignState.result?.campaign?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Campanha preparada: {campaignState.result.campaign.name}.</p> : null}
              {campaignState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{campaignState.result.warning}</p> : null}
              {landingState.error ? <p className="mt-2 text-sm text-[#F8C5C5]">{landingState.error}</p> : null}
              {landingState.result?.best ? (
                <div className="mt-4 rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[#F7F2E8]">Destino recomendado: {landingState.result.best.title}</p>
                      <p className="mt-1 text-sm text-[#8FA29B]">{landingState.result.best.slug}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Tag tone="accent">fit {landingState.result.best.recommendedScore}</Tag>
                      <button
                        type="button"
                        onClick={applyRecommendedLanding}
                        className="rounded-full border border-[#C5A059] px-4 py-2 text-xs text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E]"
                      >
                        Aplicar no formulario
                      </button>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#8FA29B]">{landingState.result.rationale}</p>
                </div>
              ) : null}
            </Panel>

            <Panel eyebrow="CRUD de anuncios" title="Cadastrar ou editar anuncio" helper="Controle cada peca com headline, descricao, CTA, campanha vinculada e score de compliance individual.">
              <div className="grid gap-4 md:grid-cols-2">
                <select value={adForm.campaignId} onChange={(event) => setAdForm({ ...adForm, campaignId: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option value="">Selecionar campanha</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                  ))}
                </select>
                <input value={adForm.name} onChange={(event) => setAdForm({ ...adForm, name: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Nome do anuncio" />
                <select value={adForm.platform} onChange={(event) => setAdForm({ ...adForm, platform: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option>Google Ads</option>
                  <option>Meta Ads</option>
                  <option>Instagram Ads</option>
                </select>
                <select value={adForm.status} onChange={(event) => setAdForm({ ...adForm, status: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option value="draft">draft</option>
                  <option value="ativa">ativa</option>
                  <option value="teste">teste</option>
                  <option value="pausada">pausada</option>
                </select>
                <input value={adForm.headline} onChange={(event) => setAdForm({ ...adForm, headline: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Headline" />
                <textarea value={adForm.description} onChange={(event) => setAdForm({ ...adForm, description: event.target.value })} rows={4} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Descricao" />
                <input value={adForm.cta} onChange={(event) => setAdForm({ ...adForm, cta: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="CTA" />
                <input value={adForm.audience} onChange={(event) => setAdForm({ ...adForm, audience: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Publico" />
                <textarea value={adForm.creativeHint} onChange={(event) => setAdForm({ ...adForm, creativeHint: event.target.value })} rows={3} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Sugestao de criativo" />
                <input value={adForm.keywordSuggestions} onChange={(event) => setAdForm({ ...adForm, keywordSuggestions: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Keywords separadas por virgula" />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={saveAdItem} disabled={adState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
                  {adState.loading ? "Salvando..." : editingAdId ? "Atualizar anuncio" : "Criar anuncio"}
                </button>
                <button type="button" onClick={resetAdForm} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                  Limpar anuncio
                </button>
              </div>
              {adState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{adState.error}</p> : null}
              {adState.result?.adItem?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Anuncio preparado: {adState.result.adItem.name}.</p> : null}
              {adState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{adState.result.warning}</p> : null}
            </Panel>

            <Panel eyebrow="Testes A/B" title="Cadastrar ou editar teste" helper="Registre hipotese, campanha, vencedor e uplift para transformar aprendizado em historico operacional.">
              <div className="grid gap-4 md:grid-cols-2">
                <select value={abForm.campaignId} onChange={(event) => setAbForm({ ...abForm, campaignId: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option value="">Selecionar campanha</option>
                  {campaigns.map((campaign) => (
                    <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                  ))}
                </select>
                <input value={abForm.area} onChange={(event) => setAbForm({ ...abForm, area: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Area juridica" />
                <select value={abForm.metric} onChange={(event) => setAbForm({ ...abForm, metric: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option>CTR</option>
                  <option>Conversao</option>
                  <option>CPA</option>
                  <option>ROI</option>
                </select>
                <textarea value={abForm.hypothesis} onChange={(event) => setAbForm({ ...abForm, hypothesis: event.target.value })} rows={4} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Hipotese do teste" />
                <input value={abForm.variantALabel} onChange={(event) => setAbForm({ ...abForm, variantALabel: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Variante A" />
                <input value={abForm.variantBLabel} onChange={(event) => setAbForm({ ...abForm, variantBLabel: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Variante B" />
                <input value={abForm.winner} onChange={(event) => setAbForm({ ...abForm, winner: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Vencedor" />
                <input value={abForm.uplift} onChange={(event) => setAbForm({ ...abForm, uplift: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Uplift %" />
                <select value={abForm.status} onChange={(event) => setAbForm({ ...abForm, status: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option value="draft">draft</option>
                  <option value="running">running</option>
                  <option value="completed">completed</option>
                </select>
                <textarea value={abForm.recommendation} onChange={(event) => setAbForm({ ...abForm, recommendation: event.target.value })} rows={3} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Recomendacao" />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={saveAbTest} disabled={abState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
                  {abState.loading ? "Salvando..." : editingAbId ? "Atualizar teste" : "Criar teste"}
                </button>
                <button type="button" onClick={resetAbForm} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                  Limpar teste
                </button>
              </div>
              {abState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{abState.error}</p> : null}
              {abState.result?.abTest?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Teste A/B preparado: {abState.result.abTest.metric}.</p> : null}
              {abState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{abState.result.warning}</p> : null}
            </Panel>

            <Panel eyebrow="Gerador com IA" title="Criar anuncio juridico" helper="Gera headlines, descricoes, CTA, criativo e keywords com revisao automatica inicial.">
              <div className="grid gap-4 md:grid-cols-2">
                <input value={generator.area} onChange={(event) => setGenerator({ ...generator, area: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Area juridica" />
                <input value={generator.audience} onChange={(event) => setGenerator({ ...generator, audience: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Publico-alvo" />
                <select value={generator.objective} onChange={(event) => setGenerator({ ...generator, objective: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option>Captacao</option>
                  <option>Autoridade</option>
                  <option>Remarketing</option>
                </select>
                <select value={generator.platform} onChange={(event) => setGenerator({ ...generator, platform: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                  <option>Google Ads</option>
                  <option>Meta Ads</option>
                  <option>Instagram Ads</option>
                </select>
                <input value={generator.location} onChange={(event) => setGenerator({ ...generator, location: event.target.value })} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Localizacao" />
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={generatePreview} disabled={previewState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
                  {previewState.loading ? "Gerando..." : "Gerar preview"}
                </button>
                <button type="button" onClick={saveDraft} disabled={draftState.loading} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50">
                  {draftState.loading ? "Salvando..." : "Salvar draft"}
                </button>
                <button type="button" onClick={load} className="rounded-full border border-[#22342F] px-5 py-3 text-sm text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]">
                  Atualizar painel
                </button>
              </div>
              {draftState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{draftState.error}</p> : null}
              {draftState.result?.draft?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Draft salvo com score {draftState.result.draft.complianceScore}.</p> : null}
              {draftState.result?.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{draftState.result.warning}</p> : null}
              {preview ? (
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <article className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">Headlines</p>
                    <div className="mt-3 space-y-2">
                      {preview.headlines.map((item) => <p key={item} className="rounded-[16px] border border-[#1F302B] px-3 py-3 text-sm text-[#F4EEE0]">{item}</p>)}
                    </div>
                    <p className="mt-4 text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">Descricoes</p>
                    <div className="mt-3 space-y-2">
                      {preview.descriptions.map((item) => <p key={item} className="rounded-[16px] border border-[#1F302B] px-3 py-3 text-sm leading-6 text-[#C9D2CD]">{item}</p>)}
                    </div>
                  </article>
                  <article className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4 text-sm text-[#C7D0CA]">
                    <div className="flex flex-wrap gap-2">
                      <Tag tone="accent">{preview.platform}</Tag>
                      <Tag tone="neutral">{preview.objective}</Tag>
                      <Tag tone={toneFor(preview.compliance?.status)}>{preview.compliance?.status || "pendente"}</Tag>
                    </div>
                    <p className="mt-4 font-semibold text-[#F7F2E8]">Criativo sugerido</p>
                    <p className="mt-2 leading-6 text-[#8EA19B]">{preview.creativeHint}</p>
                    <p className="mt-4 font-semibold text-[#F7F2E8]">Publico sugerido</p>
                    <p className="mt-2 leading-6 text-[#8EA19B]">{preview.audienceSuggestion}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(preview.keywordSuggestions || []).map((item) => <Tag key={item}>{item}</Tag>)}
                    </div>
                  </article>
                </div>
              ) : null}
            </Panel>

            <Panel eyebrow="Filtro juridico" title="Validador de compliance OAB" helper="Bloqueia linguagem vedada e sugere reescrita para manter discricao, sobriedade e carater informativo.">
              <div className="space-y-4">
                <input value={complianceInput.headline} onChange={(event) => setComplianceInput({ ...complianceInput, headline: event.target.value })} className="w-full rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Headline" />
                <textarea value={complianceInput.description} onChange={(event) => setComplianceInput({ ...complianceInput, description: event.target.value })} rows={5} className="w-full rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Descricao" />
                <input value={complianceInput.cta} onChange={(event) => setComplianceInput({ ...complianceInput, cta: event.target.value })} className="w-full rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="CTA" />
                <button type="button" onClick={validateCompliance} disabled={complianceState.loading} className="rounded-full border border-[#C5A059] px-5 py-3 text-sm font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E] disabled:opacity-50">
                  {complianceState.loading ? "Validando..." : "Validar compliance"}
                </button>
              </div>
              {complianceResult ? (
                <div className="mt-5 space-y-3">
                  <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                    <div className="flex flex-wrap gap-2">
                      <Tag tone={toneFor(complianceResult.status)}>{complianceResult.status}</Tag>
                      <Tag tone="accent">score {complianceResult.score}</Tag>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#8DA19A]">{complianceResult.guidance}</p>
                    {complianceResult.warning ? <p className="mt-2 text-sm text-[#FDE68A]">{complianceResult.warning}</p> : null}
                  </div>
                  {complianceResult.violations?.map((item) => (
                    <div key={`${item.ruleId}-${item.offendingPattern}`} className="rounded-[18px] border border-[#4B2E2F] bg-[rgba(53,18,18,0.26)] p-4">
                      <div className="flex flex-wrap gap-2">
                        <Tag tone="danger">{item.label}</Tag>
                        <Tag tone="warn">{item.severity}</Tag>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[#DABABA]">{item.message}</p>
                    </div>
                  ))}
                  <div className="rounded-[18px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">Reescrita sugerida</p>
                    <p className="mt-2 text-sm leading-6 text-[#D5DED8]">{complianceResult.revisedCopy}</p>
                  </div>
                </div>
              ) : null}
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel eyebrow="Mercado" title="Concorrencia e campanhas" helper="Recorte inicial para benchmarking, otimização e distribuicao segura do budget.">
              <div className="space-y-3">
                {data.competitorAds.map((item) => (
                  <article key={item.id} className="rounded-[22px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        <Tag tone="accent">{item.platform}</Tag>
                        <Tag>{item.area}</Tag>
                        <Tag>{item.angle}</Tag>
                      </div>
                      <Tag tone="success">CTR est. {item.estimatedCtr}%</Tag>
                    </div>
                    <h4 className="mt-3 text-lg font-semibold text-[#F7F2E8]">{item.headline}</h4>
                    <p className="mt-2 text-sm leading-6 text-[#90A49D]">{item.description}</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-4">
                      <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Keyword: {item.keyword}</div>
                      <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Dor: {item.pain}</div>
                      <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Posicao: {item.placement}</div>
                      <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Escala: {item.repetitionScore}/100</div>
                    </div>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel eyebrow="Operacao" title="Testes, landing pages e stack" helper="Base inicial para escalar o modulo com integracoes reais.">
              <div className="space-y-4">
                {data.abTests.map((item) => (
                  <article key={item.id} className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-[#F7F2E8]">{item.area}</p>
                      <div className="flex flex-wrap gap-2">
                        <Tag tone="success">{item.winner}</Tag>
                        {item.status ? <Tag tone={toneFor(item.status)}>{item.status}</Tag> : null}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#8DA19A]">{item.recommendation}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => beginEditAbTest(item)}
                        className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Editar teste
                      </button>
                    </div>
                  </article>
                ))}
                {data.campaigns.map((campaign) => (
                  <article key={campaign.id} className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-[#F7F2E8]">{campaign.name}</p>
                        <p className="mt-1 text-xs text-[#8FA29B]">{campaign.platform} · {campaign.objective}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Tag tone={toneFor(campaign.status)}>{campaign.status}</Tag>
                        <Tag tone={toneFor(campaign.complianceStatus)}>{campaign.complianceStatus}</Tag>
                        <Tag tone={toneFor(campaign.healthBand)}>saude {campaign.healthBand}</Tag>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Budget {money(campaign.budget)}</div>
                      <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">CPA {money(campaign.cpa)}</div>
                      <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">CTR {Number(campaign.ctr || 0).toFixed(1)}%</div>
                      <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">Score {campaign.healthScore || 0}/100</div>
                    </div>
                    <div className="mt-3 rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="font-semibold text-[#F7F2E8]">Proxima acao</p>
                      <p className="mt-1 text-[#8FA29B]">{campaign.nextActions?.[0] || "Sem recomendacao no momento."}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => beginEditCampaign(campaign)}
                        className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                      >
                        Editar campanha
                      </button>
                    </div>
                  </article>
                ))}
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="font-semibold text-[#F7F2E8]">Assistente de estrategia</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={generateOptimizations}
                      disabled={optimizationState.loading}
                      className="rounded-full border border-[#C5A059] px-4 py-2 text-xs font-semibold text-[#C5A059] transition hover:bg-[#C5A059] hover:text-[#07110E] disabled:opacity-50"
                    >
                      {optimizationState.loading ? "Rodando otimizacao..." : "Gerar rodada de otimizacao"}
                    </button>
                    <button
                      type="button"
                      onClick={applyOptimizations}
                      disabled={applyOptimizationState.loading}
                      className="rounded-full border border-[#22342F] px-4 py-2 text-xs font-semibold text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059] disabled:opacity-50"
                    >
                      {applyOptimizationState.loading ? "Aplicando status..." : "Aplicar status sugeridos"}
                    </button>
                    <Tag tone="accent">{(optimizationState.result || data.optimizationPlan)?.narrative || "Sem rodada executada ainda"}</Tag>
                  </div>
                  {optimizationState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{optimizationState.error}</p> : null}
                  {applyOptimizationState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{applyOptimizationState.error}</p> : null}
                  {applyOptimizationState.result ? (
                    <div className="mt-3 rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-[#F5F1E8]">Aplicacao segura concluida</p>
                        <Tag tone="accent">{applyOptimizationState.result.narrative}</Tag>
                      </div>
                      <p className="mt-2 text-[#8FA29B]">O lote atualiza apenas o status sugerido e registra a decisao em metadata, sem alterar orcamento automaticamente.</p>
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-3">
                    {strategyQueue.map((item) => (
                      <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-[#F5F1E8]">{item.campaignName}</p>
                          <div className="flex flex-wrap gap-2">
                            <Tag tone={toneFor(item.priority)}>{item.priority}</Tag>
                            <Tag tone="neutral">score {item.healthScore}</Tag>
                            {item.attributedLeads ? <Tag tone="accent">leads {item.attributedLeads}</Tag> : null}
                            {Number(item.realRoi || 0) > 0 ? <Tag tone={Number(item.realRoi || 0) >= 2 ? "success" : "warn"}>roi real {Number(item.realRoi || 0).toFixed(2)}</Tag> : null}
                          </div>
                        </div>
                        <p className="mt-2 text-[#8FA29B]">{item.action}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6F837C]">Owner sugerido: {item.owner}{item.clients ? ` · clientes ${item.clients}` : ""}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 rounded-[16px] border border-[#1D2B27] px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Tag tone="success">escala {(optimizationState.result || data.optimizationPlan)?.summary?.scale || 0}</Tag>
                      <Tag tone="accent">otimizar {(optimizationState.result || data.optimizationPlan)?.summary?.optimize || 0}</Tag>
                      <Tag tone="danger">revisar {(optimizationState.result || data.optimizationPlan)?.summary?.review || 0}</Tag>
                    </div>
                    <div className="mt-4 space-y-3">
                      {optimizationRecommendations.map((item) => (
                        <div key={`${item.campaignId}-${item.decision}`} className="rounded-[16px] border border-[#22342F] px-3 py-3 text-sm text-[#C7D0CA]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-[#F5F1E8]">{item.campaignName}</p>
                            <div className="flex flex-wrap gap-2">
                              <Tag tone={toneFor(item.decision)}>{item.decision}</Tag>
                              <Tag tone="neutral">{item.suggestedStatus}</Tag>
                              {item.attributedLeads ? <Tag tone="accent">leads {item.attributedLeads}</Tag> : null}
                              {Number(item.realRoi || 0) > 0 ? <Tag tone={Number(item.realRoi || 0) >= 2 ? "success" : "warn"}>roi real {Number(item.realRoi || 0).toFixed(2)}</Tag> : null}
                            </div>
                          </div>
                          <p className="mt-2 text-[#8FA29B]">{item.reason}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6F837C]">{item.impact}{item.clients ? ` · clientes ${item.clients}` : ""}</p>
                        </div>
                      ))}
                    </div>
                    {applyOptimizationState.result?.applied?.length ? (
                      <div className="mt-4 space-y-3">
                        {applyOptimizationState.result.applied.map((item) => (
                          <div key={`${item.campaignId}-${item.action}`} className="rounded-[16px] border border-[#22342F] px-3 py-3 text-sm text-[#C7D0CA]">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold text-[#F5F1E8]">{item.campaignName}</p>
                              <div className="flex flex-wrap gap-2">
                                <Tag tone={item.action === "updated" ? "success" : item.action === "skipped" ? "warn" : "danger"}>{item.action}</Tag>
                                {item.status ? <Tag tone="neutral">{item.status}</Tag> : null}
                              </div>
                            </div>
                            {item.decision ? <p className="mt-2 text-[#8FA29B]">Decisao aplicada: {item.decision}</p> : null}
                            {item.reason ? <p className="mt-2 text-[#8FA29B]">{item.reason}</p> : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="font-semibold text-[#F7F2E8]">Landing pages</p>
                  <div className="mt-3 space-y-2">
                    {data.landingPages.map((item) => <p key={item.id} className="text-sm leading-6 text-[#C7D0CA]">{item.title} · {item.slug}</p>)}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-[#F7F2E8]">Criativos vencedores</p>
                    <Tag tone="accent">{data.creativeRanking?.summary || "Sem ranking ainda"}</Tag>
                  </div>
                  <div className="mt-4 space-y-3">
                    {(data.creativeRanking?.leaders || []).map((item) => (
                      <div key={`${item.source}-${item.id}`} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-[#F5F1E8]">{item.headline}</p>
                          <div className="flex flex-wrap gap-2">
                            <Tag tone={item.source === "local" ? "success" : "accent"}>{item.source}</Tag>
                            <Tag tone="neutral">score {item.score}</Tag>
                          </div>
                        </div>
                        <p className="mt-1 text-[#8FA29B]">{item.platform}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Tag tone="accent">ctr {Number(item.ctr || 0).toFixed(1)}%</Tag>
                          {item.source === "local" ? <Tag tone="neutral">cliques {item.clicks || 0}</Tag> : null}
                          {item.source === "local" ? <Tag tone="neutral">conv {item.conversions || 0}</Tag> : null}
                        </div>
                        <p className="mt-3 text-[#8FA29B]">{item.recommendation}</p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => generateFromWinner(item)}
                            className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                          >
                            Gerar variacoes
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-[#F7F2E8]">Biblioteca de templates</p>
                    <Tag tone="accent">{data.templateLibrary?.summary || "Sem templates ainda"}</Tag>
                  </div>
                  {templateState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{templateState.error}</p> : null}
                  {templateState.result?.template?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Template atualizado na biblioteca persistida.</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Tag tone="neutral">uso total {data.templateLibrary?.usage?.total || 0}</Tag>
                  </div>
                  <div className="mt-4 space-y-4">
                    {(data.templateLibrary?.groups || []).map((group) => (
                      <div key={group.key} className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-[#F5F1E8]">{group.area}</p>
                          <Tag tone="neutral">{group.objective}</Tag>
                        </div>
                        <div className="mt-3 space-y-3">
                          {(group.items || []).slice(0, 3).map((item) => (
                            <div key={item.id} className="rounded-[16px] border border-[#22342F] px-3 py-3 text-sm text-[#C7D0CA]">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-[#F5F1E8]">{item.name}</p>
                                <div className="flex flex-wrap gap-2">
                                  <Tag tone={item.source === "local" ? "success" : "accent"}>{item.source}</Tag>
                                  <Tag tone="neutral">score {item.score}</Tag>
                                  <Tag tone="neutral">uso {item.usageCount || 0}</Tag>
                                  {item.isFavorite ? <Tag tone="success">favorito</Tag> : null}
                                  <Tag tone={item.visibility === "publico" ? "accent" : "neutral"}>{item.visibility || "privado"}</Tag>
                                  <Tag tone="neutral">{item.editScope === "autor" ? "somente autor" : "admins"}</Tag>
                                </div>
                              </div>
                              <p className="mt-2 text-[#8FA29B]">{item.headline}</p>
                              {item.lastUsedAt ? <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#6F837C]">Ultimo uso: {new Date(item.lastUsedAt).toLocaleDateString("pt-BR")}</p> : null}
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(item.tags || []).slice(0, 4).map((tag) => <Tag key={`${item.id}-${tag}`}>{tag}</Tag>)}
                              </div>
                              <div className="mt-3 flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  onClick={() => generateFromTemplate(item)}
                                  className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                                >
                                  Aplicar template
                                </button>
                                {item.id?.startsWith("tpl-") ? (
                                  <button
                                    type="button"
                                    onClick={() => saveTemplate(item)}
                                    className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                                  >
                                    Salvar na base
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => toggleTemplateFavorite(item)}
                                      className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                                    >
                                      {item.isFavorite ? "Desfavoritar" : "Favoritar"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleTemplateVisibility(item)}
                                      className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                                    >
                                      {item.visibility === "publico" ? "Tornar privado" : "Tornar publico"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => toggleTemplateEditScope(item)}
                                      className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                                    >
                                      {item.editScope === "autor" ? "Liberar para admins" : "Restringir ao autor"}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {(data.templateLibrary?.usage?.recent || []).length ? (
                    <div className="mt-4 rounded-[16px] border border-[#1D2B27] px-3 py-3">
                      <p className="font-semibold text-[#F5F1E8]">Atividade recente</p>
                      <div className="mt-3 space-y-2">
                        {(data.templateLibrary.usage.recent || []).slice(0, 5).map((item) => (
                          <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                            <p>Template {item.templateId || "sem id"} · uso {item.usageType}</p>
                            <p className="mt-1 text-[#8FA29B]">{new Date(item.createdAt).toLocaleString("pt-BR")}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-[#F7F2E8]">Analytics da biblioteca</p>
                    <Tag tone="accent">{data.templateAnalytics?.summary || "Sem analytics ainda"}</Tag>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-5">
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Templates</p>
                      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.templates || 0}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Favoritos</p>
                      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.favorites || 0}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Usos</p>
                      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.usage || 0}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Publicos</p>
                      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.public || 0}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Privados</p>
                      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.private || 0}</p>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Somente autor</p>
                      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.templateAnalytics?.totals?.authorOnly || 0}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 xl:grid-cols-3">
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                      <p className="font-semibold text-[#F5F1E8]">Mais usados</p>
                      <div className="mt-3 space-y-2">
                        {(data.templateAnalytics?.topUsed || []).map((item) => (
                          <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                            <p>{item.name}</p>
                            <p className="mt-1 text-[#8FA29B]">uso {item.usageCount || 0} · score {item.score || 0}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                      <p className="font-semibold text-[#F5F1E8]">Por objetivo</p>
                      <div className="mt-3 space-y-2">
                        {(data.templateAnalytics?.byObjective || []).map((item) => (
                          <div key={item.label} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                            <p>{item.label}</p>
                            <p className="mt-1 text-[#8FA29B]">{item.value} template(s)</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                      <p className="font-semibold text-[#F5F1E8]">Por plataforma</p>
                      <div className="mt-3 space-y-2">
                        {(data.templateAnalytics?.byPlatform || []).map((item) => (
                          <div key={item.label} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                            <p>{item.label}</p>
                            <p className="mt-1 text-[#8FA29B]">{item.value} template(s)</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-[#F7F2E8]">Atribuicao real de leads</p>
                    <Tag tone="accent">{data.attributionAnalytics?.summary || "Sem atribuicoes ainda"}</Tag>
                  </div>
                  {attributionState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{attributionState.error}</p> : null}
                  {attributionState.result?.attribution?.id ? <p className="mt-3 text-sm text-[#B7F7C6]">Atribuicao registrada com sucesso.</p> : null}
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <select value={attributionForm.campaignId} onChange={(event) => setAttributionForm({ ...attributionForm, campaignId: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                      <option value="">Selecionar campanha</option>
                      {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                    </select>
                    <select value={attributionForm.adItemId} onChange={(event) => setAttributionForm({ ...attributionForm, adItemId: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                      <option value="">Selecionar anuncio</option>
                      {adItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <select value={attributionForm.templateId} onChange={(event) => setAttributionForm({ ...attributionForm, templateId: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                      <option value="">Selecionar template</option>
                      {persistedTemplates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                    <select value={attributionForm.stage} onChange={(event) => setAttributionForm({ ...attributionForm, stage: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-[#0A0F0D] px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]">
                      <option value="lead">lead</option>
                      <option value="qualificado">qualificado</option>
                      <option value="atendimento">atendimento</option>
                      <option value="cliente">cliente</option>
                    </select>
                    <input value={attributionForm.leadName} onChange={(event) => setAttributionForm({ ...attributionForm, leadName: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Nome do lead" />
                    <input value={attributionForm.leadEmail} onChange={(event) => setAttributionForm({ ...attributionForm, leadEmail: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Email do lead" />
                    <input value={attributionForm.leadPhone} onChange={(event) => setAttributionForm({ ...attributionForm, leadPhone: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Telefone" />
                    <input value={attributionForm.value} onChange={(event) => setAttributionForm({ ...attributionForm, value: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Valor" />
                    <input value={attributionForm.campaignUtm} onChange={(event) => setAttributionForm({ ...attributionForm, campaignUtm: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="utm_campaign" />
                    <input value={attributionForm.contentUtm} onChange={(event) => setAttributionForm({ ...attributionForm, contentUtm: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="utm_content" />
                    <input value={attributionForm.termUtm} onChange={(event) => setAttributionForm({ ...attributionForm, termUtm: event.target.value })} className="rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="utm_term" />
                    <textarea value={attributionForm.notes} onChange={(event) => setAttributionForm({ ...attributionForm, notes: event.target.value })} rows={4} className="md:col-span-2 rounded-[18px] border border-[#22342F] bg-transparent px-4 py-3 text-sm text-[#F5F1E8] outline-none focus:border-[#C5A059]" placeholder="Observacoes da atribuicao" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={saveAttribution} disabled={attributionState.loading} className="rounded-full border border-[#C5A059] bg-[#C5A059] px-5 py-3 text-sm font-semibold text-[#07110E] disabled:opacity-50">
                      {attributionState.loading ? "Registrando..." : "Registrar atribuicao"}
                    </button>
                  </div>
                  <div className="mt-4 grid gap-4 xl:grid-cols-3">
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                      <p className="font-semibold text-[#F5F1E8]">Por campanha</p>
                      <div className="mt-3 space-y-2">
                        {(data.attributionAnalytics?.byCampaign || []).map((item) => (
                          <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                            <p>{item.name}</p>
                            <p className="mt-1 text-[#8FA29B]">leads {item.leads} · clientes {item.clients} · valor {money(item.value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                      <p className="font-semibold text-[#F5F1E8]">ROI real por campanha</p>
                      <div className="mt-3 space-y-2">
                        {(data.revenueOverview?.byCampaign || []).map((item) => (
                          <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                            <p>{item.name}</p>
                            <p className="mt-1 text-[#8FA29B]">receita {money(item.revenue)} · verba {money(item.budget)} · roi {Number(item.roiReal || 0).toFixed(2)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                      <p className="font-semibold text-[#F5F1E8]">Por anuncio</p>
                      <div className="mt-3 space-y-2">
                        {(data.attributionAnalytics?.byAdItem || []).map((item) => (
                          <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                            <p>{item.name}</p>
                            <p className="mt-1 text-[#8FA29B]">leads {item.leads}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3">
                      <p className="font-semibold text-[#F5F1E8]">Por template</p>
                      <div className="mt-3 space-y-2">
                        {(data.attributionAnalytics?.byTemplate || []).map((item) => (
                          <div key={item.id} className="rounded-[12px] border border-[#22342F] px-3 py-2 text-sm text-[#C7D0CA]">
                            <p>{item.name}</p>
                            <p className="mt-1 text-[#8FA29B]">leads {item.leads}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-[#F7F2E8]">Funil comercial</p>
                    <Tag tone="accent">fonte {(data.funnel?.source || "estimated").replace("_", " ")}</Tag>
                  </div>
                  {data.funnel?.warning ? <p className="mt-3 text-sm text-[#FDE68A]">{data.funnel.warning}</p> : null}
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {(data.funnel?.stages || []).map((stage) => (
                      <div key={stage.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">{stage.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{stage.value}</p>
                        <p className="mt-2 text-[#8FA29B]">{stage.helper}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 space-y-2">
                    {(data.funnel?.insights || []).map((item) => (
                      <p key={item} className="text-sm leading-6 text-[#8FA29B]">{item}</p>
                    ))}
                  </div>
                  {funnelRecentLeads.length ? (
                    <div className="mt-4 space-y-3">
                      {funnelRecentLeads.map((lead) => (
                        <div key={lead.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-[#F5F1E8]">{lead.name}</p>
                            <div className="flex flex-wrap gap-2">
                              <Tag tone="neutral">status {lead.status}</Tag>
                              <Tag tone="accent">prioridade {lead.priority}</Tag>
                            </div>
                          </div>
                          <p className="mt-1 text-[#8FA29B]">{lead.subject}</p>
                          {lead.email ? <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6F837C]">{lead.email}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-[#F7F2E8]">Previsao de fechamento</p>
                    <Tag tone="accent">{data.leadForecast?.summary || "Sem previsao ainda"}</Tag>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Quentes</p>
                      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.leadForecast?.totals?.hot || 0}</p>
                      <p className="mt-2 text-[#8FA29B]">Precisam de acao humana imediata.</p>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Mornos</p>
                      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.leadForecast?.totals?.warm || 0}</p>
                      <p className="mt-2 text-[#8FA29B]">Pedem follow-up estruturado em ate 24h.</p>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Frios</p>
                      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.leadForecast?.totals?.cold || 0}</p>
                      <p className="mt-2 text-[#8FA29B]">Base para nutricao ou recaptura.</p>
                    </div>
                    <div className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#7F928C]">Clientes</p>
                      <p className="mt-2 text-2xl font-semibold text-[#F5F1E8]">{data.leadForecast?.totals?.clients || 0}</p>
                      <p className="mt-2 text-[#8FA29B]">Conversoes registradas no modulo.</p>
                    </div>
                  </div>
                  {(data.leadForecast?.bottlenecks || []).length ? (
                    <div className="mt-4 space-y-2">
                      {(data.leadForecast?.bottlenecks || []).map((item) => (
                        <p key={item} className="text-sm leading-6 text-[#8FA29B]">{item}</p>
                      ))}
                    </div>
                  ) : null}
                  {leadForecastQueue.length ? (
                    <div className="mt-4 space-y-3">
                      {leadForecastQueue.map((lead) => (
                        <div key={lead.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-[#F5F1E8]">{lead.leadName}</p>
                            <div className="flex flex-wrap gap-2">
                              <Tag tone={lead.temperature === "quente" ? "success" : lead.temperature === "morno" ? "warn" : "neutral"}>{lead.temperature}</Tag>
                              <Tag tone="accent">score {lead.score}</Tag>
                              <Tag tone="neutral">etapa {lead.stage}</Tag>
                            </div>
                          </div>
                          <p className="mt-2 text-[#8FA29B]">{lead.recommendation}</p>
                          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-[#6F837C]">{lead.nextStep}</p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs uppercase tracking-[0.16em] text-[#6F837C]">
                            <span>{lead.campaignName}</span>
                            {lead.adName ? <span>· {lead.adName}</span> : null}
                            {Number(lead.value || 0) > 0 ? <span>· valor {money(lead.value)}</span> : null}
                            {Number.isFinite(lead.ageInDays) ? <span>· {lead.ageInDays} dia(s)</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="font-semibold text-[#F7F2E8]">Arquitetura tecnica</p>
                  <div className="mt-3 space-y-2 text-sm leading-6 text-[#C7D0CA]">
                    {data.architecture.backend.concat(data.architecture.integrations).concat(data.architecture.safeguards).map((item) => <p key={item}>{item}</p>)}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="font-semibold text-[#F7F2E8]">Drafts salvos</p>
                  <div className="mt-3 space-y-2">
                    {(data.drafts || []).length ? data.drafts.map((item) => (
                      <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p>{item.title}</p>
                          <Tag tone={toneFor(item.complianceStatus)}>{item.complianceStatus}</Tag>
                        </div>
                        <p className="mt-1 text-[#8FA29B]">{item.headline}</p>
                      </div>
                    )) : <p className="text-sm text-[#8FA29B]">Nenhum draft persistido ainda.</p>}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="font-semibold text-[#F7F2E8]">Historico de compliance</p>
                  <div className="mt-3 space-y-2">
                    {(data.complianceLog || []).length ? data.complianceLog.map((item) => (
                      <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Tag tone={toneFor(item.status)}>{item.status}</Tag>
                          <Tag tone="accent">score {item.score}</Tag>
                        </div>
                        <p className="mt-1 text-[#8FA29B]">{item.headline || "Validacao sem headline"}</p>
                      </div>
                    )) : <p className="text-sm text-[#8FA29B]">Nenhum log persistido ainda.</p>}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-4">
                  <p className="font-semibold text-[#F7F2E8]">Anuncios salvos</p>
                  <div className="mt-3 space-y-2">
                    {(data.adItems || []).length ? data.adItems.map((item) => (
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
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Tag tone="neutral">imp {item.impressions || 0}</Tag>
                          <Tag tone="neutral">cliques {item.clicks || 0}</Tag>
                          <Tag tone="accent">ctr {Number(item.ctr || 0).toFixed(1)}%</Tag>
                          <Tag tone="neutral">cpc {money(item.cpc || 0)}</Tag>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => beginEditAd(item)}
                            className="rounded-full border border-[#22342F] px-4 py-2 text-xs text-[#D8DED9] transition hover:border-[#C5A059] hover:text-[#C5A059]"
                          >
                            Editar anuncio
                          </button>
                        </div>
                      </div>
                    )) : <p className="text-sm text-[#8FA29B]">Nenhum anuncio persistido ainda.</p>}
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
