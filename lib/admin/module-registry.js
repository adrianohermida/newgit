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
    key: "llm-test",
    label: "LLM Test",
    routePath: "/llm-test",
    category: "ai",
    keywords: ["llm test", "smoke test", "provider test", "llm local", "cloudflare ai", "custom llm"],
    capabilities: ["provider_validation", "console_trace", "telemetry_review", "smoke_test"],
    quickMissions: [
      "Valide os providers disponiveis e explique qual esta pronto para uso.",
      "Audite o ultimo teste LLM e destaque falhas de configuracao.",
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
  {
    key: "portal-home",
    label: "Portal",
    routePath: "/portal",
    category: "portal",
    keywords: ["portal", "cliente", "workspace cliente", "overview portal"],
    capabilities: ["workspace_cliente", "prioridades", "cobertura_portal"],
    quickMissions: [
      "Resuma a saude geral do portal do cliente.",
      "Explique quais areas do portal ainda estao incompletas.",
    ],
  },
  {
    key: "portal-processos",
    label: "Portal Processos",
    routePath: "/portal/processos",
    category: "portal",
    keywords: ["portal processos", "carteira portal", "processo cliente"],
    capabilities: ["carteira_processual", "filtros", "cobertura_portal"],
    quickMissions: [
      "Resuma a carteira processual visivel ao cliente.",
      "Aponte processos com menor cobertura no portal.",
    ],
  },
  {
    key: "portal-processo-detalhe",
    label: "Portal Processo Detalhe",
    routePath: "/portal/processos/detalhe",
    category: "portal",
    keywords: ["detalhe processo portal", "caso cliente", "processo detalhe"],
    capabilities: ["detalhe_processo", "cobertura_processo", "documentos", "publicacoes"],
    quickMissions: [
      "Explique a cobertura deste processo no portal.",
      "Resuma pendencias de dados deste caso.",
    ],
  },
  {
    key: "portal-publicacoes",
    label: "Portal Publicacoes",
    routePath: "/portal/publicacoes",
    category: "portal",
    keywords: ["portal publicacoes", "publicacao cliente", "recorte portal"],
    capabilities: ["leitura_publicacoes", "timeline_juridica"],
    quickMissions: [
      "Resuma as publicacoes recentes do cliente.",
      "Aponte gaps de sincronizacao de publicacoes.",
    ],
  },
  {
    key: "portal-financeiro",
    label: "Portal Financeiro",
    routePath: "/portal/financeiro",
    category: "portal",
    keywords: ["portal financeiro", "faturas cliente", "cobranca portal"],
    capabilities: ["cobrancas", "assinaturas", "deals_portal"],
    quickMissions: [
      "Resuma as cobrancas visiveis para o cliente.",
      "Explique a cobertura financeira refletida no portal.",
    ],
  },
  {
    key: "portal-documentos",
    label: "Portal Documentos",
    routePath: "/portal/documentos",
    category: "portal",
    keywords: ["portal documentos", "estante documental", "arquivo cliente"],
    capabilities: ["estante_documental", "categorias", "timeline_documentos"],
    quickMissions: [
      "Resuma a estante documental do cliente.",
      "Aponte categorias sem documentos disponiveis.",
    ],
  },
  {
    key: "portal-consultas",
    label: "Portal Consultas",
    routePath: "/portal/consultas",
    category: "portal",
    keywords: ["portal consultas", "agendamento cliente", "consulta portal"],
    capabilities: ["agenda_cliente", "historico_consultas", "proximos_passos"],
    quickMissions: [
      "Resuma a agenda de consultas do cliente.",
      "Aponte consultas futuras que merecem atencao.",
    ],
  },
  {
    key: "portal-tickets",
    label: "Portal Tickets",
    routePath: "/portal/tickets",
    category: "portal",
    keywords: ["portal tickets", "solicitacao cliente", "suporte portal"],
    capabilities: ["atendimento", "tickets", "followup_cliente"],
    quickMissions: [
      "Resuma o atendimento aberto do cliente.",
      "Aponte tickets novos ou pendentes no portal.",
    ],
  },
  {
    key: "portal-perfil",
    label: "Portal Perfil",
    routePath: "/portal/perfil",
    category: "portal",
    keywords: ["portal perfil", "cadastro cliente", "perfil portal"],
    capabilities: ["cadastro_cliente", "alteracao_cadastral", "aprovacao_cadastro"],
    quickMissions: [
      "Explique o estado atual do cadastro do cliente.",
      "Aponte o que ainda depende de aprovacao interna.",
    ],
  },
  {
    key: "portal-onboarding",
    label: "Portal Onboarding",
    routePath: "/portal/onboarding",
    category: "portal",
    keywords: ["portal onboarding", "ativacao portal", "concluir cadastro"],
    capabilities: ["ativacao_cliente", "consentimento", "cadastro_minimo"],
    quickMissions: [
      "Explique o progresso de ativacao do portal.",
      "Aponte o campo que bloqueia a conclusao do onboarding.",
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
  "/llm-test": "llm-test",
  "/interno/leads": "leads",
  "/portal": "portal-home",
  "/portal/index": "portal-home",
  "/portal/processos": "portal-processos",
  "/portal/processos/detalhe": "portal-processo-detalhe",
  "/portal/publicacoes": "portal-publicacoes",
  "/portal/financeiro": "portal-financeiro",
  "/portal/documentos": "portal-documentos",
  "/portal/consultas": "portal-consultas",
  "/portal/tickets": "portal-tickets",
  "/portal/perfil": "portal-perfil",
  "/portal/onboarding": "portal-onboarding",
};

function normalizeRoute(routePath) {
  const value = String(routePath || "").trim().toLowerCase();
  if (!value) return "";
  const exact = MODULE_ALIAS[value];
  if (exact) return exact;
  const matched = Object.entries(MODULE_ALIAS).find(([path]) => value === path || value.startsWith(`${path}/`));
  return matched?.[1] || "";
}

function buildQuickActions(entry) {
  const label = entry?.label || entry?.key || "Modulo";
  const routePath = entry?.routePath || "/interno";
  const quickMissions = Array.isArray(entry?.quickMissions) ? entry.quickMissions : [];
  const seeded = quickMissions.slice(0, 3).map((mission, index) => ({
    id: `${entry.key}_mission_${index}`,
    label: mission.split(" ").slice(0, 5).join(" "),
    mission,
    kind: "mission",
    routePath,
  }));
  const consoleAction = {
    id: `${entry.key}_console_audit`,
    label: `Auditar ${label}`,
    mission: `Audite o modulo ${label} na rota ${routePath}, correlacione console, logs, jobs e dependencias, e proponha a proxima acao segura.`,
    kind: "console",
    routePath,
  };
  return Array.from(new Map([...seeded, consoleAction].map((action) => [action.id, action])).values());
}

function enrichRegistryEntry(entry) {
  if (!entry) return null;
  return {
    ...entry,
    quickActions: buildQuickActions(entry),
    consoleTags: Array.from(new Set(["ai-task", entry.category, entry.key].filter(Boolean))),
  };
}

export function listModuleRegistryEntries() {
  return MODULE_REGISTRY.map((entry) => enrichRegistryEntry(entry));
}

export function resolveModuleRegistryEntry(moduleKey) {
  const entry = MODULE_REGISTRY.find((item) => item.key === moduleKey) || null;
  return enrichRegistryEntry(entry);
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
    quickActions: payload.quickActions || registry?.quickActions || [],
    consoleTags: payload.consoleTags || registry?.consoleTags || ["ai-task", moduleKey].filter(Boolean),
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
