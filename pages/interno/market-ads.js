import { useEffect, useMemo, useState } from "react";
import InternoLayout from "../../components/interno/InternoLayout";
import RequireAdmin from "../../components/interno/RequireAdmin";
import { adminFetch } from "../../lib/admin/api";
import { appendActivityLog, setModuleHistory } from "../../lib/admin/activity-log";
import { buildModuleSnapshot } from "../../lib/admin/module-registry";

function Panel({ eyebrow, title, helper, children }) {
  return (
    <section className="rounded-[28px] border border-[#22342F] bg-[linear-gradient(180deg,rgba(14,18,17,0.98),rgba(8,12,11,0.94))] p-6">
      {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#C5A059]">{eyebrow}</p> : null}
      {title ? <h3 className="mt-3 text-2xl font-semibold text-[#F6F2E8]">{title}</h3> : null}
      {helper ? <p className="mt-2 text-sm leading-6 text-[#97ABA4]">{helper}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Tile({ label, value, helper }) {
  return (
    <article className="rounded-[24px] border border-[#22342F] bg-[rgba(255,255,255,0.02)] p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-[#7F928C]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[#F8F4EB]">{value}</p>
      <p className="mt-2 text-sm leading-6 text-[#8FA29B]">{helper}</p>
    </article>
  );
}

function Tag({ children, tone = "neutral" }) {
  const tones = {
    neutral: "border-[#22342F] text-[#C7D0CA]",
    accent: "border-[#C5A059] text-[#F4E7C2]",
    success: "border-[#35554B] text-[#B7F7C6]",
    warn: "border-[#6E5630] text-[#FDE68A]",
    danger: "border-[#5B2D2D] text-[#FECACA]",
  };
  return <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${tones[tone]}`}>{children}</span>;
}

function toneFor(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("aprov")) return "success";
  if (normalized.includes("escalar") || normalized.includes("scale")) return "success";
  if (normalized.includes("crit") || normalized.includes("bloq")) return "danger";
  if (normalized.includes("revis") || normalized.includes("alert") || normalized.includes("atenc")) return "warn";
  if (normalized.includes("otimiz")) return "accent";
  if (normalized.includes("forte")) return "success";
  if (normalized.includes("estavel") || normalized.includes("media")) return "accent";
  return "accent";
}

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
  const [optimizationState, setOptimizationState] = useState({ loading: false, error: null, result: null });
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

  async function load() {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const payload = await adminFetch("/api/admin-market-ads");
      setState({ loading: false, error: null, data: payload.data || null });
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
      setState({ loading: false, error: error.message || "Falha ao carregar HMADV Market Ads.", data: null });
    }
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
      await load();
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
      await load();
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
      await load();
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
      await load();
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

  const snapshot = useMemo(() => buildModuleSnapshot("market-ads", {
    routePath: "/interno/market-ads",
    loading: state.loading,
    error: state.error,
    activeCampaigns: data?.campaigns?.length || 0,
    adItemsCount: data?.adItems?.length || 0,
    benchmarkCount: data?.competitorAds?.length || 0,
    queueCount: data?.queue?.length || 0,
    complianceScore: complianceResult?.score || null,
    complianceApproved: complianceResult?.approved || false,
    coverage: {
      routeTracked: true,
      consoleIntegrated: true,
      filtersTracked: true,
      actionsTracked: true,
    },
  }), [complianceResult?.approved, complianceResult?.score, data?.adItems?.length, data?.campaigns?.length, data?.competitorAds?.length, data?.queue?.length, state.error, state.loading]);

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
              <Tag tone="accent">{(integrationState.result || data.integrations)?.summary || "Sem leitura ainda"}</Tag>
            </div>
            {integrationState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{integrationState.error}</p> : null}
            {remoteSyncState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{remoteSyncState.error}</p> : null}
            {remoteImportState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{remoteImportState.error}</p> : null}
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
                  {(data.campaigns || []).map((campaign) => (
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
                  {(data.campaigns || []).map((campaign) => (
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
                    <Tag tone="accent">{(optimizationState.result || data.optimizationPlan)?.narrative || "Sem rodada executada ainda"}</Tag>
                  </div>
                  {optimizationState.error ? <p className="mt-3 text-sm text-[#F8C5C5]">{optimizationState.error}</p> : null}
                  <div className="mt-3 space-y-3">
                    {(data.strategyQueue || []).map((item) => (
                      <div key={item.id} className="rounded-[16px] border border-[#1D2B27] px-3 py-3 text-sm text-[#C7D0CA]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-semibold text-[#F5F1E8]">{item.campaignName}</p>
                          <div className="flex flex-wrap gap-2">
                            <Tag tone={toneFor(item.priority)}>{item.priority}</Tag>
                            <Tag tone="neutral">score {item.healthScore}</Tag>
                          </div>
                        </div>
                        <p className="mt-2 text-[#8FA29B]">{item.action}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6F837C]">Owner sugerido: {item.owner}</p>
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
                      {((optimizationState.result || data.optimizationPlan)?.recommendations || []).map((item) => (
                        <div key={`${item.campaignId}-${item.decision}`} className="rounded-[16px] border border-[#22342F] px-3 py-3 text-sm text-[#C7D0CA]">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-[#F5F1E8]">{item.campaignName}</p>
                            <div className="flex flex-wrap gap-2">
                              <Tag tone={toneFor(item.decision)}>{item.decision}</Tag>
                              <Tag tone="neutral">{item.suggestedStatus}</Tag>
                            </div>
                          </div>
                          <p className="mt-2 text-[#8FA29B]">{item.reason}</p>
                          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[#6F837C]">{item.impact}</p>
                        </div>
                      ))}
                    </div>
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
                  {(data.funnel?.recentLeads || []).length ? (
                    <div className="mt-4 space-y-3">
                      {(data.funnel.recentLeads || []).map((lead) => (
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
