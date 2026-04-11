const MODULE_REGISTRY = [
  {
    key: "dashboard",
    label: "Visao geral",
    routePath: "/interno",
    category: "core",
    keywords: ["dashboard", "visao geral", "overview", "painel"],
    capabilities: ["visao_operacional", "navegacao", "auditoria_console"],
    quickMissions: [
      "Mapeie os modulos com maior risco operacional hoje.",
      "Resuma erros, filas e pendencias abertas do workspace.",
    ],
  },
  {
    key: "ai-task",
    label: "AI Task",
    routePath: "/interno/ai-task",
    category: "ai",
    keywords: ["ai task", "task run", "automacao", "orquestracao", "runid", "run id"],
    capabilities: ["task_runs", "polling", "orquestracao", "auditoria_execucao"],
    quickMissions: [
      "Audite a run atual e explique o gargalo.",
      "Monte um plano de execucao com validacao e rollback.",
    ],
  },
  {
    key: "dotobot",
    label: "Dotobot",
    routePath: "/interno",
    category: "ai",
    keywords: ["dotobot", "copilot", "copilo", "chat", "assistente"],
    capabilities: ["chat_operacional", "task_runs", "rag", "copilot_console"],
    quickMissions: [
      "Converta esta solicitacao em tarefa operacional com etapas.",
      "Explique a resposta do Dotobot e sugira o proximo passo.",
    ],
  },
  {
    key: "processos",
    label: "Processos",
    routePath: "/interno/processos",
    category: "juridico",
    keywords: ["processo", "cnj", "audiencia", "movimentacao", "datajud", "monitoramento"],
    capabilities: ["filas", "datajud", "audiencias", "monitoramento", "repair_accounts"],
    quickMissions: [
      "Analise o backlog de processos sem polos ou status.",
      "Priorize as correcoes de processos com maior impacto no CRM.",
    ],
  },
  {
    key: "publicacoes",
    label: "Publicacoes",
    routePath: "/interno/publicacoes",
    category: "juridico",
    keywords: ["publicacao", "intimacao", "diario", "dj", "parte", "backfill"],
    capabilities: ["extracao_partes", "backfill", "sincronizacao_partes", "jobs", "fila_publicacoes"],
    quickMissions: [
      "Audite os jobs de publicacoes e explique as falhas.",
      "Sugira o menor chunk seguro para backfill de partes.",
    ],
  },
  {
    key: "contacts",
    label: "Contatos",
    routePath: "/interno/contacts",
    category: "crm",
    keywords: ["contato", "cliente", "crm", "freshsales", "cpf", "cnpj", "email", "telefone"],
    capabilities: ["deduplicacao", "enriquecimento", "crm", "partes_vinculadas"],
    quickMissions: [
      "Liste os gaps de dados mais criticos na base de contatos.",
      "Sugira uma rotina segura para reconciliar contatos duplicados.",
    ],
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
    capabilities: ["deals", "reconciliacao", "runner_financeiro", "crm_events"],
    quickMissions: [
      "Resuma as pendencias financeiras e o risco de publicacao em deals.",
      "Explique qual operacao do runner financeiro deve rodar primeiro.",
    ],
  },
  {
    key: "aprovacoes",
    label: "Aprovacoes",
    routePath: "/interno/aprovacoes",
    category: "operacao",
    keywords: ["aprovacao", "cadastro", "pendencia", "solicitacao"],
    capabilities: ["fila_aprovacoes", "locks_cadastrais", "review_manual"],
    quickMissions: [
      "Priorize as aprovacoes cadastrais com maior risco.",
      "Explique o impacto de aprovar ou rejeitar a fila atual.",
    ],
  },
  {
    key: "agendamentos",
    label: "Agenda",
    routePath: "/interno/agendamentos",
    category: "operacao",
    keywords: ["agenda", "agendamento", "calendario", "reuniao"],
    capabilities: ["agenda", "zoom_sync", "crm_outcome", "detalhe_reuniao"],
    quickMissions: [
      "Resuma a agenda e destaque os agendamentos com follow-up pendente.",
      "Explique o status do sync Zoom/CRM deste agendamento.",
    ],
  },
  {
    key: "agentlab",
    label: "AgentLab",
    routePath: "/interno/agentlab",
    category: "ai",
    keywords: ["agentlab", "agente", "workflow", "knowledge", "training", "evaluation", "orquestracao"],
    capabilities: ["training", "evaluation", "knowledge", "workflows", "agent_governance"],
    quickMissions: [
      "Resuma o estado do AgentLab e os proximos experimentos.",
      "Identifique qual area do AgentLab precisa de correcao primeiro.",
    ],
  },
  {
    key: "posts",
    label: "Conteudo",
    routePath: "/interno/posts",
    category: "conteudo",
    keywords: ["post", "conteudo", "artigo", "blog"],
    capabilities: ["editorial", "rascunhos", "publicacao", "seo_basico"],
    quickMissions: [
      "Resuma o funil editorial e os posts que pedem revisao.",
      "Monte um checklist rapido para publicar este post com seguranca.",
    ],
  },
  {
    key: "leads",
    label: "Leads",
    routePath: "/interno/leads",
    category: "crm",
    keywords: ["lead", "prospect", "captacao"],
    capabilities: ["freshdesk", "triagem", "captacao", "crm"],
    quickMissions: [
      "Resuma a fila de leads e destaque urgencias.",
      "Explique quais tickets merecem triagem imediata.",
    ],
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

export function resolveModuleEntries(moduleKeys = []) {
  return Array.from(new Set(moduleKeys || []))
    .map((key) => resolveModuleRegistryEntry(key))
    .filter(Boolean);
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
    capabilities: payload.capabilities || registry?.capabilities || [],
    quickMissions: payload.quickMissions || registry?.quickMissions || [],
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

export function extractModuleKeysFromContext(moduleValue) {
  if (Array.isArray(moduleValue)) {
    return moduleValue.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(moduleValue || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
