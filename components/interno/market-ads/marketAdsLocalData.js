export const MARKET_ADS_LOCAL_KEY = "hmadv-market-ads-local-v1";

export const initialMarketAdsLocalData = {
  overview: {
    activeCampaigns: 3,
    monthlyBudget: "R$ 6.500,00",
    averageRoi: "2.57",
    averageCtr: "3.9",
    averageCpa: "R$ 120,67",
    realRevenue: "R$ 18.450,00",
    realRoi: "2.84",
  },
  pillars: [
    { id: "pillar-1", title: "Inteligencia de concorrencia", helper: "Leitura de anuncios por area, dor, plataforma e sinais de escala." },
    { id: "pillar-2", title: "Analise de vencedores", helper: "Padroes de copy e CTA com historico de aprendizado." },
    { id: "pillar-3", title: "Gerador com IA", helper: "Cria pecas com headline, descricao, CTA e criativo sugerido." },
    { id: "pillar-4", title: "Landing pages", helper: "Sugestao de destino e ajuste de conversao por objetivo." },
    { id: "pillar-5", title: "Gestao e sync", helper: "Visao central de campanhas, ads e integracoes." },
    { id: "pillar-6", title: "Teste e otimizacao", helper: "Comparacao A/B, recomendacoes e escala controlada." },
    { id: "pillar-7", title: "Compliance OAB", helper: "Filtro preventivo com score de risco e reescrita." },
  ],
  alerts: [
    { level: "atencao", title: "CTR em queda no remarketing", message: "Revisar headline e criativo da campanha de consumidor." },
    { level: "critico", title: "CPA acima da meta", message: "A campanha trabalhista precisa rever publico e pagina." },
    { level: "info", title: "Modo local ativo", message: "O modulo esta funcionando com persistencia local no navegador." },
  ],
  competitorAds: [
    { id: "comp-1", platform: "Google Ads", area: "Superendividamento", angle: "emocional", estimatedCtr: 4.8, headline: "Entenda seus direitos em casos de superendividamento", description: "Conteudo juridico informativo com foco em reorganizacao financeira.", keyword: "superendividamento advogado", pain: "Renegociacao de dividas", placement: "Topo da SERP", repetitionScore: 81, audience: "Pessoa fisica", objective: "Captacao" },
    { id: "comp-2", platform: "Instagram Ads", area: "Trabalhista", angle: "racional", estimatedCtr: 3.9, headline: "Demissao recente? Veja quais verbas merecem revisao", description: "Post de orientacao juridica com linguagem tecnica e discreta.", keyword: "direitos demissao sem justa causa", pain: "Verbas rescisorias", placement: "Feed e stories", repetitionScore: 63, audience: "Pessoa fisica", objective: "Autoridade" },
    { id: "comp-3", platform: "Facebook Ads", area: "Consumidor", angle: "emocional", estimatedCtr: 5.2, headline: "Juros altos podem merecer revisao juridica", description: "Material informativo sobre contratos bancarios.", keyword: "revisao juros abusivos", pain: "Juros abusivos", placement: "Feed", repetitionScore: 88, audience: "Pessoa fisica", objective: "Remarketing" },
  ],
  campaigns: [
    { id: "camp-001", name: "Superendividamento | Search | SP", platform: "Google Ads", objective: "Captacao", status: "Ativa", budget: 3200, roi: 3.4, ctr: 5.6, cpc: 3.2, cpa: 84, conversionRate: 8.1, complianceStatus: "Aprovada", landingPage: "/servicos/superendividamento", healthBand: "forte", healthScore: 88, nextActions: ["Escalar variacao vencedora com controle de CPA."] },
    { id: "camp-002", name: "Trabalhista | Meta | RJ", platform: "Meta Ads", objective: "Autoridade", status: "Em otimizacao", budget: 1900, roi: 2.6, ctr: 3.7, cpc: 2.8, cpa: 112, conversionRate: 5.3, complianceStatus: "Aprovada", landingPage: "/servicos/trabalhista", healthBand: "media", healthScore: 72, nextActions: ["Trocar pagina de destino para reduzir perda no meio do funil."] },
    { id: "camp-003", name: "Consumidor | Remarketing", platform: "Meta Ads", objective: "Remarketing", status: "Alerta", budget: 1400, roi: 1.7, ctr: 2.3, cpc: 4.1, cpa: 166, conversionRate: 3.1, complianceStatus: "Revisao preventiva", landingPage: "/servicos/consumidor", healthBand: "critico", healthScore: 48, nextActions: ["Conter verba e revisar criativo saturado."] },
  ],
  adItems: [
    { id: "ad-001", campaignId: "camp-001", name: "Search | Direitos", platform: "Google Ads", status: "ativa", complianceStatus: "aprovada", headline: "Entenda seus direitos em superendividamento" },
    { id: "ad-002", campaignId: "camp-002", name: "Meta | Verbas", platform: "Meta Ads", status: "teste", complianceStatus: "aprovada", headline: "Veja quais verbas podem merecer revisao" },
  ],
  abTests: [
    { id: "ab-001", campaignId: "camp-001", area: "Superendividamento", winner: "Variante B", hypothesis: "Headline objetiva gera CTR maior", metric: "CTR", uplift: 24, recommendation: "Escalar criativo B e manter CTA informativo." },
  ],
  drafts: [],
  complianceLog: [],
  integrations: {
    summary: "Modo local sem conexao com Google Ads e Meta Ads.",
    providers: [
      { id: "google", name: "Google Ads", status: "demo", helper: "Sem runtime server publicado neste ambiente." },
      { id: "meta", name: "Meta Ads", status: "demo", helper: "Leitura remota indisponivel; usando dados locais." },
    ],
  },
  creativeRanking: {
    summary: "Ranking local com base nos criativos ja cadastrados.",
    leaders: [
      { id: "winner-1", source: "local", platform: "Google Ads", area: "Superendividamento", audience: "Pessoa fisica", objective: "Captacao", headline: "Entenda seus direitos em superendividamento", score: 91, ctr: 5.6, clicks: 142, conversions: 11, recommendation: "Replicar o angulo com nova segmentacao geolocalizada." },
    ],
  },
  templateLibrary: {
    summary: "Biblioteca local com templates demonstrativos.",
    usage: { total: 3 },
    templates: [
      { id: "tpl-001", source: "seed", area: "Superendividamento", objective: "Captacao", name: "Template | Direitos", headline: "Entenda seus direitos em superendividamento", score: 88, usageCount: 2, isFavorite: false, visibility: "privado", editScope: "autor", platform: "Google Ads", audience: "Pessoa fisica" },
    ],
    groups: [
      { key: "superendividamento-captacao", area: "Superendividamento", objective: "Captacao", items: [{ id: "tpl-001", source: "seed", name: "Template | Direitos", headline: "Entenda seus direitos em superendividamento", score: 88, usageCount: 2, isFavorite: false, visibility: "privado", editScope: "autor", platform: "Google Ads", audience: "Pessoa fisica", area: "Superendividamento", objective: "Captacao" }] },
    ],
  },
  templateAnalytics: { summary: "1 grupo com historico local." },
  attributions: [],
  attributionAnalytics: { total: 0, summary: "Sem atribuicoes persistidas no servidor.", byCampaign: [{ id: "camp-001", name: "Superendividamento | Search | SP", leads: 4, clients: 1, value: 6200 }] },
  funnel: {
    source: "local_mode",
    totals: { leads: 12, qualified: 7, meetings: 4, clients: 2 },
    stages: [
      { id: "lead", label: "Leads", value: 12, helper: "Entradas totais do modulo." },
      { id: "qualificado", label: "Qualificados", value: 7, helper: "Leads com aderencia minima." },
      { id: "atendimento", label: "Atendimento", value: 4, helper: "Casos em conversa ativa." },
      { id: "cliente", label: "Clientes", value: 2, helper: "Fechamentos registrados localmente." },
    ],
    insights: ["Modo local ativo para demonstracao operacional."],
    recentLeads: [{ id: "lead-1", name: "Lead de exemplo", email: "lead@example.com", subject: "google | lead", status: "lead", priority: "cpc" }],
  },
  leadForecast: {
    summary: "Fila local de demonstracao.",
    totals: { hot: 1, warm: 1, cold: 0, clients: 2 },
    queue: [
      { id: "forecast-1", leadName: "Lead de exemplo", temperature: "quente", score: 82, recommendation: "Contato imediato e proposta direta.", value: 6200 },
      { id: "forecast-2", leadName: "Lead trabalhista", temperature: "morno", score: 61, recommendation: "Follow-up em ate 2 horas.", value: 2900 },
    ],
  },
  architecture: {
    backend: ["Next.js pages/api no repositorio", "Pages Functions pendentes de runtime compativel"],
    integrations: ["Google Ads API", "Meta Ads API", "Supabase admin"],
    safeguards: ["Compliance OAB", "Logs administrativos", "Fallback local no navegador"],
  },
  optimizationPlan: { narrative: "Priorizar contencao de verba nas campanhas em alerta e escalar as campanhas com CPA controlado.", summary: { scale: 1, optimize: 1, review: 1 }, recommendations: [{ id: "opt-1", campaignId: "camp-003", campaignName: "Consumidor | Remarketing", decision: "revisar", suggestedStatus: "Em otimizacao", reason: "CTR em queda com CPA acima da meta.", impact: "Recuperar margem antes de ampliar verba.", clients: 0 }] },
  strategyQueue: [
    { id: "queue-1", campaignName: "Superendividamento | Search | SP", priority: "alta", healthScore: 88, attributedLeads: 4, realRoi: 2.4, owner: "Midia", clients: 1, action: "Criar campanha de fundo de funil com variacao vencedora." },
    { id: "queue-2", campaignName: "Consumidor | Remarketing", priority: "critico", healthScore: 48, attributedLeads: 1, realRoi: 0.7, owner: "Criativo", clients: 0, action: "Trocar criativo e reduzir frequencia antes de manter verba." },
  ],
  landingPages: [
    { id: "lp-001", title: "Servicos Juridicos", slug: "/servicos", recommendedScore: 95 },
    { id: "lp-002", title: "Agendamento de Consultoria", slug: "/agendamento", recommendedScore: 89 },
    { id: "lp-003", title: "Contato do Escritorio", slug: "/contato", recommendedScore: 82 },
  ],
};
