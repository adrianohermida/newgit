import { fetchSupabaseAdmin, listFreshdeskTickets } from "./server.js";
import { google } from "googleapis";

const COMPETITOR_ADS = [
  {
    id: "comp-001",
    platform: "Google Ads",
    area: "Superendividamento",
    region: "Sudeste",
    audience: "Pessoa fisica",
    pain: "Renegociacao de dividas",
    angle: "emocional",
    keyword: "superendividamento advogado",
    headline: "Entenda seus direitos em casos de superendividamento",
    description: "Conteudo juridico informativo com foco em reorganizacao financeira e orientacao tecnica.",
    cta: "Saiba como funciona",
    format: "Search",
    placement: "Topo da SERP",
    frequency: "Alta",
    estimatedCtr: 4.8,
    estimatedEngagement: 72,
    repetitionScore: 81,
  },
  {
    id: "comp-002",
    platform: "Instagram Ads",
    area: "Trabalhista",
    region: "Sul",
    audience: "Pessoa fisica",
    pain: "Verbas rescisorias",
    angle: "racional",
    keyword: "direitos demissao sem justa causa",
    headline: "Demissao recente? Veja quais verbas merecem revisao",
    description: "Post de orientacao juridica com linguagem tecnica e discreta para esclarecer proximos passos.",
    cta: "Ver orientacoes",
    format: "Reel",
    placement: "Feed + stories",
    frequency: "Media",
    estimatedCtr: 3.9,
    estimatedEngagement: 68,
    repetitionScore: 63,
  },
  {
    id: "comp-003",
    platform: "Facebook Ads",
    area: "Consumidor",
    region: "Nordeste",
    audience: "Pessoa fisica",
    pain: "Juros abusivos",
    angle: "emocional",
    keyword: "revisao juros abusivos",
    headline: "Juros altos podem merecer revisao juridica",
    description: "Material informativo sobre contratos bancarios, com foco em entendimento tecnico e prevencao.",
    cta: "Conhecer analise",
    format: "Imagem estatica",
    placement: "Feed",
    frequency: "Alta",
    estimatedCtr: 5.2,
    estimatedEngagement: 74,
    repetitionScore: 88,
  },
  {
    id: "comp-004",
    platform: "Google Ads",
    area: "Previdenciario",
    region: "Centro-Oeste",
    audience: "Pessoa fisica",
    pain: "Beneficio negado",
    angle: "racional",
    keyword: "beneficio negado inss advogado",
    headline: "Beneficio negado pelo INSS? Entenda a analise juridica",
    description: "Abordagem educativa para explicar caminhos administrativos e judiciais sem promessa de resultado.",
    cta: "Ler explicacao",
    format: "Search",
    placement: "Topo da SERP",
    frequency: "Media",
    estimatedCtr: 4.1,
    estimatedEngagement: 61,
    repetitionScore: 57,
  },
];

const ACTIVE_CAMPAIGNS = [
  {
    id: "camp-001",
    name: "Superendividamento | Search | SP",
    platform: "Google Ads",
    objective: "Captacao",
    status: "Ativa",
    budget: 3200,
    roi: 3.4,
    ctr: 5.6,
    cpc: 3.2,
    cpa: 84,
    conversionRate: 8.1,
    complianceStatus: "Aprovada",
    landingPage: "/servicos/superendividamento",
  },
  {
    id: "camp-002",
    name: "Trabalhista | Meta | RJ",
    platform: "Meta Ads",
    objective: "Autoridade",
    status: "Em otimizacao",
    budget: 1900,
    roi: 2.6,
    ctr: 3.7,
    cpc: 2.8,
    cpa: 112,
    conversionRate: 5.3,
    complianceStatus: "Aprovada",
    landingPage: "/servicos/trabalhista",
  },
  {
    id: "camp-003",
    name: "Consumidor | Remarketing",
    platform: "Meta Ads",
    objective: "Remarketing",
    status: "Alerta",
    budget: 1400,
    roi: 1.7,
    ctr: 2.3,
    cpc: 4.1,
    cpa: 166,
    conversionRate: 3.1,
    complianceStatus: "Revisao preventiva",
    landingPage: "/servicos/consumidor",
  },
];

const AB_TESTS = [
  {
    id: "ab-001",
    area: "Superendividamento",
    winner: "Variante B",
    hypothesis: "Headline com foco em clareza juridica supera headline com foco em urgencia.",
    metric: "CTR",
    uplift: 24,
    recommendation: "Escalar criativo B e manter CTA informativo.",
  },
  {
    id: "ab-002",
    area: "Trabalhista",
    winner: "Variante A",
    hypothesis: "Imagem estatica com pergunta direta converte melhor que video curto.",
    metric: "Conversao",
    uplift: 17,
    recommendation: "Preservar visual discreto e testar nova pagina de destino.",
  },
];

const LANDING_PAGES = [
  {
    id: "lp-001",
    title: "Servicos Juridicos",
    slug: "/servicos",
    fitScore: 95,
    conversionLift: "Usar como pagina principal para campanhas de intencao media e comparacao de servicos.",
    areas: ["superendividamento", "bancario", "consumidor", "juros abusivos", "contratos"],
    objectiveFit: ["Captacao", "Autoridade"],
  },
  {
    id: "lp-002",
    title: "Agendamento de Consultoria",
    slug: "/agendamento",
    fitScore: 89,
    conversionLift: "Melhor destino para fundo de funil e campanhas com alta intencao de contato.",
    areas: ["superendividamento", "bancario", "consumidor", "juros abusivos", "contratos"],
    objectiveFit: ["Captacao", "Remarketing"],
  },
  {
    id: "lp-003",
    title: "Contato do Escritorio",
    slug: "/contato",
    fitScore: 82,
    conversionLift: "Funciona bem para campanhas de autoridade e suporte a retargeting de baixa friccao.",
    areas: ["superendividamento", "bancario", "consumidor", "juros abusivos", "contratos"],
    objectiveFit: ["Autoridade", "Remarketing"],
  },
  {
    id: "lp-004",
    title: "FAQ Juridico",
    slug: "/faq",
    fitScore: 78,
    conversionLift: "Bom apoio para educacao juridica, topo/meio de funil e reducao de objeções.",
    areas: ["superendividamento", "bancario", "consumidor"],
    objectiveFit: ["Autoridade"],
  },
  {
    id: "lp-005",
    title: "Blog Juridico",
    slug: "/blog",
    fitScore: 74,
    conversionLift: "Melhor uso em campanhas de conteudo, aquecimento e remarketing de baixa pressao.",
    areas: ["superendividamento", "bancario", "consumidor", "contratos"],
    objectiveFit: ["Autoridade", "Remarketing"],
  },
];

const STRATEGY_NOTES = [
  "Criar campanha de fundo de funil para superendividamento nas regioes com CPC abaixo de R$ 3,50.",
  "Ativar remarketing para visitantes da landing de consumidor com criativo educativo de baixa friccao.",
  "Reduzir frequencia na campanha de consumidor antes de ampliar verba para evitar saturacao.",
];

const COMPLIANCE_RULES = [
  {
    id: "no-promise",
    label: "Promessa de resultado",
    description: "Nao pode sugerir ganho de causa, garantia ou resultado certo.",
    severity: "critico",
    patterns: [/garantid/i, /resultado certo/i, /ganhe sua causa/i, /causa ganha/i, /100%/i],
  },
  {
    id: "no-solicitation",
    label: "Captacao indevida",
    description: "Evitar linguagem mercantilista, sensacionalista ou apelativa.",
    severity: "alto",
    patterns: [/atendimento imediato 24h/i, /nao perca tempo/i, /melhor advogado/i, /o mais barato/i, /consulta gratis/i],
  },
  {
    id: "informative-tone",
    label: "Tom informativo",
    description: "A copy deve priorizar orientacao juridica, sobriedade e clareza tecnica.",
    severity: "medio",
    patterns: [],
  },
];

const REWRITE_SUGGESTIONS = [
  { pattern: /garantid/i, replacement: "analise juridica especializada" },
  { pattern: /resultado certo/i, replacement: "avaliacao tecnica do caso" },
  { pattern: /ganhe sua causa/i, replacement: "entenda as possibilidades juridicas" },
  { pattern: /consulta gratis/i, replacement: "conteudo informativo inicial" },
  { pattern: /melhor advogado/i, replacement: "atuacao tecnica e personalizada" },
];

function money(value) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function complianceToneFromScore(score) {
  if (score >= 90) return "aprovado";
  if (score >= 70) return "revisao";
  return "bloqueado";
}

function buildAlerts(campaigns = []) {
  const alerts = [];
  campaigns.forEach((campaign) => {
    if (campaign.ctr < 2.5) {
      alerts.push({
        level: "atencao",
        title: `${campaign.name} com CTR em queda`,
        message: "Revisar headline e criativo. O conjunto perdeu tracao na ultima leitura.",
      });
    }
    if (campaign.cpa > 150) {
      alerts.push({
        level: "critico",
        title: `${campaign.name} com CPA acima da meta`,
        message: "Priorize ajuste de publico e pagina de destino antes de escalar verba.",
      });
    }
  });
  alerts.push({
    level: "info",
    title: "Compliance preventivo ativo",
    message: "Todas as novas pecas passam por revisao automatizada baseada no Estatuto, Codigo de Etica e Provimento 205/2021.",
  });
  return alerts;
}

function normalizeDraft(row = {}) {
  return {
    id: row.id,
    title: row.title,
    platform: row.platform,
    legalArea: row.legal_area,
    audience: row.audience,
    objective: row.objective,
    location: row.location,
    headline: row.headline,
    description: row.description,
    cta: row.cta,
    creativeHint: row.creative_hint,
    audienceSuggestion: row.audience_suggestion,
    keywordSuggestions: Array.isArray(row.keyword_suggestions) ? row.keyword_suggestions : [],
    complianceScore: row.compliance_score,
    complianceStatus: row.compliance_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeCampaign(row = {}) {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    objective: row.objective,
    status: row.status,
    legalArea: row.legal_area,
    audience: row.audience,
    location: row.location,
    budget: Number(row.budget || 0),
    roi: Number(row.roi || 0),
    ctr: Number(row.ctr || 0),
    cpc: Number(row.cpc || 0),
    cpa: Number(row.cpa || 0),
    conversionRate: Number(row.conversion_rate || 0),
    complianceStatus: row.compliance_status,
    landingPage: row.landing_page,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
  };
}

function normalizeAdItem(row = {}) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const performance = metadata.performance && typeof metadata.performance === "object" ? metadata.performance : {};
  return {
    id: row.id,
    campaignId: row.campaign_id,
    name: row.name,
    platform: row.platform,
    status: row.status,
    headline: row.headline,
    description: row.description,
    cta: row.cta,
    creativeHint: row.creative_hint,
    audience: row.audience,
    keywordSuggestions: Array.isArray(row.keyword_suggestions) ? row.keyword_suggestions : [],
    complianceScore: Number(row.compliance_score || 0),
    complianceStatus: row.compliance_status,
    createdAt: row.created_at,
    metadata,
    impressions: Number(performance.impressions || 0),
    clicks: Number(performance.clicks || 0),
    conversions: Number(performance.conversions || 0),
    ctr: Number(performance.ctr || 0),
    cpc: Number(performance.cpc || 0),
  };
}

function normalizeAbTest(row = {}) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    area: row.legal_area,
    hypothesis: row.hypothesis,
    metric: row.metric,
    variantALabel: row.variant_a_label,
    variantBLabel: row.variant_b_label,
    winner: row.winner,
    uplift: Number(row.uplift || 0),
    status: row.status,
    recommendation: row.recommendation,
    createdAt: row.created_at,
  };
}

function normalizeTemplate(row = {}) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    source: row.source,
    platform: row.platform,
    area: row.legal_area,
    audience: row.audience,
    objective: row.objective,
    headline: row.headline,
    complianceStatus: row.compliance_status,
    score: Number(row.score || 0),
    structure: row.structure && typeof row.structure === "object" ? row.structure : {},
    tags: Array.isArray(row.tags) ? row.tags : [],
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    isFavorite: Boolean(row.is_favorite),
    visibility: row.visibility || "privado",
    editScope: row.edit_scope || "admins",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeTemplateUsage(row = {}) {
  return {
    id: row.id,
    templateId: row.template_id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    usageType: row.usage_type,
    context: row.context && typeof row.context === "object" ? row.context : {},
    createdAt: row.created_at,
  };
}

function normalizeAttribution(row = {}) {
  return {
    id: row.id,
    userId: row.user_id,
    campaignId: row.campaign_id,
    adItemId: row.ad_item_id,
    templateId: row.template_id,
    leadName: row.lead_name,
    leadEmail: row.lead_email,
    leadPhone: row.lead_phone,
    stage: row.stage || "lead",
    source: row.source || "google",
    medium: row.medium || null,
    campaignUtm: row.campaign_utm || null,
    contentUtm: row.content_utm || null,
    termUtm: row.term_utm || null,
    value: Number(row.value || 0),
    notes: row.notes || null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function safeAdminSelect(path) {
  try {
    const rows = await fetchSupabaseAdmin(path);
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    return [];
  }
}

function computeOverview(campaigns = ACTIVE_CAMPAIGNS) {
  const totals = campaigns.reduce((acc, item) => {
    acc.budget += Number(item.budget || 0);
    acc.roi += Number(item.roi || 0);
    acc.ctr += Number(item.ctr || 0);
    acc.cpa += Number(item.cpa || 0);
    acc.conversionRate += Number(item.conversionRate || 0);
    return acc;
  }, { budget: 0, roi: 0, ctr: 0, cpa: 0, conversionRate: 0 });

  const count = Math.max(campaigns.length, 1);
  return {
    activeCampaigns: campaigns.length,
    monthlyBudget: money(totals.budget),
    averageRoi: (totals.roi / count).toFixed(1),
    averageCtr: (totals.ctr / count).toFixed(1),
    averageCpa: money(totals.cpa / count),
    averageConversionRate: (totals.conversionRate / count).toFixed(1),
  };
}

function computeRealRevenueOverview(campaigns = [], attributions = []) {
  const normalizedAttributions = attributions.map(normalizeAttribution);
  const totalRevenue = normalizedAttributions.reduce((acc, item) => acc + Number(item.value || 0), 0);
  const totalBudget = campaigns.reduce((acc, item) => acc + Number(item.budget || 0), 0);
  const realRoi = totalBudget > 0 ? totalRevenue / totalBudget : 0;

  const byCampaign = campaigns
    .map((campaign) => {
      const items = normalizedAttributions.filter((item) => item.campaignId === campaign.id);
      const revenue = items.reduce((acc, item) => acc + Number(item.value || 0), 0);
      const budget = Number(campaign.budget || 0);
      return {
        id: campaign.id,
        name: campaign.name,
        budget,
        revenue,
        roiReal: budget > 0 ? revenue / budget : 0,
        attributedLeads: items.length,
      };
    })
    .filter((item) => item.attributedLeads > 0 || item.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  return {
    totalRevenue,
    totalBudget,
    realRoi,
    byCampaign,
    summary: normalizedAttributions.length
      ? `${normalizedAttributions.length} atribuicao(oes) usada(s) para ROI real do modulo.`
      : "ROI real ainda sem atribuicoes suficientes.",
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value || 0), min), max);
}

function computeCampaignHealth(campaign = {}) {
  const ctr = Number(campaign.ctr || 0);
  const conversionRate = Number(campaign.conversionRate || 0);
  const roi = Number(campaign.roi || 0);
  const cpa = Number(campaign.cpa || 0);
  const compliance = String(campaign.complianceStatus || "").toLowerCase();
  const status = String(campaign.status || "").toLowerCase();

  let score = 50;
  score += clamp(ctr * 6, 0, 20);
  score += clamp(conversionRate * 4, 0, 20);
  score += clamp(roi * 8, 0, 15);
  score -= clamp(cpa / 12, 0, 18);

  if (compliance.includes("aprov")) score += 6;
  if (compliance.includes("revis")) score -= 8;
  if (compliance.includes("bloq")) score -= 20;
  if (status.includes("paus")) score -= 12;
  if (status.includes("alert")) score -= 10;

  const normalizedScore = clamp(Math.round(score), 0, 100);
  const healthBand = normalizedScore >= 75 ? "forte" : normalizedScore >= 50 ? "estavel" : "critico";
  const nextActions = [];

  if (ctr < 2.5) {
    nextActions.push("Revisar headline e criativo para recuperar taxa de clique.");
  }
  if (conversionRate < 3) {
    nextActions.push("Testar nova landing page ou reduzir friccao do formulario.");
  }
  if (cpa > 150) {
    nextActions.push("Reduzir desperdicio de verba ajustando publico e termos de baixa qualidade.");
  }
  if (roi >= 3 && conversionRate >= 5) {
    nextActions.push("Campanha apta para escala controlada com incremento gradual de verba.");
  }
  if (compliance.includes("revis") || compliance.includes("bloq")) {
    nextActions.push("Executar revisao de compliance antes de ampliar distribuicao.");
  }
  if (!nextActions.length) {
    nextActions.push("Manter monitoramento e abrir novo teste A/B de copy ou publico.");
  }

  return {
    healthScore: normalizedScore,
    healthBand,
    nextActions,
  };
}

function enrichCampaign(campaign = {}) {
  return {
    ...campaign,
    ...computeCampaignHealth(campaign),
  };
}

function buildStrategyQueue(campaigns = []) {
  return campaigns
    .map((campaign) => ({
      id: `strategy-${campaign.id}`,
      campaignId: campaign.id,
      campaignName: campaign.name,
      healthScore: campaign.healthScore,
      priority: campaign.healthBand === "critico" ? "alta" : campaign.healthBand === "estavel" ? "media" : "baixa",
      action: campaign.nextActions?.[0] || "Monitorar campanha",
      owner: campaign.healthBand === "critico" ? "Growth + Compliance" : "Growth",
    }))
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 5);
}

function buildOptimizationDecision(campaign = {}) {
  const actions = Array.isArray(campaign.nextActions) ? campaign.nextActions : [];

  if (campaign.healthBand === "critico") {
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      decision: "revisar",
      suggestedStatus: "Alerta",
      reason: actions[0] || "Campanha com baixa eficiencia geral.",
      impact: "Proteger verba e reduzir desperdicio antes de novo teste.",
    };
  }

  if (Number(campaign.roi || 0) >= 3 && Number(campaign.conversionRate || 0) >= 5 && Number(campaign.healthScore || 0) >= 75) {
    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      decision: "escalar",
      suggestedStatus: "Ativa",
      reason: actions.find((item) => item.toLowerCase().includes("escala")) || "Campanha com sinais fortes de tracao.",
      impact: "Expandir verba com incremento controlado para capturar mais demanda qualificada.",
    };
  }

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    decision: "otimizar",
    suggestedStatus: "Em otimizacao",
    reason: actions[0] || "Campanha com espaco para ganho incremental.",
    impact: "Melhorar eficiencia sem interromper aprendizado do conjunto.",
  };
}

function buildOptimizationPlan(campaigns = []) {
  const decisions = campaigns.map(buildOptimizationDecision);
  const summary = {
    scale: decisions.filter((item) => item.decision === "escalar").length,
    optimize: decisions.filter((item) => item.decision === "otimizar").length,
    review: decisions.filter((item) => item.decision === "revisar").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    recommendations: decisions.sort((a, b) => {
      const order = { revisar: 0, otimizar: 1, escalar: 2 };
      return (order[a.decision] ?? 9) - (order[b.decision] ?? 9);
    }),
    narrative: `${summary.review} campanha(s) pedem revisao imediata, ${summary.optimize} pedem otimizacao incremental e ${summary.scale} estao aptas para escala.`,
  };
}

function buildCreativeWinners(adItems = [], competitorAds = []) {
  const normalizedLocal = adItems.map((item) => {
    const ctr = Number(item.ctr || 0);
    const clicks = Number(item.clicks || 0);
    const conversions = Number(item.conversions || 0);
    const cpc = Number(item.cpc || 0);
    const complianceBonus = String(item.complianceStatus || "").toLowerCase().includes("aprov") ? 8 : 0;
    const score = Math.max(0, Math.round((ctr * 12) + (conversions * 8) + Math.min(clicks, 40) - (cpc * 4) + complianceBonus));
    const recommendation = score >= 80
      ? "Escalar criativo e gerar variacoes proximas."
      : score >= 45
        ? "Manter ativo e testar nova headline/CTA."
        : "Substituir criativo ou revisar aderencia com publico.";

    return {
      id: item.id,
      source: "local",
      name: item.name,
      headline: item.headline,
      platform: item.platform,
      area: item.metadata?.remoteSnapshot?.area || null,
      audience: item.audience || null,
      objective: item.metadata?.remoteSnapshot?.objective || "Captacao",
      score,
      ctr,
      clicks,
      conversions,
      cpc,
      complianceStatus: item.complianceStatus,
      recommendation,
    };
  });

  const normalizedCompetitors = competitorAds.map((item) => ({
    id: item.id,
    source: "benchmark",
    name: item.headline,
    headline: item.headline,
    platform: item.platform,
    area: item.area,
    audience: item.audience,
    objective: "Captacao",
    score: Math.max(0, Math.round((Number(item.estimatedCtr || 0) * 14) + (Number(item.estimatedEngagement || 0) * 0.35) + (Number(item.repetitionScore || 0) * 0.2))),
    ctr: Number(item.estimatedCtr || 0),
    clicks: 0,
    conversions: 0,
    cpc: 0,
    complianceStatus: "benchmark",
    recommendation: "Usar como referencia para novos testes sem copiar a promessa do mercado.",
  }));

  const ranked = normalizedLocal.concat(normalizedCompetitors).sort((a, b) => b.score - a.score);

  return {
    ranked,
    leaders: ranked.slice(0, 5),
    summary: ranked.length
      ? `${ranked.slice(0, 3).filter((item) => item.source === "local").length} criativo(s) local(is) entre os destaques do modulo.`
      : "Ainda nao ha criativos suficientes para ranking.",
  };
}

function buildTemplateLibrary(creativeRanking = { ranked: [] }) {
  const templates = (creativeRanking.ranked || [])
    .slice(0, 12)
    .map((item, index) => ({
      id: `tpl-${index + 1}-${item.id}`,
      name: item.source === "local" ? `Template vencedor | ${item.platform}` : `Template benchmark | ${item.platform}`,
      source: item.source,
      platform: item.platform,
      area: item.area || "Direito do Consumidor",
      audience: item.audience || "Pessoa fisica",
      objective: item.objective || "Captacao",
      headline: item.headline,
      score: item.score,
      complianceStatus: item.complianceStatus || (item.source === "benchmark" ? "benchmark" : "revisao"),
      recommendation: item.recommendation,
      structure: {
        angle: item.source === "benchmark" ? "benchmark_validado" : "historico_interno",
        hook: item.headline,
        cta: item.objective === "Autoridade" ? "Conhecer orientacoes" : "Saiba como funciona",
      },
      tags: [item.platform, item.objective || "Captacao", item.area || "Direito do Consumidor", item.source],
    }));

  const grouped = templates.reduce((acc, template) => {
    const key = `${template.area}::${template.objective}`;
    if (!acc[key]) {
      acc[key] = {
        key,
        area: template.area,
        objective: template.objective,
        items: [],
      };
    }
    acc[key].items.push(template);
    return acc;
  }, {});

  return {
    templates,
    groups: Object.values(grouped),
    summary: templates.length
      ? `${templates.length} template(s) disponivel(is) para reaproveitamento rapido.`
      : "Nenhum template vencedor disponivel ainda.",
  };
}

function mergeTemplateLibraries(baseLibrary = { templates: [], groups: [], summary: "" }, persistedTemplates = []) {
  const combined = [...persistedTemplates, ...(baseLibrary.templates || [])];
  const unique = [];
  const seen = new Set();

  combined.forEach((item) => {
    const key = `${item.platform}::${item.objective}::${item.headline}`;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(item);
  });

  const grouped = unique.reduce((acc, template) => {
    const key = `${template.area || "Direito do Consumidor"}::${template.objective || "Captacao"}`;
    if (!acc[key]) {
      acc[key] = {
        key,
        area: template.area || "Direito do Consumidor",
        objective: template.objective || "Captacao",
        items: [],
      };
    }
    acc[key].items.push(template);
    return acc;
  }, {});

  return {
    templates: unique,
    groups: Object.values(grouped),
    summary: unique.length
      ? `${unique.length} template(s) disponivel(is), incluindo biblioteca persistida.`
      : "Nenhum template disponivel ainda.",
  };
}

function enrichTemplateLibraryWithUsage(templateLibrary = { templates: [], groups: [] }, usageRows = []) {
  const usages = usageRows.map(normalizeTemplateUsage);
  const usageByTemplate = usages.reduce((acc, item) => {
    const key = item.templateId;
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const enrichTemplate = (template) => {
    const items = usageByTemplate[template.id] || [];
    return {
      ...template,
      usageCount: items.length,
      lastUsedAt: items[0]?.createdAt || null,
    };
  };

  return {
    ...templateLibrary,
    templates: (templateLibrary.templates || []).map(enrichTemplate),
    groups: (templateLibrary.groups || []).map((group) => ({
      ...group,
      items: (group.items || []).map(enrichTemplate),
    })),
    usage: {
      total: usages.length,
      recent: usages.slice(0, 10),
    },
  };
}

function buildTemplateOfficeAnalytics(templateLibrary = { templates: [], usage: { total: 0 } }) {
  const templates = Array.isArray(templateLibrary.templates) ? templateLibrary.templates : [];
  const totalTemplates = templates.length;
  const favorites = templates.filter((item) => item.isFavorite);
  const publicTemplates = templates.filter((item) => item.visibility === "publico");
  const privateTemplates = templates.filter((item) => item.visibility !== "publico");
  const authorOnlyTemplates = templates.filter((item) => item.editScope === "autor");
  const topUsed = [...templates]
    .sort((a, b) => {
      if ((b.usageCount || 0) !== (a.usageCount || 0)) return (b.usageCount || 0) - (a.usageCount || 0);
      return (b.score || 0) - (a.score || 0);
    })
    .slice(0, 5);

  const objectiveMap = templates.reduce((acc, item) => {
    const key = item.objective || "Captacao";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const platformMap = templates.reduce((acc, item) => {
    const key = item.platform || "Ads";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return {
    totals: {
      templates: totalTemplates,
      favorites: favorites.length,
      usage: Number(templateLibrary.usage?.total || 0),
      public: publicTemplates.length,
      private: privateTemplates.length,
      authorOnly: authorOnlyTemplates.length,
    },
    topUsed,
    byObjective: Object.entries(objectiveMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    byPlatform: Object.entries(platformMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    summary: totalTemplates
      ? `${favorites.length} favorito(s), ${Number(templateLibrary.usage?.total || 0)} uso(s) registrado(s) e ${topUsed.length} template(s) com prioridade de acompanhamento.`
      : "Biblioteca ainda sem dados suficientes para analytics.",
  };
}

function estimateFunnelFromCampaigns(campaigns = []) {
  const totals = campaigns.reduce((acc, campaign) => {
    const budget = Number(campaign.budget || 0);
    const cpa = Number(campaign.cpa || 0);
    const roi = Number(campaign.roi || 0);
    const estimatedLeads = cpa > 0 ? Math.round(budget / cpa) : 0;
    const estimatedQualified = Math.round(estimatedLeads * 0.42);
    const estimatedMeetings = Math.round(estimatedQualified * 0.55);
    const estimatedClients = Math.round(estimatedMeetings * (roi >= 3 ? 0.45 : 0.28));

    acc.leads += estimatedLeads;
    acc.qualified += estimatedQualified;
    acc.meetings += estimatedMeetings;
    acc.clients += estimatedClients;
    return acc;
  }, { leads: 0, qualified: 0, meetings: 0, clients: 0 });

  return {
    source: "estimated",
    totals,
    stages: [
      { id: "lead", label: "Leads", value: totals.leads, helper: "Estimativa derivada de verba e CPA." },
      { id: "qualified", label: "Qualificados", value: totals.qualified, helper: "Leads com maior aderencia ao servico juridico." },
      { id: "meeting", label: "Atendimento", value: totals.meetings, helper: "Contatos que avancam para triagem/consulta." },
      { id: "client", label: "Fechamentos", value: totals.clients, helper: "Conversao estimada em clientes." },
    ],
    insights: [
      "Estimativa inicial baseada em desempenho de campanha enquanto o CRM nao fornece vinculo direto por origem.",
      "Recomendado vincular UTMs e origem do lead para apuracao exata de fechamento por campanha.",
    ],
    recentLeads: [],
  };
}

async function buildFunnelOverview(campaigns = []) {
  try {
    const tickets = await listFreshdeskTickets({ page: 1, perPage: 50 });
    const items = Array.isArray(tickets) ? tickets : [];
    const open = items.filter((item) => Number(item.status) === 2).length;
    const pending = items.filter((item) => Number(item.status) === 3).length;
    const resolved = items.filter((item) => Number(item.status) === 4).length;
    const qualified = Math.round((open + pending) * 0.62);
    const meetings = Math.round((open + pending) * 0.38);

    return {
      source: "freshdesk",
      totals: {
        leads: items.length,
        qualified,
        meetings,
        clients: resolved,
      },
      stages: [
        { id: "lead", label: "Entradas", value: items.length, helper: "Tickets e contatos recebidos no Freshdesk." },
        { id: "qualified", label: "Triagem", value: qualified, helper: "Estimativa de leads em aderencia inicial." },
        { id: "meeting", label: "Atendimento", value: meetings, helper: "Casos que pedem retorno comercial/juridico." },
        { id: "client", label: "Resolvidos", value: resolved, helper: "Proxy inicial de desfecho operacional." },
      ],
      insights: [
        pending > open
          ? "Ha mais itens pendentes do que abertos, indicando gargalo de acompanhamento."
          : "Fila operacional sob controle relativo no atendimento inicial.",
        "Proximo passo recomendado: gravar origem/UTM do lead para atribuir fechamento por campanha.",
      ],
      recentLeads: items.slice(0, 6).map((item) => ({
        id: item.id,
        name: item.name || item.subject || "Lead sem identificacao",
        email: item.email || null,
        subject: item.subject || "Sem assunto",
        status: item.status,
        priority: item.priority,
        createdAt: item.created_at,
      })),
    };
  } catch (error) {
    const fallback = estimateFunnelFromCampaigns(campaigns);
    return {
      ...fallback,
      warning: error.message || "Freshdesk indisponivel para leitura do funil.",
    };
  }
}

function buildAttributionAnalytics(attributions = [], campaigns = [], adItems = [], templates = []) {
  const normalized = attributions.map(normalizeAttribution);
  const stageOrder = ["lead", "qualificado", "atendimento", "cliente"];
  const stageLabels = {
    lead: "Leads",
    qualificado: "Qualificados",
    atendimento: "Atendimento",
    cliente: "Fechamentos",
  };

  const stages = stageOrder.map((stage) => ({
    id: stage,
    label: stageLabels[stage],
    value: normalized.filter((item) => item.stage === stage).length,
    helper: `Registros reais em estágio ${stage}.`,
  }));

  const byCampaign = campaigns.map((campaign) => {
    const items = normalized.filter((item) => item.campaignId === campaign.id);
    return {
      id: campaign.id,
      name: campaign.name,
      leads: items.length,
      clients: items.filter((item) => item.stage === "cliente").length,
      value: items.reduce((acc, item) => acc + Number(item.value || 0), 0),
    };
  }).filter((item) => item.leads > 0);

  const byAdItem = adItems.map((adItem) => {
    const items = normalized.filter((item) => item.adItemId === adItem.id);
    return {
      id: adItem.id,
      name: adItem.name,
      leads: items.length,
    };
  }).filter((item) => item.leads > 0);

  const byTemplate = templates.map((template) => {
    const items = normalized.filter((item) => item.templateId === template.id);
    return {
      id: template.id,
      name: template.name,
      leads: items.length,
    };
  }).filter((item) => item.leads > 0);

  return {
    total: normalized.length,
    stages,
    byCampaign: byCampaign.sort((a, b) => b.leads - a.leads).slice(0, 6),
    byAdItem: byAdItem.sort((a, b) => b.leads - a.leads).slice(0, 6),
    byTemplate: byTemplate.sort((a, b) => b.leads - a.leads).slice(0, 6),
    recent: normalized.slice(0, 8),
    summary: normalized.length
      ? `${normalized.length} atribuicao(oes) real(is) registrada(s) no modulo.`
      : "Sem atribuicoes reais registradas ainda.",
  };
}

function normalizeArea(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function envValue(key) {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
}

function hasEnv(key) {
  return Boolean(envValue(key));
}

async function inspectGoogleAdsIntegration() {
  const config = {
    customerId: envValue("GOOGLE_ADS_CUSTOMER_ID"),
    managerId: envValue("GOOGLE_ADS_MANAGER_ID"),
    developerToken: envValue("GOOGLE_ADS_DEVELOPER_TOKEN"),
    clientId: envValue("GOOGLE_ADS_CLIENT_ID"),
    clientSecret: envValue("GOOGLE_ADS_CLIENT_SECRET"),
    refreshToken: envValue("GOOGLE_ADS_REFRESH_TOKEN"),
  };

  const configured = Boolean(
    config.customerId &&
    config.developerToken &&
    config.clientId &&
    config.clientSecret &&
    config.refreshToken
  );

  const missing = Object.entries({
    GOOGLE_ADS_CUSTOMER_ID: config.customerId,
    GOOGLE_ADS_DEVELOPER_TOKEN: config.developerToken,
    GOOGLE_ADS_CLIENT_ID: config.clientId,
    GOOGLE_ADS_CLIENT_SECRET: config.clientSecret,
    GOOGLE_ADS_REFRESH_TOKEN: config.refreshToken,
  }).filter(([, value]) => !value).map(([key]) => key);

  if (!configured) {
    return {
      provider: "Google Ads",
      configured: false,
      status: "pendente",
      missing,
      summary: "Credenciais Google Ads ainda incompletas para leitura real.",
    };
  }

  try {
    const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret);
    oauth2Client.setCredentials({ refresh_token: config.refreshToken });
    const accessTokenResponse = await oauth2Client.getAccessToken();
    return {
      provider: "Google Ads",
      configured: true,
      status: accessTokenResponse?.token ? "conectado" : "revisao",
      missing: [],
      summary: accessTokenResponse?.token
        ? "OAuth do Google pronto para integrar leitura de campanhas."
        : "Credenciais presentes, mas sem token de acesso retornado no smoke check.",
    };
  } catch (error) {
    return {
      provider: "Google Ads",
      configured: true,
      status: "erro",
      missing: [],
      summary: error.message || "Falha ao validar credenciais do Google Ads.",
    };
  }
}

async function inspectMetaAdsIntegration() {
  const config = {
    accountId: envValue("META_ADS_ACCOUNT_ID") || envValue("FACEBOOK_AD_ACCOUNT_ID"),
    accessToken: envValue("META_ADS_ACCESS_TOKEN") || envValue("FACEBOOK_ACCESS_TOKEN"),
    appId: envValue("META_APP_ID") || envValue("FACEBOOK_APP_ID"),
    appSecret: envValue("META_APP_SECRET") || envValue("FACEBOOK_APP_SECRET"),
  };

  const configured = Boolean(config.accountId && config.accessToken);
  const missing = Object.entries({
    META_ADS_ACCOUNT_ID: config.accountId,
    META_ADS_ACCESS_TOKEN: config.accessToken,
  }).filter(([, value]) => !value).map(([key]) => key);

  if (!configured) {
    return {
      provider: "Meta Ads",
      configured: false,
      status: "pendente",
      missing,
      summary: "Credenciais Meta Ads ainda incompletas para leitura real.",
    };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/v22.0/act_${encodeURIComponent(config.accountId)}?fields=id,name,account_status&access_token=${encodeURIComponent(config.accessToken)}`);
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        provider: "Meta Ads",
        configured: true,
        status: "erro",
        missing: [],
        summary: detail || `Falha no smoke check Meta Ads (${response.status}).`,
      };
    }
    const payload = await response.json().catch(() => ({}));
    return {
      provider: "Meta Ads",
      configured: true,
      status: "conectado",
      missing: [],
      summary: payload?.name
        ? `Conta ${payload.name} pronta para leitura inicial de campanhas.`
        : "Conta Meta Ads acessivel no smoke check.",
    };
  } catch (error) {
    return {
      provider: "Meta Ads",
      configured: true,
      status: "erro",
      missing: [],
      summary: error.message || "Falha ao validar credenciais do Meta Ads.",
    };
  }
}

export async function inspectAdsIntegrations() {
  const [googleAds, metaAds] = await Promise.all([
    inspectGoogleAdsIntegration(),
    inspectMetaAdsIntegration(),
  ]);

  return {
    providers: [googleAds, metaAds],
    summary: [googleAds, metaAds].every((item) => item.status === "conectado")
      ? "Google Ads e Meta Ads prontos para leitura real."
      : "Ainda ha configuracoes pendentes antes da sincronizacao externa completa.",
  };
}

async function getGoogleAdsAccessToken(config) {
  const oauth2Client = new google.auth.OAuth2(config.clientId, config.clientSecret);
  oauth2Client.setCredentials({ refresh_token: config.refreshToken });
  const accessTokenResponse = await oauth2Client.getAccessToken();
  return accessTokenResponse?.token || "";
}

async function fetchGoogleAdsCampaigns() {
  const config = {
    customerId: envValue("GOOGLE_ADS_CUSTOMER_ID"),
    developerToken: envValue("GOOGLE_ADS_DEVELOPER_TOKEN"),
    clientId: envValue("GOOGLE_ADS_CLIENT_ID"),
    clientSecret: envValue("GOOGLE_ADS_CLIENT_SECRET"),
    refreshToken: envValue("GOOGLE_ADS_REFRESH_TOKEN"),
    managerId: envValue("GOOGLE_ADS_MANAGER_ID"),
  };

  const configured = Boolean(
    config.customerId &&
    config.developerToken &&
    config.clientId &&
    config.clientSecret &&
    config.refreshToken
  );

  if (!configured) {
    return { provider: "Google Ads", synced: false, items: [], warning: "Credenciais Google Ads ausentes." };
  }

  try {
    const token = await getGoogleAdsAccessToken(config);
    const headers = {
      Authorization: `Bearer ${token}`,
      "developer-token": config.developerToken,
      "Content-Type": "application/json",
    };
    if (config.managerId) {
      headers["login-customer-id"] = config.managerId.replace(/\D/g, "");
    }

    const query = `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.average_cpc
      FROM campaign
      WHERE segments.date DURING LAST_30_DAYS
      ORDER BY campaign.id DESC
      LIMIT 10
    `.replace(/\s+/g, " ").trim();

    const response = await fetch(
      `https://googleads.googleapis.com/v19/customers/${encodeURIComponent(config.customerId.replace(/\D/g, ""))}/googleAds:searchStream`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { provider: "Google Ads", synced: false, items: [], warning: detail || `Falha Google Ads (${response.status}).` };
    }

    const payload = await response.json().catch(() => []);
    const items = (Array.isArray(payload) ? payload : [])
      .flatMap((chunk) => Array.isArray(chunk?.results) ? chunk.results : [])
      .map((row) => ({
        id: `google-${row.campaign?.id}`,
        provider: "Google Ads",
        remoteId: row.campaign?.id || null,
        name: row.campaign?.name || "Campanha Google",
        status: row.campaign?.status || "UNKNOWN",
        objective: row.campaign?.advertisingChannelType || "SEARCH",
        budget: Number(row.campaignBudget?.amountMicros || 0) / 1_000_000,
        clicks: Number(row.metrics?.clicks || 0),
        impressions: Number(row.metrics?.impressions || 0),
        conversions: Number(row.metrics?.conversions || 0),
        cpc: Number(row.metrics?.averageCpc || 0) / 1_000_000,
      }));

    return { provider: "Google Ads", synced: true, items, warning: items.length ? null : "Nenhuma campanha retornada no recorte." };
  } catch (error) {
    return { provider: "Google Ads", synced: false, items: [], warning: error.message || "Falha ao sincronizar Google Ads." };
  }
}

async function fetchMetaAdsCampaigns() {
  const accountId = envValue("META_ADS_ACCOUNT_ID") || envValue("FACEBOOK_AD_ACCOUNT_ID");
  const accessToken = envValue("META_ADS_ACCESS_TOKEN") || envValue("FACEBOOK_ACCESS_TOKEN");

  if (!accountId || !accessToken) {
    return { provider: "Meta Ads", synced: false, items: [], warning: "Credenciais Meta Ads ausentes." };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/act_${encodeURIComponent(accountId)}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget,effective_status&limit=10&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { provider: "Meta Ads", synced: false, items: [], warning: detail || `Falha Meta Ads (${response.status}).` };
    }
    const payload = await response.json().catch(() => ({}));
    const items = Array.isArray(payload?.data) ? payload.data.map((row) => ({
      id: `meta-${row.id}`,
      provider: "Meta Ads",
      remoteId: row.id,
      name: row.name || "Campanha Meta",
      status: row.effective_status || row.status || "UNKNOWN",
      objective: row.objective || "OUTCOME_UNKNOWN",
      budget: Number(row.daily_budget || row.lifetime_budget || 0) / 100,
      clicks: null,
      impressions: null,
      conversions: null,
      cpc: null,
    })) : [];

    return { provider: "Meta Ads", synced: true, items, warning: items.length ? null : "Nenhuma campanha retornada no recorte." };
  } catch (error) {
    return { provider: "Meta Ads", synced: false, items: [], warning: error.message || "Falha ao sincronizar Meta Ads." };
  }
}

async function fetchGoogleAdsItems() {
  const config = {
    customerId: envValue("GOOGLE_ADS_CUSTOMER_ID"),
    developerToken: envValue("GOOGLE_ADS_DEVELOPER_TOKEN"),
    clientId: envValue("GOOGLE_ADS_CLIENT_ID"),
    clientSecret: envValue("GOOGLE_ADS_CLIENT_SECRET"),
    refreshToken: envValue("GOOGLE_ADS_REFRESH_TOKEN"),
    managerId: envValue("GOOGLE_ADS_MANAGER_ID"),
  };

  const configured = Boolean(
    config.customerId &&
    config.developerToken &&
    config.clientId &&
    config.clientSecret &&
    config.refreshToken
  );

  if (!configured) {
    return { provider: "Google Ads", synced: false, items: [], warning: "Credenciais Google Ads ausentes para anuncios." };
  }

  try {
    const token = await getGoogleAdsAccessToken(config);
    const headers = {
      Authorization: `Bearer ${token}`,
      "developer-token": config.developerToken,
      "Content-Type": "application/json",
    };
    if (config.managerId) {
      headers["login-customer-id"] = config.managerId.replace(/\D/g, "");
    }

    const query = `
      SELECT
        campaign.id,
        campaign.name,
        ad_group.id,
        ad_group.name,
        ad_group_ad.ad.id,
        ad_group_ad.ad.name,
        ad_group_ad.status,
        ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.average_cpc,
        metrics.ctr
      FROM ad_group_ad
      WHERE segments.date DURING LAST_30_DAYS
      ORDER BY ad_group_ad.ad.id DESC
      LIMIT 20
    `.replace(/\s+/g, " ").trim();

    const response = await fetch(
      `https://googleads.googleapis.com/v19/customers/${encodeURIComponent(config.customerId.replace(/\D/g, ""))}/googleAds:searchStream`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { provider: "Google Ads", synced: false, items: [], warning: detail || `Falha Google Ads anuncios (${response.status}).` };
    }

    const payload = await response.json().catch(() => []);
    const items = (Array.isArray(payload) ? payload : [])
      .flatMap((chunk) => Array.isArray(chunk?.results) ? chunk.results : [])
      .map((row) => {
        const headlines = Array.isArray(row.adGroupAd?.ad?.responsiveSearchAd?.headlines)
          ? row.adGroupAd.ad.responsiveSearchAd.headlines.map((item) => item?.text).filter(Boolean)
          : [];
        const descriptions = Array.isArray(row.adGroupAd?.ad?.responsiveSearchAd?.descriptions)
          ? row.adGroupAd.ad.responsiveSearchAd.descriptions.map((item) => item?.text).filter(Boolean)
          : [];
        return {
          id: `google-ad-${row.adGroupAd?.ad?.id}`,
          provider: "Google Ads",
          remoteId: row.adGroupAd?.ad?.id || null,
          remoteCampaignId: row.campaign?.id || null,
          remoteCampaignName: row.campaign?.name || "Campanha Google",
          remoteAdGroupId: row.adGroup?.id || null,
          remoteAdGroupName: row.adGroup?.name || null,
          name: row.adGroupAd?.ad?.name || `Anuncio Google ${row.adGroupAd?.ad?.id || ""}`.trim(),
          status: row.adGroupAd?.status || "UNKNOWN",
          headline: headlines[0] || row.adGroupAd?.ad?.name || "Anuncio Google",
          description: descriptions[0] || "Anuncio remoto importado do Google Ads.",
          cta: "Saiba como funciona",
          creativeHint: row.adGroupAd?.ad?.finalUrls?.[0] || "Criativo remoto Google Ads",
          keywordSuggestions: headlines.slice(0, 3),
          impressions: Number(row.metrics?.impressions || 0),
          clicks: Number(row.metrics?.clicks || 0),
          conversions: Number(row.metrics?.conversions || 0),
          ctr: Number(row.metrics?.ctr || 0),
          cpc: Number(row.metrics?.averageCpc || 0) / 1_000_000,
        };
      });

    return { provider: "Google Ads", synced: true, items, warning: items.length ? null : "Nenhum anuncio retornado no recorte." };
  } catch (error) {
    return { provider: "Google Ads", synced: false, items: [], warning: error.message || "Falha ao sincronizar anuncios do Google Ads." };
  }
}

async function fetchMetaAdsItems() {
  const accountId = envValue("META_ADS_ACCOUNT_ID") || envValue("FACEBOOK_AD_ACCOUNT_ID");
  const accessToken = envValue("META_ADS_ACCESS_TOKEN") || envValue("FACEBOOK_ACCESS_TOKEN");

  if (!accountId || !accessToken) {
    return { provider: "Meta Ads", synced: false, items: [], warning: "Credenciais Meta Ads ausentes para anuncios." };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/v22.0/act_${encodeURIComponent(accountId)}/ads?fields=id,name,status,campaign{id,name},adset{id,name},creative{id,title,body},insights.limit(1){impressions,clicks,cpc,ctr,actions}&limit=20&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { provider: "Meta Ads", synced: false, items: [], warning: detail || `Falha Meta Ads anuncios (${response.status}).` };
    }

    const payload = await response.json().catch(() => ({}));
    const items = Array.isArray(payload?.data)
      ? payload.data.map((row) => {
        const insight = Array.isArray(row.insights?.data) ? row.insights.data[0] || {} : {};
        const actions = Array.isArray(insight.actions) ? insight.actions : [];
        const leadAction = actions.find((item) => String(item.action_type || "").toLowerCase().includes("lead"));
        return ({
          id: `meta-ad-${row.id}`,
          provider: "Meta Ads",
          remoteId: row.id,
          remoteCampaignId: row.campaign?.id || null,
          remoteCampaignName: row.campaign?.name || "Campanha Meta",
          remoteAdGroupId: row.adset?.id || null,
          remoteAdGroupName: row.adset?.name || null,
          name: row.name || `Anuncio Meta ${row.id}`,
          status: row.status || "UNKNOWN",
          headline: row.creative?.title || row.name || "Anuncio Meta",
          description: row.creative?.body || "Anuncio remoto importado do Meta Ads.",
          cta: "Saiba mais",
          creativeHint: row.adset?.name || "Criativo remoto Meta Ads",
          keywordSuggestions: [],
          impressions: Number(insight.impressions || 0),
          clicks: Number(insight.clicks || 0),
          conversions: Number(leadAction?.value || 0),
          ctr: Number(String(insight.ctr || 0).replace(",", ".")),
          cpc: Number(String(insight.cpc || 0).replace(",", ".")),
        });
      })
      : [];

    return { provider: "Meta Ads", synced: true, items, warning: items.length ? null : "Nenhum anuncio retornado no recorte." };
  } catch (error) {
    return { provider: "Meta Ads", synced: false, items: [], warning: error.message || "Falha ao sincronizar anuncios do Meta Ads." };
  }
}

export async function syncRemoteAdsItems() {
  const [googleAds, metaAds] = await Promise.all([
    fetchGoogleAdsItems(),
    fetchMetaAdsItems(),
  ]);

  const remoteItems = [...googleAds.items, ...metaAds.items];
  return {
    syncedAt: new Date().toISOString(),
    remoteItems,
    providers: [googleAds, metaAds],
    summary: remoteItems.length
      ? `${remoteItems.length} anuncio(s) remoto(s) lido(s) com sucesso.`
      : "Nenhum anuncio remoto foi importado neste momento.",
  };
}

export async function syncRemoteAdsCampaigns() {
  const [googleAds, metaAds] = await Promise.all([
    fetchGoogleAdsCampaigns(),
    fetchMetaAdsCampaigns(),
  ]);

  const remoteCampaigns = [...googleAds.items, ...metaAds.items];
  return {
    syncedAt: new Date().toISOString(),
    remoteCampaigns,
    providers: [googleAds, metaAds],
    summary: remoteCampaigns.length
      ? `${remoteCampaigns.length} campanha(s) remota(s) lida(s) com sucesso.`
      : "Nenhuma campanha remota foi importada neste momento.",
  };
}

function guessLocalObjective(remote = {}) {
  const raw = String(remote.objective || "").toUpperCase();
  if (raw.includes("REMARKETING") || raw.includes("RETARGET")) return "Remarketing";
  if (raw.includes("AWARENESS") || raw.includes("ENGAGEMENT") || raw.includes("VIDEO_VIEWS")) return "Autoridade";
  return "Captacao";
}

function mapRemoteStatus(remote = {}) {
  const status = String(remote.status || "").toUpperCase();
  if (["ENABLED", "ACTIVE", "SERVING"].includes(status)) return "Ativa";
  if (["PAUSED", "REMOVED"].includes(status)) return "Pausada";
  return "Em otimizacao";
}

function buildImportedCampaignPayload(remote = {}, userId = null) {
  const clicks = Number(remote.clicks || 0);
  const impressions = Number(remote.impressions || 0);
  const conversions = Number(remote.conversions || 0);
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;

  return {
    user_id: userId,
    name: String(remote.name || "Campanha remota").trim(),
    platform: String(remote.provider || "Ads").trim(),
    objective: guessLocalObjective(remote),
    status: mapRemoteStatus(remote),
    legal_area: null,
    audience: null,
    location: null,
    budget: Number(remote.budget || 0),
    roi: 0,
    ctr,
    cpc: Number(remote.cpc || 0),
    cpa: conversions > 0 && Number(remote.budget || 0) > 0 ? Number(remote.budget || 0) / conversions : 0,
    conversion_rate: conversionRate,
    compliance_status: "revisao",
    landing_page: null,
    metadata: {
      remoteProvider: remote.provider || null,
      remoteId: remote.remoteId || null,
      importedAt: new Date().toISOString(),
      remoteSnapshot: remote,
    },
  };
}

export async function importRemoteAdsCampaigns(userId = null) {
  const sync = await syncRemoteAdsCampaigns();
  const remoteCampaigns = Array.isArray(sync.remoteCampaigns) ? sync.remoteCampaigns : [];

  if (!remoteCampaigns.length) {
    return {
      ...sync,
      imported: [],
      created: 0,
      updated: 0,
      summary: "Nenhuma campanha remota disponivel para importar.",
    };
  }

  const existingRows = await safeAdminSelect("hmadv_market_ads_campaigns?select=*&limit=200");
  const existingCampaigns = existingRows.map(normalizeCampaign);
  const imported = [];
  let created = 0;
  let updated = 0;

  for (const remote of remoteCampaigns) {
    const match = existingCampaigns.find((campaign) => {
      const metadata = campaign.metadata || {};
      return metadata.remoteProvider === remote.provider && String(metadata.remoteId || "") === String(remote.remoteId || "");
    });

    const payload = buildImportedCampaignPayload(remote, userId);

    try {
      if (match?.id) {
        const rows = await fetchSupabaseAdmin(`hmadv_market_ads_campaigns?id=eq.${encodeURIComponent(match.id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            ...payload,
            updated_at: new Date().toISOString(),
          }),
        });
        imported.push({
          action: "updated",
          campaign: normalizeCampaign(Array.isArray(rows) ? rows[0] || {} : {}),
          remote,
        });
        updated += 1;
      } else {
        const rows = await fetchSupabaseAdmin("hmadv_market_ads_campaigns", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(payload),
        });
        imported.push({
          action: "created",
          campaign: normalizeCampaign(Array.isArray(rows) ? rows[0] || {} : {}),
          remote,
        });
        created += 1;
      }
    } catch (error) {
      imported.push({
        action: "error",
        remote,
        error: error.message || "Falha ao importar campanha remota.",
      });
    }
  }

  return {
    ...sync,
    imported,
    created,
    updated,
    summary: `${created} criada(s), ${updated} atualizada(s) e ${imported.filter((item) => item.action === "error").length} com erro na conciliacao local.`,
  };
}

export async function importRemoteAdsItems(userId = null) {
  const sync = await syncRemoteAdsItems();
  const remoteItems = Array.isArray(sync.remoteItems) ? sync.remoteItems : [];

  if (!remoteItems.length) {
    return {
      ...sync,
      imported: [],
      created: 0,
      updated: 0,
      summary: "Nenhum anuncio remoto disponivel para importar.",
    };
  }

  const [existingItemRows, campaignRows] = await Promise.all([
    safeAdminSelect("hmadv_market_ads_items?select=*&limit=300"),
    safeAdminSelect("hmadv_market_ads_campaigns?select=*&limit=300"),
  ]);
  const existingItems = existingItemRows.map(normalizeAdItem);
  const localCampaigns = campaignRows.map(normalizeCampaign);

  const imported = [];
  let created = 0;
  let updated = 0;

  for (const remote of remoteItems) {
    const matchedCampaign = localCampaigns.find((campaign) => {
      const metadata = campaign.metadata || {};
      return metadata.remoteProvider === remote.provider && String(metadata.remoteId || "") === String(remote.remoteCampaignId || "");
    });
    const existing = existingItems.find((item) => {
      const metadata = item.metadata || {};
      return metadata.remoteProvider === remote.provider && String(metadata.remoteId || "") === String(remote.remoteId || "");
    });

    const compliance = validateLegalAdCopy({
      headline: remote.headline,
      description: remote.description,
      cta: remote.cta,
    });

    const payload = {
      campaign_id: matchedCampaign?.id || null,
      user_id: userId,
      name: String(remote.name || "Anuncio remoto").trim(),
      platform: String(remote.provider || "Ads").trim(),
      status: mapRemoteStatus(remote).toLowerCase(),
      headline: String(remote.headline || "Anuncio remoto").trim(),
      description: String(remote.description || "Anuncio remoto importado.").trim(),
      cta: String(remote.cta || "Saiba como funciona").trim(),
      creative_hint: String(remote.creativeHint || "").trim() || null,
      audience: null,
      keyword_suggestions: Array.isArray(remote.keywordSuggestions) ? remote.keywordSuggestions : [],
      compliance_score: compliance.score,
      compliance_status: compliance.status,
      metadata: {
        remoteProvider: remote.provider || null,
        remoteId: remote.remoteId || null,
        remoteCampaignId: remote.remoteCampaignId || null,
        remoteCampaignName: remote.remoteCampaignName || null,
        remoteAdGroupId: remote.remoteAdGroupId || null,
        remoteAdGroupName: remote.remoteAdGroupName || null,
        performance: {
          impressions: Number(remote.impressions || 0),
          clicks: Number(remote.clicks || 0),
          conversions: Number(remote.conversions || 0),
          ctr: Number(remote.ctr || 0),
          cpc: Number(remote.cpc || 0),
        },
        importedAt: new Date().toISOString(),
        remoteSnapshot: remote,
      },
    };

    try {
      if (existing?.id) {
        const rows = await fetchSupabaseAdmin(`hmadv_market_ads_items?id=eq.${encodeURIComponent(existing.id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            ...payload,
            updated_at: new Date().toISOString(),
          }),
        });
        imported.push({
          action: "updated",
          adItem: normalizeAdItem(Array.isArray(rows) ? rows[0] || {} : {}),
          remote,
        });
        updated += 1;
      } else {
        const rows = await fetchSupabaseAdmin("hmadv_market_ads_items", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(payload),
        });
        imported.push({
          action: "created",
          adItem: normalizeAdItem(Array.isArray(rows) ? rows[0] || {} : {}),
          remote,
        });
        created += 1;
      }
    } catch (error) {
      imported.push({
        action: "error",
        remote,
        error: error.message || "Falha ao importar anuncio remoto.",
      });
    }
  }

  return {
    ...sync,
    imported,
    created,
    updated,
    summary: `${created} anuncio(s) criado(s), ${updated} atualizado(s) e ${imported.filter((item) => item.action === "error").length} com erro.`,
  };
}

export function recommendLandingPage(input = {}) {
  const area = normalizeArea(input.legalArea || input.area);
  const objective = String(input.objective || "Captacao").trim();

  const ranked = LANDING_PAGES
    .map((page) => {
      let score = Number(page.fitScore || 0);
      if ((page.areas || []).some((item) => normalizeArea(item).includes(area) || area.includes(normalizeArea(item)))) {
        score += 12;
      }
      if ((page.objectiveFit || []).includes(objective)) {
        score += 10;
      }
      if (page.slug === "/agendamento" && objective === "Captacao") score += 6;
      if (page.slug === "/blog" && objective === "Remarketing") score += 4;
      return { ...page, recommendedScore: score };
    })
    .sort((a, b) => b.recommendedScore - a.recommendedScore);

  const best = ranked[0] || null;
  return {
    best,
    ranked,
    rationale: best
      ? `Melhor destino atual: ${best.slug}, combinando aderencia a ${objective.toLowerCase()} e repertorio da area juridica.`
      : "Nenhum destino recomendado encontrado.",
  };
}

export function validateLegalAdCopy(input = {}) {
  const headline = String(input.headline || "").trim();
  const description = String(input.description || "").trim();
  const cta = String(input.cta || "").trim();
  const text = [headline, description, cta].filter(Boolean).join(" | ");

  const violations = [];

  COMPLIANCE_RULES.forEach((rule) => {
    if (!rule.patterns.length) return;
    rule.patterns.forEach((pattern) => {
      if (pattern.test(text)) {
        violations.push({
          ruleId: rule.id,
          label: rule.label,
          severity: rule.severity,
          offendingPattern: pattern.toString(),
          message: rule.description,
        });
      }
    });
  });

  let rewrittenText = text;
  REWRITE_SUGGESTIONS.forEach((item) => {
    rewrittenText = rewrittenText.replace(item.pattern, item.replacement);
  });

  const score = Math.max(0, 100 - (violations.length * 24));
  const tone = complianceToneFromScore(score);

  return {
    status: tone,
    score,
    approved: tone === "aprovado",
    violations,
    revisedCopy: rewrittenText,
    guidance: violations.length
      ? "Reescreva o anuncio com foco informativo, sem promessa de resultado e com CTA discreto."
      : "Copy aprovada para prosseguir com variacoes A/B e revisao humana final.",
  };
}

export function generateLegalAdVariant(input = {}) {
  const area = String(input.area || "Direito do Consumidor").trim();
  const audience = String(input.audience || "Pessoa fisica").trim();
  const objective = String(input.objective || "Captacao").trim();
  const platform = String(input.platform || "Google Ads").trim();
  const location = String(input.location || "Brasil").trim();

  const headlineBase = {
    Captacao: `Entenda seus direitos em ${area.toLowerCase()}`,
    Autoridade: `Guia juridico sobre ${area.toLowerCase()} para ${audience.toLowerCase()}`,
    Remarketing: `Retome a avaliacao juridica do seu caso em ${area.toLowerCase()}`,
  };

  const descriptionBase = {
    Captacao: `Conteudo informativo para ${audience.toLowerCase()} em ${location}, com orientacao tecnica e linguagem discreta.`,
    Autoridade: `Explicacao objetiva sobre cenarios, riscos e proximos passos em ${area.toLowerCase()}.`,
    Remarketing: "Veja criterios de analise e documentos que ajudam a organizar uma consulta juridica bem preparada.",
  };

  const ctaBase = {
    Captacao: "Saiba como funciona",
    Autoridade: "Ler orientacoes",
    Remarketing: "Retomar analise",
  };

  const creativeHint = platform === "Google Ads"
    ? "Usar extensoes de sitelink, destaque para FAQ e pagina enxuta com foco no problema juridico."
    : "Criativo estatico com tipografia forte, tom institucional e chamada educativa em primeiro plano.";

  const headlines = [
    headlineBase[objective] || headlineBase.Captacao,
    `${area}: orientacao juridica clara para ${audience.toLowerCase()}`,
    `Quando buscar apoio em ${area.toLowerCase()}?`,
  ];

  const descriptions = [
    descriptionBase[objective] || descriptionBase.Captacao,
    "Abordagem etica, informativa e alinhada ao Provimento 205/2021.",
  ];

  const ctas = [
    ctaBase[objective] || ctaBase.Captacao,
    "Conhecer orientacoes",
  ];

  const compliance = validateLegalAdCopy({
    headline: headlines[0],
    description: descriptions[0],
    cta: ctas[0],
  });

  return {
    area,
    audience,
    objective,
    platform,
    location,
    headlines,
    descriptions,
    ctas,
    creativeHint,
    audienceSuggestion: `${audience} com interesse em ${area.toLowerCase()} na regiao ${location}`,
    keywordSuggestions: platform === "Google Ads"
      ? [
          `${area.toLowerCase()} advogado`,
          `${area.toLowerCase()} direitos`,
          `${area.toLowerCase()} orientacao juridica`,
        ]
      : [],
    compliance,
  };
}

export function generateVariantFromCreativeWinner(input = {}) {
  const source = input.source && typeof input.source === "object" ? input.source : {};
  const objective = String(input.objective || source.objective || "Captacao").trim();
  const platform = String(input.platform || source.platform || "Google Ads").trim();
  const area = String(input.area || source.area || "Direito do Consumidor").trim();
  const audience = String(input.audience || source.audience || "Pessoa fisica").trim();
  const location = String(input.location || "Brasil").trim();
  const inspirationHeadline = String(source.headline || source.name || "").trim();

  const base = generateLegalAdVariant({
    area,
    audience,
    objective,
    platform,
    location,
  });

  const inspiredHeadlines = [
    inspirationHeadline ? `${inspirationHeadline} com orientacao tecnica` : "",
    `Nova variacao sobre ${area.toLowerCase()} com foco em clareza juridica`,
    `Abordagem validada para ${audience.toLowerCase()} em ${area.toLowerCase()}`,
  ].filter(Boolean);

  const compliance = validateLegalAdCopy({
    headline: inspiredHeadlines[0] || base.headlines[0],
    description: base.descriptions[0],
    cta: base.ctas[0],
  });

  return {
    ...base,
    inspiration: {
      source: source.source || "manual",
      headline: inspirationHeadline || null,
      score: Number(source.score || 0),
      recommendation: source.recommendation || null,
    },
    headlines: inspiredHeadlines.concat(base.headlines).slice(0, 3),
    descriptions: [
      `Variacao derivada de criativo vencedor com foco informativo e sobrio para ${area.toLowerCase()}.`,
      ...base.descriptions,
    ].slice(0, 2),
    ctas: base.ctas,
    compliance,
  };
}

export function generateVariantFromTemplate(input = {}) {
  const template = input.template && typeof input.template === "object" ? input.template : {};
  const area = String(input.area || template.area || "Direito do Consumidor").trim();
  const audience = String(input.audience || template.audience || "Pessoa fisica").trim();
  const objective = String(input.objective || template.objective || "Captacao").trim();
  const platform = String(input.platform || template.platform || "Google Ads").trim();
  const location = String(input.location || "Brasil").trim();

  const base = generateLegalAdVariant({
    area,
    audience,
    objective,
    platform,
    location,
  });

  const hook = String(template.structure?.hook || template.headline || "").trim();
  const cta = String(template.structure?.cta || base.ctas?.[0] || "Saiba como funciona").trim();
  const compliance = validateLegalAdCopy({
    headline: hook || base.headlines[0],
    description: base.descriptions[0],
    cta,
  });

  return {
    ...base,
    template: {
      id: template.id || null,
      name: template.name || null,
      source: template.source || "template",
      score: Number(template.score || 0),
      tags: Array.isArray(template.tags) ? template.tags : [],
    },
    headlines: [
      hook ? `${hook}` : "",
      `Modelo validado para ${area.toLowerCase()} com foco em ${objective.toLowerCase()}`,
      ...base.headlines,
    ].filter(Boolean).slice(0, 3),
    descriptions: [
      `Template reaproveitado com linguagem informativa e aderencia ao contexto juridico de ${area.toLowerCase()}.`,
      ...base.descriptions,
    ].slice(0, 2),
    ctas: [cta, ...(base.ctas || [])].filter(Boolean).slice(0, 2),
    compliance,
  };
}

export function getMarketAdsDashboard() {
  const competitorHighlights = [...COMPETITOR_ADS].sort((a, b) => b.estimatedCtr - a.estimatedCtr);
  const campaigns = [...ACTIVE_CAMPAIGNS];
  const overview = computeOverview(campaigns);

  return {
    overview,
    pillars: [
      { id: "intel", title: "Inteligencia competitiva", helper: "SERP, Meta Ads Library e classificacao por dor, copy e criativo." },
      { id: "winner", title: "Analise de vencedores", helper: "Banco de templates, gatilhos permitidos e recortes por ticket, regiao e ICP." },
      { id: "generator", title: "Gerador juridico com IA", helper: "Titulos, descricoes, CTA, criativo e variacoes A/B com trava etica." },
      { id: "landing", title: "Landing pages conectadas", helper: "Sugestao de pagina destino, ajustes UX e criacao assistida por campanha." },
      { id: "sync", title: "Gestao omnichannel", helper: "Google Ads e Meta Ads centralizados com leitura de status, verba e ROI." },
      { id: "ab", title: "Teste A/B e otimizacao", helper: "Variacoes automatizadas, leitura de vencedor e recomendacao de escala." },
      { id: "metrics", title: "Metricas executivas", helper: "CTR, CPC, CPA, conversao, ROI e alertas inteligentes de saturacao." },
    ],
    competitorAds: competitorHighlights,
    campaigns,
    abTests: AB_TESTS,
    landingPages: LANDING_PAGES,
    strategyNotes: STRATEGY_NOTES,
    alerts: buildAlerts(campaigns),
    complianceRules: COMPLIANCE_RULES.map((item) => ({
      id: item.id,
      label: item.label,
      description: item.description,
      severity: item.severity,
    })),
    queue: [
      { id: "q-001", item: "Anuncio de consumidor com CTA agressivo", status: "Revisar", owner: "Compliance IA" },
      { id: "q-002", item: "Novo benchmark Meta Ads | Trabalhista", status: "Classificar", owner: "Inteligencia" },
      { id: "q-003", item: "Landing de superendividamento para mobile", status: "Ajuste UX", owner: "Growth" },
    ],
    architecture: {
      backend: ["Next.js API", "Supabase/PostgreSQL", "Workers para scraping e sync", "Fila assincrona para ingestao e score"],
      integrations: ["Google Ads API", "Meta Marketing API", "GA4", "Tag Manager", "LLM para geracao assistida"],
      safeguards: ["Filtro OAB automatizado", "LGPD by design", "Logs de auditoria", "Fallback para revisao humana"],
    },
    generatedSeed: generateLegalAdVariant({
      area: "Superendividamento",
      audience: "Pessoa fisica",
      objective: "Captacao",
      platform: "Google Ads",
      location: "Sao Paulo",
    }),
  };
}

export async function getMarketAdsDashboardData() {
  const [draftRows, campaignRows, complianceRows, adRows, abRows, templateRows, templateUsageRows, attributionRows, integrations] = await Promise.all([
    safeAdminSelect("hmadv_market_ads_drafts?select=*&order=created_at.desc&limit=6"),
    safeAdminSelect("hmadv_market_ads_campaigns?select=*&order=created_at.desc&limit=6"),
    safeAdminSelect("hmadv_market_ads_compliance_logs?select=*&order=created_at.desc&limit=6"),
    safeAdminSelect("hmadv_market_ads_items?select=*&order=created_at.desc&limit=12"),
    safeAdminSelect("hmadv_market_ads_ab_tests?select=*&order=created_at.desc&limit=12"),
    safeAdminSelect("hmadv_market_ads_templates?select=*&order=is_favorite.desc,created_at.desc&limit=24"),
    safeAdminSelect("hmadv_market_ads_template_usage?select=*&order=created_at.desc&limit=50"),
    safeAdminSelect("hmadv_market_ads_attributions?select=*&order=created_at.desc&limit=50"),
    inspectAdsIntegrations(),
  ]);

  const base = getMarketAdsDashboard();
  const persistedCampaigns = campaignRows.map(normalizeCampaign).filter((item) => item.name);
  const persistedDrafts = draftRows.map(normalizeDraft).filter((item) => item.title);
  const adItems = adRows.map(normalizeAdItem).filter((item) => item.name);
  const abTests = abRows.map(normalizeAbTest).filter((item) => item.hypothesis);
  const persistedTemplates = templateRows.map(normalizeTemplate).filter((item) => item.name);
  const complianceLog = complianceRows.map((row) => ({
    id: row.id,
    status: row.compliance_status,
    score: row.compliance_score,
    approved: row.approved,
    headline: row.headline,
    createdAt: row.created_at,
  }));

  const effectiveCampaigns = (persistedCampaigns.length ? persistedCampaigns : base.campaigns).map(enrichCampaign);
  const normalizedAttributions = attributionRows.map(normalizeAttribution);
  const fallbackFunnel = await buildFunnelOverview(effectiveCampaigns);
  const creativeRanking = buildCreativeWinners(adItems, base.competitorAds || []);
  const templateLibrary = enrichTemplateLibraryWithUsage(
    mergeTemplateLibraries(buildTemplateLibrary(creativeRanking), persistedTemplates),
    templateUsageRows,
  );
  const templateAnalytics = buildTemplateOfficeAnalytics(templateLibrary);
  const attributionAnalytics = buildAttributionAnalytics(normalizedAttributions, effectiveCampaigns, adItems, templateLibrary.templates || []);
  const funnel = attributionAnalytics.total
    ? {
      source: "attribution",
      totals: {
        leads: attributionAnalytics.stages.find((item) => item.id === "lead")?.value || 0,
        qualified: attributionAnalytics.stages.find((item) => item.id === "qualificado")?.value || 0,
        meetings: attributionAnalytics.stages.find((item) => item.id === "atendimento")?.value || 0,
        clients: attributionAnalytics.stages.find((item) => item.id === "cliente")?.value || 0,
      },
      stages: attributionAnalytics.stages,
      insights: [
        "Funil priorizando atribuicoes reais registradas no modulo.",
        attributionAnalytics.byCampaign.length
          ? `Campanha lider atual: ${attributionAnalytics.byCampaign[0].name}.`
          : "Registre campanha/anuncio nos proximos leads para enriquecer atribuicao.",
      ],
      recentLeads: attributionAnalytics.recent.map((item) => ({
        id: item.id,
        name: item.leadName || item.leadEmail || "Lead atribuido",
        email: item.leadEmail,
        subject: `${item.source} · ${item.stage}`,
        status: item.stage,
        priority: item.medium || "utm",
      })),
    }
    : fallbackFunnel;
  return {
    ...base,
    overview: computeOverview(effectiveCampaigns),
    campaigns: effectiveCampaigns,
    adItems,
    abTests: abTests.length ? abTests : base.abTests,
    drafts: persistedDrafts,
    complianceLog,
    integrations,
    strategyQueue: buildStrategyQueue(effectiveCampaigns),
    optimizationPlan: buildOptimizationPlan(effectiveCampaigns),
    funnel,
    creativeRanking,
    templateLibrary,
    templateAnalytics,
    attributions: normalizedAttributions,
    attributionAnalytics,
  };
}

export async function generateMarketAdsOptimizations() {
  const data = await getMarketAdsDashboardData();
  return buildOptimizationPlan(data.campaigns || []);
}

export async function applyMarketAdsOptimizations() {
  const plan = await generateMarketAdsOptimizations();
  const persistedRows = await safeAdminSelect("hmadv_market_ads_campaigns?select=*&limit=200");
  const persistedCampaigns = persistedRows.map(normalizeCampaign);
  const applied = [];
  let updated = 0;
  let skipped = 0;

  for (const recommendation of plan.recommendations || []) {
    const campaign = persistedCampaigns.find((item) => item.id === recommendation.campaignId);
    if (!campaign?.id) {
      applied.push({
        campaignId: recommendation.campaignId,
        campaignName: recommendation.campaignName,
        action: "skipped",
        reason: "Campanha ainda nao persistida na base local.",
      });
      skipped += 1;
      continue;
    }

    const nextMetadata = {
      ...(campaign.metadata && typeof campaign.metadata === "object" ? campaign.metadata : {}),
      optimization: {
        decision: recommendation.decision,
        suggestedStatus: recommendation.suggestedStatus,
        reason: recommendation.reason,
        impact: recommendation.impact,
        appliedAt: new Date().toISOString(),
        mode: "safe-status-only",
      },
    };

    try {
      await updateMarketAdsCampaign(campaign.id, {
        ...campaign,
        status: recommendation.suggestedStatus,
        metadata: nextMetadata,
      });
      applied.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        action: "updated",
        status: recommendation.suggestedStatus,
        decision: recommendation.decision,
      });
      updated += 1;
    } catch (error) {
      applied.push({
        campaignId: campaign.id,
        campaignName: campaign.name,
        action: "error",
        reason: error.message || "Falha ao aplicar recomendacao.",
      });
    }
  }

  return {
    appliedAt: new Date().toISOString(),
    updated,
    skipped,
    errors: applied.filter((item) => item.action === "error").length,
    applied,
    narrative: `${updated} campanha(s) atualizada(s), ${skipped} ignorada(s) e ${applied.filter((item) => item.action === "error").length} com erro.`,
    plan,
  };
}

export async function saveMarketAdsTemplate(input = {}, userId = null) {
  const payload = {
    user_id: userId,
    name: String(input.name || "Template vencedor").trim(),
    source: String(input.source || "library").trim(),
    platform: String(input.platform || "Google Ads").trim(),
    legal_area: String(input.area || input.legalArea || "").trim() || null,
    audience: String(input.audience || "").trim() || null,
    objective: String(input.objective || "Captacao").trim(),
    headline: String(input.headline || "").trim() || "Template juridico",
    compliance_status: String(input.complianceStatus || "revisao").trim(),
    score: Number(input.score || 0),
    structure: input.structure && typeof input.structure === "object" ? input.structure : {},
    tags: Array.isArray(input.tags) ? input.tags : [],
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    is_favorite: Boolean(input.isFavorite),
    visibility: String(input.visibility || "privado").trim(),
    edit_scope: String(input.editScope || "admins").trim().toLowerCase() === "autor" ? "autor" : "admins",
  };

  const rows = await fetchSupabaseAdmin("hmadv_market_ads_templates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return { template: normalizeTemplate(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
}

async function loadTemplateById(templateId) {
  const id = String(templateId || "").trim();
  if (!id) return null;
  const rows = await safeAdminSelect(`hmadv_market_ads_templates?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return normalizeTemplate(Array.isArray(rows) ? rows[0] || {} : {});
}

function assertTemplatePermission(template = {}, actorUserId = null) {
  if (!template?.id) {
    throw new Error("Template nao encontrado.");
  }
  if (template.editScope === "autor" && template.userId && actorUserId && template.userId !== actorUserId) {
    throw new Error("Template bloqueado para edicao fora do autor responsavel.");
  }
}

export async function toggleMarketAdsTemplateFavorite(templateId, isFavorite = true, actorUserId = null) {
  const id = String(templateId || "").trim();
  if (!id) {
    throw new Error("templateId obrigatorio para favoritar template.");
  }
  const template = await loadTemplateById(id);
  assertTemplatePermission(template, actorUserId);

  const rows = await fetchSupabaseAdmin(`hmadv_market_ads_templates?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      is_favorite: Boolean(isFavorite),
      updated_at: new Date().toISOString(),
    }),
  });

  return { template: normalizeTemplate(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
}

export async function updateMarketAdsTemplateVisibility(templateId, visibility = "privado", actorUserId = null) {
  const id = String(templateId || "").trim();
  if (!id) {
    throw new Error("templateId obrigatorio para atualizar visibilidade.");
  }
  const template = await loadTemplateById(id);
  assertTemplatePermission(template, actorUserId);

  const nextVisibility = String(visibility || "privado").trim().toLowerCase() === "publico" ? "publico" : "privado";
  const rows = await fetchSupabaseAdmin(`hmadv_market_ads_templates?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      visibility: nextVisibility,
      updated_at: new Date().toISOString(),
    }),
  });

  return { template: normalizeTemplate(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
}

export async function updateMarketAdsTemplateEditScope(templateId, editScope = "admins", actorUserId = null) {
  const id = String(templateId || "").trim();
  if (!id) {
    throw new Error("templateId obrigatorio para atualizar escopo de edicao.");
  }
  const template = await loadTemplateById(id);
  assertTemplatePermission(template, actorUserId);

  const nextEditScope = String(editScope || "admins").trim().toLowerCase() === "autor" ? "autor" : "admins";
  const rows = await fetchSupabaseAdmin(`hmadv_market_ads_templates?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      edit_scope: nextEditScope,
      updated_at: new Date().toISOString(),
    }),
  });

  return { template: normalizeTemplate(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
}

export async function trackMarketAdsTemplateUsage(input = {}, userId = null) {
  const payload = {
    template_id: String(input.templateId || "").trim() || null,
    user_id: userId,
    campaign_id: String(input.campaignId || "").trim() || null,
    usage_type: String(input.usageType || "generator").trim(),
    context: input.context && typeof input.context === "object" ? input.context : {},
  };

  const rows = await fetchSupabaseAdmin("hmadv_market_ads_template_usage", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return { usage: normalizeTemplateUsage(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
}

export async function saveMarketAdsAttribution(input = {}, userId = null) {
  const payload = {
    user_id: userId,
    campaign_id: String(input.campaignId || "").trim() || null,
    ad_item_id: String(input.adItemId || "").trim() || null,
    template_id: String(input.templateId || "").trim() || null,
    lead_name: String(input.leadName || "").trim() || null,
    lead_email: String(input.leadEmail || "").trim() || null,
    lead_phone: String(input.leadPhone || "").trim() || null,
    stage: String(input.stage || "lead").trim(),
    source: String(input.source || "google").trim(),
    medium: String(input.medium || "").trim() || null,
    campaign_utm: String(input.campaignUtm || "").trim() || null,
    content_utm: String(input.contentUtm || "").trim() || null,
    term_utm: String(input.termUtm || "").trim() || null,
    value: Number(input.value || 0),
    notes: String(input.notes || "").trim() || null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };

  const rows = await fetchSupabaseAdmin("hmadv_market_ads_attributions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return { attribution: normalizeAttribution(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
}

export async function updateMarketAdsAttribution(attributionId, input = {}) {
  const id = String(attributionId || "").trim();
  if (!id) {
    throw new Error("attributionId obrigatorio para atualizar atribuicao.");
  }

  const payload = {
    campaign_id: String(input.campaignId || "").trim() || null,
    ad_item_id: String(input.adItemId || "").trim() || null,
    template_id: String(input.templateId || "").trim() || null,
    lead_name: String(input.leadName || "").trim() || null,
    lead_email: String(input.leadEmail || "").trim() || null,
    lead_phone: String(input.leadPhone || "").trim() || null,
    stage: String(input.stage || "lead").trim(),
    source: String(input.source || "google").trim(),
    medium: String(input.medium || "").trim() || null,
    campaign_utm: String(input.campaignUtm || "").trim() || null,
    content_utm: String(input.contentUtm || "").trim() || null,
    term_utm: String(input.termUtm || "").trim() || null,
    value: Number(input.value || 0),
    notes: String(input.notes || "").trim() || null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    updated_at: new Date().toISOString(),
  };

  const rows = await fetchSupabaseAdmin(`hmadv_market_ads_attributions?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  return { attribution: normalizeAttribution(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
}

export async function saveMarketAdsDraft(input = {}, userId = null) {
  const preview = generateLegalAdVariant(input);
  const payload = {
    user_id: userId,
    title: `${preview.area} | ${preview.platform} | ${preview.objective}`,
    platform: preview.platform,
    legal_area: preview.area,
    audience: preview.audience,
    objective: preview.objective,
    location: preview.location,
    headline: preview.headlines[0],
    description: preview.descriptions[0],
    cta: preview.ctas[0],
    creative_hint: preview.creativeHint,
    audience_suggestion: preview.audienceSuggestion,
    keyword_suggestions: preview.keywordSuggestions,
    compliance_score: preview.compliance?.score || 0,
    compliance_status: preview.compliance?.status || "revisao",
    compliance_payload: preview.compliance || {},
    source: "generator",
  };

  try {
    const rows = await fetchSupabaseAdmin("hmadv_market_ads_drafts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });

    return {
      draft: normalizeDraft(Array.isArray(rows) ? rows[0] || {} : {}),
      preview,
      persisted: true,
    };
  } catch (error) {
    return {
      draft: {
        id: `draft-fallback-${Date.now()}`,
        title: payload.title,
        platform: payload.platform,
        legalArea: payload.legal_area,
        audience: payload.audience,
        objective: payload.objective,
        location: payload.location,
        headline: payload.headline,
        description: payload.description,
        cta: payload.cta,
        complianceScore: payload.compliance_score,
        complianceStatus: payload.compliance_status,
      },
      preview,
      persisted: false,
      warning: error.message || "Nao foi possivel persistir o draft no banco.",
    };
  }
}

export async function saveMarketAdsCampaign(input = {}, userId = null) {
  const payload = {
    user_id: userId,
    name: String(input.name || "").trim() || "Campanha juridica",
    platform: String(input.platform || "Google Ads").trim(),
    objective: String(input.objective || "Captacao").trim(),
    status: String(input.status || "Draft").trim(),
    legal_area: String(input.legalArea || input.area || "").trim() || null,
    audience: String(input.audience || "").trim() || null,
    location: String(input.location || "").trim() || null,
    budget: Number(input.budget || 0),
    roi: Number(input.roi || 0),
    ctr: Number(input.ctr || 0),
    cpc: Number(input.cpc || 0),
    cpa: Number(input.cpa || 0),
    conversion_rate: Number(input.conversionRate || 0),
    compliance_status: String(input.complianceStatus || "revisao").trim(),
    landing_page: String(input.landingPage || "").trim() || null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };

  try {
    const rows = await fetchSupabaseAdmin("hmadv_market_ads_campaigns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    return { campaign: normalizeCampaign(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
  } catch (error) {
    return {
      campaign: {
        id: `campaign-fallback-${Date.now()}`,
        name: payload.name,
        platform: payload.platform,
        objective: payload.objective,
        status: payload.status,
        budget: payload.budget,
        roi: payload.roi,
        ctr: payload.ctr,
        cpc: payload.cpc,
        cpa: payload.cpa,
        conversionRate: payload.conversion_rate,
        complianceStatus: payload.compliance_status,
        landingPage: payload.landing_page,
      },
      persisted: false,
      warning: error.message || "Nao foi possivel persistir a campanha no banco.",
    };
  }
}

export async function updateMarketAdsCampaign(campaignId, input = {}) {
  const id = String(campaignId || "").trim();
  if (!id) {
    throw new Error("campaignId obrigatorio para atualizar a campanha.");
  }

  const payload = {
    name: String(input.name || "").trim() || "Campanha juridica",
    platform: String(input.platform || "Google Ads").trim(),
    objective: String(input.objective || "Captacao").trim(),
    status: String(input.status || "Draft").trim(),
    legal_area: String(input.legalArea || input.area || "").trim() || null,
    audience: String(input.audience || "").trim() || null,
    location: String(input.location || "").trim() || null,
    budget: Number(input.budget || 0),
    roi: Number(input.roi || 0),
    ctr: Number(input.ctr || 0),
    cpc: Number(input.cpc || 0),
    cpa: Number(input.cpa || 0),
    conversion_rate: Number(input.conversionRate || 0),
    compliance_status: String(input.complianceStatus || "revisao").trim(),
    landing_page: String(input.landingPage || "").trim() || null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    updated_at: new Date().toISOString(),
  };

  try {
    const rows = await fetchSupabaseAdmin(`hmadv_market_ads_campaigns?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    return { campaign: normalizeCampaign(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
  } catch (error) {
    return {
      campaign: {
        id,
        name: payload.name,
        platform: payload.platform,
        objective: payload.objective,
        status: payload.status,
        budget: payload.budget,
        roi: payload.roi,
        ctr: payload.ctr,
        cpc: payload.cpc,
        cpa: payload.cpa,
        conversionRate: payload.conversion_rate,
        complianceStatus: payload.compliance_status,
        landingPage: payload.landing_page,
      },
      persisted: false,
      warning: error.message || "Nao foi possivel atualizar a campanha no banco.",
    };
  }
}

export async function persistComplianceValidation(input = {}, userId = null, draftId = null) {
  const result = validateLegalAdCopy(input);
  const payload = {
    user_id: userId,
    draft_id: draftId,
    headline: input.headline || null,
    description: input.description || null,
    cta: input.cta || null,
    compliance_score: result.score,
    compliance_status: result.status,
    approved: result.approved,
    violations: result.violations,
    revised_copy: result.revisedCopy,
    guidance: result.guidance,
  };

  try {
    await fetchSupabaseAdmin("hmadv_market_ads_compliance_logs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(payload),
    });
    return { ...result, persisted: true };
  } catch (error) {
    return { ...result, persisted: false, warning: error.message || "Nao foi possivel registrar o log de compliance." };
  }
}

export async function saveMarketAdsItem(input = {}, userId = null) {
  const compliance = validateLegalAdCopy(input);
  const payload = {
    campaign_id: String(input.campaignId || "").trim() || null,
    user_id: userId,
    name: String(input.name || "").trim() || "Anuncio juridico",
    platform: String(input.platform || "Google Ads").trim(),
    status: String(input.status || "draft").trim(),
    headline: String(input.headline || "").trim() || "Headline juridica",
    description: String(input.description || "").trim() || "Descricao juridica",
    cta: String(input.cta || "").trim() || "Saiba como funciona",
    creative_hint: String(input.creativeHint || "").trim() || null,
    audience: String(input.audience || "").trim() || null,
    keyword_suggestions: Array.isArray(input.keywordSuggestions) ? input.keywordSuggestions : [],
    compliance_score: compliance.score,
    compliance_status: compliance.status,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };

  try {
    const rows = await fetchSupabaseAdmin("hmadv_market_ads_items", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    return { adItem: normalizeAdItem(Array.isArray(rows) ? rows[0] || {} : {}), compliance, persisted: true };
  } catch (error) {
    return {
      adItem: {
        id: `ad-fallback-${Date.now()}`,
        campaignId: payload.campaign_id,
        name: payload.name,
        platform: payload.platform,
        status: payload.status,
        headline: payload.headline,
        description: payload.description,
        cta: payload.cta,
        creativeHint: payload.creative_hint,
        audience: payload.audience,
        keywordSuggestions: payload.keyword_suggestions,
        complianceScore: payload.compliance_score,
        complianceStatus: payload.compliance_status,
      },
      compliance,
      persisted: false,
      warning: error.message || "Nao foi possivel persistir o anuncio no banco.",
    };
  }
}

export async function updateMarketAdsItem(itemId, input = {}) {
  const id = String(itemId || "").trim();
  if (!id) {
    throw new Error("itemId obrigatorio para atualizar o anuncio.");
  }
  const compliance = validateLegalAdCopy(input);
  const payload = {
    campaign_id: String(input.campaignId || "").trim() || null,
    name: String(input.name || "").trim() || "Anuncio juridico",
    platform: String(input.platform || "Google Ads").trim(),
    status: String(input.status || "draft").trim(),
    headline: String(input.headline || "").trim() || "Headline juridica",
    description: String(input.description || "").trim() || "Descricao juridica",
    cta: String(input.cta || "").trim() || "Saiba como funciona",
    creative_hint: String(input.creativeHint || "").trim() || null,
    audience: String(input.audience || "").trim() || null,
    keyword_suggestions: Array.isArray(input.keywordSuggestions) ? input.keywordSuggestions : [],
    compliance_score: compliance.score,
    compliance_status: compliance.status,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    updated_at: new Date().toISOString(),
  };

  try {
    const rows = await fetchSupabaseAdmin(`hmadv_market_ads_items?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    return { adItem: normalizeAdItem(Array.isArray(rows) ? rows[0] || {} : {}), compliance, persisted: true };
  } catch (error) {
    return {
      adItem: {
        id,
        campaignId: payload.campaign_id,
        name: payload.name,
        platform: payload.platform,
        status: payload.status,
        headline: payload.headline,
        description: payload.description,
        cta: payload.cta,
        creativeHint: payload.creative_hint,
        audience: payload.audience,
        keywordSuggestions: payload.keyword_suggestions,
        complianceScore: payload.compliance_score,
        complianceStatus: payload.compliance_status,
      },
      compliance,
      persisted: false,
      warning: error.message || "Nao foi possivel atualizar o anuncio no banco.",
    };
  }
}

export async function saveMarketAdsAbTest(input = {}, userId = null) {
  const payload = {
    campaign_id: String(input.campaignId || "").trim() || null,
    user_id: userId,
    legal_area: String(input.area || "").trim() || null,
    hypothesis: String(input.hypothesis || "").trim() || "Hipotese A/B",
    metric: String(input.metric || "CTR").trim(),
    variant_a_label: String(input.variantALabel || "Variante A").trim(),
    variant_b_label: String(input.variantBLabel || "Variante B").trim(),
    winner: String(input.winner || "").trim() || null,
    uplift: Number(input.uplift || 0),
    status: String(input.status || "draft").trim(),
    recommendation: String(input.recommendation || "").trim() || null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };

  try {
    const rows = await fetchSupabaseAdmin("hmadv_market_ads_ab_tests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    return { abTest: normalizeAbTest(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
  } catch (error) {
    return {
      abTest: {
        id: `ab-fallback-${Date.now()}`,
        campaignId: payload.campaign_id,
        area: payload.legal_area,
        hypothesis: payload.hypothesis,
        metric: payload.metric,
        variantALabel: payload.variant_a_label,
        variantBLabel: payload.variant_b_label,
        winner: payload.winner,
        uplift: payload.uplift,
        status: payload.status,
        recommendation: payload.recommendation,
      },
      persisted: false,
      warning: error.message || "Nao foi possivel persistir o teste A/B no banco.",
    };
  }
}

export async function updateMarketAdsAbTest(testId, input = {}) {
  const id = String(testId || "").trim();
  if (!id) {
    throw new Error("testId obrigatorio para atualizar o teste A/B.");
  }
  const payload = {
    campaign_id: String(input.campaignId || "").trim() || null,
    legal_area: String(input.area || "").trim() || null,
    hypothesis: String(input.hypothesis || "").trim() || "Hipotese A/B",
    metric: String(input.metric || "CTR").trim(),
    variant_a_label: String(input.variantALabel || "Variante A").trim(),
    variant_b_label: String(input.variantBLabel || "Variante B").trim(),
    winner: String(input.winner || "").trim() || null,
    uplift: Number(input.uplift || 0),
    status: String(input.status || "draft").trim(),
    recommendation: String(input.recommendation || "").trim() || null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    updated_at: new Date().toISOString(),
  };

  try {
    const rows = await fetchSupabaseAdmin(`hmadv_market_ads_ab_tests?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    });
    return { abTest: normalizeAbTest(Array.isArray(rows) ? rows[0] || {} : {}), persisted: true };
  } catch (error) {
    return {
      abTest: {
        id,
        campaignId: payload.campaign_id,
        area: payload.legal_area,
        hypothesis: payload.hypothesis,
        metric: payload.metric,
        variantALabel: payload.variant_a_label,
        variantBLabel: payload.variant_b_label,
        winner: payload.winner,
        uplift: payload.uplift,
        status: payload.status,
        recommendation: payload.recommendation,
      },
      persisted: false,
      warning: error.message || "Nao foi possivel atualizar o teste A/B no banco.",
    };
  }
}
