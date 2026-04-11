import { fetchSupabaseAdmin } from "./server.js";

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
    title: "Servico | Superendividamento",
    slug: "/servicos/superendividamento",
    fitScore: 95,
    conversionLift: "Adicionar prova tecnica e FAQ no primeiro scroll.",
  },
  {
    id: "lp-002",
    title: "Servico | Trabalhista",
    slug: "/servicos/trabalhista",
    fitScore: 89,
    conversionLift: "Melhorar distribuicao do formulario para mobile.",
  },
  {
    id: "lp-003",
    title: "Servico | Consumidor",
    slug: "/servicos/consumidor",
    fitScore: 82,
    conversionLift: "Destacar perguntas frequentes e reduzir distracoes visuais.",
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
  };
}

function normalizeAdItem(row = {}) {
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
  const [draftRows, campaignRows, complianceRows, adRows] = await Promise.all([
    safeAdminSelect("hmadv_market_ads_drafts?select=*&order=created_at.desc&limit=6"),
    safeAdminSelect("hmadv_market_ads_campaigns?select=*&order=created_at.desc&limit=6"),
    safeAdminSelect("hmadv_market_ads_compliance_logs?select=*&order=created_at.desc&limit=6"),
    safeAdminSelect("hmadv_market_ads_items?select=*&order=created_at.desc&limit=12"),
  ]);

  const base = getMarketAdsDashboard();
  const persistedCampaigns = campaignRows.map(normalizeCampaign).filter((item) => item.name);
  const persistedDrafts = draftRows.map(normalizeDraft).filter((item) => item.title);
  const adItems = adRows.map(normalizeAdItem).filter((item) => item.name);
  const complianceLog = complianceRows.map((row) => ({
    id: row.id,
    status: row.compliance_status,
    score: row.compliance_score,
    approved: row.approved,
    headline: row.headline,
    createdAt: row.created_at,
  }));

  const effectiveCampaigns = persistedCampaigns.length ? persistedCampaigns : base.campaigns;
  return {
    ...base,
    overview: computeOverview(effectiveCampaigns),
    campaigns: effectiveCampaigns,
    adItems,
    drafts: persistedDrafts,
    complianceLog,
  };
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
