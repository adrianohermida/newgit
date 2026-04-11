const MODULE_REGISTRY = [
  {
    key: "dashboard",
    label: "Visao geral",
    routePath: "/interno",
    category: "core",
    keywords: ["dashboard", "visao geral", "overview", "painel"],
  },
  {
    key: "ai-task",
    label: "AI Task",
    routePath: "/interno/ai-task",
    category: "ai",
    keywords: ["ai task", "task run", "automacao", "orquestracao", "runid", "run id"],
  },
  {
    key: "dotobot",
    label: "Dotobot",
    routePath: "/interno",
    category: "ai",
    keywords: ["dotobot", "copilot", "copilo", "chat", "assistente"],
  },
  {
    key: "processos",
    label: "Processos",
    routePath: "/interno/processos",
    category: "juridico",
    keywords: ["processo", "cnj", "audiencia", "movimentacao", "datajud", "monitoramento"],
  },
  {
    key: "publicacoes",
    label: "Publicacoes",
    routePath: "/interno/publicacoes",
    category: "juridico",
    keywords: ["publicacao", "intimacao", "diario", "dj", "parte", "backfill"],
  },
  {
    key: "contacts",
    label: "Contatos",
    routePath: "/interno/contacts",
    category: "crm",
    keywords: ["contato", "cliente", "crm", "freshsales", "cpf", "cnpj", "email", "telefone"],
  },
  {
    key: "clientes",
    label: "Clientes",
    routePath: "/interno/clientes",
    category: "crm",
    keywords: ["clientes", "carteira", "conta"],
  },
  {
    key: "financeiro",
    label: "Financeiro",
    routePath: "/interno/financeiro",
    category: "operacao",
    keywords: ["financeiro", "fatura", "boleto", "pagamento", "cobranca", "deal"],
  },
  {
    key: "aprovacoes",
    label: "Aprovacoes",
    routePath: "/interno/aprovacoes",
    category: "operacao",
    keywords: ["aprovacao", "cadastro", "pendencia", "solicitacao"],
  },
  {
    key: "agendamentos",
    label: "Agenda",
    routePath: "/interno/agendamentos",
    category: "operacao",
    keywords: ["agenda", "agendamento", "calendario", "reuniao"],
  },
  {
    key: "agentlab",
    label: "AgentLab",
    routePath: "/interno/agentlab",
    category: "ai",
    keywords: ["agentlab", "agente", "workflow", "knowledge", "training", "evaluation", "orquestracao"],
  },
  {
    key: "posts",
    label: "Conteudo",
    routePath: "/interno/posts",
    category: "conteudo",
    keywords: ["post", "conteudo", "artigo", "blog"],
  },
  {
    key: "leads",
    label: "Leads",
    routePath: "/interno/leads",
    category: "crm",
    keywords: ["lead", "prospect", "captacao"],
  },
];

const MODULE_ALIAS = {
  "/interno": "dashboard",
  "/interno/index": "dashboard",
  "/interno/ai-task": "ai-task",
  "/interno/aprovacoes": "aprovacoes",
  "/interno/contacts": "contacts",
  "/interno/clientes": "clientes",
  "/interno/financeiro": "financeiro",
  "/interno/processos": "processos",
  "/interno/publicacoes": "publicacoes",
  "/interno/posts": "posts",
  "/interno/agendamentos": "agendamentos",
  "/interno/agentlab": "agentlab",
  "/interno/leads": "leads",
};

function normalizeRoute(routePath) {
  const value = String(routePath || "").trim().toLowerCase();
  if (!value) return "";
  const exact = MODULE_ALIAS[value];
  if (exact) return exact;
  const matched = Object.entries(MODULE_ALIAS).find(([path]) => value === path || value.startsWith(`${path}/`));
  return matched?.[1] || "";
}

export function listModuleRegistryEntries() {
  return MODULE_REGISTRY.map((entry) => ({ ...entry }));
}

export function resolveModuleRegistryEntry(moduleKey) {
  return MODULE_REGISTRY.find((entry) => entry.key === moduleKey) || null;
}

export function inferModuleKeyFromPathname(pathname) {
  return normalizeRoute(pathname);
}

export function buildModuleSnapshot(moduleKey, payload = {}) {
  const registry = resolveModuleRegistryEntry(moduleKey) || null;
  const routePath = payload.routePath || registry?.routePath || null;
  return {
    moduleKey,
    moduleLabel: registry?.label || payload.moduleLabel || moduleKey,
    moduleCategory: registry?.category || payload.moduleCategory || "custom",
    routePath,
    aiTaskTag: "ai-task",
    coverage: {
      routeTracked: Boolean(routePath),
      consoleIntegrated: true,
      registryRegistered: Boolean(registry),
      ...(payload.coverage && typeof payload.coverage === "object" ? payload.coverage : {}),
    },
    ...payload,
  };
}

export function detectRelevantModulesForMission(mission) {
  const text = String(mission || "").toLowerCase();
  if (!text.trim()) return ["dashboard"];
  const matches = MODULE_REGISTRY.filter((entry) =>
    (entry.keywords || []).some((keyword) => text.includes(String(keyword).toLowerCase()))
  ).map((entry) => entry.key);
  return matches.length ? Array.from(new Set(matches)) : ["dashboard"];
}
