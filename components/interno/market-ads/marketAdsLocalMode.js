import { initialMarketAdsLocalData, MARKET_ADS_LOCAL_KEY } from "./marketAdsLocalData";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nextId(prefix) {
  return `${prefix}-${Date.now()}`;
}

function readStorage() {
  if (typeof window === "undefined") return clone(initialMarketAdsLocalData);
  try {
    const raw = window.localStorage.getItem(MARKET_ADS_LOCAL_KEY);
    return raw ? { ...clone(initialMarketAdsLocalData), ...JSON.parse(raw) } : clone(initialMarketAdsLocalData);
  } catch { return clone(initialMarketAdsLocalData); }
}

function writeStorage(data) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MARKET_ADS_LOCAL_KEY, JSON.stringify(data));
  }
  return data;
}

function complianceFromInput(input = {}) {
  const text = `${input.headline || ""} ${input.description || ""} ${input.cta || ""}`.toLowerCase();
  const violations = [];
  if (text.includes("garant")) violations.push({ ruleId: "no-promise", label: "Promessa de resultado", severity: "critico", message: "Remova termos de garantia ou resultado certo.", offendingPattern: "garantia" });
  if (text.includes("gratis")) violations.push({ ruleId: "no-solicitation", label: "Captacao indevida", severity: "alto", message: "Evite chamada mercantilista como consulta gratis.", offendingPattern: "gratis" });
  const score = Math.max(52, 96 - violations.length * 24);
  return {
    approved: violations.length === 0,
    status: violations.length === 0 ? "aprovado" : score >= 70 ? "revisao" : "bloqueado",
    score,
    guidance: violations.length === 0 ? "Copy em linha com linguagem informativa e sobria." : "Ajuste os termos sinalizados antes da publicacao.",
    warning: violations.length ? "Modo local: revise com a equipe juridica antes de publicar." : null,
    violations,
    revisedCopy: `${input.headline || ""}. ${input.description || ""}`.replace(/garant\w*/gi, "analise juridica").replace(/gr[aá]tis/gi, "informativo inicial"),
  };
}

export function isMarketAdsLocalModeError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "").toLowerCase();
  return status === 404 || message.includes("404") || message.includes("failed to fetch") || message.includes("chamada administrativa");
}

export function loadMarketAdsLocalData() {
  const data = readStorage();
  return { data, meta: { localMode: true, localModeReason: "API administrativa indisponivel neste ambiente publicado. O modulo entrou em modo local para continuar operando." } };
}

export function runMarketAdsLocalAction(action, payload = {}) {
  const store = readStorage();

  if (action === "generate_preview" || action === "generate_from_winner" || action === "generate_from_template") {
    const input = payload.input || {};
    const compliance = complianceFromInput({
      headline: `Entenda seus direitos em ${input.area || "marketing juridico"}`,
      description: `Conteudo informativo para ${input.audience || "seu publico"} com foco em ${input.objective || "captacao"}.`,
      cta: "Saiba como funciona",
    });
    return { data: {
      platform: input.platform || "Google Ads",
      objective: input.objective || "Captacao",
      headlines: [`Entenda seus direitos em ${input.area || "sua demanda"}`, `${input.area || "Seu caso"} exige orientacao juridica tecnica`, `Veja caminhos juridicos para ${input.area || "seu problema"}`],
      descriptions: [`Material informativo para ${input.audience || "o publico"} com linguagem discreta e foco tecnico.`, `Analise inicial sobre ${input.area || "o tema"} sem promessa de resultado e com orientacao sobria.`],
      creativeHint: "Visual limpo, tipografia forte e foco na dor juridica principal.",
      audienceSuggestion: input.audience || "Pessoa fisica com intencao ativa de busca.",
      keywordSuggestions: [`${input.area || "advogado"} direitos`, `${input.area || "advogado"} orientacao`],
      compliance,
    } };
  }

  if (action === "validate_copy") return { data: complianceFromInput(payload.input || {}) };

  if (action === "recommend_landing") {
    const best = store.landingPages?.[0];
    return { data: { best, rationale: "Destino com melhor aderencia para captacao e menor friccao de contato." } };
  }

  if (action === "save_campaign" || action === "update_campaign") {
    const campaign = { ...payload.input, id: payload.campaignId || nextId("camp"), healthBand: "media", healthScore: 70, nextActions: ["Revisar criativo e validar landing page."] };
    store.campaigns = [campaign, ...(store.campaigns || []).filter((item) => item.id !== campaign.id)].slice(0, 12);
    writeStorage(store);
    return { data: { campaign, warning: "Modo local: campanha salva apenas neste navegador." } };
  }

  if (action === "save_ad_item" || action === "update_ad_item") {
    const adItem = { ...payload.input, id: payload.itemId || nextId("ad"), complianceStatus: "aprovada" };
    store.adItems = [adItem, ...(store.adItems || []).filter((item) => item.id !== adItem.id)].slice(0, 20);
    writeStorage(store);
    return { data: { adItem, warning: "Modo local: anuncio salvo apenas neste navegador." } };
  }

  if (action === "save_ab_test" || action === "update_ab_test") {
    const abTest = { ...payload.input, id: payload.testId || nextId("ab") };
    store.abTests = [abTest, ...(store.abTests || []).filter((item) => item.id !== abTest.id)].slice(0, 20);
    writeStorage(store);
    return { data: { abTest, warning: "Modo local: teste salvo apenas neste navegador." } };
  }

  if (action === "save_draft") {
    const draft = { ...payload.input, id: nextId("draft"), title: `${payload.input?.area || "Rascunho"} | ${payload.input?.platform || "Ads"}`, complianceScore: 92 };
    store.drafts = [draft, ...(store.drafts || [])].slice(0, 6);
    writeStorage(store);
    return { data: { draft, warning: "Modo local: draft salvo apenas neste navegador." } };
  }

  if (action === "save_template" || action === "toggle_template_favorite" || action === "update_template_visibility" || action === "update_template_edit_scope") {
    const baseTemplate = payload.input || {};
    const current = (store.templateLibrary?.templates || []).find((item) => item.id === payload.templateId) || {};
    const template = { ...current, ...baseTemplate, id: payload.templateId || baseTemplate.id || nextId("tpl-local"), isFavorite: action === "toggle_template_favorite" ? payload.isFavorite !== false : current.isFavorite || false, visibility: action === "update_template_visibility" ? payload.visibility : current.visibility || "privado", editScope: action === "update_template_edit_scope" ? payload.editScope : current.editScope || "autor" };
    store.templateLibrary.templates = [template, ...(store.templateLibrary.templates || []).filter((item) => item.id !== template.id)].slice(0, 24);
    store.templateLibrary.groups = [{ key: `${template.area || "geral"}-${template.objective || "captacao"}`, area: template.area || "Geral", objective: template.objective || "Captacao", items: store.templateLibrary.templates.slice(0, 3) }];
    writeStorage(store);
    return { data: { template, warning: "Modo local: template salvo apenas neste navegador." } };
  }

  if (action === "save_attribution") {
    const attribution = { ...payload.input, id: nextId("attr") };
    store.attributions = [attribution, ...(store.attributions || [])].slice(0, 50);
    writeStorage(store);
    return { data: { attribution, warning: "Modo local: atribuicao salva apenas neste navegador." } };
  }

  if (action === "generate_optimizations") return { data: store.optimizationPlan };
  if (action === "apply_optimizations") return { data: { applied: (store.optimizationPlan?.recommendations || []).map((item) => ({ campaignId: item.campaignId, action: "updated", status: "Em otimizacao" })) } };
  if (action === "inspect_integrations") return { data: store.integrations };
  if (action === "sync_remote_campaigns") return { data: { summary: "Leitura remota simulada no modo local.", campaigns: store.campaigns || [], remoteCampaigns: store.campaigns || [] } };
  if (action === "import_remote_campaigns") return { data: { summary: "Importacao local concluida.", created: 0, updated: (store.campaigns || []).length, remoteCampaigns: store.campaigns || [], imported: (store.campaigns || []).map((campaign) => ({ campaign, remote: campaign, action: "updated" })) } };
  if (action === "sync_remote_ads") return { data: { summary: "Leitura local de anuncios.", adItems: store.adItems || [], remoteItems: store.adItems || [] } };
  if (action === "import_remote_ads") return { data: { summary: "Importacao local concluida.", created: 0, updated: (store.adItems || []).length, remoteItems: store.adItems || [], imported: (store.adItems || []).map((adItem) => ({ adItem, remote: adItem, action: "updated" })) } };

  return { data: null, warning: "Acao local nao implementada." };
}
