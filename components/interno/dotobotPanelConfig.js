import { listSkills } from "../../lib/lawdesk/skill_registry.js";
import { getBrowserLocalRuntimeConfig, hasExplicitBrowserLocalRuntimeOptIn, hasPersistedBrowserLocalRuntimeConfig, shouldAutoProbeBrowserLocalRuntime } from "../../lib/lawdesk/browser-local-runtime";
import { resolvePreferredLawdeskProvider } from "../../lib/lawdesk/providers.js";

export const MODE_OPTIONS = [
  { value: "chat", label: "Chat", hint: "Conversa assistida" },
  { value: "task", label: "Tarefa", hint: "Execução em etapas" },
  { value: "analysis", label: "Análise", hint: "Raciocínio guiado" },
];

export const PROVIDER_OPTIONS = [
  { value: "gpt", label: "Nuvem principal", disabled: false },
  { value: "local", label: "LLM local", disabled: false },
  { value: "cloudflare", label: "Cloudflare Workers AI", disabled: false },
  { value: "custom", label: "Endpoint custom", disabled: false },
];

export const SKILL_OPTIONS = listSkills().map((skill) => ({
  value: skill.id,
  label: `${skill.name} · ${skill.category}`,
  disabled: false,
}));

export const LEGAL_ACTIONS = [
  { label: "Gerar peticao", prompt: "/peticao Estruture a peticao com fatos, fundamentos e pedidos." },
  { label: "Analisar processo", prompt: "/analise Faca uma leitura juridica do processo e destaque riscos." },
  { label: "Criar plano", prompt: "/plano Monte um plano de pagamento ou de negociacao em etapas." },
  { label: "Resumir docs", prompt: "/resumo Resuma os documentos e indique pontos sensiveis." },
];

export const QUICK_PROMPTS = [
  "Analise este caso e indique o proximo passo.",
  "Crie um plano operacional em etapas.",
  "Padronize a resposta deste bot em PT-BR.",
  "Resuma riscos, fatos e inferencias deste contexto.",
];

export const DOTOBOT_LAYOUT_STORAGE_PREFIX = "lawdesk_dotobot_layout";

export const MODULE_WORKSPACES = [
  { key: "processos", label: "Processos", href: "/interno/processos", helper: "Carteira processual com visão clara, acompanhamento e próximos passos." },
  { key: "publicacoes", label: "Publicações", href: "/interno/publicacoes", helper: "Atualizações jurídicas organizadas com leitura simples e ação rápida." },
  { key: "contatos", label: "Contatos", href: "/interno/contacts", helper: "Relacionamento completo com histórico, dados e contexto comercial." },
  { key: "leads", label: "Leads", href: "/interno/leads", helper: "Entrada comercial com priorização, origem e potencial de conversão." },
  { key: "agenda", label: "Agenda", href: "/interno/agendamentos", helper: "Compromissos, confirmações e preparação do atendimento." },
  { key: "conteudo", label: "Conteúdo", href: "/interno/posts", helper: "Calendário editorial para produção, revisão e publicação." },
  { key: "market_ads", label: "Market Ads", href: "/interno/market-ads", helper: "Campanhas jurídicas com posicionamento, copy e performance." },
  { key: "financeiro", label: "Financeiro", href: "/interno/financeiro", helper: "Receita, contratos e pendências financeiras em uma visão executiva." },
  { key: "aprovacoes", label: "Aprovações", href: "/interno/aprovacoes", helper: "Validações pendentes com contexto e decisão em poucos cliques." },
  { key: "jobs", label: "Jobs", href: "/interno/jobs", helper: "Automação em lote com status, fila e previsibilidade operacional." },
];

export function shouldHydrateBrowserLocalProvider({ focusedWorkspace = false, selectedProvider = "", providers = [] } = {}) {
  if (!Array.isArray(providers) || !providers.length) return false;
  if (String(selectedProvider || "").toLowerCase() === "local") {
    return hasPersistedBrowserLocalRuntimeConfig() && hasExplicitBrowserLocalRuntimeOptIn() && shouldAutoProbeBrowserLocalRuntime();
  }
  if (focusedWorkspace) return false;
  const localOption = providers.find((item) => String(item?.value || item?.id || "").toLowerCase() === "local");
  return Boolean(localOption) && hasPersistedBrowserLocalRuntimeConfig() && hasExplicitBrowserLocalRuntimeOptIn() && shouldAutoProbeBrowserLocalRuntime();
}

export function resolveWorkspaceProviderSelection({ currentProvider, defaultProvider, providers = [] }) {
  const preferred = resolvePreferredLawdeskProvider({ currentProvider, defaultProvider, providers });
  if (String(preferred || "").toLowerCase() !== "local") return preferred;
  if (hasPersistedBrowserLocalRuntimeConfig() && hasExplicitBrowserLocalRuntimeOptIn()) return preferred;
  return providers.find((item) => String(item?.value || "").toLowerCase() !== "local" && item?.disabled !== true)?.value || preferred;
}

export function normalizeWorkspaceProvider(provider, providers = []) {
  if (String(provider || "").toLowerCase() !== "local") return provider || "gpt";
  if (hasPersistedBrowserLocalRuntimeConfig() && hasExplicitBrowserLocalRuntimeOptIn() && shouldAutoProbeBrowserLocalRuntime()) {
    return provider;
  }
  return providers.find((item) => String(item?.value || "").toLowerCase() !== "local" && item?.disabled !== true)?.value || "gpt";
}

export function buildLocalStackUnavailableSummary(error) {
  const runtimeConfig = getBrowserLocalRuntimeConfig();
  const message = String(error?.message || "Runtime local indisponivel nesta sessao.");
  return {
    ok: false,
    offlineMode: false,
    runtimeBaseUrl: runtimeConfig.runtimeBaseUrl || null,
    extensionBaseUrl: runtimeConfig.extensionBaseUrl || null,
    configuredLocalModel: runtimeConfig.localModel || null,
    extensionHealth: {
      ok: false,
      endpoint: runtimeConfig.extensionBaseUrl ? `${String(runtimeConfig.extensionBaseUrl).replace(/\/+$/, "")}/health` : null,
      status: error?.status || null,
      error: message,
    },
    localProvider: {
      configured: hasPersistedBrowserLocalRuntimeConfig(),
      available: false,
      model: runtimeConfig.localModel || null,
      baseUrl: runtimeConfig.runtimeBaseUrl || null,
      auth: null,
      runtimeFamily: null,
      runtimeLabel: "Runtime local indisponivel",
      transport: null,
      transportEndpoint: null,
      reachable: false,
      diagnosticsError: message,
      inferenceFailure: null,
    },
    cloudProvider: {
      configured: false,
      available: false,
      model: null,
      offlineBlocked: false,
    },
    persistence: null,
    capabilities: {
      skills: null,
      skillList: [],
      commands: null,
      browserExtensionProfiles: null,
      persistence: null,
    },
    recommendations: [
      "Runtime local indisponivel no momento. O Copilot vai priorizar o backend publicado ate o ai-core responder novamente.",
    ],
    actions: [
      { id: "open_runtime_config", label: "Editar runtime local" },
      { id: "open_llm_test", label: "Testar LLM local" },
    ],
  };
}

export function buildProjectInsights(groups = []) {
  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    count: group.items.length,
    updatedAt: group.updatedAt,
    latestTitle: group.items[0]?.title || "Sem conversa",
  }));
}

export function inferCopilotModuleFromRoute(routePath) {
  const normalizedRoute = String(routePath || "").toLowerCase();
  return MODULE_WORKSPACES.find((item) => normalizedRoute.startsWith(item.href.toLowerCase())) || null;
}
